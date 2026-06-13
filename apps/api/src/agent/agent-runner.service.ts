import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  agentDecisionSchema,
  reviewOutputSchema,
  AGENT_ACTION_STAGE,
  type AgentAction,
  type AgentTerminationReason,
  type Assumption,
  type ConfidenceCalibration,
  type DecisionArtifact,
  type EvalResult,
  type EvidenceAssessment,
  type FailureMode,
  type GuardrailTrigger,
  type MissingContext,
  type NextAction,
  type RealityCheck,
  type ReviewInput,
  type MainCompetitor,
  type ReviewOutput,
  type SearchDepth,
  type SecondaryAction,
  type StopReason,
  type TerminalState,
  CONTEXT_LIMITS,
  type ContextTriage,
} from '@dgb/shared';
import { PrismaService } from '../persistence/prisma.service';
import { TraceService } from '../trace/trace.service';
import { StructuredLlmService } from '../llm/structured-llm.service';
import type { Byok } from '../llm/llm.types';
import { decideIntake, type IntakeDecision } from '../workflow/intake-controller';
import {
  runPreOutputChecklist,
  unsupportedTrigger,
} from '../guardrails/guardrail-checklist';
import { registryEntry } from '../guardrails/guardrail-registry';
import { evaluateLoop } from '../loop/loop-controller';
import { TOOL_ADAPTER, type ToolAdapter } from '../tools/tool-adapter';
import {
  itemsNeedingCheck,
  recommendSearchDepth,
  applyToolResult,
  searchStopReasonFor,
} from '../tools/evidence-classifier';
import {
  buildUserContextLines,
  dedupeReviewSections,
  ensureExternalInvestigation,
  ensureUserLinkInvestigation,
} from '../review/output-dedup';
import { ensureValidationLinks, collectValidationUrlPool } from '../review/validation-links';
import { enrichMainCompetitors } from '../review/competitor-enrichment';
import { EvalHarnessService } from '../eval/eval-harness.service';
import { MetricsService } from '../metrics/metrics.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import type { RunSignals } from '../metrics/metrics-builder';
import {
  initialRunState,
  incrementTurn,
  withCompletedAction,
  withCost,
  withIntakeOutcome,
  withLoopCount,
  withPendingExternalChecks,
  withToolCall,
  type AgentRunState,
} from './agent-state';
import { budgetTermination, terminationStopReason } from './termination';
import { buildObservation } from './observation';
import { legalActions } from './action-space';
import { decideNextAction, type Proposer } from './agent-decider';
import {
  runStageAction,
  runExternalCheckAction,
  type StageAction,
} from './action-handlers';
import { ContextIngestionService } from '../ingestion/context-ingestion.service';
import { buildContextTriagePrompt } from '../workflow/context-triage-prompts';
import type { PreparedReviewInput } from '../workflow/stage-prompts';
import { AlarmService } from '../alarms/alarm.service';
import { parseCheckpointSnapshot, type CheckpointSnapshot } from './checkpoint';
import type { ErrorType } from '@dgb/shared';

/**
 * Agent harness — the model-directed control loop (AgentRunner).
 *
 * This is the agentic core: instead of a hardcoded stage sequence, each turn the
 * harness offers the model a legal action set and the model proposes the next
 * action (the harness forces the move when only one is legal, and validates and
 * can override otherwise). The EXECUTED work per action is identical to the old
 * spine — same structured stages, same tool adapter, same intake routing,
 * confidence cap, guardrail checklist, bounded reassessment loop, evaluation,
 * and metrics — so functionality is preserved byte-for-byte while the mechanism
 * that chooses the next step changes from "fixed order" to "model decision".
 *
 * The completeness gate (legalActions / finalize precondition) guarantees no
 * mandatory stage is skipped, and the budgets guarantee the loop always halts.
 */

const PERSONA_FOR_DECISION = `You are the control loop of "Don't Go Blind", a Decision Stress Tester that performs a bounded, skeptical review of a resource-intensive decision. Each turn you choose the single next action from the legal set you are given. Follow the canonical review order; when you have already assessed evidence and items are still awaiting an external check, prefer "external_check" to verify them before proceeding. Never skip a stage. Choose "finalize" only when every review stage is complete.`;

/** Run-scoped mutable bag — local to a single run(), never shared. */
interface RunContext {
  readonly runId: string;
  readonly input: ReviewInput;
  preparedInput: PreparedReviewInput;
  readonly byok: Byok;
  readonly startedAtMs: number;
  readonly acc: Record<string, unknown>;
  state: AgentRunState;
  searchDepth: SearchDepth;
  searchAnnounced: boolean;
  anyToolAvailable: boolean;
  lastActionSummary: string | null;
  intake: IntakeDecision | null;
  guardrailTriggers: GuardrailTrigger[];
  checkedStatements: Set<string>;
  // Kept stage outputs, assembled at finalize.
  artifact: DecisionArtifact | null;
  assumptions: readonly Assumption[];
  evidence: EvidenceAssessment | null;
  realityChecks: readonly RealityCheck[];
  failureModes: readonly FailureMode[];
  mainCompetitors: readonly MainCompetitor[] | null;
  confidence: ConfidenceCalibration | null;
  nextAction: NextAction | null;
  secondaryActions: readonly SecondaryAction[];
  assembly: {
    readonly decision_summary: string;
    readonly missing_context: MissingContext;
    readonly review_trace_summary: string;
  } | null;
}

@Injectable()
export class AgentRunner {
  constructor(
    private readonly llm: StructuredLlmService,
    private readonly trace: TraceService,
    private readonly prisma: PrismaService,
    @Inject(TOOL_ADAPTER) private readonly tools: ToolAdapter,
    private readonly evalHarness: EvalHarnessService,
    private readonly metrics: MetricsService,
    private readonly contextIngestion: ContextIngestionService,
    private readonly alarms: AlarmService,
    @Optional() private readonly telemetry?: TelemetryService,
  ) {}

