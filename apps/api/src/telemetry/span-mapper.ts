import type { Attributes } from '@opentelemetry/api';
import type { TraceEvent, RunMetrics } from '@dgb/shared';

/**
 * Pure phase8.v1 → OpenTelemetry mappers. No IO, no SDK, no framework deps.
 *
 * Privacy: only the bounded, non-sensitive scalar columns of a TraceEvent are
 * mapped. The raw `details` blob, prompts, sources, chain-of-thought, and BYOK
 * keys are NEVER emitted as span attributes.
 */

/** Add `key` to `attrs` only when `value` is a present scalar (skip null/undefined). */
function put(
  attrs: Record<string, string | number | boolean>,
  key: string,
  value: string | number | boolean | null | undefined,
): void {
  if (value === null || value === undefined) return;
  attrs[key] = value;
}

/** Privacy-safe span/event attributes for one trace event (namespaced `dgb.*`). */
export function eventAttributes(event: TraceEvent): Attributes {
  const attrs: Record<string, string | number | boolean> = {};
  put(attrs, 'dgb.event_name', event.event_name);
  put(attrs, 'dgb.stage', event.stage);
  put(attrs, 'dgb.review_state', event.review_state);
  put(attrs, 'dgb.terminal_state', event.terminal_state);
  put(attrs, 'dgb.cost_usd', event.cost_usd);
  put(attrs, 'dgb.model', event.model);
  put(attrs, 'dgb.tool_name', event.tool_name);
  put(attrs, 'dgb.search_depth', event.search_depth);
  put(attrs, 'dgb.loop_count', event.loop_count);
  put(attrs, 'dgb.guardrail_category', event.guardrail_category);
  put(attrs, 'dgb.confidence_before', event.confidence_before);
  put(attrs, 'dgb.confidence_after', event.confidence_after);
  put(attrs, 'dgb.eval_result', event.eval_result);
  put(attrs, 'dgb.error_type', event.error_type);
  put(attrs, 'dgb.error_severity', event.error_severity);
  put(attrs, 'dgb.stop_reason', event.stop_reason);
  return attrs;
}

/** Whether this event represents a failure (drives span ERROR status). */
export function isErrorEvent(event: TraceEvent): boolean {
  return event.error_type !== null && event.error_type !== undefined;
}

/**
 * Dimensional attributes for the `dgb.review.runs` counter. Low-cardinality
 * enum-typed fields only — safe as Prometheus label values.
 */
export function runCounterAttributes(metrics: RunMetrics): Attributes {
  const attrs: Record<string, string | number | boolean> = {};
  put(attrs, 'terminal_state', metrics.terminal_state);
  put(attrs, 'eval_result', metrics.eval_result);
  put(attrs, 'final_review_confidence', metrics.final_review_confidence);
  put(attrs, 'search_depth', metrics.search_depth);
  put(attrs, 'max_loop_reached', metrics.max_loop_reached);
  return attrs;
}
