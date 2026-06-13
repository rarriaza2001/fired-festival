import { z } from 'zod';
import {
  BLOCKING_FIELDS,
  BLOCKING_FIELD_STATUSES,
  INTAKE_CLASSIFICATIONS,
  UNSUPPORTED_MODES,
  INTAKE_LIMITS,
} from '../constants/intake.js';

/**
 * Phase 3 Steps 1-2 — Input Sufficiency Gate.
 *
 * The intake stage classifies the raw submission and resolves each of the five
 * blocking fields BEFORE any serious review may begin. This schema is the
 * single source of truth for the gate's structured LLM output; the
 * progress-bounded intake controller (apps/api) derives the routing decision
 * from it. A field is "cleared" when `present` or `safely_inferable`; `missing`
 * fields are non-obvious and trigger clarification.
 */

/** One blocking field's resolution (Phase 3 Step 2). */
export const blockingFieldAssessmentSchema = z.object({
  field: z.enum(BLOCKING_FIELDS),
  status: z.enum(BLOCKING_FIELD_STATUSES),
  // The stated or safely-inferred value; null when missing. Inferred values
  // must never be presented to the user as user-stated fact.
  value: z.string().nullable().default(null),
});

export type BlockingFieldAssessment = z.infer<typeof blockingFieldAssessmentSchema>;

/**
 * The intake stage output for one assessment round. The model classifies the
 * input, resolves the blocking fields, flags weak evidence (sufficient vs
 * sufficient_limited), names the unsupported mode when applicable, and surfaces
 * at most three priority-ordered clarification questions.
 */
export const intakeAssessmentSchema = z.object({
  classification: z.enum(INTAKE_CLASSIFICATIONS),
  blocking_fields: z.array(blockingFieldAssessmentSchema),
  // Blocking fields present but evidence weak -> route to sufficient_limited.
  evidence_weak: z.boolean().default(false),
  // Populated only when classification === 'unsupported'.
  unsupported_mode: z.enum(UNSUPPORTED_MODES).nullable().default(null),
  // Targeted, specific questions (never "tell me more"); priority-ordered by
  // BLOCKING_FIELDS order. Bounded by the intake patch.
  clarification_questions: z
    .array(z.string().min(1))
    .max(INTAKE_LIMITS.MAX_QUESTIONS_PER_ROUND)
    .default([]),
});

export type IntakeAssessment = z.infer<typeof intakeAssessmentSchema>;