  /**
   * Drive one review to a terminal state via the model-directed loop. Same
   * public contract as the former orchestrator: detached, never throws onward.
   */
  async run(runId: string, input: ReviewInput, byok: Byok): Promise<void> {
    const ctx: RunContext = {
      runId,
      input,
      preparedInput: input,
      byok,
      startedAtMs: Date.now(),
      acc: {},
      state: initialRunState(),
      searchDepth: 'no_search',
      searchAnnounced: false,
      anyToolAvailable: false,
      lastActionSummary: null,
      intake: null,
      guardrailTriggers: [],
      checkedStatements: new Set(),
      artifact: null,
      assumptions: [],
      evidence: null,
      realityChecks: [],
      failureModes: [],
      mainCompetitors: null,
      confidence: null,
      nextAction: null,
      secondaryActions: [],
      assembly: null,
    };

    try {
      await this.trace.emit(runId, {
        event_name: 'run_started',
        stage: 'intake',
        review_state: 'raw_input_received',
        model: byok.model,
        visibility: 'user_visible',
      });
      await this.trace.emit(runId, {
        event_name: 'input_received',
        stage: 'intake',
        review_state: 'raw_input_received',
        details: { context_item_count: input.context_items.length },
        visibility: 'user_visible',
      });

      if (input.context_items.length > 0) {
        if (input.context_items.length > CONTEXT_LIMITS.MAX_ITEMS_PER_REVIEW) {
          throw new Error(
            `Too many context items (max ${CONTEXT_LIMITS.MAX_ITEMS_PER_REVIEW}).`,
          );
        }
        ctx.preparedInput = await this.prepareContext(ctx);
      }

      await this.loop(ctx);
    } catch (error: unknown) {
      await this.fail(ctx, error);
    }
  }

  /** Deterministic ingestion + LLM triage before the control loop when attachments exist. */
  private async prepareContext(ctx: RunContext): Promise<PreparedReviewInput> {
    await this.trace.emit(ctx.runId, {
      event_name: 'context_ingestion_started',
      stage: 'intake',
      review_state: 'raw_input_received',
      details: { item_count: ctx.input.context_items.length },
      visibility: 'user_visible',
    });

    const ingested = await this.contextIngestion.ingestItems(ctx.input.context_items);
    for (const item of ingested) {
      await this.trace.emit(ctx.runId, {
        event_name: 'context_item_ingested',
        stage: 'intake',
        review_state: 'raw_input_received',
        details: {
          label: item.label,
          kind: item.kind,
          status: item.status,
          char_count: item.char_count,
        },
        visibility: 'user_visible',
      });
    }

    await this.trace.emit(ctx.runId, {
      event_name: 'context_ingestion_completed',
      stage: 'intake',
      review_state: 'raw_input_received',
      details: {
        parsed_count: ingested.filter((i) => i.status === 'parsed').length,
        failed_count: ingested.filter((i) => i.status !== 'parsed').length,
      },
      visibility: 'user_visible',
    });

    const triagePrompt = buildContextTriagePrompt(ctx.input, ingested);
    const triageResult = await this.llm.complete(
      ctx.byok,
      triagePrompt.schema,
      triagePrompt.system,
      triagePrompt.user,
    );
    ctx.state = withCost(ctx.state, triageResult.costUsd ?? 0);

    const triage = triageResult.data as ContextTriage;
    await this.trace.emit(ctx.runId, {
      event_name: 'context_triage_completed',
      stage: 'intake',
      review_state: 'raw_input_received',
      details: {
        material_count: triage.items.filter((i) => i.worth === 'material').length,
        overall_evidence_weak: triage.overall_evidence_weak,
      },
      visibility: 'user_visible',
    });

    return {
      ...ctx.input,
      ingested_items: ingested,
      context_triage: triage,
    };
  }

  /** The control loop: choose → validate → execute, until a terminal action. */
  private async loop(ctx: RunContext): Promise<void> {
    for (;;) {
      ctx.state = incrementTurn(ctx.state);

      const budget = budgetTermination(ctx.state);
      if (budget) {
        await this.terminateBudget(ctx, budget);
        return;
      }

      const legal = legalActions(ctx.state);
      await this.trace.emit(ctx.runId, {
        event_name: 'agent_turn_started',
        stage: null,
        review_state: 'review_in_progress',
        details: { turn: ctx.state.turn, legal_actions: [...legal] },
        visibility: 'internal_only',
      });

      const chosen = await decideNextAction(ctx.state, this.proposer(ctx));
      if (!chosen) {
        await this.fail(ctx, new Error('No legal action available to the agent.'));
        return;
      }

      await this.trace.emit(ctx.runId, {
        event_name: 'action_selected',
        stage: AGENT_ACTION_STAGE[chosen.action],
        review_state: 'review_in_progress',
        details: {
          action: chosen.action,
          rationale: chosen.rationale,
          source: chosen.source,
          target: chosen.target,
          turn: ctx.state.turn,
          legal_actions: [...legal],
        },
        visibility: 'user_visible',
      });

      const reason = await this.executeAction(ctx, chosen.action);

      await this.trace.emit(ctx.runId, {
        event_name: 'action_executed',
        stage: AGENT_ACTION_STAGE[chosen.action],
        review_state: 'review_in_progress',
        details: { action: chosen.action, turn: ctx.state.turn },
        visibility: 'internal_only',
      });

      if (reason) {
        return;
      }
    }
  }

  /**
   * The model proposer used at genuine choice points (|legal| > 1). Emits no
   * trace event itself — the decision is recorded by `action_selected`. Returns
   * a validated AgentDecision; the decider rejects any illegal choice.
   */
  private proposer(ctx: RunContext): Proposer {
    return async ({ state, legal }) => {
      const observation = buildObservation({
        state,
        legalActions: legal,
        lastActionSummary: ctx.lastActionSummary,
      });
      const result = await this.llm.complete(
        ctx.byok,
        agentDecisionSchema,
        PERSONA_FOR_DECISION,
        observation,
      );
      ctx.state = withCost(ctx.state, result.costUsd ?? 0);
      return result.data;
    };
  }

