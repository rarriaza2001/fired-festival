import { describe, it, expect } from 'vitest';
import {
  initialRunState,
  hasCompleted,
  withCompletedAction,
  clearCompletedAction,
  incrementTurn,
  withIntakeOutcome,
  withPendingExternalChecks,
  withToolCall,
  withCost,
  withLoopCount,
} from './agent-state';

describe('agent-state (immutable run state)', () => {
  it('starts empty at turn 0', () => {
    const s = initialRunState();
    expect(s.turn).toBe(0);
    expect(s.completedActions).toEqual([]);
    expect(s.intakeOutcome).toBeNull();
    expect(s.pendingExternalChecks).toBe(0);
  });

  it('never mutates the input state', () => {
    const s = initialRunState();
    const next = withCompletedAction(s, 'assess_sufficiency');
    expect(s.completedActions).toEqual([]); // original unchanged
    expect(next.completedActions).toEqual(['assess_sufficiency']);
  });

  it('records completed actions without duplicates', () => {
    const s = withCompletedAction(
      withCompletedAction(initialRunState(), 'assess_sufficiency'),
      'assess_sufficiency',
    );
    expect(s.completedActions).toEqual(['assess_sufficiency']);
    expect(hasCompleted(s, 'assess_sufficiency')).toBe(true);
  });

  it('clears a completed action so it can re-run', () => {
    const done = withCompletedAction(initialRunState(), 'frame_next_action');
    const cleared = clearCompletedAction(done, 'frame_next_action');
    expect(hasCompleted(cleared, 'frame_next_action')).toBe(false);
  });

  it('advances turns', () => {
    expect(incrementTurn(initialRunState()).turn).toBe(1);
  });

  it('records the intake outcome', () => {
    const s = withIntakeOutcome(initialRunState(), 'sufficient');
    expect(s.intakeOutcome).toBe('sufficient');
  });

  it('clamps pending external checks to >= 0', () => {
    expect(withPendingExternalChecks(initialRunState(), -3).pendingExternalChecks).toBe(0);
    expect(withPendingExternalChecks(initialRunState(), 4).pendingExternalChecks).toBe(4);
  });

  it('a tool call increments count, adds cost, and consumes one pending check', () => {
    const base = withPendingExternalChecks(initialRunState(), 2);
    const after = withToolCall(base, 0.01);
    expect(after.toolCallCount).toBe(1);
    expect(after.totalCostUsd).toBeCloseTo(0.01);
    expect(after.pendingExternalChecks).toBe(1);
  });

  it('a tool call never drives pending checks negative', () => {
    const after = withToolCall(initialRunState(), 0);
    expect(after.pendingExternalChecks).toBe(0);
  });

  it('adds stage cost without touching tool/loop budget', () => {
    const after = withCost(initialRunState(), 0.05);
    expect(after.totalCostUsd).toBeCloseTo(0.05);
    expect(after.toolCallCount).toBe(0);
  });

  it('ignores negative costs', () => {
    expect(withCost(initialRunState(), -1).totalCostUsd).toBe(0);
  });

  it('records the granted loop count', () => {
    expect(withLoopCount(initialRunState(), 2).loopCount).toBe(2);
  });
});
