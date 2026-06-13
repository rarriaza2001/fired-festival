import { describe, it, expect } from 'vitest';
import { runMetricsSchema } from '@dgb/shared';
import { buildRunMetrics, actionHistogram, type RunSignals } from './metrics-builder';

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