  /**
   * Execute one accepted action. Returns the termination reason when the action
   * ends the run (finalize / refuse / clarify), otherwise null to keep looping.
   */
  private async executeAction(
    ctx: RunContext,
    action: AgentAction,
  ): Promise<AgentTerminationReason | null> {
    switch (action) {
      case 'assess_sufficiency':
        return this.doSufficiency(ctx);
      case 'extract_artifact':
        return this.doArtifact(ctx);
      case 'confirm_scope':
        return this.doScope(ctx);
      case 'discover_assumptions':
        return this.doAssumptions(ctx);
      case 'assess_evidence':
        return this.doEvidence(ctx);
      case 'external_check':
        return this.doExternalCheck(ctx);
      case 'check_reality_and_risks':
        return this.doRealityRisks(ctx);
      case 'calibrate_confidence':
        return this.doConfidence(ctx);
      case 'frame_next_action':
        return this.doNextAction(ctx);
      case 'assemble_output':
        return this.doAssembly(ctx);
      case 'finalize':
        return this.doFinalize(ctx);
      case 'refuse_unsupported':
        return this.doRefuse(ctx);
      case 'request_clarification':
        return this.doClarify(ctx);
    }
  }

  // -------------------------------------------------------------------------
  // Stage actions (each wraps exactly one structured review stage)
  // -------------------------------------------------------------------------

  private async runStage(ctx: RunContext, action: StageAction): Promise<unknown> {
    const result = await runStageAction({
      action,
      input: ctx.preparedInput,
      byok: ctx.byok,
      acc: ctx.acc,
      llm: this.llm,
    });
    ctx.acc[result.stageKey] = result.data;
    ctx.state = withCost(ctx.state, result.costUsd);
    ctx.state = withCompletedAction(ctx.state, action);
    await this.saveCheckpoint(ctx, action);
    return result.data;
  }

  /**
   * Persist a replayable checkpoint after a stage completes. Fail-safe: a
   * checkpoint write must never break a run (mirrors safeRecordMetrics). The seq
   * is the 1-based count of completed stage actions, so a later replay resumes
   * the loop forward from that point without re-running prior stages.
   */
  private async saveCheckpoint(ctx: RunContext, action: AgentAction): Promise<void> {
    try {
      await this.prisma.checkpoint.create({
        data: {
          runId: ctx.runId,
          seq: ctx.state.completedActions.length,
          action,
          snapshot: JSON.stringify(this.snapshotOf(ctx)),
        },
      });
    } catch {
      // Deliberate: a checkpoint failure must not fail the run.
    }
  }

  /** The serializable slice of RunContext (no BYOK key, no service handles). */
  private snapshotOf(ctx: RunContext): CheckpointSnapshot {
    return {
      input: ctx.input,
      preparedInput: ctx.preparedInput,
      acc: ctx.acc,
      state: ctx.state,
      searchDepth: ctx.searchDepth,
      searchAnnounced: ctx.searchAnnounced,
      anyToolAvailable: ctx.anyToolAvailable,
      lastActionSummary: ctx.lastActionSummary,
      intake: ctx.intake,
      guardrailTriggers: ctx.guardrailTriggers,
      checkedStatements: [...ctx.checkedStatements],
      artifact: ctx.artifact,
      assumptions: ctx.assumptions,
      evidence: ctx.evidence,
      realityChecks: ctx.realityChecks,
      failureModes: ctx.failureModes,
      mainCompetitors: ctx.mainCompetitors,
      confidence: ctx.confidence,
      nextAction: ctx.nextAction,
      secondaryActions: ctx.secondaryActions,
      assembly: ctx.assembly,
    };
  }

  /** Rebuild a RunContext from a checkpoint snapshot for a fresh BYOK key. */
  private restoreContext(runId: string, snap: CheckpointSnapshot, byok: Byok): RunContext {
    return {
      runId,
      input: snap.input,
      preparedInput: snap.preparedInput,
      byok,
      startedAtMs: Date.now(),
      acc: { ...snap.acc },
      state: snap.state,
      searchDepth: snap.searchDepth,
      searchAnnounced: snap.searchAnnounced,
      anyToolAvailable: snap.anyToolAvailable,
      lastActionSummary: snap.lastActionSummary,
      intake: snap.intake,
      guardrailTriggers: [...snap.guardrailTriggers],
      checkedStatements: new Set(snap.checkedStatements),
      artifact: snap.artifact,
      assumptions: snap.assumptions,
      evidence: snap.evidence,
      realityChecks: snap.realityChecks,
      failureModes: snap.failureModes,
      mainCompetitors: snap.mainCompetitors,
      confidence: snap.confidence,
      nextAction: snap.nextAction,
      secondaryActions: snap.secondaryActions,
      assembly: snap.assembly,
    };
  }

  /**
   * Replay a run forward from a persisted checkpoint without re-running the
   * prior stages. Because legalActions(state) is derived from completedActions,
   * the resumed loop only offers the actions that had not yet run at capture
   * time. Same detached/never-throws-onward contract as run(). The BYOK key is
   * re-supplied here (it was never persisted in the checkpoint).
   */
  async replay(runId: string, fromSeq: number, byok: Byok): Promise<void> {
    const row = await this.prisma.checkpoint.findUnique({
      where: { runId_seq: { runId, seq: fromSeq } },
    });
    if (!row) {
      throw new Error(`No checkpoint ${fromSeq} for run ${runId}.`);
    }
    const ctx = this.restoreContext(runId, parseCheckpointSnapshot(row.snapshot), byok);
    try {
      await this.loop(ctx);
    } catch (error: unknown) {
      await this.fail(ctx, error);
    }
  }

