/**
 * Output token budgets for structured review stages. Complex stages (many
 * assumptions, evidence items, three competitors, failure modes) need headroom
 * so JSON is not truncated mid-object — truncation forces a repair pass and
 * often surfaces as timeouts on slower providers.
 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 10_000;

/** Stages that emit the largest JSON payloads (same cap as default). */
export const HEAVY_STAGE_MAX_OUTPUT_TOKENS = 10_000;

/** Anthropic combined context window (input + max_tokens) for current Opus tier. */
export const ANTHROPIC_CONTEXT_TOKEN_LIMIT = 30_000;

/** Reserve headroom so the API does not reject input + max_tokens at the limit. */
export const LLM_CONTEXT_SAFETY_BUFFER_TOKENS = 512;

/** Rough chars-per-token for pre-flight budgeting (conservative). */
export const LLM_CHARS_PER_TOKEN_ESTIMATE = 3.5;
