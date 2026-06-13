// Phase 3 Step 12 — Next-Action Framing. Exactly one primary next action.
// Pass/fail signals must be observable, not vibes.

export const NEXT_ACTION_TYPES = [
  'clarify',
  'narrow_scope',
  'gather_context',
  'validate_assumption',
  'gather_direct_evidence',
  'compare_alternatives',
  'revise_decision',
  'proceed_under_conditions',
  'bounded_execution',
] as const;
export type NextActionType = (typeof NEXT_ACTION_TYPES)[number];

/** Review modes (Phase 3 Step 13). */
export const REVIEW_MODES = ['full', 'limited'] as const;
export type ReviewMode = (typeof REVIEW_MODES)[number];