  private async doSufficiency(ctx: RunContext): Promise<null> {
    const data = await this.runStage(ctx, 'assess_sufficiency');
    const intake = decideIntake(data as Parameters<typeof decideIntake>[0]);
    ctx.intake = intake;
    ctx.state = withIntakeOutcome(ctx.state, intake.outcome);
    ctx.lastActionSummary = `intake assessed: ${intake.outcome}`;

    if (intake.outcome === 'sufficient' || intake.outcome === 'sufficient_limited') {
      await this.trace.emit(ctx.runId, {
        event_name: 'input_sufficiency_checked',
        stage: 'input_sufficiency_check',
        review_state: 'input_sufficient',
        details: { outcome: intake.outcome },
        visibility: 'user_visible',
      });
    }
    // unsupported / insufficient: the forced refuse/clarify action emits the
    // terminal sufficiency event (preserving the old order of events).
    return null;
  }

  private async doArtifact(ctx: RunContext): Promise<null> {
    const artifact = (await this.runStage(ctx, 'extract_artifact')) as DecisionArtifact;
    ctx.artifact = artifact;
    ctx.lastActionSummary = 'decision artifact extracted';
    await this.trace.emit(ctx.runId, {
      event_name: 'decision_artifact_extracted',
      stage: 'decision_artifact_extraction',
      review_state: 'decision_artifact_extracted',
      confidence_after: artifact.extraction_confidence,
      details: { inferred_reframe: artifact.inferred_reframe },
      visibility: 'user_visible',
    });
    return null;
  }

  private async doScope(ctx: RunContext): Promise<null> {
    await this.runStage(ctx, 'confirm_scope');
    ctx.lastActionSummary = 'review scope confirmed';
    await this.trace.emit(ctx.runId, {
      event_name: 'review_scope_confirmed',
      stage: 'review_scope_confirmation',
      review_state: 'review_scope_confirmed',
      visibility: 'user_visible',
    });
    return null;
  }

  private async doAssumptions(ctx: RunContext): Promise<null> {
    const data = (await this.runStage(ctx, 'discover_assumptions')) as {
      assumptions: readonly Assumption[];
    };
    ctx.assumptions = data.assumptions;
    ctx.lastActionSummary = `assumptions identified: ${data.assumptions.length}`;
    await this.trace.emit(ctx.runId, {
      event_name: 'assumptions_identified',
      stage: 'assumption_discovery',
      review_state: 'review_in_progress',
      details: { count: data.assumptions.length },
      visibility: 'user_visible',
    });
    await this.trace.emit(ctx.runId, {
      event_name: 'assumptions_ranked',
      stage: 'assumption_prioritization',
      review_state: 'review_in_progress',
      visibility: 'user_visible',
    });
    return null;
  }

  private async doEvidence(ctx: RunContext): Promise<null> {
    let evidence = (await this.runStage(ctx, 'assess_evidence')) as EvidenceAssessment;
    evidence = ensureUserLinkInvestigation(
      evidence,
      ctx.preparedInput.context_items,
      ctx.preparedInput.ingested_items ?? [],
    );
    evidence = ensureExternalInvestigation(evidence);
    ctx.evidence = evidence;
    ctx.lastActionSummary = `evidence assessed: ${evidence.critical_gaps.length} critical gaps`;
    await this.trace.emit(ctx.runId, {
      event_name: 'evidence_assessed',
      stage: 'evidence_assessment',
      review_state: 'review_in_progress',
      details: { critical_gap_count: evidence.critical_gaps.length },
      visibility: 'user_visible',
    });
    if (evidence.items.some((i) => i.state === 'external_check_needed')) {
      await this.trace.emit(ctx.runId, {
        event_name: 'external_check_needed',
        stage: 'evidence_assessment',
        review_state: 'external_check_needed',
        visibility: 'user_visible',
      });
    }

    const toCheck = itemsNeedingCheck(evidence);
    ctx.state = withPendingExternalChecks(ctx.state, toCheck.length);
    if (toCheck.length > 0) {
      ctx.searchDepth = recommendSearchDepth(evidence);
      ctx.searchAnnounced = true;
      await this.trace.emit(ctx.runId, {
        event_name: 'search_started',
        stage: 'evidence_assessment',
        review_state: 'review_in_progress',
        search_depth: ctx.searchDepth,
        details: { item_count: toCheck.length },
        visibility: 'user_visible',
      });
    }
    return null;
  }

