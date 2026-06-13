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
