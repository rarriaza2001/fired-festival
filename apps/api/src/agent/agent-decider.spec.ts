import { describe, it, expect } from 'vitest';
import type { AgentAction, AgentDecision } from '@dgb/shared';
import { initialRunState, type AgentRunState } from './agent-state';
import { fallbackAction, decideNextAction, type Proposer } from './agent-decider';

/** A state at the genuine choice point: evidence assessed, checks still pending. */
function choicePoint(): AgentRunState {
  return {
    ...initialRunState(),
    intakeOutcome: 'sufficient',
    completedActions: [
      'assess_sufficiency',
      'extract_artifact',
      'confirm_scope',
      'discover_assumptions',
      'assess_evidence',
    ],
    pendingExternalChecks: 2,
  };
}

function proposerOf(action: AgentAction): Proposer {
  return async () => ({ action, rationale: 'because', target: null }) as AgentDecision;
}

describe('agent-decider (model proposes, harness disposes)', () => {
  it('fallback drains external checks first', () => {
    expect(fallbackAction(['check_reality_and_risks', 'external_check'])).toBe(
      'external_check',
    );
  });

  it('fallback otherwise takes the canonical-earliest legal action', () => {
    expect(fallbackAction(['confirm_scope', 'assemble_output'])).toBe('confirm_scope');
  });

  it('fallback on an empty legal set is null', () => {
    expect(fallbackAction([])).toBeNull();
  });

  it('forces the only legal action at the start (no model call)', async () => {
    let called = false;
    const proposer: Proposer = async () => {
      called = true;
      return { action: 'finalize', rationale: 'x', target: null };
    };
    const chosen = await decideNextAction(initialRunState(), proposer);
    expect(chosen?.action).toBe('assess_sufficiency');
    expect(chosen?.source).toBe('forced');
    expect(called).toBe(false); // forced moves never consult the model
  });

  it('accepts a legal model proposal at a genuine choice point', async () => {
    const chosen = await decideNextAction(choicePoint(), proposerOf('check_reality_and_risks'));
    expect(chosen?.action).toBe('check_reality_and_risks');
    expect(chosen?.source).toBe('model');
    expect(chosen?.rationale).toBe('because');
  });

  it('rejects an illegal model proposal and falls back', async () => {
    const chosen = await decideNextAction(choicePoint(), proposerOf('finalize'));
    expect(chosen?.action).toBe('external_check'); // fallback drains first
    expect(chosen?.source).toBe('fallback');
  });

  it('falls back when the proposer throws', async () => {
    const throwing: Proposer = async () => {
      throw new Error('model down');
    };
    const chosen = await decideNextAction(choicePoint(), throwing);
    expect(chosen?.action).toBe('external_check');
    expect(chosen?.source).toBe('fallback');
  });

  it('uses fallback at a choice point when no proposer is given', async () => {
    const chosen = await decideNextAction(choicePoint(), null);
    expect(chosen?.action).toBe('external_check');
    expect(chosen?.source).toBe('fallback');
  });
});
