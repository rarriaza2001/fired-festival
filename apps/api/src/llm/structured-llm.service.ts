import { Injectable } from '@nestjs/common';
import type { ZodType, ZodTypeDef } from 'zod';
import { DEFAULT_MAX_OUTPUT_TOKENS } from '@dgb/shared';
import { ProviderRegistry } from '../providers/provider.registry';
import { ProviderError } from '../providers/provider-adapter';
import type { ChatMessage, CompletionRequest } from '../providers/provider.types';
import type { Byok, StructuredResult } from './llm.types';
import { zodToAnthropicJsonSchema } from './anthropic-json-schema';
import { parseJsonObject } from './json-extract';

const MAX_ERROR_ISSUES = 6;

type ParseOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

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
    const useAnthropicStructured = byok.providerName === 'anthropic';
    const responseFormat = useAnthropicStructured
      ? { type: 'json_schema' as const, schema: zodToAnthropicJsonSchema(schema) }
      : undefined;

    const buildRequest = (
      messages: ReadonlyArray<ChatMessage>,
      withStructured: boolean,
    ): CompletionRequest => ({
      model: byok.model,
      system,
      messages,
      maxTokens,
      ...(byok.providerName !== 'anthropic' ? { temperature: 0 } : {}),
      ...(withStructured && responseFormat
        ? { responseFormat: { type: 'json_schema', schema: responseFormat.schema } }
        : {}),
    });

    const ask = async (messages: ReadonlyArray<ChatMessage>, structured: boolean) => {
      try {
        return await adapter.complete(buildRequest(messages, structured), byok.apiKey);
      } catch (error: unknown) {
        if (
          structured &&
          useAnthropicStructured &&
          error instanceof ProviderError &&
          error.status === 400 &&
          /schema|too complex|output_config|format/i.test(error.message)
        ) {
          return adapter.complete(buildRequest(messages, false), byok.apiKey);
        }
        throw error;
      }
    };

    const first = await ask([{ role: 'user', content: user }], useAnthropicStructured);
    const firstParse = this.parse(schema, first.text);
    if (firstParse.ok) {
      return {
        data: firstParse.value,
        model: first.model,
        costUsd: first.costUsd,
        costAccuracy: first.costAccuracy,
      };
    }

    // Single-turn repair avoids replaying assistant turns (required for Claude 4.8+).
    const repair = await ask(
      [
        {
          role: 'user',
          content: `${user}\n\n---\nYour previous response was invalid: ${firstParse.error}\nReturn ONLY a single JSON object matching the requested fields. No prose, markdown, or code fences.`,
        },
      ],
      useAnthropicStructured,
    );
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
    const parsed = parseJsonObject(text);
    if (!parsed.ok) return parsed;

    const result = schema.safeParse(parsed.value);
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
