// Phase 4 / Phase 8 §9 — Bounded Loop Model. Material change or don't loop.

/** Hard cap on reassessment loops (Phase 4). Intake is NOT counted here. */
export const MAX_LOOP_COUNT = 3 as const;

/** Loop types that may consume loop budget (Phase 8 §9). */
export const LOOP_TYPES = [
  'clarification_loop',
  'artifact_scope_reassessment_loop',
  'evidence_update_loop',
  'risk_reweighting_loop',
  'confidence_recalibration_loop',
  'next_action_reselection_loop',
] as const;
export type LoopType = (typeof LOOP_TYPES)[number];

export const LOOP_STOP_REASONS = [
  'no_material_change',
  'max_loop_reached',
  'material_change_resolved',
  'forbidden_loop_request',
  'budget_exhausted',
] as const;
export type LoopStopReason = (typeof LOOP_STOP_REASONS)[number];

/**
 * General stop reasons for a run (why the workflow ended). Superset usable by
 * the trace `stop_reason` field across loop, search, and terminal contexts.
 */
export const STOP_REASONS = [
  'review_complete',
  'review_complete_limited',
  'input_insufficient',
  'unsupported_request',
  'refused',
  'failed',
  'max_loop_reached',
  'no_material_change',
  'budget_exhausted',
  'intake_stalled',
  'max_turns_reached',
] as const;
export type StopReason = (typeof STOP_REASONS)[number];
