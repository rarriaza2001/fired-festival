import type { AgentAction, IntakeOutcome } from '@dgb/shared';

/**
 * Agent harness — in-process run state (the blackboard).
 *
 * This is the full bookkeeping the control loop carries across turns. It is a
 * superset of the serializable `agentStateSchema` slice in @dgb/shared (which is
 * what the trace/persistence boundary records); the extra fields here
 * (intakeOutcome, pendingExternalChecks) are the routing facts the harness needs
 * to enforce the spine's invariants under a model-chosen order.
 *
 * Every helper is pure and returns a NEW state — never mutates its input.
 */
export interface AgentRunState {
  /** Loop iterations consumed so far. */
  readonly turn: number;
  /** Stage/tool actions that have successfully run (drives the completeness gate). */
  readonly completedActions: readonly AgentAction[];
  /** Tool invocations made so far. */
  readonly toolCallCount: number;
  /** Bounded reassessment loops consumed. */
  readonly loopCount: number;
  /** Accumulated USD cost. */
  readonly totalCostUsd: number;
  /** Intake routing outcome; null until `assess_sufficiency` has run. */
  readonly intakeOutcome: IntakeOutcome | null;
  /** Evidence items still awaiting an external check (set after evidence assessment). */
  readonly pendingExternalChecks: number;
}

/** A fresh run state at turn 0 with nothing completed. */
export function initialRunState(): AgentRunState {
  return {
    turn: 0,
    completedActions: [],
    toolCallCount: 0,
    loopCount: 0,
    totalCostUsd: 0,
    intakeOutcome: null,
    pendingExternalChecks: 0,
  };
}

/** Whether an action has already run in this state. */
export function hasCompleted(state: AgentRunState, action: AgentAction): boolean {
  return state.completedActions.includes(action);
}

/** Record an action as completed (idempotent — no duplicates). */
export function withCompletedAction(
  state: AgentRunState,
  action: AgentAction,
): AgentRunState {
  if (state.completedActions.includes(action)) {
    return state;
  }
  return { ...state, completedActions: [...state.completedActions, action] };
}

/**
 * Clear a completed action so it becomes legal to re-run. Used only when the
 * bounded loop controller grants a reassessment pass for an affected stage.
 */
export function clearCompletedAction(
  state: AgentRunState,
  action: AgentAction,
): AgentRunState {
  if (!state.completedActions.includes(action)) {
    return state;
  }
  return {
    ...state,
    completedActions: state.completedActions.filter((a) => a !== action),
  };
}

/** Advance to the next turn. */
export function incrementTurn(state: AgentRunState): AgentRunState {
  return { ...state, turn: state.turn + 1 };
}

/** Record the intake routing outcome after `assess_sufficiency` runs. */
export function withIntakeOutcome(
  state: AgentRunState,
  outcome: IntakeOutcome,
): AgentRunState {
  return { ...state, intakeOutcome: outcome };
}

/** Set the number of evidence items awaiting an external check. */
export function withPendingExternalChecks(
  state: AgentRunState,
  count: number,
): AgentRunState {
  return { ...state, pendingExternalChecks: Math.max(0, count) };
}

/**
 * Record one tool invocation: increments the tool count, adds its cost, and
 * consumes one pending external check.
 */
export function withToolCall(
  state: AgentRunState,
  costUsd: number,
): AgentRunState {
  return {
    ...state,
    toolCallCount: state.toolCallCount + 1,
    totalCostUsd: state.totalCostUsd + Math.max(0, costUsd),
    pendingExternalChecks: Math.max(0, state.pendingExternalChecks - 1),
  };
}

/** Add a stage's cost without consuming tool/loop budget. */
export function withCost(state: AgentRunState, costUsd: number): AgentRunState {
  return { ...state, totalCostUsd: state.totalCostUsd + Math.max(0, costUsd) };
}

/** Record that a bounded reassessment loop pass was granted. */
export function withLoopCount(
  state: AgentRunState,
  nextLoopCount: number,
): AgentRunState {
  return { ...state, loopCount: nextLoopCount };
}
