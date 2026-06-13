import {
  AGENT_ACTIONS,
  MANDATORY_STAGE_ACTIONS,
  type AgentAction,
} from '@dgb/shared';
import { hasCompleted, type AgentRunState } from './agent-state';
import { toolBudgetExhausted } from './termination';

/**
 * Agent harness — action space legality (the completeness/ordering guarantee).
 *
 * Pure, framework-free. `legalActions(state)` is what the harness offers the
 * model each turn; the model may choose any legal action, but cannot skip a
 * required stage or jump ahead, because each stage action's predecessor must be
 * complete. This is how the spine's invariants survive a model-chosen order:
 * functionality is the floor (preconditions), agency is the freedom above it.
 */

/** Linear predecessor for each review stage action (the canonical spine order). */
const STAGE_PREDECESSOR: Partial<Record<AgentAction, AgentAction>> = {
  extract_artifact: 'assess_sufficiency',
  confirm_scope: 'extract_artifact',
  discover_assumptions: 'confirm_scope',
  assess_evidence: 'discover_assumptions',
  check_reality_and_risks: 'assess_evidence',
  calibrate_confidence: 'check_reality_and_risks',
  frame_next_action: 'calibrate_confidence',
  assemble_output: 'frame_next_action',
};

/** Review may proceed only once intake clears the input as reviewable. */
function reviewPermitted(state: AgentRunState): boolean {
  return (
    state.intakeOutcome === 'sufficient' ||
    state.intakeOutcome === 'sufficient_limited'
  );
}

export interface PreconditionResult {
  readonly ok: boolean;
  /** Why the action is not yet permitted; null when ok. */
  readonly reason: string | null;
}

const OK: PreconditionResult = { ok: true, reason: null };
const no = (reason: string): PreconditionResult => ({ ok: false, reason });

/** Whether `action` may run given the current state. */
export function preconditionsMet(
  action: AgentAction,
  state: AgentRunState,
): PreconditionResult {
  switch (action) {
    case 'assess_sufficiency':
      return hasCompleted(state, action)
        ? no('Intake has already been assessed.')
        : OK;

    case 'refuse_unsupported':
      return state.intakeOutcome === 'unsupported'
        ? OK
        : no('Only legal when intake classified the request as unsupported.');

    case 'request_clarification':
      return state.intakeOutcome === 'insufficient'
        ? OK
        : no('Only legal when intake classified the input as insufficient.');

    case 'external_check': {
      if (!hasCompleted(state, 'assess_evidence')) {
        return no('Evidence must be assessed before any external check.');
      }
      if (state.pendingExternalChecks <= 0) {
        return no('No evidence items are awaiting an external check.');
      }
      if (toolBudgetExhausted(state)) {
        return no('Tool-call budget is exhausted.');
      }
      return OK;
    }

    case 'finalize': {
      const missing = MANDATORY_STAGE_ACTIONS.filter(
        (a) => !hasCompleted(state, a),
      );
      return missing.length === 0
        ? OK
        : no(`Cannot finalize; missing stages: ${missing.join(', ')}.`);
    }

    default: {
      // Remaining cases are the linear review stage actions.
      if (!reviewPermitted(state)) {
        return no('Review is not permitted until intake clears the input.');
      }
      if (hasCompleted(state, action)) {
        return no('This stage has already run.');
      }
      const predecessor = STAGE_PREDECESSOR[action];
      if (predecessor && !hasCompleted(state, predecessor)) {
        return no(`Requires "${predecessor}" to run first.`);
      }
      return OK;
    }
  }
}

/** The actions the harness offers the model this turn. */
export function legalActions(state: AgentRunState): readonly AgentAction[] {
  return AGENT_ACTIONS.filter((action) => preconditionsMet(action, state).ok);
}
