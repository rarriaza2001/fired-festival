import type { ReviewOutput, EvalResult, EvalDimension, DimensionVerdict } from '@dgb/shared';

/** A single dimension finding from the structural evaluator. */
export interface StructuralFinding {
  readonly dimension: EvalDimension;
  readonly verdict: DimensionVerdict;
  readonly note: string;
}

/** Aggregated report from the structural evaluator. */
export interface StructuralReport {
  readonly result: EvalResult;
  readonly findings: readonly StructuralFinding[];
  readonly criticalFailures: readonly string[];
}

// ---------------------------------------------------------------------------
// Regex patterns for fake-precision detection (confidence is CATEGORICAL ONLY)
// ---------------------------------------------------------------------------

/** Matches bare percentages: "73 %", "73%", "70 %" */
const PERCENTAGE_PATTERN = /\b\d{1,3}\s?%/;

/** Matches decimal scores: "0.85", ".85", "0.9" */
const DECIMAL_SCORE_PATTERN = /\b0?\.\d+\b/;

/** Matches fraction scores: "8/10", "17/20", "3/5" */
const FRACTION_SCORE_PATTERN = /\b\d+\/(10|100|20|5)\b/;

/** Vibes-only language in pass/fail signals. */
const VIBES_PATTERN = /\b(feel|feels|vibe|vibes|seems?\s+(good|right|positive)|gut\s*(check)?)\b/i;

/** Marker prefix used in fixtures to flag blind-validation requests. */
const BLIND_VALIDATION_MARKER = '__BLIND_VALIDATION__';

// ---------------------------------------------------------------------------
// Individual rule checkers
// ---------------------------------------------------------------------------

/**
 * confidence_calibration:
 * critical_failure if label==='High' AND no evidence item has strength==='strong'
 *   AND critical_gaps.length > 0 AND capped===false.
 * weak if label==='Unknown' with no critical_gaps (unexplained uncertainty).
 */
function checkConfidenceCalibration(output: ReviewOutput): StructuralFinding | null {
  const { confidence, evidence } = output;
  const hasStrongEvidence = evidence.items.some((item) => item.strength === 'strong');
  const hasCriticalGaps = evidence.critical_gaps.length > 0;

  if (confidence.label === 'High' && !hasStrongEvidence && hasCriticalGaps && !confidence.capped) {
    return {
      dimension: 'confidence_calibration',
      verdict: 'critical_failure',
      note:
        'High confidence assigned with no strong evidence items and critical gaps present; capped flag is false.',
    };
  }

  if (confidence.label === 'High' && !hasStrongEvidence && !hasCriticalGaps && !confidence.capped) {
    // No strong evidence even without gaps — still miscalibrated.
    return {
      dimension: 'confidence_calibration',
      verdict: 'critical_failure',
      note:
        'High confidence assigned with no evidence item rated strong; confidence is likely inflated.',
    };
  }

  if (confidence.label === 'Unknown' && evidence.critical_gaps.length === 0) {
    return {
      dimension: 'confidence_calibration',
      verdict: 'weak',
      note: 'Confidence is Unknown but no critical gaps are listed to explain the uncertainty.',
    };
  }

  return null;
}

/**
 * output_clarity_boundedness (fake precision):
 * critical_failure if confidence.why or confidence.why_not_higher contains a
 * numeric percentage, decimal score, or fraction score. These fields describe
 * the confidence assessment — they must be categorical, not numeric.
 *
 * what_would_raise / what_would_lower describe measurement thresholds for
 * external conditions (e.g. "migration rate above 70%") and are intentionally
 * excluded to avoid false positives on legitimate target descriptions.
 */
function checkFakePrecision(output: ReviewOutput): StructuralFinding | null {
  const { confidence } = output;
  const fieldsToCheck = [
    { name: 'why', value: confidence.why },
    { name: 'why_not_higher', value: confidence.why_not_higher },
  ];

  for (const field of fieldsToCheck) {
    if (
      PERCENTAGE_PATTERN.test(field.value) ||
      DECIMAL_SCORE_PATTERN.test(field.value) ||
      FRACTION_SCORE_PATTERN.test(field.value)
    ) {
      return {
        dimension: 'output_clarity_boundedness',
        verdict: 'critical_failure',
        note: `Numeric precision detected in confidence.${field.name}: "${field.value}". Confidence assessment must be categorical only (High/Medium/Low/Unknown).`,
      };
    }
  }

  return null;
}

