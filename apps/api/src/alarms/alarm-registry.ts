import { z } from 'zod';
import { ERROR_TYPES, ERROR_SEVERITIES, type ErrorType } from '@dgb/shared';

/**
 * Alarms pillar — the declarative alarm registry.
 *
 * Mirrors the guardrail registry pattern: alarms are *declared*, not implicit.
 * Each entry binds a named error type (from the frozen ERROR_TYPES taxonomy) to
 * its default severity, a coarse category, and a fixed `recommended_action`. The
 * AlarmService looks an entry up by type when raising an alarm, so the operator
 * always gets a named type + severity + recommended action — never an ad-hoc
 * string. The registry is validated at module load; a malformed entry throws.
 */

export const ALARM_CATEGORIES = [
  'tool',
  'cost',
  'evaluation',
  'system',
  'input',
] as const;
export type AlarmCategory = (typeof ALARM_CATEGORIES)[number];

export const alarmRegistryEntrySchema = z.object({
  type: z.enum(ERROR_TYPES),
  severity: z.enum(ERROR_SEVERITIES),
  category: z.enum(ALARM_CATEGORIES),
  recommended_action: z.string().min(1),
});
export type AlarmRegistryEntry = z.infer<typeof alarmRegistryEntrySchema>;

const RAW_REGISTRY: readonly AlarmRegistryEntry[] = [
  // Tool / external-check limitations — a failed check narrows the review, it
  // never fabricates evidence (preserves invariant I6).
  {
    type: 'tool_error',
    severity: 'recoverable',
    category: 'tool',
    recommended_action:
      'Treat the unverified claim as an open evidence gap; do not raise confidence on its basis.',
  },
  {
    type: 'tool_timeout',
    severity: 'recoverable',
    category: 'tool',
    recommended_action:
      'Retry the external check once; if it times out again, finalize with the claim marked unverified.',
  },
  {
    type: 'tool_unavailable',
    severity: 'recoverable',
    category: 'tool',
    recommended_action:
      'Proceed without the external check and flag the dependent assumption as needing direct evidence.',
  },
  {
    type: 'source_unreachable',
    severity: 'recoverable',
    category: 'tool',
    recommended_action:
      'Record the source as unreachable and ask the user to supply the document directly.',
  },
  // Cost / budget ceilings — hard stops enforced by the harness.
  {
    type: 'cost_budget_exceeded',
    severity: 'blocking',
    category: 'cost',
    recommended_action:
      'Review ran out of cost budget. Re-run with a higher AGENT_BUDGET.MAX_COST_USD or a cheaper model.',
  },
  {
    type: 'retry_budget_exceeded',
    severity: 'blocking',
    category: 'cost',
    recommended_action:
      'Review hit the max-turns ceiling. Tighten the input scope or raise AGENT_BUDGET.MAX_TURNS, then re-run.',
  },
  {
    type: 'tool_budget_exceeded',
    severity: 'limited',
    category: 'cost',
    recommended_action:
      'External-check budget spent. Finalize with current evidence; verify the remaining claims manually.',
  },
  // Evaluation checkpoint failures — the review needs human attention.
  {
    type: 'critical_failure_detected',
    severity: 'blocking',
    category: 'evaluation',
    recommended_action:
      'Do not rely on this review. A human must resolve the flagged critical failure before acting.',
  },
  {
    type: 'eval_failed',
    severity: 'blocking',
    category: 'evaluation',
    recommended_action:
      'Structural evaluation failed. Inspect the eval record and correct the output before use.',
  },
  {
    type: 'regression_triggered',
    severity: 'blocking',
    category: 'evaluation',
    recommended_action:
      'A known regression case fired. Compare against the golden fixture and fix the offending stage.',
  },
  // System / provider failures — terminal for the run.
  {
    type: 'schema_validation_error',
    severity: 'terminal',
    category: 'system',
    recommended_action:
      'Output failed schema validation. This is a harness bug — check the failing stage against reviewOutputSchema.',
  },
  {
    type: 'provider_error',
    severity: 'terminal',
    category: 'system',
    recommended_action:
      'The model provider returned an error. Verify the BYOK key, model id, and provider status, then re-run.',
  },
  {
    type: 'rate_limit',
    severity: 'recoverable',
    category: 'system',
    recommended_action:
      'Provider rate limit hit. Wait and re-run, or supply a key with higher throughput.',
  },
  {
    type: 'timeout',
    severity: 'blocking',
    category: 'system',
    recommended_action:
      'An operation timed out. Re-run; if it persists, reduce input size or check network/provider latency.',
  },
  {
    type: 'network_error',
    severity: 'recoverable',
    category: 'system',
    recommended_action:
      'A network call failed. Check connectivity and re-run the review.',
  },
  {
    type: 'storage_error',
    severity: 'terminal',
    category: 'system',
    recommended_action:
      'Persistence failed. Check the database connection/disk and re-run; the run state may be incomplete.',
  },
  {
    type: 'serialization_error',
    severity: 'terminal',
    category: 'system',
    recommended_action:
      'Failed to (de)serialize run state. Inspect the offending payload; replay from the last good checkpoint.',
  },
  {
    type: 'unknown_error',
    severity: 'terminal',
    category: 'system',
    recommended_action:
      'An unclassified error ended the run. Inspect the trace and logs for the root cause, then re-run.',
  },
  // Input limitations.
  {
    type: 'insufficient_input',
    severity: 'limited',
    category: 'input',
    recommended_action:
      'The decision is missing required substance. Surface the clarification questions and ask the user to resubmit.',
  },
];

/** Validated registry — a malformed entry throws at module load. */
export const ALARM_REGISTRY: readonly AlarmRegistryEntry[] = RAW_REGISTRY.map((entry) =>
  alarmRegistryEntrySchema.parse(entry),
);

/** Look up a declared alarm entry by type. Throws if the type is not declared. */
export function alarmEntry(type: ErrorType): AlarmRegistryEntry {
  const entry = ALARM_REGISTRY.find((e) => e.type === type);
  if (!entry) {
    // A raised-but-undeclared alarm type is a programming error: the AlarmService
    // must only raise declared types so severity + recommended action are defined.
    throw new Error(`No alarm registry entry for type: ${type}`);
  }
  return entry;
}
