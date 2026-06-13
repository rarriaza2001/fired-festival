import {
  ANTHROPIC_CONTEXT_TOKEN_LIMIT,
  LLM_CHARS_PER_TOKEN_ESTIMATE,
  LLM_CONTEXT_SAFETY_BUFFER_TOKENS,
} from '@dgb/shared';
import type { ChatMessage } from '../providers/provider.types';

/** Conservative token estimate from text length (no tokenizer call). */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / LLM_CHARS_PER_TOKEN_ESTIMATE);
}

export function estimatePromptTokens(
  system: string | undefined,
  messages: readonly ChatMessage[],
): number {
  const systemTokens = estimateTokens(system ?? '');
  const messageTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  return systemTokens + messageTokens;
}

/** Fit max_tokens inside the provider context window without exceeding the limit. */
export function capMaxTokensForContext(
  system: string | undefined,
  messages: readonly ChatMessage[],
  requestedMax: number,
  contextLimit: number = ANTHROPIC_CONTEXT_TOKEN_LIMIT,
): number {
  const inputTokens = estimatePromptTokens(system, messages);
  const remaining = contextLimit - inputTokens - LLM_CONTEXT_SAFETY_BUFFER_TOKENS;
  if (remaining < 1024) {
    return 1024;
  }
  return Math.min(requestedMax, remaining);
}

/** Parse Anthropic "Limit X, Used Y, Requested Z" context errors. */
export function parseAnthropicContextLimitError(message: string): {
  limit: number;
  used: number;
  requested: number;
} | null {
  const match = message.match(/Limit\s+(\d+),\s*Used\s+(\d+),\s*Requested\s+(\d+)/i);
  if (!match) return null;
  return {
    limit: Number(match[1]),
    used: Number(match[2]),
    requested: Number(match[3]),
  };
}

export function maxTokensAfterContextError(
  parsed: { limit: number; used: number },
  requestedMax: number,
): number {
  const remaining = parsed.limit - parsed.used - LLM_CONTEXT_SAFETY_BUFFER_TOKENS;
  return Math.max(1024, Math.min(requestedMax, remaining));
}
