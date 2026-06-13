import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace-base';
import type { TraceEvent } from '@dgb/shared';
import { TelemetryService } from './telemetry.service';

function makeEvent(overrides: Partial<TraceEvent>): TraceEvent {
  return {
    schema_version: 'phase8.v1',
    run_id: 'run-1',
    event_id: 'evt-1',
    parent_event_id: null,
    event_name: 'tool_invocation_completed',
    timestamp: '2026-01-01T00:00:00.000Z',
    stage: null,
    review_state: null,
    terminal_state: null,
    duration_ms: null,
    cost_usd: null,
    model: null,
    tool_name: null,
    search_depth: null,
    loop_count: null,
    guardrail_category: null,
    confidence_before: null,
    confidence_after: null,
    eval_result: null,
    error_type: null,
    error_severity: null,
    stop_reason: null,
    details: {},
    visibility: 'internal_only',
    ...overrides,
  } as TraceEvent;
}

const exporter = new InMemorySpanExporter();
let provider: BasicTracerProvider;

function spanByName(spans: ReadableSpan[], name: string): ReadableSpan | undefined {
  return spans.find((s) => s.name === name);
}

describe('TelemetryService (enabled)', () => {
  beforeEach(() => {
    exporter.reset();
    provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    trace.setGlobalTracerProvider(provider);
  });

  afterEach(() => {
    trace.disable();
  });

  it('opens a review.run root span and closes it on run_completed with terminal_state', () => {
    const svc = new TelemetryService(true);
    svc.onTraceEvent(makeEvent({ event_name: 'run_started' }));
    svc.onTraceEvent(
      makeEvent({ event_name: 'run_completed', terminal_state: 'review_complete' }),
    );

    const root = spanByName(exporter.getFinishedSpans(), 'review.run');
    expect(root).toBeDefined();
    expect(root?.attributes['dgb.terminal_state']).toBe('review_complete');
    expect(root?.events.map((e) => e.name)).toContain('run_completed');
  });

  it('emits a child span for events carrying a duration', () => {
    const svc = new TelemetryService(true);
    svc.onTraceEvent(makeEvent({ event_name: 'run_started' }));
    svc.onTraceEvent(
      makeEvent({ event_name: 'tool_invocation_completed', duration_ms: 50, tool_name: 'web_search' }),
    );
    svc.onTraceEvent(makeEvent({ event_name: 'run_completed' }));

    const child = spanByName(exporter.getFinishedSpans(), 'tool_invocation_completed');
    expect(child).toBeDefined();
    expect(child?.attributes['dgb.tool_name']).toBe('web_search');
  });

  it('marks a child span ERROR when the event carries an error_type', () => {
    const svc = new TelemetryService(true);
    svc.onTraceEvent(makeEvent({ event_name: 'run_started' }));
    svc.onTraceEvent(
      makeEvent({
        event_name: 'tool_invocation_failed',
        duration_ms: 10,
        error_type: 'tool_timeout',
      }),
    );

    const child = spanByName(exporter.getFinishedSpans(), 'tool_invocation_failed');
    expect(child?.status.code).toBe(SpanStatusCode.ERROR);
  });

  it('marks the root span ERROR on run_failed', () => {
    const svc = new TelemetryService(true);
    svc.onTraceEvent(makeEvent({ event_name: 'run_started' }));
    svc.onTraceEvent(
      makeEvent({ event_name: 'run_failed', error_type: 'provider_error' }),
    );

    const root = spanByName(exporter.getFinishedSpans(), 'review.run');
    expect(root?.status.code).toBe(SpanStatusCode.ERROR);
  });
});

describe('TelemetryService (disabled)', () => {
  beforeEach(() => {
    exporter.reset();
    provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    trace.setGlobalTracerProvider(provider);
  });

  afterEach(() => {
    trace.disable();
  });

  it('is a no-op: emits no spans', () => {
    const svc = new TelemetryService(false);
    svc.onTraceEvent(makeEvent({ event_name: 'run_started' }));
    svc.onTraceEvent(makeEvent({ event_name: 'run_completed' }));

    expect(exporter.getFinishedSpans()).toHaveLength(0);
  });
});
