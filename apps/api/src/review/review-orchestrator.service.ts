import { Injectable } from '@nestjs/common';
import type { ReviewInput } from '@dgb/shared';
import type { Byok } from '../llm/llm.types';
import { AgentRunner } from '../agent/agent-runner.service';

/**
 * Review entry point. The review is now driven by a model-directed agent loop
 * (AgentRunner) rather than a hardcoded stage sequence: each turn the model
 * chooses the next legal action and the harness validates/forces/terminates it.
 * Every behavioral invariant the old spine guaranteed — intake routing, the
 * confidence cap, the pre-output guardrail checklist, the bounded reassessment
 * loop, tool discipline, evaluation, and metrics — is preserved inside the
 * runner; only the mechanism that selects the next step changed.
 *
 * This class is kept as the stable public seam the controller depends on, so the
 * cutover to the agent harness is invisible to callers: same method, same
 * signature, same detached/never-throws-onward contract.
 */
@Injectable()
export class ReviewOrchestrator {
  constructor(private readonly runner: AgentRunner) {}

  /** Drive one review to a terminal state. Delegates to the agent harness. */
  async run(runId: string, input: ReviewInput, byok: Byok): Promise<void> {
    return this.runner.run(runId, input, byok);
  }

  /**
   * Replay a run forward from a persisted checkpoint (seq), without re-running
   * the prior stages. Same detached contract as run(); the BYOK key is supplied
   * per request and never persisted.
   */
  async replay(runId: string, fromSeq: number, byok: Byok): Promise<void> {
    return this.runner.replay(runId, fromSeq, byok);
  }
}
