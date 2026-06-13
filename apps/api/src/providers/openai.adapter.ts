import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { CostAccuracy } from '@dgb/shared';
import { ProviderAdapter, ProviderError } from './provider-adapter';
import type {
  CompletionRequest,
  CompletionResult,
  ProviderName,
  TokenUsage,
} from './provider.types';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * USD per million tokens, keyed by model-id prefix. Estimation only — prices
 * drift, so results are reported with cost_accuracy = 'estimated'. Unknown
 * models report cost null / 'unknown' rather than a fabricated number.
 */
const PRICING_PER_MTOK: ReadonlyArray<readonly [string, { input: number; output: number }]> = [
  ['gpt-4o-mini', { input: 0.15, output: 0.6 }],
  ['gpt-4o', { input: 2.5, output: 10 }],
  ['gpt-4-turbo', { input: 10, output: 30 }],
  ['gpt-4', { input: 30, output: 60 }],
  ['o3-mini', { input: 1.1, output: 4.4 }],
  ['o1-mini', { input: 3, output: 12 }],
  ['o1', { input: 15, output: 60 }],
];

/** Untrusted external response — validated before use. */
const openaiResponseSchema = z.object({
  model: z.string(),
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string().nullable(),
      }),
    }),
  ),
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
    })
    .optional(),
});

/** Structured OpenAI error envelope. Only typed fields are surfaced. */
const openaiErrorSchema = z.object({
  error: z.object({
    type: z.string().optional(),
    message: z.string(),
  }),
});

function safeErrorDetail(status: number, bodyText: string): string {
  try {
    const parsed = openaiErrorSchema.safeParse(JSON.parse(bodyText));
    if (parsed.success) {
      const { type, message } = parsed.data.error;
      const prefix = type ? `${type}: ` : '';
      return `${prefix}${message.slice(0, 200)}`;
    }
  } catch {
    // Non-JSON body — fall through to the generic detail.
  }
  return `HTTP ${status}`;
}

function estimateCost(
  model: string,
  usage: TokenUsage | null,
): { costUsd: number | null; costAccuracy: CostAccuracy } {
  if (!usage) return { costUsd: null, costAccuracy: 'unavailable' };
  const entry = PRICING_PER_MTOK.find(([prefix]) => model.startsWith(prefix));
  if (!entry) return { costUsd: null, costAccuracy: 'unknown' };
  const [, price] = entry;
  const costUsd =
    (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
  return { costUsd, costAccuracy: 'estimated' };
}

/** OpenAI Chat Completions API adapter (BYOK). */
@Injectable()
export class OpenAiAdapter implements ProviderAdapter {
  readonly name: ProviderName = 'openai';

  async complete(
    request: CompletionRequest,
    apiKey: string,
  ): Promise<CompletionResult> {
    if (!apiKey) {
      throw new ProviderError(
        this.name,
        null,
        'Missing API key. A BYOK provider key must be supplied per request.',
      );
    }

    let response: Response;
    try {
      response = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          max_tokens: request.maxTokens,
          ...(request.temperature !== undefined
            ? { temperature: request.temperature }
            : {}),
          messages: [
            ...(request.system ? [{ role: 'system', content: request.system }] : []),
            ...request.messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          ],
        }),
      });
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : 'network error';
      throw new ProviderError(this.name, null, `Request failed: ${reason}`);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ProviderError(
        this.name,
        response.status,
        `OpenAI request failed — ${safeErrorDetail(response.status, body)}`,
      );
    }

    const parsed = openaiResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new ProviderError(
        this.name,
        response.status,
        'OpenAI response did not match the expected shape.',
      );
    }

    const data = parsed.data;
    const text = data.choices[0]?.message.content ?? '';
    const usage: TokenUsage | null = data.usage
      ? {
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
        }
      : null;
    const { costUsd, costAccuracy } = estimateCost(data.model, usage);

    return { text, model: data.model, usage, costUsd, costAccuracy };
  }
}
