import { z } from 'zod';
import { CONFIDENCE_LABELS } from '../constants/confidence.js';

/**
 * Phase 3 Step 4 — Decision Artifact. No serious review may begin without one.
 * Every field carries a source label; inferred fields must never be presented
 * as user-stated facts.
 */
export const SOURCE_LABELS = ['user_stated', 'inferred'] as const;
export type SourceLabel = (typeof SOURCE_LABELS)[number];

/** A single artifact field with its provenance (Phase 3 Step 4). */
export const artifactFieldSchema = z.object({
  value: z.string().min(1),
  source: z.enum(SOURCE_LABELS),
});
export type ArtifactField = z.infer<typeof artifactFieldSchema>;

/** The five blocking fields, each provenance-labeled. */
export const decisionArtifactSchema = z.object({
  decision: artifactFieldSchema,
  current_state: artifactFieldSchema,
  end_goal: artifactFieldSchema,
  commitment_consequence: artifactFieldSchema,
  decision_stage: artifactFieldSchema,
  // Low/Unknown extraction confidence routes to artifact_needs_correction.
  extraction_confidence: z.enum(CONFIDENCE_LABELS),
  // If a reframe was inferred from conversational input, record it explicitly.
  inferred_reframe: z.string().nullable().default(null),
});

export type DecisionArtifact = z.infer<typeof decisionArtifactSchema>;
