// Phase 2 / Phase 3 Step 2 + locked Intake Patch.
// Five blocking fields gate serious review. Intake clarification is
// PROGRESS-BOUNDED (clear >=1 blocking field/round) and does NOT consume the
// Phase 4 loop budget.

/** The five blocking input fields (Phase 3 Step 2). */
export const BLOCKING_FIELDS = [
  'decision',
  'current_state',
  'end_goal',
  'commitment_consequence',
  'decision_stage',
] as const;
export type BlockingField = (typeof BLOCKING_FIELDS)[number];

/** Intake patch thresholds (locked). */
export const INTAKE_LIMITS = {
  /** A productive round clears at least this many blocking fields. */
  MIN_FIELDS_CLEARED_PER_ROUND: 1,
  /** Stop after this many consecutive non-productive rounds. */
  MAX_CONSECUTIVE_STALLS: 2,
  /** Hard backstop on total intake rounds. */
  MAX_INTAKE_ROUNDS: 6,
  /** Max clarification questions surfaced per round (Phase 3 Step 3). */
  MAX_QUESTIONS_PER_ROUND: 3,
} as const;

/**
 * Per-blocking-field resolution status (Phase 3 Step 2). A field is "cleared"
 * for serious review when it is `present` or `safely_inferable`; `missing`
 * fields are non-obvious and must trigger clarification.
 */
export const BLOCKING_FIELD_STATUSES = [
  'present',
  'safely_inferable',
  'missing',
] as const;
export type BlockingFieldStatus = (typeof BLOCKING_FIELD_STATUSES)[number];

/**
 * Terminal routing outcomes of the input-sufficiency gate (Phase 2 §4-axis).
 * `sufficient_limited` proceeds with a confidence cap; `insufficient` and
 * `unsupported` are terminal (no serious review).
 */
export const INTAKE_OUTCOMES = [
  'sufficient',
  'sufficient_limited',
  'insufficient',
  'unsupported',
] as const;
export type IntakeOutcome = (typeof INTAKE_OUTCOMES)[number];

/** Intake input classification (Phase 3 Step 1). */
export const INTAKE_CLASSIFICATIONS = [
  'possibly_reviewable',
  'incomplete_salvageable',
  'insufficient',
  'unsupported',
] as const;
export type IntakeClassification = (typeof INTAKE_CLASSIFICATIONS)[number];

/** Unsupported request modes (Phase 3 Step 1). */
export const UNSUPPORTED_MODES = [
  'blind_validation',
  'final_decision_delegation',
  'hype',
  'pure_implementation',
  'pure_fact_lookup',
  'professional_determination',
  'emotional_reassurance',
  'certainty_seeking',
  'low_stakes_preference',
] as const;
export type UnsupportedMode = (typeof UNSUPPORTED_MODES)[number];
