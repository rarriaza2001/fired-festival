import { z } from 'zod';
import {
  CONTEXT_ITEM_KINDS,
  INGESTION_STATUSES,
  CONTEXT_ATTACHMENT_WORTH,
  CONTEXT_ATTACHMENT_WEIGHT,
} from '../constants/context-items.js';

/** Result of deterministic ingestion for one context item. */
export const ingestedContextItemSchema = z.object({
  label: z.string().min(1),
  kind: z.enum(CONTEXT_ITEM_KINDS),
  ref: z.string().min(1),
  status: z.enum(INGESTION_STATUSES),
  extracted_text: z.string().nullable().default(null),
  excerpt: z.string().nullable().default(null),
  char_count: z.number().int().nonnegative().default(0),
  warnings: z.array(z.string()).default([]),
});

export type IngestedContextItem = z.infer<typeof ingestedContextItemSchema>;

/** Per-attachment LLM triage verdict. */
export const contextAttachmentAssessmentSchema = z.object({
  ref: z.string().min(1),
  worth: z.enum(CONTEXT_ATTACHMENT_WORTH),
  weight: z.enum(CONTEXT_ATTACHMENT_WEIGHT),
  dangers_acknowledged: z.array(z.string()).default([]),
  should_influence_review: z.boolean(),
  rationale: z.string().min(1),
});

export type ContextAttachmentAssessment = z.infer<typeof contextAttachmentAssessmentSchema>;

/** LLM triage output for all ingested attachments. */
export const contextTriageSchema = z.object({
  items: z.array(contextAttachmentAssessmentSchema),
  overall_evidence_weak: z.boolean().default(true),
});

export type ContextTriage = z.infer<typeof contextTriageSchema>;

/** Response from POST /attachments after a successful upload. */
export const attachmentUploadSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['pdf', 'docx', 'pptx', 'xlsx', 'csv']),
  filename: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});

export type AttachmentUpload = z.infer<typeof attachmentUploadSchema>;
