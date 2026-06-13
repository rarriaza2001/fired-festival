// Phase 8 §7 — Cost Tracking Model. Provider-agnostic. No fake exact cost.

/** Cost accuracy labels (Phase 8 §7). */
export const COST_ACCURACY = ['exact', 'estimated', 'unknown', 'unavailable'] as const;
export type CostAccuracy = (typeof COST_ACCURACY)[number];

/** Providers the cost model must support (Phase 8 §7). BYOK per provider. */
export const PROVIDERS = [
  'anthropic',
  'openai',
  'gemini',
  'grok',
  'local',
] as const;
export type Provider = (typeof PROVIDERS)[number];
