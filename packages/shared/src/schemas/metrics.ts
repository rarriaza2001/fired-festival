import { z } from 'zod';
import { COST_ACCURACY } from '../constants/cost.js';
import { SEARCH_DEPTHS } from '../constants/search.js';
import { CONFIDENCE_LABELS } from '../constants/confidence.js';
import { EVAL_RESULTS } from '../constants/eval.js';
import { TERMINAL_STATES } from '../constants/review-states.js';
import { STOP_REASONS } from '../constants/loop.js';

/**
 * Phase 8 §3/§7 — Per-run rollup metrics. No metric exists unless it helps
 * debug quality, cost, speed, boundedness, or reliability. Cost is always
 * interpreted alongside eval result, terminal state, search depth, loop count.
 */
export const runMetricsSchema = z.object({
  run_id: z.string().min(1),
  // Operational
  duration_ms: z.number().nonnegative(),
  terminal_state: z.enum(TERMINAL_STATES),
  stop_reason: z.enum(STOP_REASONS),
  retry_count: z.number().int().min(0).default(0),
  // Boundedness
  loop_count: z.number().int().min(0).default(0),
  max_loop_reached: z.boolean().default(false),
  clarification_count: z.number().int().min(0).default(0),
  search_depth: z.enum(SEARCH_DEPTHS).default('no_search'),
  tool_call_count: z.number().int().min(0).default(0),
  // Quality
  final_review_confidence: z.enum(CONFIDENCE_LABELS).nullable().default(null),
  eval_result: z.enum(EVAL_RESULTS).nullable().default(null),
  guardrail_trigger_count: z.number().int().min(0).default(0),
  // Cost
  total_cost_usd: z.number().nonnegative().nullable().default(null),
  cost_accuracy: z.enum(COST_ACCURACY).default('unknown'),
});

export type RunMetrics = z.infer<typeof runMetricsSchema>;

/**
 * Distribution of one numeric metric across runs. Percentiles use the
 * nearest-rank method (p95 is the smallest sample at or above the 95th
 * percentile), which is the meaningful view for tail latency and cost.
 */
export const metricDistributionSchema = z.object({
  /** Number of runs that contributed a value to this distribution. */
  count: z.number().int().min(0),
  avg: z.number().nonnegative(),
  p50: z.number().nonnegative(),
  p95: z.number().nonnegative(),
  p99: z.number().nonnegative(),
  max: z.number().nonnegative(),
});

export type MetricDistribution = z.infer<typeof metricDistributionSchema>;

/**
 * Aggregate observability rollup across many runs. Served by
 * `GET /telemetry/metrics/summary` so an operator can read fleet-wide health in
 * one call instead of paging the per-run list. It mirrors the established OTel
 * instruments: run counts by terminal state and eval result, plus distributions
 * (avg + p50/p95/p99/max) for the speed, cost, and boundedness histograms.
 *
 * Breakdowns are counts keyed by label. `eval_result` and
 * `final_review_confidence` count only runs that produced that value, so their
 * counts can sum to fewer than `total_runs`. `cost_usd` covers only runs with a
 * recorded cost (`count` reports how many).
 */
export const metricsSummarySchema = z.object({
  total_runs: z.number().int().min(0),
  // Speed
  duration_ms: metricDistributionSchema,
  // Cost (over runs with a recorded cost)
  cost_usd: metricDistributionSchema.extend({
    total: z.number().nonnegative(),
  }),
  // Boundedness
  loop_count: metricDistributionSchema,
  tool_call_count: metricDistributionSchema,
  max_loop_reached_count: z.number().int().min(0),
  // Reliability (totals across all runs)
  retry_count: z.number().int().min(0),
  clarification_count: z.number().int().min(0),
  guardrail_triggers: z.number().int().min(0),
  // Quality / boundedness breakdowns (counts keyed by label)
  terminal_state: z.record(z.string(), z.number().int().min(0)),
  eval_result: z.record(z.string(), z.number().int().min(0)),
  final_review_confidence: z.record(z.string(), z.number().int().min(0)),
  search_depth: z.record(z.string(), z.number().int().min(0)),
  cost_accuracy: z.record(z.string(), z.number().int().min(0)),
});

export type MetricsSummary = z.infer<typeof metricsSummarySchema>;
