import { describe, it, expect } from 'vitest';
import { AGENT_BUDGET, MANDATORY_STAGE_ACTIONS, type AgentAction } from '@dgb/shared';
import { initialRunState, type AgentRunState } from './agent-state';
import { legalActions, preconditionsMet } from './action-space';

/** Build a reviewable state with a set of completed stages. */
function reviewable(
  completed: readonly AgentAction[],
  extra: Partial<AgentRunState> = {},
): AgentRunState {
  return {
    ...initialRunState(),
    intakeOutcome: 'sufficient',
    completedActions: [...completed],
    ...extra,
  };
}

describe('action-space (legality / completeness gate)', () => {
  it('offers only sufficiency assessment at the start', () => {
    expect(legalActions(initialRunState())).toEqual(['assess_sufficiency']);
  });

  it('routes an unsupported intake to refusal only', () => {
    const s = { ...initialRunState(), completedActions: ['assess_sufficiency' as AgentAction], intakeOutcome: 'unsupported' as const };
    expect(legalActions(s)).toEqual(['refuse_unsupported']);
  });

  it('routes an insufficient intake to clarification only', () => {
    const s = { ...initialRunState(), completedActions: ['assess_sufficiency' as AgentAction], intakeOutcome: 'insufficient' as const };
    expect(legalActions(s)).toEqual(['request_clarification']);
  });

  it('after a sufficient intake, only artifact extraction is next', () => {
    expect(legalActions(reviewable(['assess_sufficiency']))).toEqual(['extract_artifact']);
  });

  it('cannot skip ahead: scope requires artifact first', () => {
    const r = preconditionsMet('confirm_scope', reviewable(['assess_sufficiency']));
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('extract_artifact');
  });

  it('after evidence with pending checks, the agent may verify or proceed', () => {
    const s = reviewable(
      ['assess_sufficiency', 'extract_artifact', 'confirm_scope', 'discover_assumptions', 'assess_evidence'],
      { pendingExternalChecks: 2 },
    );
    const legal = legalActions(s);
    expect(legal).toContain('external_check');
    expect(legal).toContain('check_reality_and_risks');
  });

  it('forbids external_check once the tool budget is exhausted', () => {
    const s = reviewable(
      ['assess_sufficiency', 'extract_artifact', 'confirm_scope', 'discover_assumptions', 'assess_evidence'],
      { pendingExternalChecks: 2, toolCallCount: AGENT_BUDGET.MAX_TOOL_CALLS },
    );
    expect(legalActions(s)).not.toContain('external_check');
  });

  it('forbids external_check when nothing is pending', () => {
    const s = reviewable(
      ['assess_sufficiency', 'extract_artifact', 'confirm_scope', 'discover_assumptions', 'assess_evidence'],
      { pendingExternalChecks: 0 },
    );
    expect(legalActions(s)).not.toContain('external_check');
  });

  it('finalize is illegal until every mandatory stage is complete', () => {
    const partial = reviewable(['assess_sufficiency', 'extract_artifact']);
    const r = preconditionsMet('finalize', partial);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('missing stages');
  });

  it('finalize becomes legal once all mandatory stages are complete', () => {
    const full = reviewable([...MANDATORY_STAGE_ACTIONS]);
    expect(legalActions(full)).toContain('finalize');
  });

  it('a completed stage is not offered again', () => {
    const r = preconditionsMet('extract_artifact', reviewable(['assess_sufficiency', 'extract_artifact']));
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('already run');
  });
});
