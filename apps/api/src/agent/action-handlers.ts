import type { ZodType, ZodTypeDef } from 'zod';
import type { AgentAction } from '@dgb/shared';
import {
  buildPrompt,
  STAGE_SCHEMAS,
  type StageKey,
  type PreparedReviewInput,
} from '../workflow/stage-prompts';
import { StructuredLlmService } from '../llm/structured-llm.service';
import type { Byok } from '../llm/llm.types';
import type { ToolAdapter, ToolResult } from '../tools/tool-adapter';

/**
 * Agent harness — action handlers (the action space's executable side).
 *
 * Each stage action wraps EXACTLY one existing structured review stage; the tool
 * action wraps the existing ToolAdapter. No business logic is re-implemented
 * here: stage prompts/schemas come verbatim from `workflow/stage-prompts`, and
 * tool invocation goes verbatim through the injected `ToolAdapter`. This is the
 * "wrap, don't rewrite" boundary that lets a model-directed loop drive the same
 * spine the hardcoded orchestrator drove — functionality is preserved because
 * the executed code is identical; only the caller (a loop, not a fixed sequence)
 * changes.
 *
 * Handlers are deliberately thin and side-effect-light: they run the call and
 * return its result + cost. Trace emission, state transitions, intake routing,
 * confidence capping, guardrails, and the completeness gate are the runner's job
 * (Phase 3) — the same separation the orchestrator already used.
 */

/**
 * The nine stage actions, each mapped to the StageKey of the review stage it
 * runs. This is the 1:1 correspondence that makes the agent's stage actions
 * behaviorally identical to the spine: the same prompt, the same schema, keyed
 * into the accumulator under the same StageKey so downstream prompts are byte
 * identical to the orchestrator's.
 */
const STAGE_ACTION_KEY = {
  assess_sufficiency: 'sufficiency',
  extract_artifact: 'artifact',
  confirm_scope: 'scope',
  discover_assumptions: 'assumptions',
  assess_evidence: 'evidence',
  check_reality_and_risks: 'realityRisks',
  calibrate_confidence: 'confidence',
  frame_next_action: 'nextAction',
  assemble_output: 'assembly',
} as const satisfies Record<string, StageKey>;

/** An action that runs a structured review stage (a key of STAGE_ACTION_KEY). */
export type StageAction = keyof typeof STAGE_ACTION_KEY;

/** Whether an action runs a structured review stage (vs. a tool/control action). */
export function isStageAction(action: AgentAction): action is StageAction {
  return action in STAGE_ACTION_KEY;
}

/** The StageKey a stage action runs (for accumulator keying + trace). */
export function stageKeyFor(action: StageAction): StageKey {
  return STAGE_ACTION_KEY[action];
}

export interface StageActionContext {
  readonly action: StageAction;
  readonly input: PreparedReviewInput;
  readonly byok: Byok;
  /** Accumulated prior stage results, keyed by StageKey — fed into the prompt. */
  readonly acc: Readonly<Record<string, unknown>>;
  readonly llm: StructuredLlmService;
}

export interface StageActionResult {
  /** The StageKey this action ran — the runner stores `data` under this key. */
  readonly stageKey: StageKey;
  /** The validated stage output (typed by the StageKey's schema at runtime). */
  readonly data: unknown;
  /** Cost of this stage's LLM call in USD (0 when the provider reported none). */
  readonly costUsd: number;
}

/**
 * Run one structured review stage. Identical to the orchestrator's `runStage`
 * closure: build the stage prompt from the input + accumulated prior results,
 * run the Zod-validated structured LLM call, and return the data + cost. The
 * runner is responsible for folding `data` into the accumulator under `stageKey`
 * and for any stage-specific post-processing (routing, capping, trace events).
 */
export async function runStageAction(
  ctx: StageActionContext,
): Promise<StageActionResult> {
  const stageKey = STAGE_ACTION_KEY[ctx.action];
  // The schema is statically a union across StageKeys; the runtime value is the
  // exact schema for this stage. We erase to unknown so one generic call site
  // serves every stage, exactly as the orchestrator did via its StageKey switch.
  const schema = STAGE_SCHEMAS[stageKey] as ZodType<unknown, ZodTypeDef, unknown>;
  const prompt = buildPrompt(stageKey, ctx.input, JSON.stringify(ctx.acc));
  const result = await ctx.llm.complete(
    ctx.byok,
    schema,
    prompt.system,
    prompt.user,
  );
  return { stageKey, data: result.data, costUsd: result.costUsd ?? 0 };
}

export interface ExternalCheckContext {
  /** The evidence statement to check (one pending item per action). */
  readonly statement: string;
  /** When set, fetch this URL directly (user-submitted links) before search. */
  readonly fetchUrl?: string;
  readonly tools: ToolAdapter;
}

export interface ExternalCheckResult {
  /** The adapter's result — the runner applies it via `applyToolResult`. */
  readonly result: ToolResult;
  /** Cost of this tool invocation in USD (0 in model-only mode). */
  readonly costUsd: number;
}

/**
 * Run one external check against a single pending evidence item. Identical to
 * the orchestrator's per-item invocation: a `search` primitive on the item's
 * statement through the injected adapter. In model-only mode the adapter returns
 * `available: false` (a limitation, never a fabricated result); the runner
 * decrements the pending count and applies the result to the evidence item.
 */
export async function runExternalCheckAction(
  ctx: ExternalCheckContext,
): Promise<ExternalCheckResult> {
  if (ctx.fetchUrl) {
    const fetched = await ctx.tools.invoke({
      primitive: 'fetch',
      query: ctx.fetchUrl,
    });
    if (fetched.available) {
      return { result: fetched, costUsd: fetched.costUsd ?? 0 };
    }
  }
  const result = await ctx.tools.invoke({
    primitive: 'search',
    query: ctx.statement,
  });
  return { result, costUsd: result.costUsd ?? 0 };
}
