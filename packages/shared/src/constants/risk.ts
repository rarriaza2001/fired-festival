// Phase 3 Step 10 — Failure Mode Analysis. Risks are causal and categorical.
// If [assumption fails], then [failure path], causing [decision impact].

/** Categorical severity only — no numeric scores. */
export const RISK_SEVERITIES = ['critical', 'high', 'moderate', 'low'] as const;
export type RiskSeverity = (typeof RISK_SEVERITIES)[number];

/** Categorical likelihood only — no numeric scores. */
export const RISK_LIKELIHOODS = ['high', 'medium', 'low', 'unknown'] as const;
export type RiskLikelihood = (typeof RISK_LIKELIHOODS)[number];

/** What a failure mode links back to (Phase 3 Step 10). */
export const RISK_LINK_TYPES = [
  'ranked_assumption',
  'evidence_gap',
  'contradiction',
  'reality_check',
] as const;
export type RiskLinkType = (typeof RISK_LINK_TYPES)[number];
