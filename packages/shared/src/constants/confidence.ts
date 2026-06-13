// Phase 2 / Phase 3 Step 11 — Confidence is CATEGORICAL ONLY.
// No numeric scores, percentages, or fake precision (supersedes the PDF poster).

export const CONFIDENCE_LABELS = ['High', 'Medium', 'Low', 'Unknown'] as const;
export type ConfidenceLabel = (typeof CONFIDENCE_LABELS)[number];
