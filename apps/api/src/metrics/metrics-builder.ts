import {
  runMetricsSchema,
  metricsSummarySchema,
  type RunMetrics,
  type MetricsSummary,
  type MetricDistribution,
  type TerminalState,
  type StopReason,
  type SearchDepth,
  type ConfidenceLabel,
  type EvalResult,
  type CostAccuracy,
  MAX_LOOP_COUNT,
} from '@dgb/shared';

export interface RunSignals {
  readonly runId: string;
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  readonly terminalState: TerminalState;
  readonly stopReason: StopReason;
  readonly retryCount?: number;
  readonly loopCount?: number;
  readonly clarificationCount?: number;
  readonly searchDepth?: SearchDepth;
  readonly toolCallCount?: number;
  readonly finalConfidence?: ConfidenceLabel | null;
  readonly evalResult?: EvalResult | null;
  readonly guardrailTriggerCount?: number;
  readonly totalCostUsd?: number | null;
  readonly costAccuracy?: CostAccuracy;
  // Agent-harness observability (not persisted to the Metric rollup table; logged
  // and already carried on the agent_terminated trace event). turnCount = control
  // -loop iterations; completedActions = the ordered actions the agent ran.
  readonly turnCount?: number;
  readonly completedActions?: readonly string[];
}

/**
 * Action histogram for the run — how many times the agent took each action.
 * Pure; used for harness observability (the model-directed loop's action mix),
 * not for the persisted rollup. Order-independent counts keyed by action name.
 */
export function actionHistogram(
  actions: readonly string[],
): Readonly<Record<string, number>> {
  return actions.reduce<Record<string, number>>((acc, action) => {
    return { ...acc, [action]: (acc[action] ?? 0) + 1 };
  }, {});
}

/** Round a number to a fixed number of decimal places. */
function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Count occurrences of each label. Order-independent. */
function tally(labels: readonly string[]): Record<string, number> {
  return labels.reduce<Record<string, number>>(
    (acc, label) => ({ ...acc, [label]: (acc[label] ?? 0) + 1 }),
    {},
  );
}

/**
 * Nearest-rank percentile of an ascending-sorted sample. p95 is the smallest
 * value at or above the 95th percentile. Returns 0 for an empty sample.
 */
function percentile(sortedAsc: readonly number[], p: number): number {
  if (sortedAsc.length === 0) {
    return 0;
  }
  const rank = Math.ceil((p / 100) * sortedAsc.length);
  const index = Math.min(sortedAsc.length - 1, Math.max(0, rank - 1));
  return sortedAsc[index] ?? 0;
}