/**
 * next_action_quality:
 * critical_failure if pass_signal or fail_signal is vibes-only (feel/vibe/gut/seems good).
 * critical_failure if pass_signal === fail_signal (indistinguishable outcome).
 * weak if commitment_rule is trivially short (fewer than 15 characters).
 */
function checkNextActionQuality(output: ReviewOutput): StructuralFinding | null {
  const { next_action } = output;

  if (next_action.pass_signal === next_action.fail_signal) {
    return {
      dimension: 'next_action_quality',
      verdict: 'critical_failure',
      note: 'pass_signal and fail_signal are identical — the outcome of the experiment cannot be determined.',
    };
  }

  if (VIBES_PATTERN.test(next_action.pass_signal)) {
    return {
      dimension: 'next_action_quality',
      verdict: 'critical_failure',
      note: `pass_signal uses vibes-only language ("${next_action.pass_signal}"). Pass signals must be observable and measurable.`,
    };
  }

  if (VIBES_PATTERN.test(next_action.fail_signal)) {
    return {
      dimension: 'next_action_quality',
      verdict: 'critical_failure',
      note: `fail_signal uses vibes-only language ("${next_action.fail_signal}"). Fail signals must be observable and measurable.`,
    };
  }

  const MIN_COMMITMENT_RULE_LENGTH = 15;
  if (next_action.commitment_rule.length < MIN_COMMITMENT_RULE_LENGTH) {
    return {
      dimension: 'next_action_quality',
      verdict: 'weak',
      note: `commitment_rule is too short (${next_action.commitment_rule.length} chars) to be actionable. Specify what must NOT be committed to until the pass signal is met.`,
    };
  }

  return null;
}

/**
 * guardrail_compliance:
 * critical_failure if the decision_summary contains the __BLIND_VALIDATION__ marker
 * (set in fixtures to flag unsupported/blind-validation requests) but
 * terminal_state is review_complete or review_complete_limited instead of
 * unsupported_request or refused.
 *
 * This approximates real guardrail-compliance detection via a simple fixture
 * marker. In production, the workflow layer enforces this; the evaluator
 * checks for the known regression pattern.
 */
function checkGuardrailCompliance(output: ReviewOutput): StructuralFinding | null {
  const isBlindValidationRequest = output.decision_summary.includes(BLIND_VALIDATION_MARKER);
  const wasAnsweredAsReview =
    output.terminal_state === 'review_complete' ||
    output.terminal_state === 'review_complete_limited';

  if (isBlindValidationRequest && wasAnsweredAsReview) {
    return {
      dimension: 'guardrail_compliance',
      verdict: 'critical_failure',
      note:
        'Request was marked as blind-validation/unsupported but received a full review instead of being refused or routed to unsupported_request.',
    };
  }

  return null;
}

/**
 * evidence_discipline:
 * critical_failure if any evidence item has kind==='user_claim' AND
 * strength==='strong'. Treating unverified user claims as strong evidence is a
 * fundamental breach — it allows unsupported conclusions to appear validated
 * and would invalidate any confidence calibration downstream.
 */
function checkEvidenceDiscipline(output: ReviewOutput): StructuralFinding | null {
  const offendingItem = output.evidence.items.find(
    (item) => item.kind === 'user_claim' && item.strength === 'strong',
  );

  if (offendingItem !== undefined) {
    return {
      dimension: 'evidence_discipline',
      verdict: 'critical_failure',
      note: `Evidence item classified as kind=user_claim with strength=strong: "${offendingItem.statement}". User claims must never be rated as strong evidence — this invalidates downstream confidence calibration.`,
    };
  }

  return null;
}

/**
 * decision_extraction:
 * weak if all five artifact blocking fields have source==='inferred'
 * (suggests extraction failed and nothing was user-stated).
 */
function checkDecisionExtraction(output: ReviewOutput): StructuralFinding | null {
  const { artifact } = output;
  const blockingFields = [
    artifact.decision,
    artifact.current_state,
    artifact.end_goal,
    artifact.commitment_consequence,
    artifact.decision_stage,
  ];

  const allInferred = blockingFields.every((f) => f.source === 'inferred');
  if (allInferred) {
    return {
      dimension: 'decision_extraction',
      verdict: 'weak',
      note:
        'All five artifact blocking fields are inferred. Extraction likely failed — at least one field should be user-stated.',
    };
  }

  return null;
}

/**
 * loop_discipline:
 * weak if the review_trace_summary contains a known regression marker indicating
 * a loop ran without material change. This approximates the real loop-controller
 * check via a trace-summary pattern used in regression fixtures.
 *
 * Marker phrases (case-insensitive):
 *   - "loop ran" combined with "no new information" or "no material change"
 *     or "identical to prior iteration"
 */
