import { Injectable } from '@nestjs/common';
import { AnthropicAdapter } from './anthropic.adapter';
import { OpenAiAdapter } from './openai.adapter';
import { ProviderError, type ProviderAdapter } from './provider-adapter';
import type { ProviderName } from './provider.types';

/**
 * Resolves a provider name to its adapter. Providers register here behind the
 * same interface (graceful: an unregistered provider fails loudly rather than
 * silently degrading).
 */
@Injectable()
export class ProviderRegistry {
  private readonly adapters: ReadonlyMap<ProviderName, ProviderAdapter>;

  constructor(anthropic: AnthropicAdapter, openai: OpenAiAdapter) {
    this.adapters = new Map<ProviderName, ProviderAdapter>([
      [anthropic.name, anthropic],
      [openai.name, openai],
    ]);
  }

  get(name: ProviderName): ProviderAdapter {
    const adapter = this.adapters.get(name);
    if (!adapter) {
      throw new ProviderError(name, null, `Unsupported provider: ${name}`);
    }
    return adapter;
  }

  supported(): ReadonlyArray<ProviderName> {
    return [...this.adapters.keys()];
  }
}
