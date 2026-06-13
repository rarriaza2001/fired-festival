import { Global, Module } from '@nestjs/common';
import { loadEnv } from '../config/env';
import { TelemetryService } from './telemetry.service';
import { TelemetryController } from './telemetry.controller';

/**
 * Global telemetry layer. Provides the phase8.v1 → OpenTelemetry bridge
 * (TelemetryService, injected optionally by TraceService and AgentRunner) and
 * the read API (TelemetryController). The OTel SDK itself is started in
 * `main.ts` before Nest boots; the service only reads OTEL_ENABLED to decide
 * whether to emit. PrismaService (global) backs the controller.
 */
@Global()
@Module({
  controllers: [TelemetryController],
  providers: [
    {
      provide: TelemetryService,
      useFactory: (): TelemetryService => new TelemetryService(loadEnv().OTEL_ENABLED),
    },
  ],
  exports: [TelemetryService],
})
export class TelemetryModule {}