  /** One external check against the next pending evidence item (tool discipline). */
  private async doExternalCheck(ctx: RunContext): Promise<null> {
    const evidence = ctx.evidence;
    if (!evidence) {
      return null;
    }
    const item = itemsNeedingCheck(evidence).find(
      (i) => !ctx.checkedStatements.has(i.statement),
    );
    if (!item) {
      ctx.state = withPendingExternalChecks(ctx.state, 0);
      await this.maybeStopSearch(ctx);
      return null;
    }

    await this.trace.emit(ctx.runId, {
      event_name: 'tool_invocation_started',
      stage: 'evidence_assessment',
      review_state: 'review_in_progress',
      tool_name: this.tools.name,
      details: { statement: item.statement },
      visibility: 'user_visible',
    });

    try {
      const fetchUrl = item.sources.find(
        (s) => s.startsWith('http://') || s.startsWith('https://'),
      );
      const { result, costUsd } = await runExternalCheckAction({
        statement: item.statement,
        fetchUrl,
        decisionContext: ctx.artifact?.decision.value,
        tools: this.tools,
      });
      ctx.state = withToolCall(ctx.state, costUsd);
      ctx.anyToolAvailable = ctx.anyToolAvailable || result.available;
      ctx.checkedStatements.add(item.statement);
      ctx.evidence = {
        ...evidence,
        items: evidence.items.map((i) =>
          i.statement === item.statement
            ? applyToolResult(i, result, undefined, result.sourceUrls)
            : i,
        ),
      };
      ctx.acc.evidence = ctx.evidence;
      ctx.lastActionSummary = `external check: ${result.evidenceState}`;
      await this.trace.emit(ctx.runId, {
        event_name: 'tool_invocation_completed',
        stage: 'evidence_assessment',
        review_state: 'review_in_progress',
        tool_name: this.tools.name,
        cost_usd: result.costUsd ?? null,
        details: { available: result.available, evidence_state: result.evidenceState },
        visibility: 'user_visible',
      });
    } catch (error: unknown) {
      // A tool failure is a limitation, not a contradiction: leave the item
      // unchanged, consume the pending slot, and never re-select it.
      const message = error instanceof Error ? error.message : 'tool invocation failed';
      ctx.checkedStatements.add(item.statement);
      ctx.state = withPendingExternalChecks(
        ctx.state,
        ctx.state.pendingExternalChecks - 1,
      );
      await this.trace.emit(ctx.runId, {
        event_name: 'tool_invocation_failed',
        stage: 'evidence_assessment',
        review_state: 'review_in_progress',
        tool_name: this.tools.name,
        details: { message },
        visibility: 'user_visible',
      });
      // Alarm: a tool failure is a limitation, not a contradiction (I6). The
      // recommended action tells the operator to treat the claim as unverified.
      await this.alarms.raise(ctx.runId, 'tool_error', {
        message: `External check failed: ${message}`,
        stage: 'evidence_assessment',
        reviewState: 'review_in_progress',
        context: { statement: item.statement, tool_name: this.tools.name },
      });
    }

    await this.maybeStopSearch(ctx);
    return null;
  }

  /** Emit search_stopped once, when every pending item has been checked. */
  private async maybeStopSearch(ctx: RunContext): Promise<void> {
    if (!ctx.searchAnnounced || !ctx.evidence) {
      return;
    }
    const remaining = itemsNeedingCheck(ctx.evidence).filter(
      (i) => !ctx.checkedStatements.has(i.statement),
    );
    if (remaining.length > 0) {
      return;
    }
    ctx.searchAnnounced = false;
    await this.trace.emit(ctx.runId, {
      event_name: 'search_stopped',
      stage: 'evidence_assessment',
      review_state: 'review_in_progress',
      search_depth: ctx.searchDepth,
      details: {
        search_stop_reason: searchStopReasonFor(ctx.evidence, ctx.anyToolAvailable),
        tool_call_count: ctx.state.toolCallCount,
      },
      visibility: 'user_visible',
    });
  }

  private async doRealityRisks(ctx: RunContext): Promise<null> {
    const data = (await this.runStage(ctx, 'check_reality_and_risks')) as {
      main_competitors: readonly MainCompetitor[];
      reality_checks: readonly RealityCheck[];
      failure_modes: readonly FailureMode[];
    };
    ctx.mainCompetitors = data.main_competitors;
    ctx.realityChecks = data.reality_checks;
    ctx.failureModes = data.failure_modes;
    ctx.lastActionSummary = `risks ranked: ${data.failure_modes.length} failure modes`;
    await this.trace.emit(ctx.runId, {
      event_name: 'risks_ranked',
      stage: 'failure_mode_analysis',
      review_state: 'review_in_progress',
      details: {
        reality_check_count: data.reality_checks.length,
        failure_mode_count: data.failure_modes.length,
      },
      visibility: 'user_visible',
    });
    return null;
  }

  private async doConfidence(ctx: RunContext): Promise<null> {
    const calibrated = (await this.runStage(
      ctx,
      'calibrate_confidence',
    )) as ConfidenceCalibration;
    const capped = ctx.intake?.capConfidence ? capConfidence(calibrated) : calibrated;
    ctx.confidence = capped;
    ctx.acc.confidence = capped;
    ctx.lastActionSummary = `confidence calibrated: ${capped.label}`;
    await this.trace.emit(ctx.runId, {
      event_name: 'confidence_calibrated',
      stage: 'confidence_calibration',
      review_state: 'confidence_calibrated',
      confidence_after: capped.label,
      details: { capped: capped.capped, intake_capped: ctx.intake?.capConfidence ?? false },
      visibility: 'user_visible',
    });
    return null;
  }

  private async doNextAction(ctx: RunContext): Promise<null> {
    const data = (await this.runStage(ctx, 'frame_next_action')) as {
      next_action: NextAction;
      secondary_actions: readonly SecondaryAction[];
    };
    ctx.nextAction = data.next_action;
    ctx.secondaryActions = data.secondary_actions;
    ctx.lastActionSummary = `next action selected: ${data.next_action.action_type}`;
    await this.trace.emit(ctx.runId, {
      event_name: 'next_action_selected',
      stage: 'next_action_framing',
      review_state: 'next_action_selected',
      details: { action_type: data.next_action.action_type },
      visibility: 'user_visible',
    });

    await this.applyGuardrailsAndLoop(ctx);
    return null;
  }

