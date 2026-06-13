// Phase 6 / Phase 8 §10 — Guardrail registry vocabulary.
// Guardrails must be executable, not decorative; they change behavior when fired.

/** Required guardrail categories (Phase 8 §10). */
export const GUARDRAIL_CATEGORIES = [
  'blind_validation',
  'final_decision_ownership',
  'unsupported_confidence',
  'fake_precision',
  'speculation_as_fact',
  'weak_evidence_for_strong_conclusion',
  'professional_determination',
  'over_challenge',
  'under_challenge',
  'unsupported_request',
  'tool_overuse',
  'loop_without_material_change',
] as const;
export type GuardrailCategory = (typeof GUARDRAIL_CATEGORIES)[number];

/** Required-behavior vocabulary when a guardrail fires (Phase 8 §10). */
export const GUARDRAIL_BEHAVIORS = [
  'refuse',
  'reframe',
  'clarify',
  'downgrade_confidence',
  'cap_confidence',
  'mark_limited',
  'block_fake_precision',
  'block_final_ownership',
  'block_professional_determination',
  'remove_noise',
  'stop_loop',
  'stop_search',
  'select_validation_next_action',
] as const;
export type GuardrailBehavior = (typeof GUARDRAIL_BEHAVIORS)[number];
