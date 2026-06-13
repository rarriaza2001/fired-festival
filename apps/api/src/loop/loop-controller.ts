import { MAX_LOOP_COUNT, type LoopStopReason } from '@dgb/shared';

/**
 * Phase 4 / Phase 8 §9 — Bounded Loop Controller. "Material change or don't
 * loop." Pure, framework-free. A reassessment loop may run only when it can
 * materially change the review AND the hard cap is not exhausted. Forbidden
 * loop requests (think harder, please the user, more risks without new
 * evidence, confidence upgrade without material change) are rejected outright.
 * Intake clarification does NOT consume this budget (see intake-controller).
 */

export interface LoopEvaluation {
  /** Loop passes already consumed by this run. */
  readonly loopCount: number;
  /** Whether re-entering the review would materially change it. */
  readonly materialChange: boolean;
  /** True when the loop request matches a forbidden purpose. */
  readonly forbidden?: boolean;
}

export type LoopDecision =
  | { readonly allowed: true; readonly nextLoopCount: number }
  | {
      readonly allowed: false;
      readonly forbidden: boolean;
      readonly stopReason: LoopStopReason;
    };

/**
 * Decide whether a reassessment loop pass is permitted. Precedence:
 * forbidden purpose > hard cap > no material change > allowed.
 */
export function evaluateLoop({
  loopCount,
  materialChange,
  forbidden = false,
}: LoopEvaluation): LoopDecision {
  if (forbidden) {
    return { allowed: false, forbidden: true, stopReason: 'forbidden_loop_request' };
  }
  if (loopCount >= MAX_LOOP_COUNT) {
    return { allowed: false, forbidden: false, stopReason: 'max_loop_reached' };
  }
  if (!materialChange) {
    return { allowed: false, forbidden: false, stopReason: 'no_material_change' };
  }
  return { allowed: true, nextLoopCount: loopCount + 1 };
}
