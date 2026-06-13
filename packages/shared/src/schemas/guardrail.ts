import { z } from 'zod';
import {
  GUARDRAIL_CATEGORIES,
  GUARDRAIL_BEHAVIORS,
} from '../constants/guardrails.js';
import { CONFIDENCE_LABELS } from '../constants/confidence.js';
import { TERMINAL_STATES, REVIEW_STATES } from '../constants/review-states.js';
import { NEXT_ACTION_TYPES } from '../constants/next-action.js';

/**
 * Phase 6 — Executable guardrail registry entry. Guardrails must change
 * behavior when triggered, not merely warn. The pre-output checklist gate
 * evaluates these before any review is assembled.
 */
export const guardrailRegistryEntrySchema = z.object({
  category: z.enum(GUARDRAIL_CATEGORIES),
  trigger_condition: z.string().min(1),
  required_behavior: z.enum(GUARDRAIL_BEHAVIORS),
  confidence_effect: z.enum(CONFIDENCE_LABELS).nullable().default(null),
  terminal_state_effect: z.enum(TERMINAL_STATES).nullable().default(null),
  // Phase 8 §10 "next-action effect": the next action this guardrail forces
  // (e.g. blind_validation -> validate_assumption), or null when it does not
  // dictate one. This is the 7th registry field.
  next_action_effect: z.enum(NEXT_ACTION_TYPES).nullable().default(null),
  // What the user is told — guardrails must be observable, not silent.
  user_facing_explanation: z.string().min(1),
});

export type GuardrailRegistryEntry = z.infer<typeof guardrailRegistryEntrySchema>;

/** Phase 8 §10 — a guardrail firing recorded for trace/eval. */
export const guardrailTriggerSchema = z.object({
  category: z.enum(GUARDRAIL_CATEGORIES),
  review_state: z.enum(REVIEW_STATES).nullable().default(null),
  required_behavior: z.enum(GUARDRAIL_BEHAVIORS),
  confidence_effect: z.enum(CONFIDENCE_LABELS).nullable().default(null),
  terminal_state_effect: z.enum(TERMINAL_STATES).nullable().default(null),
  next_action_effect: z.enum(NEXT_ACTION_TYPES).nullable().default(null),
  explanation_shown: z.string().min(1),
});

export type GuardrailTrigger = z.infer<typeof guardrailTriggerSchema>;
