import {
  BLOCKING_FIELDS,
  INTAKE_LIMITS,
  type BlockingField,
  type IntakeAssessment,
  type IntakeOutcome,
  type UnsupportedMode,
} from '@dgb/shared';

/**
 * Phase 3 Steps 1-2 + locked Intake Patch — Input Sufficiency Gate logic.
 *
 * Pure, framework-free controller. The orchestrator runs the structured
 * `sufficiency` LLM stage, then this module derives the routing decision. The
 * progress-bounded helpers encode the locked intake patch and are exercised by
 * unit tests (regression: intake_stall_not_terminated). Intake does NOT consume
 * the Phase 4 loop budget.
 */

/** A blocking field is cleared for serious review when present or inferable. */
function isCleared(status: string): boolean {
  return status === 'present' || status === 'safely_inferable';
}

/**
 * Which of the five blocking fields remain missing after an assessment. A field
 * absent from the model's array is treated as missing, so under-reporting can
 * never silently pass the gate.
 */
export function missingBlockingFields(assessment: IntakeAssessment): BlockingField[] {
  const statusByField = new Map(
    assessment.blocking_fields.map((f) => [f.field, f.status] as const),
  );
  return BLOCKING_FIELDS.filter(
    (field) => !isCleared(statusByField.get(field) ?? 'missing'),
  );
}

export interface IntakeDecision {
  readonly outcome: IntakeOutcome;
  /** sufficient_limited caps confidence; carried into calibration. */
  readonly capConfidence: boolean;
  readonly missingFields: readonly BlockingField[];
  readonly clarificationQuestions: readonly string[];
  readonly unsupportedMode: UnsupportedMode | null;
}

/**
 * Single-shot routing decision from ONE intake assessment (the MVP path).
 * - unsupported request -> terminal `unsupported` (a guardrail reframes it).
 * - any blocking field missing -> terminal `insufficient`. No new input arrives
 *   within a detached run, so further rounds would clear nothing (a stall); we
 *   terminate now and surface the clarification questions for the user to
 *   resubmit a more complete decision.
 * - all cleared + weak evidence -> `sufficient_limited` (cap confidence).
 * - all cleared + usable evidence -> `sufficient`.
 */
export function decideIntake(assessment: IntakeAssessment): IntakeDecision {
  if (assessment.classification === 'unsupported') {
    return {
      outcome: 'unsupported',
      capConfidence: false,
      missingFields: [],
      clarificationQuestions: [],
      unsupportedMode: assessment.unsupported_mode,
    };
  }

  const missing = missingBlockingFields(assessment);
  if (missing.length > 0) {
    return {
      outcome: 'insufficient',
      capConfidence: false,
      missingFields: missing,
      clarificationQuestions: assessment.clarification_questions.slice(
        0,
        INTAKE_LIMITS.MAX_QUESTIONS_PER_ROUND,
      ),
      unsupportedMode: null,
    };
  }

  return {
    outcome: assessment.evidence_weak ? 'sufficient_limited' : 'sufficient',
    capConfidence: assessment.evidence_weak,
    missingFields: [],
    clarificationQuestions: [],
    unsupportedMode: null,
  };
}

/** Outcome of one intake clarification round (interactive mode). */
export interface IntakeRound {
  /** Blocking fields newly cleared in this round. */
  readonly fieldsClearedThisRound: number;
  /** Blocking fields still missing AFTER this round. */
  readonly remainingMissing: number;
}

export type ProgressBoundedStatus =
  | 'proceed'
  | 'continue'
  | 'stalled'
  | 'backstopped';

export interface ProgressBoundedDecision {
  readonly status: ProgressBoundedStatus;
  readonly roundsUsed: number;
  readonly consecutiveStalls: number;
}

/**
 * Progress-bounded intake controller (locked intake patch). Given the ordered
 * clarification rounds so far, decide whether intake may continue, has resolved
 * (all blocking fields cleared), or must terminate. A round is "productive" iff
 * it clears at least MIN_FIELDS_CLEARED_PER_ROUND blocking fields.
 *
 * Termination guarantees (regression: intake_stall_not_terminated):
 * - MAX_CONSECUTIVE_STALLS non-productive rounds in a row -> `stalled`.
 * - MAX_INTAKE_ROUNDS total rounds without resolution -> `backstopped`.
 * Both map to terminal input_insufficient. Resolution (remainingMissing === 0)
 * always takes priority over termination.
 */
export function decideProgressBoundedIntake(
  rounds: readonly IntakeRound[],
): ProgressBoundedDecision {
  let consecutiveStalls = 0;

  for (const [i, round] of rounds.entries()) {
    const productive =
      round.fieldsClearedThisRound >= INTAKE_LIMITS.MIN_FIELDS_CLEARED_PER_ROUND;
    consecutiveStalls = productive ? 0 : consecutiveStalls + 1;

    if (round.remainingMissing === 0) {
      return { status: 'proceed', roundsUsed: i + 1, consecutiveStalls };
    }
    if (consecutiveStalls >= INTAKE_LIMITS.MAX_CONSECUTIVE_STALLS) {
      return { status: 'stalled', roundsUsed: i + 1, consecutiveStalls };
    }
    if (i + 1 >= INTAKE_LIMITS.MAX_INTAKE_ROUNDS) {
      return { status: 'backstopped', roundsUsed: i + 1, consecutiveStalls };
    }
  }

  return { status: 'continue', roundsUsed: rounds.length, consecutiveStalls };
}
