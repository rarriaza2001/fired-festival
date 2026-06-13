import { z } from 'zod';
import {
  TRACE_EVENTS,
  TRACE_VISIBILITIES,
  TRACE_SCHEMA_VERSION,
} from '../constants/trace-events.js';
import { WORKFLOW_STAGES } from '../constants/workflow-stages.js';
import { REVIEW_STATES, TERMINAL_STATES } from '../constants/review-states.js';
import { GUARDRAIL_CATEGORIES } from '../constants/guardrails.js';
import { CONFIDENCE_LABELS } from '../constants/confidence.js';
import { EVAL_RESULTS } from '../constants/eval.js';
import { ERROR_TYPES, ERROR_SEVERITIES } from '../constants/errors.js';
import { SEARCH_DEPTHS } from '../constants/search.js';
import { STOP_REASONS } from '../constants/loop.js';

/**
 * Phase 8 — Final Trace Payload Schema ("phase8.v1").
 * The canonical, compact, privacy-aware event row. Records state transitions,
 * outcomes, failures, and stop reasons — never hidden reasoning transcripts.
 */
export const traceEventSchema = z.object({
  schema_version: z.literal(TRACE_SCHEMA_VERSION).default(TRACE_SCHEMA_VERSION),
  run_id: z.string().min(1),
  event_id: z.string().min(1),
  parent_event_id: z.string().nullable().default(null),
  event_name: z.enum(TRACE_EVENTS),
  timestamp: z.string().min(1), // ISO-8601
  stage: z.enum(WORKFLOW_STAGES).nullable().default(null),
  review_state: z.enum(REVIEW_STATES).nullable().default(null),
  terminal_state: z.enum(TERMINAL_STATES).nullable().default(null),
  duration_ms: z.number().nonnegative().nullable().default(null),
  cost_usd: z.number().nonnegative().nullable().default(null),
  model: z.string().nullable().default(null),
  tool_name: z.string().nullable().default(null),
  search_depth: z.enum(SEARCH_DEPTHS).nullable().default(null),
  loop_count: z.number().int().min(0).nullable().default(null),
  guardrail_category: z.enum(GUARDRAIL_CATEGORIES).nullable().default(null),
  confidence_before: z.enum(CONFIDENCE_LABELS).nullable().default(null),
  confidence_after: z.enum(CONFIDENCE_LABELS).nullable().default(null),
  eval_result: z.enum(EVAL_RESULTS).nullable().default(null),
  error_type: z.enum(ERROR_TYPES).nullable().default(null),
  error_severity: z.enum(ERROR_SEVERITIES).nullable().default(null),
  stop_reason: z.enum(STOP_REASONS).nullable().default(null),
  // Bounded event-specific metadata only. No raw prompt/source dumps, no
  // chain-of-thought. Store references, not content.
  details: z.record(z.unknown()).default({}),
  // A4: live UI renders user_visible only; full trace persists for audit/eval.
  visibility: z.enum(TRACE_VISIBILITIES).default('internal_only'),
});

export type TraceEvent = z.infer<typeof traceEventSchema>;

/**
 * Fields a caller supplies when emitting; the TraceService fills run_id,
 * event_id, timestamp, and schema_version.
 */
export const traceEmitSchema = traceEventSchema
  .omit({ schema_version: true, event_id: true, timestamp: true, run_id: true })
  .partial()
  .required({ event_name: true });

export type TraceEmit = z.infer<typeof traceEmitSchema>;