/** Distribution (count, avg, p50/p95/p99, max) of a numeric sample. */
function distribution(values: readonly number[], decimals = 2): MetricDistribution {
  const count = values.length;
  if (count === 0) {
    return { count: 0, avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count,
    avg: roundTo(total / count, decimals),
    p50: roundTo(percentile(sorted, 50), decimals),
    p95: roundTo(percentile(sorted, 95), decimals),
    p99: roundTo(percentile(sorted, 99), decimals),
    max: roundTo(sorted[sorted.length - 1] ?? 0, decimals),
  };
}

/** Empty rollup for when no runs have been recorded yet. */
const EMPTY_DISTRIBUTION: MetricDistribution = {
  count: 0,
  avg: 0,
  p50: 0,
  p95: 0,
  p99: 0,
  max: 0,
};

const EMPTY_SUMMARY: MetricsSummary = {
  total_runs: 0,
  duration_ms: EMPTY_DISTRIBUTION,
  cost_usd: { ...EMPTY_DISTRIBUTION, total: 0 },
  loop_count: EMPTY_DISTRIBUTION,
  tool_call_count: EMPTY_DISTRIBUTION,
  max_loop_reached_count: 0,
  retry_count: 0,
  clarification_count: 0,
  guardrail_triggers: 0,
  terminal_state: {},
  eval_result: {},
  final_review_confidence: {},
  search_depth: {},
  cost_accuracy: {},
};

/** Sum a numeric field across runs. */
function sumOf(
  metrics: readonly RunMetrics[],
  pick: (m: RunMetrics) => number,
): number {
  return metrics.reduce((sum, m) => sum + pick(m), 0);
}

/**
 * Aggregates per-run metrics into one fleet-wide observability rollup with
 * percentiles, mirroring the established OTel instruments. Pure function — no
 * IO, no framework dependencies. Duration, loop, and tool-call distributions
 * cover every run; the cost distribution covers only runs with a recorded cost
 * (a null cost is unknown, not zero). Runs with no eval verdict or confidence
 * are left out of those breakdowns.
 */
export function summarizeRunMetrics(
  metrics: readonly RunMetrics[],
): MetricsSummary {
  if (metrics.length === 0) {
    return EMPTY_SUMMARY;
  }

  const costs = metrics
    .map((m) => m.total_cost_usd)
    .filter((cost): cost is number => cost !== null);
  const evalVerdicts = metrics
    .map((m) => m.eval_result)
    .filter((verdict): verdict is EvalResult => verdict !== null);
  const confidences = metrics
    .map((m) => m.final_review_confidence)
    .filter((label): label is ConfidenceLabel => label !== null);

  return metricsSummarySchema.parse({
    total_runs: metrics.length,
    duration_ms: distribution(metrics.map((m) => m.duration_ms), 0),
    cost_usd: {
      ...distribution(costs, 4),
      total: roundTo(sumOf(metrics, (m) => m.total_cost_usd ?? 0), 4),
    },
    loop_count: distribution(metrics.map((m) => m.loop_count)),
    tool_call_count: distribution(metrics.map((m) => m.tool_call_count)),
    max_loop_reached_count: metrics.filter((m) => m.max_loop_reached).length,
    retry_count: sumOf(metrics, (m) => m.retry_count),
    clarification_count: sumOf(metrics, (m) => m.clarification_count),
    guardrail_triggers: sumOf(metrics, (m) => m.guardrail_trigger_count),
    terminal_state: tally(metrics.map((m) => m.terminal_state)),
    eval_result: tally(evalVerdicts),
    final_review_confidence: tally(confidences),
    search_depth: tally(metrics.map((m) => m.search_depth)),
    cost_accuracy: tally(metrics.map((m) => m.cost_accuracy)),
  });
}

/**
 * Assembles a validated RunMetrics from raw run signals.
 * Pure function — no IO, no framework dependencies.
 */
export function buildRunMetrics(signals: RunSignals): RunMetrics {
  const rawDuration = signals.endedAtMs - signals.startedAtMs;
  const durationMs = Math.max(0, rawDuration);

  const loopCount = Math.max(0, signals.loopCount ?? 0);
  const maxLoopReached = loopCount >= MAX_LOOP_COUNT;

  const retryCount = Math.max(0, signals.retryCount ?? 0);
  const clarificationCount = Math.max(0, signals.clarificationCount ?? 0);
  const toolCallCount = Math.max(0, signals.toolCallCount ?? 0);
  const guardrailTriggerCount = Math.max(0, signals.guardrailTriggerCount ?? 0);

  const totalCostUsd = signals.totalCostUsd ?? null;
  const costAccuracy: CostAccuracy =
    totalCostUsd === null ? 'unknown' : (signals.costAccuracy ?? 'estimated');

  return runMetricsSchema.parse({
    run_id: signals.runId,
    duration_ms: durationMs,
    terminal_state: signals.terminalState,
    stop_reason: signals.stopReason,
    retry_count: retryCount,
    loop_count: loopCount,
    max_loop_reached: maxLoopReached,
    clarification_count: clarificationCount,
    search_depth: signals.searchDepth ?? 'no_search',
    tool_call_count: toolCallCount,
    final_review_confidence: signals.finalConfidence ?? null,
    eval_result: signals.evalResult ?? null,
    guardrail_trigger_count: guardrailTriggerCount,
    total_cost_usd: totalCostUsd,
    cost_accuracy: costAccuracy,
  });
}
