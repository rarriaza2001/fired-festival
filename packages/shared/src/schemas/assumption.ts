import { z } from 'zod';
import { EVIDENCE_STATES } from '../constants/evidence.js';

/**
 * Phase 3 Steps 6-7 — Assumption Discovery & Prioritization.
 * Every assumption must be specific, material, falsifiable, and tied to the
 * Decision Artifact. Ranked ordinally — no numeric scores, no fake precision.
 */
export const assumptionSchema = z.object({
  statement: z.string().min(1),
  // Specific, material, falsifiable check is enforced at the workflow layer.
  current_support: z.string().min(1),
  evidence_state: z.enum(EVIDENCE_STATES).default('evidence_state_unknown'),
  // At least one assumption must connect to commitment/consequence/success.
  connects_to_commitment: z.boolean().default(false),
  // Ordinal rank (1 = highest priority). Set during prioritization (Step 7).
  rank: z.number().int().min(1).nullable().default(null),
  // Why it ranks where it does (importance, weakness, invalidation power).
  rank_rationale: z.string().nullable().default(null),
  sources: z.array(z.string()).default([]),
});

export type Assumption = z.infer<typeof assumptionSchema>;
