// Phase 7 / Phase 8 §11 — Evaluation Model. Automated eval is support only;
// human review remains required (hard lock).

export const EVAL_RESULTS = ['pass', 'weak', 'fail'] as const;
export type EvalResult = (typeof EVAL_RESULTS)[number];

/** The 12-dimension rubric (Phase 7 / Phase 8 §11). */
export const EVAL_DIMENSIONS = [
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
] as const;
export type EvalDimension = (typeof EVAL_DIMENSIONS)[number];

export const EVALUATOR_TYPES = ['manual', 'automated_assist', 'mixed'] as const;
export type EvaluatorType = (typeof EVALUATOR_TYPES)[number];

/** Per-dimension verdict. */
export const DIMENSION_VERDICTS = ['strong', 'adequate', 'weak', 'critical_failure'] as const;
export type DimensionVerdict = (typeof DIMENSION_VERDICTS)[number];
