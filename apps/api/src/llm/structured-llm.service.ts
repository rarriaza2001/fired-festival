import { Injectable } from '@nestjs/common';
import type { ZodType, ZodTypeDef } from 'zod';
import { DEFAULT_MAX_OUTPUT_TOKENS } from '@dgb/shared';
import { ProviderRegistry } from '../providers/provider.registry';
import { ProviderError } from '../providers/provider-adapter';
import type { ChatMessage } from '../providers/provider.types';
import type { Byok, StructuredResult } from './llm.types';

const MAX_ERROR_ISSUES = 6;

type ParseOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

/**
 * Pull the JSON object out of a model response. Tolerates code fences and
 * leading/trailing prose by taking the outermost brace span.
 */
function extractJsonBlock(text: string): string | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence?.[1] ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  return candidate.slice(start, end + 1);
}

function addCost(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

/**
 * Runs one structured LLM stage: prompt the model, extract + Zod-validate the
 * JSON, and on a shape mismatch make exactly ONE bounded repair attempt that
 * feeds the validation error back. Never logs prompts, responses, or the key.
 */
@Injectable()
export class StructuredLlmService {
  constructor(private readonly registry: ProviderRegistry) {}

  async complete<T>(
    byok: Byok,
    schema: ZodType<T, ZodTypeDef, unknown>,
    system: string,
    user: string,
    maxTokens: number = DEFAULT_MAX_OUTPUT_TOKENS,
  ): Promise<StructuredResult<T>> {
    const adapter = this.registry.get(byok.providerName);
    const ask = (messages: ReadonlyArray<ChatMessage>) =>
      adapter.complete(
        { model: byok.model, system, messages, maxTokens, temperature: 0 },
        byok.apiKey,
      );

    const first = await ask([{ role: 'user', content: user }]);
    const firstParse = this.parse(schema, first.text);
    if (firstParse.ok) {
      return {
        data: firstParse.value,
        model: first.model,
        costUsd: first.costUsd,
        costAccuracy: first.costAccuracy,
      };
    }

    const repair = await ask([
      { role: 'user', content: user },
      { role: 'assistant', content: first.text },
      {
        role: 'user',
        content: `That response was not valid: ${firstParse.error} Return ONLY a single JSON object — no prose, no markdown, no code fences.`,
      },
    ]);
    const repairParse = this.parse(schema, repair.text);
    if (repairParse.ok) {
      return {
        data: repairParse.value,
        model: repair.model,
        costUsd: addCost(first.costUsd, repair.costUsd),
        costAccuracy: repair.costAccuracy,
      };
    }

    throw new ProviderError(
      byok.providerName,
      null,
      `Model did not return schema-valid JSON after one repair: ${repairParse.error}`,
    );
  }

  private parse<T>(schema: ZodType<T, ZodTypeDef, unknown>, text: string): ParseOutcome<T> {
    const json = extractJsonBlock(text);
    if (json === null) return { ok: false, error: 'No JSON object found in response.' };

    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      return { ok: false, error: 'Response was not parseable JSON.' };
    }

    const result = schema.safeParse(raw);
    if (!result.success) {
      const detail = result.error.issues
        .slice(0, MAX_ERROR_ISSUES)
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
      return { ok: false, error: `Schema mismatch — ${detail}.` };
    }
    return { ok: true, value: result.data };
  }
}
