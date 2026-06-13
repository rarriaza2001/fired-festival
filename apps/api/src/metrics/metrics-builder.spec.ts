import { describe, it, expect } from 'vitest';
import { runMetricsSchema, metricsSummarySchema, type RunMetrics } from '@dgb/shared';
import {
  buildRunMetrics,
  actionHistogram,
  summarizeRunMetrics,
  type RunSignals,
} from './metrics-builder';

const BASE_SIGNALS: RunSignals = {
  runId: 'run-abc-123',
  startedAtMs: 1_000_000,
  endedAtMs: 1_001_500,
  terminalState: 'review_complete',
  stopReason: 'review_complete',
};

describe('buildRunMetrics', () => {
  describe('duration_ms', () => {
    it('computes duration from endedAtMs minus startedAtMs', () => {
      // Arrange
      const signals: RunSignals = {
        ...BASE_SIGNALS,
        startedAtMs: 1_000_000,
        endedAtMs: 1_002_750,
      };

      // Act
      const metrics = buildRunMetrics(signals);

      // Assert
      expect(metrics.duration_ms).toBe(2_750);
    });

    it('clamps negative duration to 0 when endedAtMs is before startedAtMs', () => {
      // Arrange
      const signals: RunSignals = {
        ...BASE_SIGNALS,
        startedAtMs: 1_001_000,
        endedAtMs: 1_000_000,
      };

      // Act
      const metrics = buildRunMetrics(signals);

      // Assert
      expect(metrics.duration_ms).toBe(0);
    });

    it('returns 0 when startedAtMs equals endedAtMs', () => {
      // Arrange
      const signals: RunSignals = {
        ...BASE_SIGNALS,
        startedAtMs: 1_000_000,
        endedAtMs: 1_000_000,
      };

      // Act
      const metrics = buildRunMetrics(signals);

      // Assert
      expect(metrics.duration_ms).toBe(0);
    });
  });

  describe('max_loop_reached', () => {
    it('sets max_loop_reached to true when loopCount equals MAX_LOOP_COUNT (3)', () => {
      // Arrange
      const signals: RunSignals = { ...BASE_SIGNALS, loopCount: 3 };

      // Act
      const metrics = buildRunMetrics(signals);

      // Assert
      expect(metrics.max_loop_reached).toBe(true);
    });

    it('sets max_loop_reached to false when loopCount is 2 (below cap)', () => {
      // Arrange
      const signals: RunSignals = { ...BASE_SIGNALS, loopCount: 2 };

      // Act
      const metrics = buildRunMetrics(signals);

      // Assert
      expect(metrics.max_loop_reached).toBe(false);
    });

    it('sets max_loop_reached to false when loopCount is 0', () => {
      // Arrange
      const signals: RunSignals = { ...BASE_SIGNALS, loopCount: 0 };

      // Act
      const metrics = buildRunMetrics(signals);

      // Assert
      expect(metrics.max_loop_reached).toBe(false);
    });

    it('sets max_loop_reached to true when loopCount exceeds cap', () => {
      // Arrange
      const signals: RunSignals = { ...BASE_SIGNALS, loopCount: 5 };

      // Act
      const metrics = buildRunMetrics(signals);

      // Assert
      expect(metrics.max_loop_reached).toBe(true);
    });
  });

  describe('cost_accuracy', () => {
    it('returns cost_accuracy "unknown" when totalCostUsd is null', () => {
      // Arrange
      const signals: RunSignals = {
        ...BASE_SIGNALS,
        totalCostUsd: null,
        costAccuracy: 'exact',
      };

      // Act
      const metrics = buildRunMetrics(signals);

      // Assert
      expect(metrics.cost_accuracy).toBe('unknown');
      expect(metrics.total_cost_usd).toBeNull();
    });

    it('returns cost_accuracy "unknown" when totalCostUsd is omitted', () => {
      // Arrange — no totalCostUsd provided
      const signals: RunSignals = { ...BASE_SIGNALS };

      // Act
      const metrics = buildRunMetrics(signals);

      // Assert
      expect(metrics.cost_accuracy).toBe('unknown');
    });

    it('uses provided costAccuracy when totalCostUsd is a number', () => {
      // Arrange
      const signals: RunSignals = {
        ...BASE_SIGNALS,
        totalCostUsd: 0.0042,
        costAccuracy: 'exact',
      };

      // Act
      const metrics = buildRunMetrics(signals);

      // Assert
      expect(metrics.cost_accuracy).toBe('exact');
      expect(metrics.total_cost_usd).toBe(0.0042);
    });

    it('defaults costAccuracy to "estimated" when totalCostUsd is set but costAccuracy is omitted', () => {
      // Arrange
      const signals: RunSignals = {
        ...BASE_SIGNALS,
        totalCostUsd: 0.001,
      };

      // Act
      const metrics = buildRunMetrics(signals);

      // Assert
      expect(metrics.cost_accuracy).toBe('estimated');
    });
  });

  describe('defaults', () => {
    it('applies default values when optional fields are omitted', () => {
      // Arrange — only required fields
      const signals: RunSignals = { ...BASE_SIGNALS };

      // Act
      const metrics = buildRunMetrics(signals);

      // Assert
      expect(metrics.retry_count).toBe(0);
      expect(metrics.loop_count).toBe(0);
      expect(metrics.max_loop_reached).toBe(false);
      expect(metrics.clarification_count).toBe(0);
      expect(metrics.search_depth).toBe('no_search');
      expect(metrics.tool_call_count).toBe(0);
      expect(metrics.final_review_confidence).toBeNull();
      expect(metrics.eval_result).toBeNull();
      expect(metrics.guardrail_trigger_count).toBe(0);
      expect(metrics.total_cost_usd).toBeNull();
      expect(metrics.cost_accuracy).toBe('unknown');
    });

    it('clamps negative retryCount to 0', () => {
      // Arrange
      const signals: RunSignals = { ...BASE_SIGNALS, retryCount: -3 };

      // Act
      const metrics = buildRunMetrics(signals);

      // Assert
      expect(metrics.retry_count).toBe(0);
    });

    it('clamps negative guardrailTriggerCount to 0', () => {
      // Arrange
      const signals: RunSignals = { ...BASE_SIGNALS, guardrailTriggerCount: -1 };

      // Act
      const metrics = buildRunMetrics(signals);

      // Assert
      expect(metrics.guardrail_trigger_count).toBe(0);
    });
  });

  describe('schema validity', () => {
    it('output always passes runMetricsSchema parse', () => {
      // Arrange
      const signals: RunSignals = {
        ...BASE_SIGNALS,
        loopCount: 3,
        searchDepth: 'deep_search',
        totalCostUsd: 0.0055,
        costAccuracy: 'estimated',
        finalConfidence: 'High',
        evalResult: 'pass',
        guardrailTriggerCount: 2,
        retryCount: 1,
        clarificationCount: 1,
        toolCallCount: 4,
      };

      // Act
      const metrics = buildRunMetrics(signals);

      // Assert — no throw means parse succeeded; also verify field values
      expect(() => runMetricsSchema.parse(metrics)).not.toThrow();
      expect(metrics.run_id).toBe('run-abc-123');
      expect(metrics.terminal_state).toBe('review_complete');
      expect(metrics.stop_reason).toBe('review_complete');
    });

    it('preserves all non-default fields in the output', () => {
      // Arrange
      const signals: RunSignals = {
        runId: 'run-xyz-999',
        startedAtMs: 5_000,
        endedAtMs: 7_500,
        terminalState: 'failed',
        stopReason: 'failed',
        loopCount: 1,
        clarificationCount: 2,
        searchDepth: 'shallow_search',
        toolCallCount: 3,
        finalConfidence: 'Low',
        evalResult: 'fail',
        guardrailTriggerCount: 1,
        totalCostUsd: 0.002,
        costAccuracy: 'estimated',
        retryCount: 2,
      };

      // Act
      const metrics = buildRunMetrics(signals);

      // Assert
      expect(metrics.run_id).toBe('run-xyz-999');
      expect(metrics.duration_ms).toBe(2_500);
      expect(metrics.terminal_state).toBe('failed');
      expect(metrics.stop_reason).toBe('failed');
      expect(metrics.loop_count).toBe(1);
      expect(metrics.max_loop_reached).toBe(false);
      expect(metrics.clarification_count).toBe(2);
      expect(metrics.search_depth).toBe('shallow_search');
      expect(metrics.tool_call_count).toBe(3);
      expect(metrics.final_review_confidence).toBe('Low');
      expect(metrics.eval_result).toBe('fail');
      expect(metrics.guardrail_trigger_count).toBe(1);
      expect(metrics.total_cost_usd).toBe(0.002);
      expect(metrics.cost_accuracy).toBe('estimated');
      expect(metrics.retry_count).toBe(2);
    });
  });
});

