import { describe, it, expect } from 'vitest';
import { AGENT_BUDGET, MANDATORY_STAGE_ACTIONS, type AgentAction, type AgentDecision } from '@dgb/shared';
import { initialRunState, type AgentRunState } from './agent-state';
import { validateDecision, finalizeCompleteness, forcedAction } from './policy';

function decision(action: AgentAction): AgentDecision {
  return { action, rationale: 'test', target: null };
}

function reviewable(completed: readonly AgentAction[]): AgentRunState {
  return { ...initialRunState(), intakeOutcome: 'sufficient', completedActions: [...completed] };
}

describe('policy (the model proposes, the harness disposes)', () => {
  it('accepts a legal in-budget action', () => {
    const v = validateDecision(decision('assess_sufficiency'), initialRunState());
    expect(v.kind).toBe('accept');
  });

  it('rejects an illegal action and returns the legal set', () => {
    const v = validateDecision(decision('assemble_output'), initialRunState());
    expect(v.kind).toBe('reject');
    if (v.kind === 'reject') {
      expect(v.legalActions).toEqual(['assess_sufficiency']);
      expect(v.reason).toContain('not permitted');
    }
  });

  it('terminates a run over the turn budget before checking legality', () => {
    const over = { ...initialRunState(), turn: AGENT_BUDGET.MAX_TURNS };
    const v = validateDecision(decision('assess_sufficiency'), over);
    expect(v.kind).toBe('terminate');
    if (v.kind === 'terminate') {
      expect(v.reason).toBe('max_turns_reached');
    }
  });

  it('completeness gate lists missing mandatory stages', () => {
    const r = finalizeCompleteness(reviewable(['assess_sufficiency']));
    expect(r.complete).toBe(false);
    expect(r.missing).toContain('assemble_output');
  });

  it('completeness gate passes when all mandatory stages ran', () => {
    const r = finalizeCompleteness(reviewable([...MANDATORY_STAGE_ACTIONS]));
    expect(r.complete).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('forces the only legal action (no model call needed)', () => {
    expect(forcedAction(initialRunState())).toBe('assess_sufficiency');
  });

  it('returns null when the model has a genuine choice', () => {
    const choice = reviewable([
      'assess_sufficiency', 'extract_artifact', 'confirm_scope', 'discover_assumptions', 'assess_evidence',
    ]);
    const withPending = { ...choice, pendingExternalChecks: 1 };
    expect(forcedAction(withPending)).toBeNull();
  });
});
