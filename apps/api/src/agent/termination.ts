import {
  AGENT_BUDGET,
  type AgentTerminationReason,
  type StopReason,
} from '@dgb/shared';
import type { AgentRunState } from './agent-state';

/**
 * Agent harness — termination & budget guards (protection pillar).
 *
 * Pure, framework-free. The harness, not the model, decides when the loop must
 * stop. Tool-budget exhaustion does NOT end the run (it only makes
 * `external_check` illegal — see action-space); it lets the agent finalize with
 * the evidence it has. Turn and cost ceilings are hard run-level stops.
 */

/** True when no further tool invocations are permitted. */
export function toolBudgetExhausted(state: AgentRunState): boolean {
  return state.toolCallCount >= AGENT_BUDGET.MAX_TOOL_CALLS;
}

/**
 * Run-level budget check. Returns the termination reason when a hard ceiling is
 * hit (turns or cost), otherwise null. Checked before every model decision.
 */
export function budgetTermination(
  state: AgentRunState,
): AgentTerminationReason | null {
  if (state.turn >= AGENT_BUDGET.MAX_TURNS) {
    return 'max_turns_reached';
  }
  if (state.totalCostUsd >= AGENT_BUDGET.MAX_COST_USD) {
    return 'budget_exhausted';
  }
  return null;
}

/**
 * Map an agent termination reason to the trace `stop_reason`. Typed as a
 * pass-through: this compiles only because AGENT_TERMINATION_REASONS is a subset
 * of STOP_REASONS, which is the invariant we want enforced at build time.
 */
export function terminationStopReason(
  reason: AgentTerminationReason,
): StopReason {
  return reason;
}
