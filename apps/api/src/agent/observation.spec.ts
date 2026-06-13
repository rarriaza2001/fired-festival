import { describe, it, expect } from 'vitest';
import { initialRunState, withCompletedAction, withIntakeOutcome } from './agent-state';
import { legalActions } from './action-space';
import { buildObservation } from './observation';

describe('observation (decision context formatting)', () => {
  it('lists the legal actions and core state, deterministically', () => {
    const state = initialRunState();
    const input = {
      state,
      legalActions: legalActions(state),
      lastActionSummary: null,
    };
    const a = buildObservation(input);
    const b = buildObservation(input);

    expect(a).toBe(b); // deterministic
    expect(a).toContain('Legal next actions:');
    expect(a).toContain('assess_sufficiency');
    expect(a).toContain('not yet assessed');
    expect(a).toContain('none (start of run)');
  });

  it('reflects intake outcome and the last action summary', () => {
    const state = withIntakeOutcome(
      withCompletedAction(initialRunState(), 'assess_sufficiency'),
      'sufficient',
    );
    const out = buildObservation({
      state,
      legalActions: legalActions(state),
      lastActionSummary: 'intake assessed: sufficient',
    });
    expect(out).toContain('Intake outcome: sufficient');
    expect(out).toContain('intake assessed: sufficient');
    expect(out).toContain('extract_artifact');
  });
});
