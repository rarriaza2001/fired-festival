import type { Provider, CostAccuracy } from '@dgb/shared';

export type ProviderName = Provider;

/** One conversational turn. System content is passed separately. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** A single LLM completion request. The provider/model is caller-chosen. */
export interface CompletionRequest {
  model: string;
  system?: string;
  messages: ReadonlyArray<ChatMessage>;
  maxTokens: number;
  temperature?: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Completion result. cost is interpreted alongside accuracy — never a fake
 * exact number (Phase 8 §7).
 */
export interface CompletionResult {
  text: string;
  model: string;
  usage: TokenUsage | null;
  costUsd: number | null;
  costAccuracy: CostAccuracy;
}
