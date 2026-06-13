import {
  runMetricsSchema,
  type RunMetrics,
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
