// Phase 8 — Final Trace Event List ("phase8.v1" spine).
// Events record state transitions and reasons, never hidden reasoning.

export const TRACE_EVENTS = [
  'run_started',
  // Agent harness control-loop events (visible: shows the agent deciding).
  'agent_turn_started',
  'action_selected',
  'action_executed',
  'agent_terminated',
  'input_received',
  'context_ingestion_started',
  'context_item_ingested',
  'context_ingestion_completed',
  'context_triage_completed',
  'input_sufficiency_checked',
  'clarification_requested',
  'clarification_received',
  'decision_artifact_extracted',
  'artifact_needs_correction',
  'artifact_corrected',
  'review_scope_confirmed',
  'assumptions_identified',
  'assumptions_ranked',
  'evidence_assessed',
  'external_check_needed',
  'tool_invocation_started',
  'tool_invocation_completed',
  'tool_invocation_failed',
  'search_started',
  'search_completed',
  'search_stopped',
  'risks_ranked',
  'confidence_calibrated',
  'confidence_changed',
  'guardrail_triggered',
  'next_action_selected',
  'loop_candidate_detected',
  'loop_entered',
  'loop_stopped',
  'loop_forbidden',
  'evaluation_completed',
  // Alarms pillar — a named failure/limitation fired to the operator with
  // severity + recommended action (payload in error_type/error_severity/details).
  'alarm_raised',
  'run_completed',
  'run_failed',
] as const;

export type TraceEventName = (typeof TRACE_EVENTS)[number];

/** Trace event visibility (Phase 4 / A4). Live UI renders user_visible only. */
export const TRACE_VISIBILITIES = ['user_visible', 'internal_only'] as const;
export type TraceVisibility = (typeof TRACE_VISIBILITIES)[number];

export const TRACE_SCHEMA_VERSION = 'phase8.v1' as const;
