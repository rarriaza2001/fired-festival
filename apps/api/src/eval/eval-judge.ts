import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  EVAL_DIMENSIONS,
  dimensionResultSchema,
  evalResultRecordSchema,
  type EvalResultRecord,
  type DimensionResult,
} from '@dgb/shared';
import type { ReviewOutput } from '@dgb/shared';
import { StructuredLlmService } from '../llm/structured-llm.service';
import type { Byok } from '../llm/llm.types';

// ---------------------------------------------------------------------------
// LLM judge output schema — 12 dimension results + aggregated fields.
// The judge returns these; we assemble the full EvalResultRecord from them.
// ---------------------------------------------------------------------------

const judgeOutputSchema = z.object({
  dimensions: z.array(dimensionResultSchema).length(EVAL_DIMENSIONS.length),
  critical_failures: z.array(z.string()).default([]),
  required_correction: z.string().nullable().default(null),
});

type JudgeOutput = z.infer<typeof judgeOutputSchema>;

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a strict, impartial reviewer of decision stress-test outputs.

Your role is ASSIST ONLY — you help human reviewers spot patterns. You do NOT make final judgments.
Human review is ALWAYS required; this evaluation is never the final word.

You will be given a ReviewOutput JSON object. Score each of the 12 dimensions below.

DIMENSIONS (score every one, in order):
1. decision_extraction — Was the decision artifact clearly extracted?
2. input_sufficiency — Was input sufficient before the review began?
3. assumption_quality — Are assumptions specific, material, and falsifiable?
4. evidence_discipline — Are user claims clearly separated from evidence?
5. contradiction_handling — Were contradictions and reality checks addressed?
6. risk_materiality — Are failure modes causal and linked to assumptions?
7. confidence_calibration — Is confidence appropriate given evidence strength?
8. next_action_quality — Is the next action concrete with observable signals?
9. guardrail_compliance — Did guardrails fire correctly when needed?
10. loop_discipline — Were loops bounded and only run on material changes?
11. search_tool_discipline — Were search tools used appropriately (not over/under)?
12. output_clarity_boundedness — Is the output clear, bounded, and free of fake precision?

VERDICTS (for each dimension):
- strong: No issues; best-practice execution.
- adequate: No significant issues; minor room for improvement.
- weak: A meaningful deficiency that should be addressed but is not immediately blocking.
- critical_failure: A structural breach (e.g. High confidence with weak evidence; vibes-only signals; fake precision; unsupported request answered as review).

RULES:
- NEVER assign numeric scores, percentages, or fractions.
- One-line note per dimension explaining the verdict.
- If you detect a critical failure, add the note to critical_failures.
- If the review requires a structural correction before it can be trusted, populate required_correction.
- You are NOT the final word. Do not overstate certainty.

Return a single JSON object:
{
  "dimensions": [
    { "dimension": "<dimension_name>", "verdict": "<verdict>", "note": "<one-line explanation>" },
    ... (exactly 12 entries, one per dimension above, in order)
  ],
  "critical_failures": ["<note text for each critical_failure verdict>"],
  "required_correction": "<string or null>"
}`;

// ---------------------------------------------------------------------------
// EvalJudge
// ---------------------------------------------------------------------------

/**
 * LLM-powered evaluation judge.
 *
 * Calls the structured LLM service to score a ReviewOutput across the
 * 12-dimension rubric, then assembles a validated EvalResultRecord.
 *
 * This is ASSIST ONLY — human_review_required is hardcoded to true and
 * evaluator_type is fixed to 'automated_assist'.
 */
@Injectable()
export class EvalJudge {
  constructor(private readonly llm: StructuredLlmService) {}

  async judge(byok: Byok, output: ReviewOutput): Promise<EvalResultRecord> {
    const judgeOutput = await this.callLlm(byok, output);

    const weakDimensions = judgeOutput.dimensions
      .filter((d): d is DimensionResult => d.verdict === 'weak')
      .map((d) => d.dimension);

    const strongDimensions = judgeOutput.dimensions
      .filter((d): d is DimensionResult => d.verdict === 'strong')
      .map((d) => d.dimension);

    const hasCriticalFailure = judgeOutput.dimensions.some(
      (d) => d.verdict === 'critical_failure',
    );
    const hasWeak = judgeOutput.dimensions.some((d) => d.verdict === 'weak');

    const result = hasCriticalFailure ? 'fail' : hasWeak ? 'weak' : 'pass';

    return evalResultRecordSchema.parse({
      result,
      dimensions: judgeOutput.dimensions,
      critical_failures: judgeOutput.critical_failures,
      weak_dimensions: weakDimensions,
      strong_dimensions: strongDimensions,
      triggered_regression_labels: [],
      required_correction: judgeOutput.required_correction,
      evaluator_type: 'automated_assist',
      human_review_required: true,
    });
  }

  private async callLlm(byok: Byok, output: ReviewOutput): Promise<JudgeOutput> {
    const result = await this.llm.complete<JudgeOutput>(
      byok,
      judgeOutputSchema,
      SYSTEM_PROMPT,
      JSON.stringify(output),
      3000,
    );

    return result.data;
  }
}
