// Phase 8 §8 — Search Budget Model. Use the shallowest sufficient search.
// Search failure is a limitation, not a contradiction.

export const SEARCH_DEPTHS = [
  'no_search',
  'shallow_search',
  'standard_search',
  'deep_search',
] as const;
export type SearchDepth = (typeof SEARCH_DEPTHS)[number];

export const SEARCH_STOP_REASONS = [
  'material_question_answered',
  'source_quality_sufficient',
  'source_quality_stopped_improving',
  'results_repetitive',
  'budget_exhausted',
  'timeout',
  'direct_validation_needed',
  'professional_review_needed',
  'non_material_result',
  'search_not_needed',
] as const;
export type SearchStopReason = (typeof SEARCH_STOP_REASONS)[number];
