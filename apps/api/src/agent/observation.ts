import { AGENT_BUDGET, type AgentAction } from '@dgb/shared';
import type { AgentRunState } from './agent-state';

/**
 * Agent harness — observation formatting (trait 4).
 *
 * Pure, framework-free. Turns the current run state + the legal action set into
 * the deterministic decision context the model reads each turn. It steers toward
 * the canonical spine order while leaving the genuine choices (check evidence
 * now vs. proceed; finalize when complete) to the model.
 */

/** One-line description of each action, shown when it is legal this turn. */
const ACTION_BRIEF: Readonly<Record<AgentAction, string>> = {
  assess_sufficiency: 'Classify the input and resolve the five blocking fields.',
  extract_artifact: 'Extract the structured decision artifact.',
  confirm_scope: 'Confirm what is in and out of review scope.',
  discover_assumptions: 'Surface and rank the load-bearing assumptions.',
  assess_evidence: 'Assess evidence strength and flag external-check gaps.',
  check_reality_and_risks: 'Run reality/contradiction checks and failure modes.',
  calibrate_confidence: 'Calibrate confidence with reasons and bounds.',
  frame_next_action: 'Frame the single best next action with pass/fail signals.',
  assemble_output: 'Assemble the final review output.',
  external_check: 'Verify one unverifiable claim via the external-check tool.',
  finalize: 'Complete the run and emit the review (all stages must be done).',
  refuse_unsupported: 'Refuse/reframe an unsupported request.',
  request_clarification: 'Ask for the missing blocking fields and stop.',
};

export interface ObservationInput {
  readonly state: AgentRunState;
  readonly legalActions: readonly AgentAction[];
  /** Short summary of the last action's result; null on the first turn. */
  readonly lastActionSummary: string | null;
}

/** Build the model-facing decision context for one turn. Deterministic. */
export function buildObservation(input: ObservationInput): string {
  const { state, legalActions, lastActionSummary } = input;

  const completed =
    state.completedActions.length > 0
      ? state.completedActions.join(', ')
      : 'none';

  const legalLines = legalActions
    .map((a) => `- ${a} — ${ACTION_BRIEF[a]}`)
    .join('\n');

  return [
    `Turn ${state.turn + 1} of ${AGENT_BUDGET.MAX_TURNS}. ` +
      `Cost $${state.totalCostUsd.toFixed(4)} of $${AGENT_BUDGET.MAX_COST_USD.toFixed(2)}. ` +
      `Tool calls ${state.toolCallCount}/${AGENT_BUDGET.MAX_TOOL_CALLS}.`,
    `Intake outcome: ${state.intakeOutcome ?? 'not yet assessed'}.`,
    `Completed stages: ${completed}.`,
    `Evidence items awaiting external check: ${state.pendingExternalChecks}.`,
    `Last action: ${lastActionSummary ?? 'none (start of run)'}.`,
    '',
    'Legal next actions:',
    legalLines,
    '',
    'Choose exactly one action. Prefer the canonical review order; pick ' +
      'external_check only to verify a specific unverifiable claim; pick ' +
      'finalize only when every required stage is complete. Give a short ' +
      'rationale (no hidden reasoning).',
  ].join('\n');
}
