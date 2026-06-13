import { describe, it, expect } from 'vitest';
import type { ReviewInput } from '@dgb/shared';
import type { Byok, StructuredResult } from '../llm/llm.types';
import { StructuredLlmService } from '../llm/structured-llm.service';
import type { ToolAdapter, ToolRequest, ToolResult } from '../tools/tool-adapter';
import {
  isStageAction,
  stageKeyFor,
  runStageAction,
  runExternalCheckAction,
} from './action-handlers';

const INPUT: ReviewInput = {
  text: 'Should we migrate the billing service to event sourcing?',
  context_items: [{ label: 'rfc', ref: 'https://example.test/rfc', kind: 'link' as const }],
};

const BYOK: Byok = { providerName: 'anthropic', model: 'fake-model', apiKey: 'k' };

/** Records the (system, user) prompt it was called with and returns a fixed result. */
interface CapturedCall {
  system: string;
  user: string;
}

function fakeLlm(data: unknown, costUsd: number | null): {
  llm: StructuredLlmService;
  calls: CapturedCall[];
} {
  const calls: CapturedCall[] = [];
  const llm = {
    complete: async (
      _byok: Byok,
      _schema: unknown,
      system: string,
      user: string,
    ): Promise<StructuredResult<unknown>> => {
      calls.push({ system, user });
      return { data, model: 'fake-model', costUsd, costAccuracy: 'estimated' };
    },
  } as unknown as StructuredLlmService;
  return { llm, calls };
}

function fakeTool(result: ToolResult): { tools: ToolAdapter; requests: ToolRequest[] } {
  const requests: ToolRequest[] = [];
  const tools: ToolAdapter = {
    name: 'fake_tool',
    invoke: async (request: ToolRequest): Promise<ToolResult> => {
      requests.push(request);
      return result;
    },
  };
  return { tools, requests };
}

describe('action-handlers (wrap existing stages + tool)', () => {
  it('classifies stage vs. tool/control actions', () => {
    expect(isStageAction('assess_sufficiency')).toBe(true);
    expect(isStageAction('assemble_output')).toBe(true);
    expect(isStageAction('external_check')).toBe(false);
    expect(isStageAction('finalize')).toBe(false);
    expect(isStageAction('refuse_unsupported')).toBe(false);
  });

  it('maps each stage action to its StageKey', () => {
    expect(stageKeyFor('assess_sufficiency')).toBe('sufficiency');
    expect(stageKeyFor('check_reality_and_risks')).toBe('realityRisks');
    expect(stageKeyFor('frame_next_action')).toBe('nextAction');
    expect(stageKeyFor('assemble_output')).toBe('assembly');
  });

  it('runs a stage via the existing prompt/schema and returns data + cost', async () => {
    const { llm, calls } = fakeLlm({ ok: true }, 0.012);
    const result = await runStageAction({
      action: 'assess_sufficiency',
      input: INPUT,
      byok: BYOK,
      acc: {},
      llm,
    });

    expect(result.stageKey).toBe('sufficiency');
    expect(result.data).toEqual({ ok: true });
    expect(result.costUsd).toBe(0.012);

    // Reuses buildPrompt verbatim: persona in system, verbatim decision in user.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.system).toContain("Don't Go Blind");
    expect(calls[0]?.user).toContain('migrate the billing service');
  });

  it('feeds accumulated prior results into a downstream stage prompt', async () => {
    const { llm, calls } = fakeLlm({ in_scope: ['x'] }, null);
    const acc = { sufficiency: { classification: 'possibly_reviewable' } };
    const result = await runStageAction({
      action: 'confirm_scope',
      input: INPUT,
      byok: BYOK,
      acc,
      llm,
    });

    expect(result.stageKey).toBe('scope');
    expect(result.costUsd).toBe(0); // null cost normalizes to 0
    expect(calls[0]?.user).toContain('possibly_reviewable');
  });

  it('runs an external check as a search primitive on the statement', async () => {
    const toolResult: ToolResult = {
      available: false,
      evidenceState: 'external_check_unavailable',
      content: null,
      sourceTrust: null,
      costUsd: 0,
      costAccuracy: 'unknown',
      note: 'model-only mode',
    };
    const { tools, requests } = fakeTool(toolResult);
    const out = await runExternalCheckAction({
      statement: 'Users churn after the third onboarding step',
      tools,
    });

    expect(requests).toEqual([
      { primitive: 'search', query: 'Users churn after the third onboarding step' },
    ]);
    expect(out.result).toBe(toolResult);
    expect(out.costUsd).toBe(0);
  });
});
