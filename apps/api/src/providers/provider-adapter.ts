import type {
  CompletionRequest,
  CompletionResult,
  ProviderName,
} from './provider.types';

/**
 * BYOK provider adapter. The apiKey is supplied per-request by the caller
 * (originating client-side) and must NEVER be persisted, logged, or written
 * to the trace. Implementations throw on failure — provider errors are never
 * silently swallowed.
 */
export interface ProviderAdapter {
  readonly name: ProviderName;
  complete(request: CompletionRequest, apiKey: string): Promise<CompletionResult>;
}

/** Raised when a provider call fails. Carries status, never the API key. */
export class ProviderError extends Error {
  constructor(
    readonly provider: ProviderName,
    readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