  /**
   * Pre-output guardrail checklist + bounded reassessment loop. Ported verbatim
   * from the spine: an unsupported High-confidence conclusion is corrected, and
   * a material confidence change permits exactly one next-action reselection.
   */
  private async applyGuardrailsAndLoop(ctx: RunContext): Promise<void> {
    if (!ctx.confidence || !ctx.evidence) {
      return;
    }
    const checklist = runPreOutputChecklist({
      confidence: ctx.confidence,
      evidence: ctx.evidence,
    });
    for (const trigger of checklist.triggers) {
      ctx.guardrailTriggers.push(trigger);
      await this.emitGuardrail(ctx.runId, trigger);
    }
    if (!checklist.confidenceChanged) {
      return;
    }

    await this.trace.emit(ctx.runId, {
      event_name: 'confidence_changed',
      stage: 'confidence_calibration',
      review_state: 'confidence_calibrated',
      confidence_before: ctx.confidence.label,
      confidence_after: checklist.confidence.label,
      visibility: 'user_visible',
    });
    ctx.confidence = checklist.confidence;
    ctx.acc.confidence = checklist.confidence;

    const loop = evaluateLoop({ loopCount: ctx.state.loopCount, materialChange: true });
    if (!loop.allowed) {
      return;
    }
    ctx.state = withLoopCount(ctx.state, loop.nextLoopCount);
    await this.trace.emit(ctx.runId, {
      event_name: 'loop_candidate_detected',
      stage: 'next_action_framing',
      review_state: 'next_action_selected',
      loop_count: loop.nextLoopCount,
      details: { loop_type: 'next_action_reselection_loop' },
      visibility: 'user_visible',
    });
    await this.trace.emit(ctx.runId, {
      event_name: 'loop_entered',
      stage: 'next_action_framing',
      review_state: 'next_action_selected',
      loop_count: loop.nextLoopCount,
      visibility: 'user_visible',
    });

    const reselect = await runStageAction({
      action: 'frame_next_action',
      input: ctx.preparedInput,
      byok: ctx.byok,
      acc: ctx.acc,
      llm: this.llm,
    });
    ctx.acc[reselect.stageKey] = reselect.data;
    ctx.state = withCost(ctx.state, reselect.costUsd);
    const reselected = reselect.data as {
      next_action: NextAction;
      secondary_actions: readonly SecondaryAction[];
    };
    ctx.nextAction = reselected.next_action;
    ctx.secondaryActions = reselected.secondary_actions;
    await this.trace.emit(ctx.runId, {
      event_name: 'loop_stopped',
      stage: 'next_action_framing',
      review_state: 'next_action_selected',
      loop_count: loop.nextLoopCount,
      details: {
        loop_stop_reason: 'material_change_resolved',
        action_type: reselected.next_action.action_type,
      },
      visibility: 'user_visible',
    });
  }

  private async doAssembly(ctx: RunContext): Promise<null> {
    const data = (await this.runStage(ctx, 'assemble_output')) as {
      decision_summary: string;
      missing_context: MissingContext;
      review_trace_summary: string;
    };
    ctx.assembly = data;
    ctx.lastActionSummary = 'output assembled';
    return null;
  }

  // -------------------------------------------------------------------------
  // Control actions (terminal)
  // -------------------------------------------------------------------------

  /** Assemble + persist the completed review, evaluate, and finish the run. */
  private async doFinalize(ctx: RunContext): Promise<AgentTerminationReason> {
    const confidence = ctx.confidence;
    const artifact = ctx.artifact;
    const evidence = ctx.evidence;
    const nextAction = ctx.nextAction;
    const assembly = ctx.assembly;
    if (!confidence || !artifact || !evidence || !nextAction || !assembly) {
      throw new Error('finalize reached before all required stage outputs exist.');
    }

    const mode = confidence.capped ? 'limited' : 'full';
    const terminalState: TerminalState = confidence.capped
      ? 'review_complete_limited'
      : 'review_complete';
    const stopReason: StopReason = terminalState;

    const userContextLines = buildUserContextLines(
      ctx.preparedInput.text,
      ctx.preparedInput.ingested_items ?? [],
    );
    const deduped = dedupeReviewSections(
      {
        assumptions: ctx.assumptions ?? [],
        evidence,
        reality_checks: ctx.realityChecks ?? [],
        failure_modes: ctx.failureModes ?? [],
      },
      { userContextLines },
    );

    const ingestedLinkUrls = (ctx.preparedInput.ingested_items ?? [])
      .filter((i) => i.kind === 'link')
      .map((i) => i.ref)
      .filter((ref) => ref.startsWith('http://') || ref.startsWith('https://'));

    const validated = ensureValidationLinks(deduped, nextAction, { ingestedLinkUrls });

    const mainCompetitors = enrichMainCompetitors(ctx.mainCompetitors, {
      artifact,
      decisionText: ctx.preparedInput.text,
      realityChecks: validated.bundle.reality_checks,
      evidence: validated.bundle.evidence,
      urlPool: collectValidationUrlPool(validated.bundle.evidence, ingestedLinkUrls),
    });

    const output: ReviewOutput = reviewOutputSchema.parse({
      mode,
      terminal_state: terminalState,
      decision_summary: assembly.decision_summary,
      artifact,
      missing_context: assembly.missing_context,
      assumptions: validated.bundle.assumptions,
      main_competitors: mainCompetitors,
      evidence: validated.bundle.evidence,
      reality_checks: validated.bundle.reality_checks,
      failure_modes: validated.bundle.failure_modes,
      confidence,
      next_action: validated.nextAction,
      secondary_actions: ctx.secondaryActions,
      guardrail_triggers: ctx.guardrailTriggers,
      review_trace_summary: assembly.review_trace_summary,
    });

    await this.prisma.review.update({
      where: { id: ctx.runId },
      data: {
        reviewState: terminalState,
        terminalState,
        stopReason,
        mode,
        outputJson: JSON.stringify(output),
      },
    });

    const evalResult = await this.evaluate(ctx.runId, output, terminalState);
    await this.emitTerminated(ctx, terminalState, terminalState);
    await this.trace.emit(ctx.runId, {
      event_name: 'run_completed',
      stage: 'review_trace',
      review_state: terminalState,
      terminal_state: terminalState,
      confidence_after: confidence.label,
      eval_result: evalResult,
      stop_reason: stopReason,
      cost_usd: ctx.state.totalCostUsd,
      details: { guardrail_trigger_count: ctx.guardrailTriggers.length },
      visibility: 'user_visible',
    });

    await this.safeRecordMetrics(ctx, {
      terminalState,
      stopReason,
      loopCount: ctx.state.loopCount,
      toolCallCount: ctx.state.toolCallCount,
      searchDepth: ctx.searchDepth,
      guardrailTriggerCount: ctx.guardrailTriggers.length,
      finalConfidence: confidence.label,
      evalResult,
      totalCostUsd: ctx.state.totalCostUsd,
      costAccuracy: 'estimated',
    });
    return terminalState;
  }

