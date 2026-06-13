import { z } from 'zod';
import { REVIEW_STATES } from '../constants/review-states.js';

/**
 * Phase 2J — A single review-state transition. The state machine records
 * every transition so the trace can reconstruct how the run reached its
 * terminal state.
 */
export const stateTransitionSchema = z.object({
  run_id: z.string().min(1),
  from_state: z.enum(REVIEW_STATES).nullable(),
  to_state: z.enum(REVIEW_STATES),
  at: z.string().min(1), // ISO-8601
  reason: z.string().min(1),
});

export type StateTransition = z.infer<typeof stateTransitionSchema>;
