import type { LoggerService } from '@nestjs/common';
import type { AppEnv } from '../config/env';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
// Named AppLogLevel to avoid clashing with NestJS's own LogLevel (which has a
// different shape: 'log' | 'verbose' | 'fatal' ...).
export type AppLogLevel = AppEnv['LOG_LEVEL'];

/**
 * Structured JSON logger (one line = one JSON object) written to stdout.
 * Replaces console.log per coding standards. Callers must never pass secrets;
 * BYOK provider keys are intentionally absent from every log payload.
 */
export class JsonLogger implements LoggerService {
  constructor(private readonly minLevel: AppLogLevel = 'info') {}

  private write(
    level: AppLogLevel,
    message: unknown,
    context?: string,
    extra?: Readonly<Record<string, unknown>>,
  ): void {
    if (LEVELS[level] < LEVELS[this.minLevel]) return;
    // Reserved fields are spread last so caller-supplied `extra` can never
    // clobber level/time/context/message.
    const line = JSON.stringify({
      ...extra,
      level,
      time: new Date().toISOString(),
      context: context ?? null,
      message,
    });
    process.stdout.write(`${line}\n`);
  }

  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  error(message: unknown, stackOrContext?: string, context?: string): void {
    const ctx = context ?? stackOrContext;
    const extra = context ? { stack: stackOrContext } : undefined;
    this.write('error', message, ctx, extra);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  /** Emit a structured event line with arbitrary (secret-free) fields. */
  event(level: AppLogLevel, message: string, fields: Readonly<Record<string, unknown>>): void {
    this.write(level, message, 'event', fields);
  }
}
