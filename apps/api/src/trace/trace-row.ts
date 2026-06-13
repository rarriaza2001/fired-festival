import { traceEventSchema, type TraceEvent } from '@dgb/shared';

/** A persisted TraceEvent row (columnar phase8.v1 storage). */
export interface TraceEventRow {
  eventId: string;
  schemaVersion: string;
  runId: string;
  parentEventId: string | null;
  eventName: string;
  timestamp: string;
  stage: string | null;
  reviewState: string | null;
  terminalState: string | null;
  durationMs: number | null;
  costUsd: number | null;
  model: string | null;
  toolName: string | null;
  searchDepth: string | null;
  loopCount: number | null;
  guardrailCategory: string | null;
  confidenceBefore: string | null;
  confidenceAfter: string | null;
  evalResult: string | null;
  errorType: string | null;
  errorSeverity: string | null;
  stopReason: string | null;
  details: string;
  visibility: string;
}

/** Parse a persisted `details` column, tolerating a corrupt/non-JSON value. */
export function parseDetails(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Reconstruct a validated TraceEvent from a persisted row. */
export function traceRowToEvent(row: TraceEventRow): TraceEvent {
  return traceEventSchema.parse({
    schema_version: row.schemaVersion,
    run_id: row.runId,
    event_id: row.eventId,
    parent_event_id: row.parentEventId,
    event_name: row.eventName,
    timestamp: row.timestamp,
    stage: row.stage,
    review_state: row.reviewState,
    terminal_state: row.terminalState,
    duration_ms: row.durationMs,
    cost_usd: row.costUsd,
    model: row.model,
    tool_name: row.toolName,
    search_depth: row.searchDepth,
    loop_count: row.loopCount,
    guardrail_category: row.guardrailCategory,
    confidence_before: row.confidenceBefore,
    confidence_after: row.confidenceAfter,
    eval_result: row.evalResult,
    error_type: row.errorType,
    error_severity: row.errorSeverity,
    stop_reason: row.stopReason,
    details: parseDetails(row.details),
    visibility: row.visibility,
  });
}