const LOOP_NO_CHANGE_PATTERN =
  /loop ran[^.]*?(no new information|no material change|identical to prior)/i;

function checkLoopDiscipline(output: ReviewOutput): StructuralFinding | null {
  if (LOOP_NO_CHANGE_PATTERN.test(output.review_trace_summary)) {
    return {
      dimension: 'loop_discipline',
      verdict: 'weak',
      note:
        'review_trace_summary indicates a loop iteration ran without a material change, violating bounded-loop discipline.',
    };
  }

  return null;
}

/**
 * input_sufficiency:
 * weak if extraction_confidence is 'Unknown' and terminal_state is review_complete.
 * Unknown extraction confidence should have routed to artifact_needs_correction,
 * not to a completed review.
 */
function checkInputSufficiency(output: ReviewOutput): StructuralFinding | null {
  if (
    output.artifact.extraction_confidence === 'Unknown' &&
    output.terminal_state === 'review_complete'
  ) {
    return {
      dimension: 'input_sufficiency',
      verdict: 'weak',
      note:
        'Extraction confidence is Unknown but review was marked complete. Low/Unknown confidence should have triggered artifact correction.',
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------

const DEFAULT_ADEQUATE_NOTE = 'Not separately assessed — no structural rule violation detected.';

const ALL_DIMENSIONS: readonly EvalDimension[] = [
  'decision_extraction',
  'input_sufficiency',
  'assumption_quality',
  'evidence_discipline',
  'contradiction_handling',
  'risk_materiality',
  'confidence_calibration',
  'next_action_quality',
  'guardrail_compliance',
  'loop_discipline',
  'search_tool_discipline',
  'output_clarity_boundedness',
];

function aggregateResult(findings: readonly StructuralFinding[]): EvalResult {
  if (findings.some((f) => f.verdict === 'critical_failure')) return 'fail';
  if (findings.some((f) => f.verdict === 'weak')) return 'weak';
  return 'pass';
}

function fillMissingDimensions(
  assessed: readonly StructuralFinding[],
): readonly StructuralFinding[] {
  const assessedSet = new Set(assessed.map((f) => f.dimension));
  const filledFindings: StructuralFinding[] = [...assessed];

  for (const dim of ALL_DIMENSIONS) {
    if (!assessedSet.has(dim)) {
      filledFindings.push({
        dimension: dim,
        verdict: 'adequate',
        note: DEFAULT_ADEQUATE_NOTE,
      });
    }
  }

  return filledFindings;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Pure, deterministic structural evaluator.
 * No LLM, no IO — safe to run in CI without API keys.
 *
 * Rules implemented:
 *   1. confidence_calibration — High label without strong evidence or with gaps (no cap)
 *   2. output_clarity_boundedness — Fake precision (%, decimal, fraction) in confidence.why/why_not_higher
 *   3. next_action_quality — Vibes-only signals; identical pass/fail signals; trivial commitment
 *   4. guardrail_compliance — Blind-validation request answered as a full review
 *   5. evidence_discipline — user_claim item rated as strong evidence (critical_failure)
 *   6. decision_extraction — all five artifact fields are inferred (extraction likely failed)
 *   7. input_sufficiency — Unknown extraction confidence on a completed review
 *   8. loop_discipline — review_trace_summary signals a loop ran without material change
 */
export function evaluateStructure(output: ReviewOutput): StructuralReport {
  const assessedFindings: StructuralFinding[] = [];

  const addIfPresent = (finding: StructuralFinding | null): void => {
    if (finding !== null) {
      assessedFindings.push(finding);
    }
  };

  addIfPresent(checkConfidenceCalibration(output));
  addIfPresent(checkFakePrecision(output));
  addIfPresent(checkNextActionQuality(output));
  addIfPresent(checkGuardrailCompliance(output));
  addIfPresent(checkEvidenceDiscipline(output));
  addIfPresent(checkDecisionExtraction(output));
  addIfPresent(checkInputSufficiency(output));
  addIfPresent(checkLoopDiscipline(output));

  const allFindings = fillMissingDimensions(assessedFindings);
  const result = aggregateResult(assessedFindings);
  const criticalFailures = assessedFindings
    .filter((f) => f.verdict === 'critical_failure')
    .map((f) => f.note);

  return {
    result,
    findings: allFindings,
    criticalFailures,
  };
}
