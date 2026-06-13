import { Injectable } from '@nestjs/common';
import type { ToolAdapter, ToolRequest, ToolResult } from './tool-adapter';

const UNAVAILABLE_RESULT: ToolResult = {
  available: false,
  evidenceState: 'external_check_unavailable',
  content: null,
  sourceTrust: null,
  costUsd: 0,
  costAccuracy: 'exact',
  note: 'External retrieval is disabled in model-only mode; claim left unverified.',
};

const INGEST_RESULT_NOTE = 'Context ingested without external verification.';

/**
 * Phase A3 graceful-degradation adapter.
 *
 * Makes zero network calls. All search and fetch primitives return
 * `external_check_unavailable`. The ingest primitive acknowledges the provided
 * context but marks it `provided_but_unassessed` because no external source
 * corroborates it.
 *
 * Deterministic and side-effect-free — safe to use in tests and offline envs.
 */
@Injectable()
export class ModelOnlyToolAdapter implements ToolAdapter {
  readonly name = 'model_only';

  invoke(request: ToolRequest): Promise<ToolResult> {
    if (request.primitive === 'ingest') {
      const result: ToolResult = {
        available: true,
        evidenceState: 'provided_but_unassessed',
        content: request.query,
        sourceTrust: 'unverified',
        costUsd: 0,
        costAccuracy: 'exact',
        note: INGEST_RESULT_NOTE,
      };
      return Promise.resolve(result);
    }

    return Promise.resolve(UNAVAILABLE_RESULT);
  }
}
