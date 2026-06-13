import { Module } from '@nestjs/common';
import { LoggerModule } from './logger/logger.module';
import { PersistenceModule } from './persistence/persistence.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { ProviderModule } from './providers/provider.module';
import { TraceModule } from './trace/trace.module';
import { LlmModule } from './llm/llm.module';
import { ToolsModule } from './tools/tools.module';
import { EvalModule } from './eval/eval.module';
import { MetricsModule } from './metrics/metrics.module';
import { ReviewModule } from './review/review.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { HealthController } from './health/health.controller';

/**
 * Root module. Global infrastructure (logger, persistence) + feature modules
 * (providers, trace, LLM, review). The review module hosts the Phase 3 spine.
 */
@Module({
  imports: [
    LoggerModule,
    PersistenceModule,
    TelemetryModule,
    ProviderModule,
    TraceModule,
    LlmModule,
    ToolsModule,
    EvalModule,
    MetricsModule,
    IngestionModule,
    ReviewModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
