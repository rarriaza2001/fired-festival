import { Injectable } from '@nestjs/common';
import type { RunMetrics } from '@dgb/shared';
import { PrismaService } from '../persistence/prisma.service';
import { JsonLogger } from '../logger/json-logger';
import { buildRunMetrics, actionHistogram, type RunSignals } from './metrics-builder';

/**
 * Persists per-run metrics to the Metric table and emits a structured log line.
 * Never logs or persists API keys or prompt content.
 */
@Injectable()
export class MetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: JsonLogger,
  ) {}

  async record(signals: RunSignals): Promise<RunMetrics> {
    const metrics = buildRunMetrics(signals);

    const row = {
      durationMs: metrics.duration_ms,
      terminalState: metrics.terminal_state,
      stopReason: metrics.stop_reason,
      retryCount: metrics.retry_count,
      loopCount: metrics.loop_count,
      maxLoopReached: metrics.max_loop_reached,
      clarificationCount: metrics.clarification_count,
      searchDepth: metrics.search_depth,
      toolCallCount: metrics.tool_call_count,
      finalReviewConfidence: metrics.final_review_confidence,
      evalResult: metrics.eval_result,
      guardrailTriggerCount: metrics.guardrail_trigger_count,
      totalCostUsd: metrics.total_cost_usd,
      costAccuracy: metrics.cost_accuracy,
    };

    await this.prisma.metric.upsert({
      where: { runId: metrics.run_id },
      create: { runId: metrics.run_id, ...row },
      update: row,
    });

    this.logger.event('info', 'run_metrics', {
      run_id: metrics.run_id,
      duration_ms: metrics.duration_ms,
      terminal_state: metrics.terminal_state,
      total_cost_usd: metrics.total_cost_usd,
      cost_accuracy: metrics.cost_accuracy,
      eval_result: metrics.eval_result,
      loop_count: metrics.loop_count,
      // Agent-harness observability: control-loop iterations + action mix.
      turn_count: signals.turnCount ?? 0,
      action_histogram: actionHistogram(signals.completedActions ?? []),
    });

    return metrics;
  }
}
