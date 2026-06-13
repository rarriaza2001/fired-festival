'use client';

import type { TraceEvent } from '@/lib/api';
import { ThemedCard } from '@/components/ui/themed-card';
import FadeContent from '@/components/ui/FadeContent';
import TextType from '@/components/ui/TextType';

const EVENT_LABELS: Record<string, string> = {
  run_started: 'Review started',
  // Agent harness control-loop events (the visible "it's an agent" signal).
  agent_turn_started: 'Agent turn',
  action_selected: 'Agent decision',
  action_executed: 'Action executed',
  agent_terminated: 'Agent terminated',
  input_received: 'Input received',
  context_ingestion_started: 'Parsing attachments',
  context_item_ingested: 'Attachment ingested',
  context_ingestion_completed: 'Attachment parsing complete',
  context_triage_completed: 'Attachment triage complete',
  input_sufficiency_checked: 'Input sufficiency checked',
  clarification_requested: 'Clarification needed',
  decision_artifact_extracted: 'Decision artifact extracted',
  review_scope_confirmed: 'Review scope confirmed',
  assumptions_identified: 'Material assumptions identified',
  assumptions_ranked: 'Assumptions ranked',
  evidence_assessed: 'Evidence assessed',
  external_check_needed: 'External check needed',
  risks_ranked: 'Failure modes ranked',
  confidence_calibrated: 'Confidence calibrated',
  confidence_changed: 'Confidence changed',
  guardrail_triggered: 'Guardrail triggered',
  next_action_selected: 'Next action selected',
  loop_candidate_detected: 'Reassessment loop candidate',
  loop_entered: 'Reassessment loop entered',
  loop_stopped: 'Reassessment loop stopped',
  loop_forbidden: 'Loop refused',
  run_completed: 'Review complete',
  run_failed: 'Review failed',
};

/** Friendly names for the action the agent chose each turn. */
const ACTION_LABELS: Record<string, string> = {
  assess_sufficiency: 'Assess input sufficiency',
  extract_artifact: 'Extract decision artifact',
  confirm_scope: 'Confirm review scope',
  discover_assumptions: 'Discover assumptions',
  assess_evidence: 'Assess evidence',
  check_reality_and_risks: 'Check reality & risks',
  calibrate_confidence: 'Calibrate confidence',
  frame_next_action: 'Frame next action',
  assemble_output: 'Assemble output',
  external_check: 'Run external check',
  finalize: 'Finalize review',
  refuse_unsupported: 'Refuse unsupported request',
  request_clarification: 'Request clarification',
};

/** How the action was chosen — the heart of "the model proposes, the harness disposes". */
const SOURCE_LABELS: Record<string, string> = {
  model: 'agent chose',
  forced: 'only legal step',
  fallback: 'harness default',
};

/** Friendly names for why the loop stopped (details.termination_reason). */
const TERMINATION_LABELS: Record<string, string> = {
  review_complete: 'review complete',
  review_complete_limited: 'review complete',
  input_insufficient: 'review ended',
  unsupported_request: 'review ended',
  max_turns_reached: 'max turns reached',
  budget_exhausted: 'budget exhausted',
  failed: 'failed',
};

/**
 * Milestones shown to the user. The full event set is still emitted and
 * persisted for the audit trail — this only curates the on-screen trace so a
 * single review reads as a short, high-signal narrative instead of 15+ lines of
 * control-loop chatter (agent_turn_started / action_selected / action_executed,
 * per-stage echoes, etc. stay in the durable trace but are not displayed).
 */
const DISPLAY_EVENTS = new Set<string>([
  'run_started',
  'context_ingestion_started',
  'context_ingestion_completed',
  'context_triage_completed',
  'input_sufficiency_checked',
  'decision_artifact_extracted',
  'evidence_assessed',
  'risks_ranked',
  'next_action_selected',
  'clarification_requested',
  'guardrail_triggered',
  'loop_entered',
  'loop_stopped',
  'run_completed',
  'run_failed',
]);

function labelFor(name: string): string {
  return EVENT_LABELS[name] ?? name.replace(/_/g, ' ');
}

function detailFor(ev: TraceEvent): string | null {
  const details = ev.details as Record<string, unknown> | undefined;
  if (!details) return null;
  if (typeof details.message === 'string') return details.message;
  if (typeof details.explanation === 'string') return details.explanation;
  if (typeof details.reframe === 'string') return details.reframe;
  if (Array.isArray(details.questions) && details.questions.length > 0) {
    return details.questions.filter((q): q is string => typeof q === 'string').join(' · ');
  }
  return null;
}

interface DecisionMeta {
  actionLabel: string;
  sourceLabel: string | null;
  rationale: string | null;
}