  /** Terminal: an unsupported request is refused/reframed, never answered. */
  private async doRefuse(ctx: RunContext): Promise<AgentTerminationReason> {
    const mode = ctx.intake?.unsupportedMode ?? null;
    const trigger = mode ? unsupportedTrigger(mode) : genericUnsupportedTrigger();
    await this.trace.emit(ctx.runId, {
      event_name: 'input_sufficiency_checked',
      stage: 'input_sufficiency_check',
      review_state: 'unsupported_request',
      visibility: 'user_visible',
    });
    await this.emitGuardrail(ctx.runId, trigger);
    await this.finishTerminal(
      ctx,
      'unsupported_request',
      'unsupported_request',
      { reframe: trigger.explanation_shown },
      { guardrailTriggerCount: 1 },
    );
    return 'unsupported_request';
  }

  /** Terminal: blocking fields missing — surface the clarification questions. */
  private async doClarify(ctx: RunContext): Promise<AgentTerminationReason> {
    const missingFields = ctx.intake?.missingFields ?? [];
    const questions = ctx.intake?.clarificationQuestions ?? [];
    await this.trace.emit(ctx.runId, {
      event_name: 'input_sufficiency_checked',
      stage: 'input_sufficiency_check',
      review_state: 'input_insufficient',
      visibility: 'user_visible',
    });
    await this.trace.emit(ctx.runId, {
      event_name: 'clarification_requested',
      stage: 'clarification_gate',
      review_state: 'clarification_requested',
      visibility: 'user_visible',
      details: { missing_fields: [...missingFields], questions: [...questions] },
    });
    await this.finishTerminal(
      ctx,
      'input_insufficient',
      'input_insufficient',
      { missing_fields: [...missingFields], questions: [...questions] },
      { stopReason: 'input_insufficient', clarificationCount: 1 },
    );
    return 'input_insufficient';
  }

  // -------------------------------------------------------------------------
  // Terminal helpers (ported from the orchestrator)
  // -------------------------------------------------------------------------

  /** Persist a non-review terminal state, emit agent_terminated + run_completed. */
  private async finishTerminal(
    ctx: RunContext,
    terminalState: 'unsupported_request' | 'input_insufficient',
    reason: AgentTerminationReason,
    details: Record<string, unknown>,
    extras: {
      readonly stopReason?: StopReason;
      readonly clarificationCount?: number;
      readonly guardrailTriggerCount?: number;
    } = {},
  ): Promise<void> {
    const stopReason: StopReason = extras.stopReason ?? terminalState;
    await this.prisma.review.update({
      where: { id: ctx.runId },
      data: { reviewState: terminalState, terminalState, stopReason },
    });
    await this.emitTerminated(ctx, terminalState, reason);
    await this.trace.emit(ctx.runId, {
      event_name: 'run_completed',
      stage: 'review_trace',
      review_state: terminalState,
      terminal_state: terminalState,
      stop_reason: stopReason,
      cost_usd: ctx.state.totalCostUsd,
      details,
      visibility: 'user_visible',
    });
    await this.safeRecordMetrics(ctx, {
      terminalState,
      stopReason,
      clarificationCount: extras.clarificationCount ?? 0,
      guardrailTriggerCount: extras.guardrailTriggerCount ?? 0,
      totalCostUsd: ctx.state.totalCostUsd,
      costAccuracy: ctx.state.totalCostUsd > 0 ? 'estimated' : 'unknown',
    });
  }

  /** Harness budget guard: turns/cost exhausted. Maps to a failed terminal. */
  private async terminateBudget(
    ctx: RunContext,
    reason: AgentTerminationReason,
  ): Promise<void> {
    const stopReason = terminationStopReason(reason);
    await this.prisma.review
      .update({
        where: { id: ctx.runId },
        data: { reviewState: 'failed', terminalState: 'failed', stopReason },
      })
      .catch(() => undefined);
    // Alarm: a hard budget ceiling was hit. cost vs. turns map to distinct types.
    const budgetAlarm: ErrorType =
      reason === 'budget_exhausted' ? 'cost_budget_exceeded' : 'retry_budget_exceeded';
    await this.alarms.raise(ctx.runId, budgetAlarm, {
      message: `Run terminated by the harness: ${reason}.`,
      stage: 'review_trace',
      reviewState: 'failed',
      context: {
        termination_reason: reason,
        turns: ctx.state.turn,
        tool_calls: ctx.state.toolCallCount,
        cost_usd: ctx.state.totalCostUsd,
      },
    });
    await this.emitTerminated(ctx, 'failed', reason);
    await this.trace.emit(ctx.runId, {
      event_name: 'run_failed',
      stage: 'review_trace',
      review_state: 'failed',
      terminal_state: 'failed',
      stop_reason: stopReason,
      cost_usd: ctx.state.totalCostUsd,
      details: { termination_reason: reason, turns: ctx.state.turn },
      visibility: 'user_visible',
    });
    await this.safeRecordMetrics(ctx, {
      terminalState: 'failed',
      stopReason,
      totalCostUsd: ctx.state.totalCostUsd,
      costAccuracy: ctx.state.totalCostUsd > 0 ? 'estimated' : 'unknown',
    });
  }

