import { z } from 'zod';

/** Validated process environment (system boundary). LLM keys are server-side only. */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z
    .string()
    .url()
    .refine((u) => ['http:', 'https:'].includes(new URL(u).protocol), {
      message: 'WEB_ORIGIN must use http or https',
    })
    .default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  ATTACHMENT_STORAGE_DIR: z.string().min(1).default('storage/attachments'),
  ATTACHMENT_TTL_HOURS: z.coerce.number().int().positive().default(24),
  LINK_FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  /** Per-request LLM HTTP timeout (Opus on heavy stages can run several minutes). */
  LLM_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
  TOOL_MODE: z.enum(['model_only', 'network']).default('model_only'),
  /** Server-side LLM keys (local dev / deployment). Never sent to the client. */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  /** Brave Search API key — enables web search during external checks when TOOL_MODE=network. */
  BRAVE_SEARCH_API_KEY: z.string().min(1).optional(),
  // OpenTelemetry export (additive observability over the phase8.v1 model).
  // Off by default so default behavior + the test suite are unaffected.
  OTEL_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  OTEL_PROMETHEUS_PORT: z.coerce.number().int().positive().default(9464),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_SERVICE_NAME: z.string().min(1).default('dgb-api'),
});

export type AppEnv = z.infer<typeof envSchema>;

/** Parse + validate env once at startup; fail fast with a clear message. */
export function loadEnv(): AppEnv {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${detail}`);
  }
  return parsed.data;
}
