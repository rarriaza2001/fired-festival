import { describe, it, expect } from 'vitest';
import type { TraceEvent, RunMetrics } from '@dgb/shared';
import { eventAttributes, isErrorEvent, runCounterAttributes } from './span-mapper';

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

function makeMetrics(overrides: Partial<RunMetrics>): RunMetrics {
  return {
    run_id: 'run-1',
    duration_ms: 1200,
    terminal_state: 'review_complete',
    stop_reason: 'review_complete',
    retry_count: 0,
    loop_count: 0,
    max_loop_reached: false,
    clarification_count: 0,
    search_depth: 'no_search',
    tool_call_count: 0,
    final_review_confidence: null,
    eval_result: null,
    guardrail_trigger_count: 0,
    total_cost_usd: null,
    cost_accuracy: 'unknown',
    ...overrides,
  } as RunMetrics;
}

describe('eventAttributes', () => {
  it('maps present scalar fields to namespaced dgb.* attributes', () => {
    const attrs = eventAttributes(
      makeEvent({
        event_name: 'tool_invocation_completed',
        tool_name: 'web_search',
        cost_usd: 0.0123,
        loop_count: 2,
        model: 'claude',
      }),
    );

    expect(attrs['dgb.event_name']).toBe('tool_invocation_completed');
    expect(attrs['dgb.tool_name']).toBe('web_search');
    expect(attrs['dgb.cost_usd']).toBe(0.0123);
    expect(attrs['dgb.loop_count']).toBe(2);
    expect(attrs['dgb.model']).toBe('claude');
  });

  it('omits null/undefined fields entirely (no null attribute values)', () => {
    const attrs = eventAttributes(makeEvent({ tool_name: null, cost_usd: null }));

    expect('dgb.tool_name' in attrs).toBe(false);
    expect('dgb.cost_usd' in attrs).toBe(false);
  });

  it('never emits the raw details blob', () => {
    const attrs = eventAttributes(
      makeEvent({ details: { prompt: 'secret', sources: ['x'] } }),
    );

    expect(Object.keys(attrs).some((k) => k.includes('details'))).toBe(false);
    expect(JSON.stringify(attrs)).not.toContain('secret');
  });
});

describe('isErrorEvent', () => {
  it('is true when error_type is present', () => {
    expect(isErrorEvent(makeEvent({ error_type: 'tool_timeout' }))).toBe(true);
  });

  it('is false when error_type is null', () => {
    expect(isErrorEvent(makeEvent({ error_type: null }))).toBe(false);
  });
});

describe('runCounterAttributes', () => {
  it('maps low-cardinality rollup dimensions, including booleans', () => {
    const attrs = runCounterAttributes(
      makeMetrics({
        terminal_state: 'review_complete_limited',
        eval_result: 'pass',
        final_review_confidence: 'Medium',
        search_depth: 'shallow_search',
        max_loop_reached: true,
      }),
    );

    expect(attrs.terminal_state).toBe('review_complete_limited');
    expect(attrs.eval_result).toBe('pass');
    expect(attrs.final_review_confidence).toBe('Medium');
    expect(attrs.search_depth).toBe('shallow_search');
    expect(attrs.max_loop_reached).toBe(true);
  });

  it('omits null nullable dimensions', () => {
    const attrs = runCounterAttributes(
      makeMetrics({ eval_result: null, final_review_confidence: null }),
    );

    expect('eval_result' in attrs).toBe(false);
    expect('final_review_confidence' in attrs).toBe(false);
  });
});
