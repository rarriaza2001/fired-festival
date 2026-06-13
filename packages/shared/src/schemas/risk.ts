import { z } from 'zod';
import {
  RISK_SEVERITIES,
  RISK_LIKELIHOODS,
  RISK_LINK_TYPES,
} from '../constants/risk.js';
import { CONFIDENCE_LABELS } from '../constants/confidence.js';

/**
 * Phase 3 Step 10 — Failure Mode Analysis. Every risk is causal:
 * If [assumption fails], then [failure path], causing [decision impact].
 * Generic labels (competition, execution, scalability) are invalid.
 */
export const failureModeSchema = z.object({
  // Causal statement — the three-part structure above.
  if_condition: z.string().min(1),
  then_failure_path: z.string().min(1),
  causing_impact: z.string().min(1),
  // Must link back to a ranked assumption, gap, contradiction, or reality check.
  link_type: z.enum(RISK_LINK_TYPES),
  link_ref: z.string().min(1),
  severity: z.enum(RISK_SEVERITIES),
  likelihood: z.enum(RISK_LIKELIHOODS),
  evidence_state: z.string().min(1),
  // If none exists, mark hard_to_detect (handled by setting this to that value).
  early_warning_signal: z.string().min(1),
  validation_mitigation: z.string().min(1),
  confidence_effect: z.enum(CONFIDENCE_LABELS).nullable().default(null),
  rank: z.number().int().min(1),
  sources: z.array(z.string()).default([]),
});

export type FailureMode = z.infer<typeof failureModeSchema>;
