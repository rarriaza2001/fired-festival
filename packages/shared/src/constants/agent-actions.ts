// Agent harness — action space + budgets. The review is driven by a
// model-directed control loop (AgentRunner) that, each turn, selects one of
// these actions. Stage actions map 1:1 onto the existing 14-step review spine
// (workflow-stages), so functionality is unchanged — only the mechanism that
// chooses the next step changes (hardcoded order -> model decision).
import type { WorkflowStage } from './workflow-stages.js';

/**
 * The full action space the agent may choose from.
 * - Stage actions: one existing structured review stage each.
 * - Tool actions: the external-check tool (search / fetch / ingest adapter).
 * - Control actions: terminate the run (finalize / refuse / request clarify).
 */
export const AGENT_ACTIONS = [
  // Stage actions (mirror the review spine)
  'assess_sufficiency',
  'extract_artifact',
  'confirm_scope',
  'discover_assumptions',
  'assess_evidence',
  'check_reality_and_risks',
  'calibrate_confidence',
  'frame_next_action',
  'assemble_output',
  // Tool action
  'external_check',
  // Control actions
  'finalize',
  'refuse_unsupported',
  'request_clarification',
] as const;

export type AgentAction = (typeof AGENT_ACTIONS)[number];

/**
 * Stage actions that must all have run before `finalize` is legal. This is the
 * completeness gate that preserves the spine's guarantees under a model-chosen
 * order: the agent may reorder within preconditions, but cannot skip a stage.
 */
export const MANDATORY_STAGE_ACTIONS: readonly AgentAction[] = [
  'assess_sufficiency',
  'extract_artifact',
  'confirm_scope',
  'discover_assumptions',
  'assess_evidence',
  'check_reality_and_risks',
  'calibrate_confidence',
  'frame_next_action',
  'assemble_output',
] as const;

/** Control actions terminate the run; they are never "completed" stages. */
export const CONTROL_ACTIONS: readonly AgentAction[] = [
  'finalize',
  'refuse_unsupported',
  'request_clarification',
] as const;

/** Tool actions invoke the pluggable ToolAdapter; they do not satisfy a stage. */
export const TOOL_ACTIONS: readonly AgentAction[] = ['external_check'] as const;

/**
 * Map each action to the workflow stage it belongs to, for trace emission and
 * legality checks. Tool/control actions map to their nearest spine stage.
 */
export const AGENT_ACTION_STAGE: Readonly<Record<AgentAction, WorkflowStage>> = {
  assess_sufficiency: 'input_sufficiency_check',
  extract_artifact: 'decision_artifact_extraction',
  confirm_scope: 'review_scope_confirmation',
  discover_assumptions: 'assumption_discovery',
  assess_evidence: 'evidence_assessment',
  check_reality_and_risks: 'failure_mode_analysis',
  calibrate_confidence: 'confidence_calibration',
  frame_next_action: 'next_action_framing',
  assemble_output: 'review_output_assembly',
  external_check: 'evidence_assessment',
  finalize: 'review_trace',
  refuse_unsupported: 'input_sufficiency_check',
  request_clarification: 'clarification_gate',
} as const;

/**
 * Hard budgets enforced by the harness (protection pillar). The model proposes
 * actions; the harness stops the loop when any budget is exhausted, regardless
 * of what the model wants. MAX_TURNS comfortably exceeds the 9 mandatory stages
 * plus the bounded reassessment loop and a few tool calls.
 */
export const AGENT_BUDGET = {
  MAX_TURNS: 32,
  MAX_TOOL_CALLS: 8,
  MAX_COST_USD: 2.0,
} as const;

/**
 * Why the agent loop stopped. A superset of the run stop reasons that also
 * covers the harness-level budget guards. Carried on the `agent_terminated`
 * trace event (in `details.termination_reason`).
 */
export const AGENT_TERMINATION_REASONS = [
  'review_complete',
  'review_complete_limited',
  'input_insufficient',
  'unsupported_request',
  'max_turns_reached',
  'budget_exhausted',
  'failed',
] as const;

export type AgentTerminationReason = (typeof AGENT_TERMINATION_REASONS)[number];
