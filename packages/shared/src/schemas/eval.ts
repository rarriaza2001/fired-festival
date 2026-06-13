import { z } from 'zod';
import {
  EVAL_RESULTS,
  EVAL_DIMENSIONS,
  EVALUATOR_TYPES,
  DIMENSION_VERDICTS,
} from '../constants/eval.js';

/**
 * Phase 7 / Phase 8 §11 — Evaluation Model.
 * 12-dimension rubric. Automated evaluation is SUPPORT ONLY; human review
 * remains required (hard lock: human_review_required is literally true).
 */
export const dimensionResultSchema = z.object({
  dimension: z.enum(EVAL_DIMENSIONS),
  verdict: z.enum(DIMENSION_VERDICTS),
  note: z.string().min(1),
});

export type DimensionResult = z.infer<typeof dimensionResultSchema>;

export const evalResultRecordSchema = z.object({
  result: z.enum(EVAL_RESULTS),
  dimensions: z.array(dimensionResultSchema).length(EVAL_DIMENSIONS.length),
  critical_failures: z.array(z.string()).default([]),
  weak_dimensions: z.array(z.enum(EVAL_DIMENSIONS)).default([]),
  strong_dimensions: z.array(z.enum(EVAL_DIMENSIONS)).default([]),
  triggered_regression_labels: z.array(z.string()).default([]),
  required_correction: z.string().nullable().default(null),
  evaluator_type: z.enum(EVALUATOR_TYPES),
  // HARD LOCK (Phase 8 §11): automated eval never becomes final truth.
  human_review_required: z.literal(true).default(true),
});

export type EvalResultRecord = z.infer<typeof evalResultRecordSchema>;
