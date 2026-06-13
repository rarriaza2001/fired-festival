import { describe, it, expect } from 'vitest';
import type { IntakeAssessment } from '@dgb/shared';
import {
  decideIntake,
  missingBlockingFields,
  decideProgressBoundedIntake,
  type IntakeRound,
} from './intake-controller';

/** Build an assessment where every blocking field is present unless overridden. */
function assessment(overrides: Partial<IntakeAssessment> = {}): IntakeAssessment {
  return {
    classification: 'possibly_reviewable',
    blocking_fields: [
      { field: 'decision', status: 'present', value: 'open a 2nd cafe' },
      { field: 'current_state', status: 'present', value: 'one profitable cafe' },
      { field: 'end_goal', status: 'present', value: 'double revenue' },
      { field: 'commitment_consequence', status: 'present', value: '12-month lease' },
      { field: 'decision_stage', status: 'present', value: 'evaluating' },
    ],
    evidence_weak: false,
    unsupported_mode: null,
    clarification_questions: [],
    ...overrides,
  };
}

describe('missingBlockingFields', () => {
  it('returns empty when all five fields are present or inferable', () => {
    expect(missingBlockingFields(assessment())).toEqual([]);
  });

  it('treats a field absent from the array as missing (no silent pass)', () => {
    const partial = assessment({
      blocking_fields: [
        { field: 'decision', status: 'present', value: 'x' },
      ],
    });
    expect(missingBlockingFields(partial)).toEqual([
      'current_state',
      'end_goal',
      'commitment_consequence',
      'decision_stage',
    ]);
  });

  it('counts a safely_inferable field as cleared', () => {
    const inferable = assessment({
      blocking_fields: [
        { field: 'decision', status: 'present', value: 'x' },
        { field: 'current_state', status: 'safely_inferable', value: 'inferred' },
        { field: 'end_goal', status: 'present', value: 'x' },
        { field: 'commitment_consequence', status: 'present', value: 'x' },
        { field: 'decision_stage', status: 'present', value: 'x' },
      ],
    });
    expect(missingBlockingFields(inferable)).toEqual([]);
  });
});

describe('decideIntake (single-shot routing)', () => {
  it('routes a fully-specified, well-evidenced input to sufficient', () => {
    const decision = decideIntake(assessment());
    expect(decision.outcome).toBe('sufficient');
    expect(decision.capConfidence).toBe(false);
  });

  it('routes present-but-weak-evidence to sufficient_limited with a confidence cap', () => {
    const decision = decideIntake(assessment({ evidence_weak: true }));
    expect(decision.outcome).toBe('sufficient_limited');
    expect(decision.capConfidence).toBe(true);
  });

  it('routes missing blocking fields to insufficient and surfaces questions', () => {
    const decision = decideIntake(
      assessment({
        classification: 'insufficient',
        blocking_fields: [{ field: 'decision', status: 'missing', value: null }],
        clarification_questions: ['What is the decision?', 'What is your current state?'],
      }),
    );
    expect(decision.outcome).toBe('insufficient');
    expect(decision.missingFields.length).toBeGreaterThan(0);
    expect(decision.clarificationQuestions).toHaveLength(2);
  });

  it('caps surfaced questions at the per-round maximum', () => {
    const decision = decideIntake(
      assessment({
        classification: 'insufficient',
        blocking_fields: [{ field: 'decision', status: 'missing', value: null }],
        clarification_questions: ['q1', 'q2', 'q3'],
      }),
    );
    expect(decision.clarificationQuestions.length).toBeLessThanOrEqual(3);
  });

  it('routes an unsupported request to unsupported with its mode', () => {
    const decision = decideIntake(
      assessment({
        classification: 'unsupported',
        unsupported_mode: 'blind_validation',
      }),
    );
    expect(decision.outcome).toBe('unsupported');
    expect(decision.unsupportedMode).toBe('blind_validation');
  });
});

describe('decideProgressBoundedIntake (intake patch)', () => {
  it('proceeds as soon as all blocking fields are cleared', () => {
    const rounds: IntakeRound[] = [{ fieldsClearedThisRound: 5, remainingMissing: 0 }];
    expect(decideProgressBoundedIntake(rounds).status).toBe('proceed');
  });

  it('continues while rounds stay productive and fields remain', () => {
    const rounds: IntakeRound[] = [{ fieldsClearedThisRound: 1, remainingMissing: 4 }];
    expect(decideProgressBoundedIntake(rounds).status).toBe('continue');
  });

  it('terminates as stalled after two consecutive non-productive rounds', () => {
    // Regression: intake_stall_not_terminated — a stalling intake MUST stop.
    const rounds: IntakeRound[] = [
      { fieldsClearedThisRound: 0, remainingMissing: 5 },
      { fieldsClearedThisRound: 0, remainingMissing: 5 },
    ];
    const decision = decideProgressBoundedIntake(rounds);
    expect(decision.status).toBe('stalled');
    expect(decision.roundsUsed).toBe(2);
  });

  it('resets the stall counter after a productive round', () => {
    const rounds: IntakeRound[] = [
      { fieldsClearedThisRound: 0, remainingMissing: 5 },
      { fieldsClearedThisRound: 1, remainingMissing: 4 },
      { fieldsClearedThisRound: 0, remainingMissing: 4 },
    ];
    // Stall, productive (reset), stall -> only one consecutive stall -> continue.
    expect(decideProgressBoundedIntake(rounds).status).toBe('continue');
  });

  it('hits the six-round backstop when rounds alternate without resolving', () => {
    // Alternating productive/stall never reaches 2 consecutive stalls, so only
    // the hard backstop can terminate it.
    const rounds: IntakeRound[] = [
      { fieldsClearedThisRound: 1, remainingMissing: 4 },
      { fieldsClearedThisRound: 0, remainingMissing: 4 },
      { fieldsClearedThisRound: 1, remainingMissing: 3 },
      { fieldsClearedThisRound: 0, remainingMissing: 3 },
      { fieldsClearedThisRound: 1, remainingMissing: 2 },
      { fieldsClearedThisRound: 0, remainingMissing: 2 },
    ];
    const decision = decideProgressBoundedIntake(rounds);
    expect(decision.status).toBe('backstopped');
    expect(decision.roundsUsed).toBe(6);
  });
});
