import { z } from 'zod';
import { CONFIDENCE_LABELS } from '../constants/confidence.js';

/**
 * Phase 3 Step 11 — Confidence Calibration. Categorical only.
 * Confidence cannot be assigned before artifact, assumptions, evidence,
 * contradictions, and failure modes are complete. High confidence is rare.
 */
export const confidenceCalibrationSchema = z.object({
  label: z.enum(CONFIDENCE_LABELS),
  why: z.string().min(1),
  why_not_higher: z.string().min(1),
  what_would_raise: z.string().min(1),
  what_would_lower: z.string().min(1),
  // True when evidence/context is weak — forces review_complete_limited.
  capped: z.boolean().default(false),
});

export type ConfidenceCalibration = z.infer<typeof confidenceCalibrationSchema>;
