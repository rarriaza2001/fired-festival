import { Module } from '@nestjs/common';
import { ModelOnlyToolAdapter } from './model-only-tool.adapter';
import { NetworkToolAdapter } from './network-tool.adapter';
import { TOOL_ADAPTER } from './tool-adapter';
import { IngestionModule } from '../ingestion/ingestion.module';
import { loadEnv } from '../config/env';

/**
 * Provides the active ToolAdapter under the TOOL_ADAPTER injection token.
 *
 * Defaults to ModelOnlyToolAdapter (Phase A3 graceful degradation — no network
 * calls). Set TOOL_MODE=network to enable fetch/ingest via ContextIngestionService.
 */
@Module({
  imports: [IngestionModule],
  providers: [
    ModelOnlyToolAdapter,
    NetworkToolAdapter,
    {
      provide: TOOL_ADAPTER,
      useFactory: (
        modelOnly: ModelOnlyToolAdapter,
        network: NetworkToolAdapter,
      ) => (loadEnv().TOOL_MODE === 'network' ? network : modelOnly),
      inject: [ModelOnlyToolAdapter, NetworkToolAdapter],
    },
  ],
  exports: [TOOL_ADAPTER],
})
export class ToolsModule {}
