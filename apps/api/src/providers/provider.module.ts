import { Module } from '@nestjs/common';
import { AnthropicAdapter } from './anthropic.adapter';
import { OpenAiAdapter } from './openai.adapter';
import { ProviderRegistry } from './provider.registry';

/** LLM provider layer (BYOK). Exposes the ProviderRegistry. */
@Module({
  providers: [AnthropicAdapter, OpenAiAdapter, ProviderRegistry],
  exports: [ProviderRegistry],
})
export class ProviderModule {}
