import { z } from 'zod';
import { CONFIDENCE_LABELS } from '../constants/confidence.js';

const confidenceCalibrationShape = z.object({
  label: z.enum(CONFIDENCE_LABELS),
  why: z.string().min(1),
  why_not_higher: z.string().min(1),
  what_would_raise: z.string().min(1),
  what_would_lower: z.string().min(1),
  // True when evidence/context is weak — forces review_complete_limited.
  capped: z.boolean().default(false),
});

/**
 * Phase 3 Step 11 — Confidence Calibration. Categorical only.
 * Confidence cannot be assigned before artifact, assumptions, evidence,
 * contradictions, and failure modes are complete. High confidence is rare.
 *
 * Resilience: the model occasionally emits a verdict-style value for `label`
 * (e.g. "Pause/reframe") instead of one of the four categorical levels, which
 * is an enum violation that previously failed the entire review. Confidence we
 * cannot interpret is, by definition, unknown — so an out-of-enum label is
 * coerced to "Unknown" and the review is forced into the capped/limited path
 * rather than crashing. Valid labels pass through untouched, and the generated
 * structured-output JSON Schema is identical (the preprocess wraps the same
 * object), so happy-path model behavior is unchanged.
 */
export const confidenceCalibrationSchema = z.preprocess((raw) => {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    const label = obj.label;
    const isValid =
      typeof label === 'string' &&
      (CONFIDENCE_LABELS as readonly string[]).includes(label);
    if (!isValid) {
      return { ...obj, label: 'Unknown', capped: true };
    }
  }
  return raw;
}, confidenceCalibrationShape);

export type ConfidenceCalibration = z.infer<typeof confidenceCalibrationSchema>;
