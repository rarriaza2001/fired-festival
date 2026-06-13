// Phase 2J — Review State Model. Frozen enumeration of review states,
// terminal states, the serious-review gate, and illegal transitions.

/** All review states the workflow can occupy (Phase 2J). */
export const REVIEW_STATES = [
  'raw_input_received',
  'input_sufficiency_checked',
  'input_insufficient',
  'clarification_requested',
  'input_sufficient',
  'decision_artifact_extracted',
  'artifact_needs_correction',
  'artifact_corrected',
  'review_scope_confirmed',
  'review_in_progress',
  'evidence_limited',
  'external_check_needed',
  'external_check_completed',
  'external_check_unavailable',
  'confidence_calibrated',
  'next_action_selected',
  'review_complete',
  'review_complete_limited',
  'unsupported_request',
  'refused',
  'failed',
] as const;

export type ReviewState = (typeof REVIEW_STATES)[number];

/** Terminal states — a run must end in exactly one of these (Phase 3 §14). */
export const TERMINAL_STATES = [
  'review_complete',
  'review_complete_limited',
  'input_insufficient',
  'unsupported_request',
  'refused',
  'failed',
] as const;

export type TerminalState = (typeof TERMINAL_STATES)[number];

/**
 * The serious-review gate (Phase 2J): a serious review may only begin after
 * input_sufficient -> decision_artifact_extracted -> review_scope_confirmed.
 */
export const SERIOUS_REVIEW_GATE: readonly ReviewState[] = [
  'input_sufficient',
  'decision_artifact_extracted',
  'review_scope_confirmed',
] as const;

/** Illegal transitions the state machine must never allow (Phase 2J). */
export const ILLEGAL_TRANSITIONS: ReadonlyArray<readonly [ReviewState, ReviewState]> = [
  ['raw_input_received', 'review_complete'],
  ['input_insufficient', 'review_complete'],
  ['artifact_needs_correction', 'review_in_progress'],
  ['unsupported_request', 'review_complete'],
  ['evidence_limited', 'review_complete'],
] as const;

/** States from which clarification may be triggered (Phase 2J). */
export const CLARIFICATION_TRIGGER_STATES: readonly ReviewState[] = [
  'input_insufficient',
  'artifact_needs_correction',
  'unsupported_request',
  'external_check_needed',
] as const;
