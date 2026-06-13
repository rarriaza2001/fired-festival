import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { JsonLogger } from './logger/json-logger';
import { loadEnv } from './config/env';
import { startTelemetry, shutdownTelemetry } from './telemetry/telemetry.sdk';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const logger = new JsonLogger(env.LOG_LEVEL);

  // Start the OTel SDK before Nest boots (no-op when OTEL_ENABLED is false).
  await startTelemetry(env);

  const app = await NestFactory.create(AppModule, { logger });
  // Provider choice travels in headers; LLM keys stay server-side.
  // credentials stay off and the origin/method/header allowlist is explicit.
  app.enableCors({
    origin: env.WEB_ORIGIN,
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'X-Provider-Name',
      'X-Provider-Model',
    ],
  });
  app.enableShutdownHooks();

  // Flush + stop the OTel SDK on shutdown (no-op when never started).
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void shutdownTelemetry();
    });
  }

  await app.listen(env.API_PORT);
  logger.log(`Don't Go Blind API listening on :${env.API_PORT}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown bootstrap error';
  process.stdout.write(
    `${JSON.stringify({ level: 'error', context: 'Bootstrap', message })}\n`,
  );
  process.exit(1);
});
