import { Injectable } from '@nestjs/common';
import {
  trace,
  context,
  metrics,
  SpanStatusCode,
  type Tracer,
  type Meter,
  type Span,
  type Counter,
  type Histogram,
} from '@opentelemetry/api';
import type { TraceEvent, RunMetrics } from '@dgb/shared';
import { eventAttributes, isErrorEvent, runCounterAttributes } from './span-mapper';

const INSTRUMENTATION_SCOPE = '@dgb/api';
const ROOT_SPAN_NAME = 'review.run';

interface Instruments {
  readonly runs: Counter;
  readonly duration: Histogram;
  readonly cost: Histogram;
  readonly loop: Histogram;
  readonly toolCalls: Histogram;
  readonly guardrails: Histogram;
  readonly turns: Histogram;
}

/**
 * phase8.v1 → OpenTelemetry bridge. ADDITIVE and FAIL-SAFE: every method is
 * wrapped so a telemetry error can never break a review. When telemetry is
 * disabled this is a pure no-op.
 *
 * Trace model: one root span (`review.run`) per run, opened on `run_started`
 * and closed on `run_completed`/`run_failed`. Every event is added to that span
 * as a span event (full timeline); events carrying a real `duration_ms` also
 * get a short child span. Bounded — the root span is deleted on the terminal
 * event, so the map never leaks.
 */
@Injectable()
export class TelemetryService {
  private readonly enabled: boolean;
  private readonly tracer?: Tracer;
  private readonly instruments?: Instruments;
  private readonly rootSpans = new Map<string, Span>();

  constructor(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) return;

    this.tracer = trace.getTracer(INSTRUMENTATION_SCOPE);
    const meter: Meter = metrics.getMeter(INSTRUMENTATION_SCOPE);
    this.instruments = {
      runs: meter.createCounter('dgb.review.runs', {
        description: 'Completed review runs, by terminal state and eval result',
      }),
      duration: meter.createHistogram('dgb.review.duration_ms', {
        unit: 'ms',
        description: 'Wall-clock duration of a review run',
      }),
      cost: meter.createHistogram('dgb.review.cost_usd', {
        unit: 'usd',
        description: 'Total LLM cost of a review run',
      }),
      loop: meter.createHistogram('dgb.review.loop_count', {
        description: 'Bounded reassessment loops per run',
      }),
      toolCalls: meter.createHistogram('dgb.review.tool_call_count', {
        description: 'Tool invocations per run',
      }),
      guardrails: meter.createHistogram('dgb.review.guardrail_triggers', {
        description: 'Guardrails fired per run',
      }),
      turns: meter.createHistogram('dgb.review.turn_count', {
        description: 'Control-loop iterations per run',
      }),
    };
  }

  /** Bridge one phase8 trace event into the run's span timeline. Never throws. */
  onTraceEvent(event: TraceEvent): void {
    if (!this.enabled || !this.tracer) return;
    try {
      this.bridgeEvent(event);
    } catch {
      // Deliberate: telemetry must never break a review.
    }
  }

  /** Bridge the per-run rollup metrics into OTel instruments. Never throws. */
  onMetrics(metricsRollup: RunMetrics, turnCount?: number): void {
    if (!this.enabled || !this.instruments) return;
    try {
      const i = this.instruments;
      i.runs.add(1, runCounterAttributes(metricsRollup));
      i.duration.record(metricsRollup.duration_ms);
      if (metricsRollup.total_cost_usd !== null) {
        i.cost.record(metricsRollup.total_cost_usd, {
          cost_accuracy: metricsRollup.cost_accuracy,
        });
      }
      i.loop.record(metricsRollup.loop_count);
      i.toolCalls.record(metricsRollup.tool_call_count);
      i.guardrails.record(metricsRollup.guardrail_trigger_count);
      if (typeof turnCount === 'number') i.turns.record(turnCount);
    } catch {
      // Deliberate: telemetry must never break a review.
    }
  }

  private bridgeEvent(event: TraceEvent): void {
    const tracer = this.tracer;
    if (!tracer) return;
    const attrs = eventAttributes(event);

    if (event.event_name === 'run_started') {
      const span = tracer.startSpan(ROOT_SPAN_NAME, { attributes: attrs });
      this.rootSpans.set(event.run_id, span);
      return;
    }

    const root = this.rootSpans.get(event.run_id);
    root?.addEvent(event.event_name, attrs);

    // Events that carry a measured duration become short child spans.
    if (typeof event.duration_ms === 'number' && event.duration_ms >= 0) {
      const end = Date.now();
      const start = end - event.duration_ms;
      const parent = root
        ? trace.setSpan(context.active(), root)
        : context.active();
      const child = tracer.startSpan(
        event.event_name,
        { startTime: start, attributes: attrs },
        parent,
      );
      if (isErrorEvent(event)) {
        child.setStatus({ code: SpanStatusCode.ERROR, message: event.error_type ?? undefined });
      }
      child.end(end);
    }

    if (event.event_name === 'run_completed' || event.event_name === 'run_failed') {
      if (root) {
        if (event.event_name === 'run_failed' || isErrorEvent(event)) {
          root.setStatus({ code: SpanStatusCode.ERROR, message: event.error_type ?? undefined });
        }
        if (event.terminal_state) root.setAttribute('dgb.terminal_state', event.terminal_state);
        root.end();
        this.rootSpans.delete(event.run_id);
      }
    }
  }
}
