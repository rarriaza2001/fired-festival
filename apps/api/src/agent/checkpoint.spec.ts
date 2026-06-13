import { describe, it, expect } from 'vitest';
import type { AgentAction } from '@dgb/shared';
import { parseCheckpointSnapshot } from './checkpoint';
import { legalActions } from './action-space';
import { initialRunState, withIntakeOutcome, withCompletedAction } from './agent-state';

describe('parseCheckpointSnapshot', () => {
  it('round-trips run state and checkedStatements (Set persisted as array) through JSON', () => {
    let state = initialRunState();
    const done: AgentAction[] = ['assess_sufficiency', 'extract_artifact', 'confirm_scope'];
    for (const action of done) {
      state = withCompletedAction(state, action);
    }

    const raw = { state, checkedStatements: ['claim a', 'claim b'] };
    const parsed = parseCheckpointSnapshot(JSON.stringify(raw));

    expect(parsed.state.completedActions).toEqual(done);
    expect(parsed.checkedStatements).toEqual(['claim a', 'claim b']);
  });
});

describe('resume-forward (the replay invariant)', () => {
  it('never re-offers a stage that was already completed at checkpoint time', () => {
    // A restored mid-run state: intake passed and the first four stages ran.
    let state = withIntakeOutcome(initialRunState(), 'sufficient');
    const completed: AgentAction[] = [
      'assess_sufficiency',
      'extract_artifact',
      'confirm_scope',
      'discover_assumptions',
    ];
    for (const action of completed) {
      state = withCompletedAction(state, action);
    }

    const legal = legalActions(state);

    // legalActions is derived from completedActions, so replay continues forward:
    // none of the already-run stages are offered again.
    for (const action of completed) {
      expect(legal, `completed ${action}`).not.toContain(action);
    }
  });
});
