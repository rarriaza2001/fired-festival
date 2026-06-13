import { describe, it, expect } from 'vitest';
import { AGENT_BUDGET, AGENT_TERMINATION_REASONS } from '@dgb/shared';
import { initialRunState } from './agent-state';
import {
  toolBudgetExhausted,
  budgetTermination,
  terminationStopReason,
} from './termination';

describe('termination (budget guards)', () => {
  it('does not terminate a fresh run', () => {
    expect(budgetTermination(initialRunState())).toBeNull();
  });

  it('terminates when the turn ceiling is reached', () => {
    const s = { ...initialRunState(), turn: AGENT_BUDGET.MAX_TURNS };
    expect(budgetTermination(s)).toBe('max_turns_reached');
  });

  it('terminates when the cost ceiling is reached', () => {
    const s = { ...initialRunState(), totalCostUsd: AGENT_BUDGET.MAX_COST_USD };
    expect(budgetTermination(s)).toBe('budget_exhausted');
  });

  it('reports tool-budget exhaustion at the cap (but does not end the run)', () => {
    const exhausted = { ...initialRunState(), toolCallCount: AGENT_BUDGET.MAX_TOOL_CALLS };
    expect(toolBudgetExhausted(exhausted)).toBe(true);
    expect(budgetTermination(exhausted)).toBeNull(); // run may still finalize
  });

  it('still has tool budget below the cap', () => {
    const s = { ...initialRunState(), toolCallCount: AGENT_BUDGET.MAX_TOOL_CALLS - 1 };
    expect(toolBudgetExhausted(s)).toBe(false);
  });

  it('maps every termination reason to a valid stop reason (pass-through)', () => {
    for (const reason of AGENT_TERMINATION_REASONS) {
      expect(terminationStopReason(reason)).toBe(reason);
    }
  });
});
