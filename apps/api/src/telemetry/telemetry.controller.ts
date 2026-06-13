import { Controller, Get, Param, Query, NotFoundException } from '@nestjs/common';
import { runMetricsSchema, type RunMetrics, type TraceEvent } from '@dgb/shared';
import { PrismaService } from '../persistence/prisma.service';
import { traceRowToEvent } from '../trace/trace-row';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** A persisted Metric row (columnar phase8.v1 rollup). */
interface MetricRow {
  runId: string;
  durationMs: number;
  terminalState: string;
  stopReason: string;
  retryCount: number;
  loopCount: number;
  maxLoopReached: boolean;
  clarificationCount: number;
  searchDepth: string;
  toolCallCount: number;
  finalReviewConfidence: string | null;
  evalResult: string | null;
  guardrailTriggerCount: number;
  totalCostUsd: number | null;
  costAccuracy: string;
}

/** Map a persisted Metric row to the validated snake_case RunMetrics shape. */
function metricRowToRunMetrics(row: MetricRow): RunMetrics {
  return runMetricsSchema.parse({
    run_id: row.runId,
    duration_ms: row.durationMs,
    terminal_state: row.terminalState,
    stop_reason: row.stopReason,
    retry_count: row.retryCount,
    loop_count: row.loopCount,
    max_loop_reached: row.maxLoopReached,
    clarification_count: row.clarificationCount,
    search_depth: row.searchDepth,
    tool_call_count: row.toolCallCount,
    final_review_confidence: row.finalReviewConfidence,
    eval_result: row.evalResult,
    guardrail_trigger_count: row.guardrailTriggerCount,
    total_cost_usd: row.totalCostUsd,
    cost_accuracy: row.costAccuracy,
  });
}

function clampLimit(raw?: string): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

/**
 * Telemetry read API (no auth — local/hackathon use). Serves the persisted
 * phase8.v1 rollups and full traces as JSON, independent of whether the OTel
 * export is enabled. OTel metrics themselves are scraped from the separate
 * Prometheus endpoint (`GET :<OTEL_PROMETHEUS_PORT>/metrics`).
 */
@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly prisma: PrismaService) {}

  /** Recent per-run metric rollups, newest first. */
  @Get('metrics')
  async listMetrics(@Query('limit') limit?: string): Promise<RunMetrics[]> {
    const rows = await this.prisma.metric.findMany({
      take: clampLimit(limit),
      orderBy: { review: { createdAt: 'desc' } },
    });
    return rows.map(metricRowToRunMetrics);
  }

  /** The metric rollup for one run. */
  @Get('metrics/:runId')
  async getMetrics(@Param('runId') runId: string): Promise<RunMetrics> {
    const row = await this.prisma.metric.findUnique({ where: { runId } });
    if (!row) throw new NotFoundException(`No metrics for run ${runId}`);
    return metricRowToRunMetrics(row);
  }

  /** The full persisted trace for one run, in emit order. */
  @Get('traces/:runId')
  async getTrace(@Param('runId') runId: string): Promise<TraceEvent[]> {
    const rows = await this.prisma.traceEvent.findMany({
      where: { runId },
      orderBy: { id: 'asc' },
    });
    if (rows.length === 0) throw new NotFoundException(`No trace for run ${runId}`);
    return rows.map(traceRowToEvent);
  }

  /** Structured alarms raised during one run, in fire order (newest insight last). */
  @Get('alarms/:runId')
  async getAlarms(@Param('runId') runId: string): Promise<AlarmView[]> {
    const rows = await this.prisma.alarm.findMany({
      where: { runId },
      orderBy: { id: 'asc' },
    });
    return rows.map(alarmRowToView);
  }
}

/** A persisted Alarm row rendered for the read API. */
interface AlarmView {
  type: string;
  severity: string;
  category: string;
  recommended_action: string;
  message: string;
  context: unknown;
  created_at: string;
}

function alarmRowToView(row: {
  type: string;
  severity: string;
  category: string;
  recommendedAction: string;
  message: string;
  context: string;
  createdAt: Date;
}): AlarmView {
  let context: unknown = {};
  try {
    context = JSON.parse(row.context);
  } catch {
    context = {};
  }
  return {
    type: row.type,
    severity: row.severity,
    category: row.category,
    recommended_action: row.recommendedAction,
    message: row.message,
    context,
    created_at: row.createdAt.toISOString(),
  };
}
