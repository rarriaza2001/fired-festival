import { Global, Module } from '@nestjs/common';
import { JsonLogger } from './json-logger';
import { loadEnv } from '../config/env';

/**
 * Global logger. One JsonLogger instance, configured from the validated
 * LOG_LEVEL (via loadEnv — no unchecked cast), available for injection
 * everywhere.
 */
@Global()
@Module({
  providers: [
    {
      provide: JsonLogger,
      useFactory: (): JsonLogger => new JsonLogger(loadEnv().LOG_LEVEL),
    },
  ],
  exports: [JsonLogger],
})
export class LoggerModule {}