describe('actionHistogram', () => {
  it('returns an empty object for no actions', () => {
    expect(actionHistogram([])).toEqual({});
  });

  it('counts each action by name regardless of order', () => {
    const histogram = actionHistogram([
      'assess_evidence',
      'external_check',
      'external_check',
      'calibrate_confidence',
    ]);
    expect(histogram).toEqual({
      assess_evidence: 1,
      external_check: 2,
      calibrate_confidence: 1,
    });
  });

  it('does not mutate the input array', () => {
    const actions = ['assess_evidence', 'assess_evidence'];
    actionHistogram(actions);
    expect(actions).toEqual(['assess_evidence', 'assess_evidence']);
  });
});

describe('summarizeRunMetrics', () => {
  /** Build a valid RunMetrics, overriding only the fields a test cares about. */
  function metric(overrides: Partial<RunSignals> = {}): RunMetrics {
    return buildRunMetrics({ ...BASE_SIGNALS, ...overrides });
  }

  /** Build a run with a fixed duration in milliseconds. */
  function withDuration(ms: number): RunMetrics {
    return metric({ startedAtMs: 0, endedAtMs: ms });
  }

  it('returns an empty rollup for no runs', () => {
    // Act
    const summary = summarizeRunMetrics([]);

    // Assert
    expect(summary).toEqual({
      total_runs: 0,
      duration_ms: { count: 0, avg: 0, p50: 0, p95: 0, p99: 0, max: 0 },
      cost_usd: { count: 0, avg: 0, p50: 0, p95: 0, p99: 0, max: 0, total: 0 },
      loop_count: { count: 0, avg: 0, p50: 0, p95: 0, p99: 0, max: 0 },
      tool_call_count: { count: 0, avg: 0, p50: 0, p95: 0, p99: 0, max: 0 },
      max_loop_reached_count: 0,
      retry_count: 0,
      clarification_count: 0,
      guardrail_triggers: 0,
      terminal_state: {},
      eval_result: {},
      final_review_confidence: {},
      search_depth: {},
      cost_accuracy: {},
    });
  });

  it('counts total runs', () => {
    // Arrange
    const metrics = [metric(), metric(), metric()];

    // Act / Assert
    expect(summarizeRunMetrics(metrics).total_runs).toBe(3);
  });

  it('breaks down runs by terminal state', () => {
    // Arrange
    const metrics = [
      metric({ terminalState: 'review_complete', stopReason: 'review_complete' }),
      metric({ terminalState: 'review_complete', stopReason: 'review_complete' }),
      metric({ terminalState: 'failed', stopReason: 'failed' }),
    ];

    // Act
    const summary = summarizeRunMetrics(metrics);

    // Assert
    expect(summary.terminal_state).toEqual({ review_complete: 2, failed: 1 });
  });

  it('counts eval verdicts and omits runs with no verdict', () => {
    // Arrange
    const metrics = [
      metric({ evalResult: 'pass' }),
      metric({ evalResult: 'pass' }),
      metric({ evalResult: 'weak' }),
      metric({ evalResult: null }),
    ];

    // Act
    const summary = summarizeRunMetrics(metrics);

    // Assert — null verdict is excluded, so counts sum to fewer than total_runs
    expect(summary.eval_result).toEqual({ pass: 2, weak: 1 });
    expect(summary.total_runs).toBe(4);
  });

  it('counts final-review confidence and omits runs with none', () => {
    // Arrange
    const metrics = [
      metric({ finalConfidence: 'High' }),
      metric({ finalConfidence: 'Medium' }),
      metric({ finalConfidence: null }),
    ];

    // Act / Assert
    expect(summarizeRunMetrics(metrics).final_review_confidence).toEqual({
      High: 1,
      Medium: 1,
    });
  });

  describe('duration_ms distribution', () => {
    it('reports avg, max, and count over every run, rounded to whole ms', () => {
      // Arrange — 1000, 2000, 2001 -> mean 1667
      const metrics = [
        withDuration(1_000),
        withDuration(2_000),
        withDuration(2_001),
      ];

      // Act
      const { duration_ms } = summarizeRunMetrics(metrics);

      // Assert
      expect(duration_ms.count).toBe(3);
      expect(duration_ms.avg).toBe(1_667);
      expect(duration_ms.max).toBe(2_001);
    });

    it('computes p95 by nearest rank', () => {
      // Arrange — 1..100ms; nearest-rank p95 is the 95th value = 95
      const metrics = Array.from({ length: 100 }, (_, i) => withDuration(i + 1));

      // Act
      const { duration_ms } = summarizeRunMetrics(metrics);

      // Assert
      expect(duration_ms.p50).toBe(50);
      expect(duration_ms.p95).toBe(95);
      expect(duration_ms.p99).toBe(99);
      expect(duration_ms.max).toBe(100);
    });
  });

  describe('cost_usd distribution', () => {
    it('covers only runs with a recorded cost and totals them', () => {
      // Arrange — one run has unknown (null) cost
      const metrics = [
        metric({ totalCostUsd: 0.001, costAccuracy: 'estimated' }),
        metric({ totalCostUsd: 0.003, costAccuracy: 'estimated' }),
        metric({ totalCostUsd: null }),
      ];

      // Act
      const { cost_usd } = summarizeRunMetrics(metrics);

      // Assert — count excludes the null run; total sums recorded costs
      expect(cost_usd.count).toBe(2);
      expect(cost_usd.avg).toBe(0.002);
      expect(cost_usd.total).toBe(0.004);
      expect(cost_usd.max).toBe(0.003);
    });

    it('is all zeros when no run recorded a cost', () => {
      // Arrange
      const metrics = [metric({ totalCostUsd: null }), metric({ totalCostUsd: null })];

      // Act
      const { cost_usd } = summarizeRunMetrics(metrics);

      // Assert
      expect(cost_usd).toEqual({
        count: 0,
        avg: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        max: 0,
        total: 0,
      });
    });
  });

  describe('boundedness', () => {
    it('reports the loop-count distribution and max-loop-reached count', () => {
      // Arrange — loopCount 3 trips max_loop_reached (cap is 3)
      const metrics = [
        metric({ loopCount: 0 }),
        metric({ loopCount: 1 }),
        metric({ loopCount: 3 }),
      ];

      // Act
      const summary = summarizeRunMetrics(metrics);

      // Assert
      expect(summary.loop_count.avg).toBe(1.33);
      expect(summary.loop_count.max).toBe(3);
      expect(summary.max_loop_reached_count).toBe(1);
    });

    it('reports the tool-call distribution', () => {
      // Arrange
      const metrics = [
        metric({ toolCallCount: 0 }),
        metric({ toolCallCount: 2 }),
        metric({ toolCallCount: 4 }),
      ];

      // Act / Assert
      expect(summarizeRunMetrics(metrics).tool_call_count.max).toBe(4);
    });
  });

  describe('reliability totals', () => {
    it('sums retries, clarifications, and guardrail triggers across runs', () => {
      // Arrange
      const metrics = [
        metric({ retryCount: 1, clarificationCount: 2, guardrailTriggerCount: 2 }),
        metric({ retryCount: 0, clarificationCount: 0, guardrailTriggerCount: 3 }),
      ];

      // Act
      const summary = summarizeRunMetrics(metrics);

      // Assert
      expect(summary.retry_count).toBe(1);
      expect(summary.clarification_count).toBe(2);
      expect(summary.guardrail_triggers).toBe(5);
    });
  });

  it('always returns output that passes metricsSummarySchema parse', () => {
    // Arrange
    const metrics = [
      metric({ evalResult: 'pass', totalCostUsd: 0.01, costAccuracy: 'exact' }),
      metric({ terminalState: 'failed', stopReason: 'failed', loopCount: 2 }),
    ];

    // Act / Assert
    expect(() =>
      metricsSummarySchema.parse(summarizeRunMetrics(metrics)),
    ).not.toThrow();
  });
});
