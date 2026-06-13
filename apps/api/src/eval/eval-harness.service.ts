import { Injectable } from '@nestjs/common';
import {
  EVAL_DIMENSIONS,
  evalResultRecordSchema,
  type EvalResultRecord,
  type EvalDimension,
  type DimensionVerdict,
} from '@dgb/shared';
import type { ReviewOutput } from '@dgb/shared';
import { PrismaService } from '../persistence/prisma.service';
import { EvalJudge } from './eval-judge';
import { evaluateStructure } from './structural-evaluator';
import type { StructuralFinding } from './structural-evaluator';
import type { Byok } from '../llm/llm.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOT_ASSESSED_NOTE = 'Not separately assessed — no structural rule violation detected.';

/**
 * Fills the 12-dimension array from structural findings.
 * Assessed dimensions use the finding's verdict and note;
 * all remaining dimensions are filled as 'adequate'.
 */
function buildDimensions(
  findings: readonly StructuralFinding[],
): Array<{ dimension: EvalDimension; verdict: DimensionVerdict; note: string }> {
  const findingMap = new Map<EvalDimension, StructuralFinding>();
  for (const finding of findings) {
    // Keep the first (most severe) finding per dimension
    if (!findingMap.has(finding.dimension)) {
      findingMap.set(finding.dimension, finding);
    }
  }

  return EVAL_DIMENSIONS.map((dim) => {
    const finding = findingMap.get(dim);
    return finding !== undefined
      ? { dimension: dim, verdict: finding.verdict, note: finding.note }
      : { dimension: dim, verdict: 'adequate' as DimensionVerdict, note: NOT_ASSESSED_NOTE };
  });
}

function buildRecord(
  report: ReturnType<typeof evaluateStructure>,
  triggeredRegressionLabels: readonly string[],
): EvalResultRecord {
  const dimensions = buildDimensions(report.findings);

  const weakDimensions = dimensions
    .filter((d) => d.verdict === 'weak')
    .map((d) => d.dimension);

  const strongDimensions = dimensions
    .filter((d) => d.verdict === 'strong')
    .map((d) => d.dimension);

  return evalResultRecordSchema.parse({
    result: report.result,
    dimensions,
    critical_failures: [...report.criticalFailures],
    weak_dimensions: weakDimensions,
    strong_dimensions: strongDimensions,
    triggered_regression_labels: [...triggeredRegressionLabels],
    required_correction:
      report.criticalFailures.length > 0
        ? `Fix the following critical issues before relying on this review: ${report.criticalFailures.join('; ')}`
        : null,
    evaluator_type: 'automated_assist',
    human_review_required: true,
  });
}

// ---------------------------------------------------------------------------
// EvalHarnessService
// ---------------------------------------------------------------------------

/**
 * Orchestrates structural evaluation and optional LLM judging.
 *
 * evaluateRun — runs the deterministic structural evaluator, persists the
 *   EvalResult row, and returns the record. No LLM call; safe in CI.
 *
 * judgeRun — additionally calls the LLM judge and upserts the EvalResult
 *   row with the richer automated-assist record.
 */
@Injectable()
export class EvalHarnessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evalJudge: EvalJudge,
  ) {}

  /**
   * Runs the structural (deterministic) evaluator for a completed review run.
   * Persists the EvalResult row and returns the assembled record.
   *
   * No LLM is called here — keeps the live demo fast and cheap.
   */
  async evaluateRun(runId: string, output: ReviewOutput): Promise<EvalResultRecord> {
    const report = evaluateStructure(output);
    const record = buildRecord(report, []);

    await this.prisma.evalResult.create({
      data: {
        runId,
        result: record.result,
        evaluatorType: record.evaluator_type,
        humanReviewRequired: true,
        payload: JSON.stringify(record),
      },
    });

    return record;
  }

  /**
   * Calls the LLM judge for a richer evaluation and upserts the EvalResult row.
   * Use this sparingly — it costs tokens and is ASSIST ONLY.
   */
  async judgeRun(byok: Byok, runId: string, output: ReviewOutput): Promise<EvalResultRecord> {
    const record = await this.evalJudge.judge(byok, output);

    await this.prisma.evalResult.upsert({
      where: { runId },
      create: {
        runId,
        result: record.result,
        evaluatorType: record.evaluator_type,
        humanReviewRequired: true,
        payload: JSON.stringify(record),
      },
      update: {
        result: record.result,
        evaluatorType: record.evaluator_type,
        humanReviewRequired: true,
        payload: JSON.stringify(record),
      },
    });

    return record;
  }
}
