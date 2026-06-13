import type { Provider, CostAccuracy } from '@dgb/shared';

export type ProviderName = Provider;

/** One conversational turn. System content is passed separately. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Anthropic structured-output JSON schema envelope. */
export interface JsonSchemaResponseFormat {
  readonly type: 'json_schema';
  readonly schema: Record<string, unknown>;
}

/** A single LLM completion request. The provider/model is caller-chosen. */
export interface CompletionRequest {
  model: string;
  system?: string;
  messages: ReadonlyArray<ChatMessage>;
  maxTokens: number;
  temperature?: number;
  /** When set, Anthropic uses constrained JSON decoding for valid output. */
  responseFormat?: JsonSchemaResponseFormat;
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
  stopReason?: string | null;
}
