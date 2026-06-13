// Phase 3 — Core Review Workflow. The 14-step deterministic spine every
// serious review must pass through. It cannot jump from raw input to review.

export const WORKFLOW_STAGES = [
  'intake',
  'input_sufficiency_check',
  'clarification_gate',
  'decision_artifact_extraction',
  'review_scope_confirmation',
  'assumption_discovery',
  'assumption_prioritization',
  'evidence_assessment',
  'reality_contradiction_check',
  'failure_mode_analysis',
  'confidence_calibration',
  'next_action_framing',
  'review_output_assembly',
  'review_trace',
] as const;

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

/** Ordered spine — used by the orchestrator to enforce progression. */
export const WORKFLOW_SPINE: readonly WorkflowStage[] = WORKFLOW_STAGES;
