import { z } from 'zod';
import { ERROR_TYPES, ERROR_SEVERITIES } from '../constants/errors.js';
import { WORKFLOW_STAGES } from '../constants/workflow-stages.js';
import { CONFIDENCE_LABELS } from '../constants/confidence.js';
import { TERMINAL_STATES } from '../constants/review-states.js';

/**
 * Phase 8 §6 — A classified error. Lock: a failed tool/search narrows the
 * review; it never creates evidence, proves a claim false, or hides
 * uncertainty. Errors carry their terminal and confidence effects.
 */
export const dgbErrorSchema = z.object({
  type: z.enum(ERROR_TYPES),
  severity: z.enum(ERROR_SEVERITIES),
  stage: z.enum(WORKFLOW_STAGES).nullable().default(null),
  message: z.string().min(1),
  // Effects the error has on the run — explicit, never hidden.
  terminal_effect: z.enum(TERMINAL_STATES).nullable().default(null),
  confidence_effect: z.enum(CONFIDENCE_LABELS).nullable().default(null),
});

export type DgbError = z.infer<typeof dgbErrorSchema>;
