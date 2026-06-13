import { Module } from '@nestjs/common';
import { LoggerModule } from '../logger/logger.module';
import { MetricsService } from './metrics.service';

/**
 * Metrics module. Provides MetricsService for per-run rollup tracking.
 * PrismaService is global (PersistenceModule) — not re-provided here.
 * JsonLogger is global (LoggerModule) — imported to ensure availability
 * in contexts where LoggerModule is not already in scope.
 */
@Module({
  imports: [LoggerModule],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
