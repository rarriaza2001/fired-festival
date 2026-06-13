import { Module } from '@nestjs/common';
import { ProviderModule } from '../providers/provider.module';
import { StructuredLlmService } from './structured-llm.service';

/** Exposes the structured-LLM stage runner to the workflow/review layer. */
@Module({
  imports: [ProviderModule],
  providers: [StructuredLlmService],
  exports: [StructuredLlmService],
})
export class LlmModule {}
