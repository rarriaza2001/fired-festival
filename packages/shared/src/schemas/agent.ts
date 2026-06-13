import { z } from 'zod';
import { AGENT_ACTIONS } from '../constants/agent-actions.js';

/**
 * Agent harness — control-loop schemas.
 *
 * Each turn the model emits an `AgentDecision`: which action to take next and a
 * short, user-visible rationale (never a chain-of-thought dump). The harness
 * validates the decision against the current state's legal actions and
 * preconditions before executing it ("the model proposes, the harness
 * disposes"), so the spine's guarantees hold under a model-chosen order.
 */
export const agentDecisionSchema = z.object({
  /** The next action the model wants to take, from the fixed action space. */
  action: z.enum(AGENT_ACTIONS),
  /** Brief, user-facing reason for choosing this action (bounded; no transcript). */
  rationale: z.string().min(1).max(400),
  /**
   * Optional focus for the action — e.g. the evidence statement to check for
   * `external_check`. Null for actions that operate on the whole state.
   */
  target: z.string().min(1).nullable().default(null),
});

export type AgentDecision = z.infer<typeof agentDecisionSchema>;

/**
 * The harness-tracked slice of agent state — the bookkeeping the completeness
 * gate, budget guards, and trace depend on. The full review accumulator (each
 * stage's structured output) is held in-memory by the runner and typed by the
 * existing per-stage schemas; only this budget/progress slice is shared.
 */
export const agentStateSchema = z.object({
  /** Loop iterations consumed so far. */
  turn: z.number().int().min(0).default(0),
  /** Stage/tool actions that have successfully run (drives the completeness gate). */
  completed_actions: z.array(z.enum(AGENT_ACTIONS)).default([]),
  /** Tool invocations made so far (bounded by AGENT_BUDGET.MAX_TOOL_CALLS). */
  tool_call_count: z.number().int().min(0).default(0),
  /** Bounded reassessment loops consumed (shared with MAX_LOOP_COUNT). */
  loop_count: z.number().int().min(0).default(0),
  /** Accumulated USD cost (bounded by AGENT_BUDGET.MAX_COST_USD). */
  total_cost_usd: z.number().nonnegative().default(0),
});

export type AgentState = z.infer<typeof agentStateSchema>;
