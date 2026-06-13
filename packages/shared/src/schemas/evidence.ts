import { z } from 'zod';
import {
  EVIDENCE_KINDS,
  EVIDENCE_STATES,
  SOURCE_TRUST_LEVELS,
  EVIDENCE_STRENGTHS,
} from '../constants/evidence.js';

/**
 * Phase 3 Step 8 — Evidence Assessment.
 * Source trust and evidence strength are classified SEPARATELY. User claims
 * are recorded only as claims, never as proof. Missing evidence limits
 * confidence but does not prove an assumption false.
 */
export const evidenceItemSchema = z.object({
  statement: z.string().min(1),
  kind: z.enum(EVIDENCE_KINDS),
  state: z.enum(EVIDENCE_STATES).default('evidence_state_unknown'),
  source_trust: z.enum(SOURCE_TRUST_LEVELS).nullable().default(null),
  strength: z.enum(EVIDENCE_STRENGTHS).nullable().default(null),
  // User-facing: how this conclusion was reached (1–2 sentences).
  note: z.string().nullable().default(null),
  // User-facing citations: user input, attachments, domain knowledge, external checks, URLs.
  sources: z.array(z.string()).default([]),
});

export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

export const evidenceAssessmentSchema = z.object({
  items: z.array(evidenceItemSchema),
  // Critical evidence gaps cap confidence and feed next-action selection.
  critical_gaps: z.array(z.string()).default([]),
});

export type EvidenceAssessment = z.infer<typeof evidenceAssessmentSchema>;
