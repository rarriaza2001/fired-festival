import { z } from 'zod';
import { ERROR_TYPES, ERROR_SEVERITIES } from '../constants/errors.js';
import { WORKFLOW_STAGES } from '../constants/workflow-stages.js';

/**
 * Harness alarm — the structured output the *alarms* pillar produces when
 * something goes wrong. An alarm names what failed (`type`, drawn from the
 * frozen ERROR_TYPES taxonomy), how bad it is (`severity`), where it happened
 * (`stage`), a human-readable `message`, bounded `context`, and — crucially —
 * a `recommended_action` telling the operator what to do about it.
 *
 * Distinct from a guardrail trigger: a guardrail *constrains* the agent before
 * output; an alarm *reports a failure or limitation* to the operator. Distinct
 * from a raw DgbError: an alarm always carries a recommended action and is the
 * shape that is persisted + emitted on the trace as `alarm_raised`.
 */
export const alarmSchema = z.object({
  type: z.enum(ERROR_TYPES),
  severity: z.enum(ERROR_SEVERITIES),
  stage: z.enum(WORKFLOW_STAGES).nullable().default(null),
  message: z.string().min(1),
  // The named, actionable remediation — the field the rubric requires and a
  // bare DgbError lacks. Never empty.
  recommended_action: z.string().min(1),
  // Bounded references only — never prompts, raw sources, or BYOK keys.
  context: z.record(z.unknown()).default({}),
});

export type Alarm = z.infer<typeof alarmSchema>;
