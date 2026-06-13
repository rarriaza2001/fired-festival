import { z } from 'zod';
import { NEXT_ACTION_TYPES } from '../constants/next-action.js';

/**
 * Phase 3 Step 12 — Next-Action Framing. Exactly one primary next action.
 * Pass/fail signals must be observable, not vibes. The commitment rule says
 * what the user should NOT commit to until the pass signal is met.
 */
export const nextActionSchema = z.object({
  action_type: z.enum(NEXT_ACTION_TYPES),
  primary_action: z.string().min(1),
  target: z.string().min(1),
  how: z.string().min(1),
  pass_signal: z.string().min(1),
  fail_signal: z.string().min(1),
  commitment_rule: z.string().min(1),
  sources: z.array(z.string()).default([]),
});

export type NextAction = z.infer<typeof nextActionSchema>;

/** Optional secondary actions must not compete with the primary action. */
export const secondaryActionSchema = z.object({
  action_type: z.enum(NEXT_ACTION_TYPES),
  primary_action: z.string().min(1),
  why_secondary: z.string().min(1),
});

export type SecondaryAction = z.infer<typeof secondaryActionSchema>;
