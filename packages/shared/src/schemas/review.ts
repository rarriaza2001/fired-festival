import { z } from 'zod';
import { CONTEXT_ITEM_KINDS, CONTEXT_LIMITS } from '../constants/context-items.js';
import { decisionArtifactSchema } from './artifact.js';
import { assumptionSchema } from './assumption.js';
import { evidenceAssessmentSchema } from './evidence.js';
import { failureModeSchema } from './risk.js';
import { confidenceCalibrationSchema } from './confidence.js';
import { nextActionSchema, secondaryActionSchema } from './next-action.js';
import { guardrailTriggerSchema } from './guardrail.js';
import { REVIEW_MODES } from '../constants/next-action.js';
import { TERMINAL_STATES } from '../constants/review-states.js';
import { mainCompetitorsSchema } from './competitor.js';

/** Phase 3 Step 9 — Reality / Contradiction Check. */
export const realityCheckSchema = z.object({
  challenges: z.string().min(1), // the specific claim/assumption/evidence
  why_it_matters: z.string().min(1),
  is_direct_contradiction: z.boolean().default(false),
  sources: z.array(z.string()).default([]),
});
export type RealityCheck = z.infer<typeof realityCheckSchema>;

/** Phase 3 Step 13 part 2 — Missing context check. */
export const missingContextSchema = z.object({
  missing_items: z.array(z.string()).default([]),
  inferred_items: z.array(z.string()).default([]),
});
export type MissingContext = z.infer<typeof missingContextSchema>;

/** A context reference attached to a submission (link URL or attachment:// id). */
export const contextItemSchema = z.object({
  label: z.string().min(1),
  ref: z.string().min(1),
  kind: z.enum(CONTEXT_ITEM_KINDS),
});
export type ContextItem = z.infer<typeof contextItemSchema>;

/**
 * Raw user submission. Conversational input is accepted; the artifact is
 * extracted before serious review. Context items are media-agnostic refs.
 */
export const reviewInputSchema = z.object({
  text: z.string().min(1),
  context_items: z
    .array(contextItemSchema)
    .max(CONTEXT_LIMITS.MAX_ITEMS_PER_REVIEW)
    .default([]),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;

/**
 * Phase 3 Step 13 — Review Output Assembly. The eight required review
 * functions. Functions may be compressed but cannot disappear.
 */
export const reviewOutputSchema = z.object({
  mode: z.enum(REVIEW_MODES),
  terminal_state: z.enum(TERMINAL_STATES),
  // 1. Extracted decision summary
  decision_summary: z.string().min(1),
  artifact: decisionArtifactSchema,
  // 2. Missing context check
  missing_context: missingContextSchema,
  // 3. Material assumptions (ranked)
  assumptions: z.array(assumptionSchema),
  main_competitors: mainCompetitorsSchema,
  // 4. Evidence assessment
  evidence: evidenceAssessmentSchema,
  // 5. Contradictions / reality checks
  reality_checks: z.array(realityCheckSchema),
  // 6. Ranked risks / failure modes
  failure_modes: z.array(failureModeSchema),
  // 7. Confidence calibration
  confidence: confidenceCalibrationSchema,
  // 8. Concrete next action (exactly one primary)
  next_action: nextActionSchema,
  secondary_actions: z.array(secondaryActionSchema).default([]),
  // Guardrails that fired during this review (user-visible explanations).
  guardrail_triggers: z.array(guardrailTriggerSchema).default([]),
  // Step 14 — compact, structured trace explaining the terminal state.
  review_trace_summary: z.string().min(1),
});

export type ReviewOutput = z.infer<typeof reviewOutputSchema>;
