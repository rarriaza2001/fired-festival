import type { AgentAction, AgentDecision } from '@dgb/shared';
import { type AgentRunState } from './agent-state';
import { legalActions } from './action-space';
import { forcedAction } from './policy';

/**
 * Agent harness — the per-turn decision ("the model proposes, the harness
 * disposes"). Pure and framework-free: the runner supplies a `proposer` that
 * actually calls the model; this module decides WHICH action the turn takes,
 * guaranteeing the result is always legal regardless of what the model says.
 *
 * Precedence each turn:
 *   1. Forced move — when exactly one action is legal, take it with no model
 *      call (deterministic; e.g. the linear spine, or refuse after an
 *      unsupported intake). This is most turns, which is why a model-directed
 *      loop keeps the spine's guarantees: freedom only exists where the action
 *      space genuinely offers a choice.
 *   2. Model proposal — when several actions are legal (e.g. "verify another
 *      evidence item" vs "proceed"), ask the model and accept its choice iff it
 *      is legal. This is the agent's real, user-visible decision point.
 *   3. Fallback — if there is no proposer, or the model errored or proposed an
 *      illegal action, take the harness default ordering (drain external checks
 *      first to mirror the spine, then the canonical-earliest legal action).
 */

/** Where the chosen action came from — surfaced on the action_selected event. */
export type DecisionSource = 'forced' | 'model' | 'fallback';

export interface ChosenDecision {
  readonly action: AgentAction;
  readonly rationale: string;
  readonly target: string | null;
  readonly source: DecisionSource;
}

/** Calls the model for a decision given the legal set; supplied by the runner. */
export type Proposer = (input: {
  readonly state: AgentRunState;
  readonly legal: readonly AgentAction[];
}) => Promise<AgentDecision>;

/**
 * Harness default ordering when the model is silent or wrong. Drains external
 * checks first (so evidence is verified before proceeding, exactly as the
 * hardcoded spine did), otherwise the canonical-earliest legal action — `legal`
 * is already in AGENT_ACTIONS order because `legalActions` filters that array.
 */
export function fallbackAction(
  legal: readonly AgentAction[],
): AgentAction | null {
  if (legal.length === 0) {
    return null;
  }
  if (legal.includes('external_check')) {
    return 'external_check';
  }
  return legal[0] ?? null;
}

/**
 * Decide the next action for this turn. Assumes the run is in budget (the runner
 * checks budget termination separately). Returns null only when no action is
 * legal at all — a state the runner treats as a failure.
 */
export async function decideNextAction(
  state: AgentRunState,
  proposer: Proposer | null,
): Promise<ChosenDecision | null> {
  const legal = legalActions(state);
  if (legal.length === 0) {
    return null;
  }

  const forced = forcedAction(state);
  if (forced) {
    return {
      action: forced,
      rationale: 'Only one action is legal in this state.',
      target: null,
      source: 'forced',
    };
  }

  if (proposer) {
    try {
      const proposed = await proposer({ state, legal });
      if (legal.includes(proposed.action)) {
        return {
          action: proposed.action,
          rationale: proposed.rationale,
          target: proposed.target,
          source: 'model',
        };
      }
    } catch {
      // Fall through to the deterministic fallback below — a model failure must
      // never stall the loop.
    }
  }

  const fallback = fallbackAction(legal);
  return fallback
    ? {
        action: fallback,
        rationale:
          'Harness default ordering (no proposer, or the model errored or proposed an illegal action).',
        target: null,
        source: 'fallback',
      }
    : null;
}
