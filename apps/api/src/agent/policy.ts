import {
  MANDATORY_STAGE_ACTIONS,
  type AgentAction,
  type AgentDecision,
  type AgentTerminationReason,
} from '@dgb/shared';
import { hasCompleted, type AgentRunState } from './agent-state';
import { legalActions } from './action-space';
import { budgetTermination } from './termination';

/**
 * Agent harness — decision policy ("the model proposes, the harness disposes").
 *
 * Pure, framework-free. The runner asks the model for an action, then runs it
 * past this policy before executing anything. An out-of-budget run terminates;
 * an illegal action is rejected with the legal set so the runner can re-prompt;
 * only a legal, in-budget action is accepted. This is the layer that makes a
 * model-driven loop keep every deterministic guarantee.
 */

export type PolicyVerdict =
  | { readonly kind: 'accept'; readonly action: AgentAction }
  | { readonly kind: 'terminate'; readonly reason: AgentTerminationReason }
  | {
      readonly kind: 'reject';
      readonly reason: string;
      readonly legalActions: readonly AgentAction[];
    };

/** Validate a model decision against budget and action legality. */
export function validateDecision(
  decision: AgentDecision,
  state: AgentRunState,
): PolicyVerdict {
  const termination = budgetTermination(state);
  if (termination) {
    return { kind: 'terminate', reason: termination };
  }

  const legal = legalActions(state);
  if (legal.includes(decision.action)) {
    return { kind: 'accept', action: decision.action };
  }

  return {
    kind: 'reject',
    reason: `Action "${decision.action}" is not permitted now. Choose one of: ${
      legal.length > 0 ? legal.join(', ') : '(none)'
    }.`,
    legalActions: legal,
  };
}

export interface CompletenessResult {
  readonly complete: boolean;
  readonly missing: readonly AgentAction[];
}

/**
 * The finalize completeness gate: every mandatory stage must have run before a
 * review may be assembled and the run completed.
 */
export function finalizeCompleteness(state: AgentRunState): CompletenessResult {
  const missing = MANDATORY_STAGE_ACTIONS.filter(
    (action) => !hasCompleted(state, action),
  );
  return { complete: missing.length === 0, missing };
}

/**
 * When exactly one action is legal, the harness may take it without consulting
 * the model (deterministic forced moves — e.g. only `refuse_unsupported` after
 * an unsupported intake). Returns null when the model genuinely has a choice.
 */
export function forcedAction(state: AgentRunState): AgentAction | null {
  const legal = legalActions(state);
  return legal.length === 1 ? legal[0] ?? null : null;
}