  /** Mark the run failed on the DB and trace — never throws onward. */
  private async fail(ctx: RunContext, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : 'Unknown review error';
    await this.prisma.review
      .update({
        where: { id: ctx.runId },
        data: { reviewState: 'failed', terminalState: 'failed', stopReason: 'failed' },
      })
      .catch(() => undefined);
    // Alarm: classify the failure (schema validation vs. unclassified) so the
    // operator gets a named type + severity + recommended action, not just text.
    await this.alarms.raise(ctx.runId, classifyFailureAlarm(error), {
      message,
      stage: 'review_trace',
      reviewState: 'failed',
    });
    await this.emitTerminated(ctx, 'failed', 'failed').catch(() => undefined);
    await this.trace
      .emit(ctx.runId, {
        event_name: 'run_failed',
        stage: 'review_trace',
        review_state: 'failed',
        terminal_state: 'failed',
        stop_reason: 'failed',
        cost_usd: ctx.state.totalCostUsd,
        details: { message },
        visibility: 'user_visible',
      })
      .catch(() => undefined);
    await this.safeRecordMetrics(ctx, {
      terminalState: 'failed',
      stopReason: 'failed',
      totalCostUsd: ctx.state.totalCostUsd,
      costAccuracy: ctx.state.totalCostUsd > 0 ? 'estimated' : 'unknown',
    });
  }

  /**
   * The harness-level termination summary. Emitted just BEFORE the terminal
   * run_completed/run_failed (which closes the live stream), so subscribers see
   * the agent's stop reason and turn/tool/loop totals.
   */
  private async emitTerminated(
    ctx: RunContext,
    terminalState: TerminalState,
    reason: AgentTerminationReason,
  ): Promise<void> {
    await this.trace.emit(ctx.runId, {
      event_name: 'agent_terminated',
      stage: 'review_trace',
      review_state: terminalState,
      terminal_state: terminalState,
      stop_reason: terminationStopReason(reason),
      loop_count: ctx.state.loopCount,
      cost_usd: ctx.state.totalCostUsd,
      details: {
        termination_reason: reason,
        turns: ctx.state.turn,
        tool_calls: ctx.state.toolCallCount,
        completed_actions: [...ctx.state.completedActions],
      },
      visibility: 'user_visible',
    });
  }

  /** Emit an observable guardrail-trigger trace event (ported verbatim). */
  private async emitGuardrail(runId: string, trigger: GuardrailTrigger): Promise<void> {
    await this.trace.emit(runId, {
      event_name: 'guardrail_triggered',
      stage: 'review_output_assembly',
      review_state: trigger.review_state,
      guardrail_category: trigger.category,
      confidence_after: trigger.confidence_effect,
      visibility: 'user_visible',
      details: {
        required_behavior: trigger.required_behavior,
        next_action_effect: trigger.next_action_effect,
        explanation: trigger.explanation_shown,
      },
    });
  }

  /** Per-run structural evaluation (assist-only; non-fatal — ported verbatim). */
  private async evaluate(
    runId: string,
    output: ReviewOutput,
    terminalState: TerminalState,
  ): Promise<EvalResult | null> {
    try {
      const record = await this.evalHarness.evaluateRun(runId, output);
      await this.trace.emit(runId, {
        event_name: 'evaluation_completed',
        stage: 'review_trace',
        review_state: terminalState,
        terminal_state: terminalState,
        eval_result: record.result,
        details: {
          evaluator_type: record.evaluator_type,
          human_review_required: record.human_review_required,
          critical_failures: record.critical_failures,
        },
        visibility: 'user_visible',
      });
      // Alarm: a checkpoint (eval) critical failure means the output cannot be
      // relied on — surface it with a human-review recommended action.
      if (record.critical_failures.length > 0) {
        await this.alarms.raise(runId, 'critical_failure_detected', {
          message: `Evaluation flagged ${record.critical_failures.length} critical failure(s); human review required.`,
          stage: 'review_trace',
          reviewState: terminalState,
          context: { critical_failures: record.critical_failures, eval_result: record.result },
        });
      }
      return record.result;
    } catch {
      return null;
    }
  }

  /** Build and persist the per-run RunMetrics rollup (non-fatal — ported). */
  private async safeRecordMetrics(
    ctx: RunContext,
    signals: Omit<RunSignals, 'runId' | 'endedAtMs' | 'startedAtMs'>,
  ): Promise<void> {
    try {
      const metrics = await this.metrics.record({
        ...signals,
        runId: ctx.runId,
        startedAtMs: ctx.startedAtMs,
        endedAtMs: Date.now(),
        // Harness observability injected once here so every terminal path reports
        // the control-loop turn count and the ordered action mix it ran.
        turnCount: ctx.state.turn,
        completedActions: ctx.state.completedActions,
      });
      // Additive, fail-safe OTel bridge (no-op when telemetry disabled/absent).
      this.telemetry?.onMetrics(metrics, ctx.state.turn);
    } catch {
      // Deliberate: a rollup failure must not fail the run.
    }
  }
}

/**
 * Classify a thrown failure into a declared alarm type. A Zod failure (e.g. the
 * reviewOutputSchema.parse at finalize) is a schema validation error; anything
 * else is unclassified. Both are declared in the alarm registry.
 */
function classifyFailureAlarm(error: unknown): ErrorType {
  if (error instanceof Error && error.name === 'ZodError') {
    return 'schema_validation_error';
  }
  return 'unknown_error';
}

/** Cap a calibrated confidence to at most Medium and mark it limited. */
function capConfidence(c: ConfidenceCalibration): ConfidenceCalibration {
  const label = c.label === 'High' ? 'Medium' : c.label;
  return { ...c, label, capped: true };
}

/** Fallback trigger when the model flags unsupported without naming a mode. */
function genericUnsupportedTrigger(): GuardrailTrigger {
  const entry = registryEntry('unsupported_request');
  return {
    category: entry.category,
    review_state: 'unsupported_request',
    required_behavior: entry.required_behavior,
    confidence_effect: null,
    terminal_state_effect: 'unsupported_request',
    next_action_effect: entry.next_action_effect,
    explanation_shown: entry.user_facing_explanation,
  };
}