/** Pull the agent's chosen action / source / rationale off an action_selected event. */
function decisionMeta(ev: TraceEvent): DecisionMeta | null {
  if (ev.event_name !== 'action_selected') return null;
  const details = (ev.details ?? {}) as Record<string, unknown>;
  const action = typeof details.action === 'string' ? details.action : null;
  if (!action) return null;
  const source = typeof details.source === 'string' ? details.source : null;
  const rationale =
    typeof details.rationale === 'string' && details.rationale.trim().length > 0
      ? details.rationale
      : null;
  return {
    actionLabel: ACTION_LABELS[action] ?? action.replace(/_/g, ' '),
    sourceLabel: source ? (SOURCE_LABELS[source] ?? source) : null,
    rationale,
  };
}

interface TerminationMeta {
  reasonLabel: string;
  summary: string | null;
}

/** Pull the stop reason + turn/tool totals off an agent_terminated event. */
function terminationMeta(ev: TraceEvent): TerminationMeta | null {
  if (ev.event_name !== 'agent_terminated') return null;
  const details = (ev.details ?? {}) as Record<string, unknown>;
  const reason = typeof details.termination_reason === 'string' ? details.termination_reason : null;
  if (!reason) return null;
  const turns = typeof details.turns === 'number' ? details.turns : null;
  const toolCalls = typeof details.tool_calls === 'number' ? details.tool_calls : null;
  const parts: string[] = [];
  if (turns !== null) parts.push(`${turns} ${turns === 1 ? 'turn' : 'turns'}`);
  if (toolCalls !== null) parts.push(`${toolCalls} tool ${toolCalls === 1 ? 'call' : 'calls'}`);
  return {
    reasonLabel: TERMINATION_LABELS[reason] ?? reason.replace(/_/g, ' '),
    summary: parts.length > 0 ? parts.join(' · ') : null,
  };
}

function timeFor(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return '';
  }
}

function dotClass(name: string, isLast: boolean, done: boolean): string {
  if (name === 'run_failed') return 'trace-dot fail';
  if (name === 'action_selected') return 'trace-dot active';
  if (!done && isLast) return 'trace-dot active';
  return 'trace-dot';
}

interface TraceStreamProps {
  events: TraceEvent[];
  done: boolean;
  mode?: 'live' | 'replay';
}

export function TraceStream({ events, done, mode = 'live' }: TraceStreamProps) {
  const heading = mode === 'replay' ? 'Replay' : 'Live review trace';
  const pendingText =
    mode === 'replay'
      ? '● replaying… re-watching the agent decide each step'
      : '● reviewing… watching the agent choose each next action';

  const shown = events.filter((ev) => DISPLAY_EVENTS.has(ev.event_name));

  return (
    <ThemedCard title={heading}>
      {shown.map((ev, index) => {
        const flagged =
          ev.event_name === 'guardrail_triggered' ||
          ev.event_name === 'clarification_requested';
        const decision = decisionMeta(ev);
        const termination = terminationMeta(ev);
        const detail = decision || termination ? null : detailFor(ev);
        const isLast = index === shown.length - 1;

        return (
          <FadeContent
            key={ev.event_id}
            triggerOnMount
            delay={40}
            duration={350}
            className="trace-event"
          >
            <span className={dotClass(ev.event_name, isLast, done)} />
            <span>
              <span className="trace-label">{labelFor(ev.event_name)}</span>
              {decision ? (
                <>
                  <span className="tag detail">{decision.actionLabel}</span>
                  {decision.sourceLabel ? (
                    <span className="tag">{decision.sourceLabel}</span>
                  ) : null}
                  {decision.rationale ? (
                    <span className="trace-detail">{decision.rationale}</span>
                  ) : null}
                </>
              ) : null}
              {termination ? (
                <>
                  <span className="tag">{termination.reasonLabel}</span>
                  {termination.summary ? (
                    <span className="trace-detail">{termination.summary}</span>
                  ) : null}
                </>
              ) : null}
              {ev.stage && !decision && !termination ? (
                <span className="trace-stage"> · {ev.stage.replace(/_/g, ' ')}</span>
              ) : null}
              {detail ? (
                <span className={flagged ? 'trace-detail flagged' : 'trace-detail'}>
                  {detail}
                </span>
              ) : null}
            </span>
            <span className="trace-time">{timeFor(ev.timestamp)}</span>
          </FadeContent>
        );
      })}
      {!done ? (
        <div className="mt-2 text-sm text-[var(--accent)]">
          <TextType
            text={pendingText}
            typingSpeed={35}
            loop={false}
            showCursor={false}
            className="text-[var(--accent)]"
          />
        </div>
      ) : null}
    </ThemedCard>
  );
}
