/**
 * Output token budgets for structured review stages. Complex stages (many
 * assumptions, evidence items, three competitors, failure modes) need headroom
 * so JSON is not truncated mid-object — truncation forces a repair pass and
 * often surfaces as timeouts on slower providers.
 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

/** Stages that emit the largest JSON payloads. */
export const HEAVY_STAGE_MAX_OUTPUT_TOKENS = 12_288;
