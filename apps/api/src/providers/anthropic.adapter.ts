import { Injectable } from '@nestjs/common';
import { loadEnv } from '../config/env';
import { z } from 'zod';
import type { CostAccuracy } from '@dgb/shared';
import { ProviderAdapter, ProviderError } from './provider-adapter';
import type {
  CompletionRequest,
  CompletionResult,
  ProviderName,
  TokenUsage,
} from './provider.types';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * USD per million tokens, keyed by model-id prefix. Estimation only — prices
 * drift, so results are reported with cost_accuracy = 'estimated'. Unknown
 * models report cost null / 'unknown' rather than a fabricated number.
 */
const PRICING_PER_MTOK: ReadonlyArray<readonly [string, { input: number; output: number }]> = [
  ['claude-opus-4-8', { input: 5, output: 25 }],
  ['claude-opus-4', { input: 15, output: 75 }],
  ['claude-sonnet-4', { input: 3, output: 15 }],
  ['claude-haiku-4', { input: 1, output: 5 }],
];

/** Untrusted external response — validated before use. */
const anthropicResponseSchema = z.object({
  model: z.string(),
  stop_reason: z.string().nullable().optional(),
  content: z.array(
    z.object({
      type: z.string(),
      text: z.string().optional(),
      thinking: z.string().optional(),
    }),
  ),
  usage: z
    .object({ input_tokens: z.number(), output_tokens: z.number() })
    .optional(),
});

/** Structured Anthropic error envelope. Only typed fields are surfaced. */
const anthropicErrorSchema = z.object({
  error: z.object({ type: z.string(), message: z.string() }),
});

/**
 * Build a safe failure detail from an error response. Never returns the raw
 * body (which could break log formatting or, via a hostile proxy, echo
 * attacker-controlled content) — only the typed error.type/message.
 */
function safeErrorDetail(status: number, bodyText: string): string {
  try {
    const parsed = anthropicErrorSchema.safeParse(JSON.parse(bodyText));
    if (parsed.success) {
      return `${parsed.data.error.type}: ${parsed.data.error.message.slice(0, 200)}`;
    }
  } catch {
    // Non-JSON body — fall through to the generic detail.
  }
  return `HTTP ${status}`;
}


/** Claude 4.7+ rejects temperature/top_p — omit sampling params for these ids. */
export function anthropicSupportsTemperature(model: string): boolean {
  const id = model.toLowerCase();
  const blocked = [
    'claude-opus-4-7',
    'claude-opus-4-8',
    'claude-sonnet-4-6',
    'claude-fable',
    'claude-mythos',
  ];
  return !blocked.some((prefix) => id.startsWith(prefix));
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

/** Anthropic Messages API adapter (BYOK). */
@Injectable()
export class AnthropicAdapter implements ProviderAdapter {
  readonly name: ProviderName = 'anthropic';

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
      response = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        signal: AbortSignal.timeout(loadEnv().LLM_REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          model: request.model,
          max_tokens: request.maxTokens,
          thinking: { type: 'disabled' },
          ...(request.temperature !== undefined &&
          anthropicSupportsTemperature(request.model)
            ? { temperature: request.temperature }
            : {}),
          ...(request.system ? { system: request.system } : {}),
          ...(request.responseFormat
            ? {
                output_config: {
                  format: {
                    type: 'json_schema',
                    schema: request.responseFormat.schema,
                  },
                },
              }
            : {}),
          messages: request.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
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
        `Anthropic request failed — ${safeErrorDetail(response.status, body)}`,
      );
    }

    const parsed = anthropicResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new ProviderError(
        this.name,
        response.status,
        'Anthropic response did not match the expected shape.',
      );
    }

    const data = parsed.data;
    const text = data.content
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text ?? '')
      .join('');

    if (!text.trim() && data.stop_reason === 'max_tokens') {
      throw new ProviderError(
        this.name,
        response.status,
        'Anthropic response hit max_tokens before emitting JSON text — retry with a higher token budget.',
      );
    }

    if (!text.trim()) {
      throw new ProviderError(
        this.name,
        response.status,
        'Anthropic returned no text content in the response.',
      );
    }
    const usage: TokenUsage | null = data.usage
      ? {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
        }
      : null;
    const { costUsd, costAccuracy } = estimateCost(data.model, usage);

    return {
      text,
      model: data.model,
      usage,
      costUsd,
      costAccuracy,
      stopReason: data.stop_reason ?? null,
    };
  }
}
