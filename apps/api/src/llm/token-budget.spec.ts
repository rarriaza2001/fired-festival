import { describe, expect, it } from 'vitest';
import {
  capMaxTokensForContext,
  estimateTokens,
  maxTokensAfterContextError,
  parseAnthropicContextLimitError,
} from './token-budget';

describe('token-budget', () => {
  it('estimates tokens from text length', () => {
    expect(estimateTokens('abcd')).toBeGreaterThan(0);
  });

  it('caps max_tokens when input would exceed the context window', () => {
    const big = 'x'.repeat(25_000 * 4);
    const capped = capMaxTokensForContext('system', [{ role: 'user', content: big }], 10_000, 30_000);
    expect(capped).toBeLessThan(10_000);
    expect(capped).toBeGreaterThanOrEqual(1024);
  });

  it('parses Anthropic context limit errors', () => {
    const parsed = parseAnthropicContextLimitError(
      'invalid_request_error: Limit 30000, Used 25098, Requested 8886',
    );
    expect(parsed).toEqual({ limit: 30_000, used: 25_098, requested: 8886 });
    expect(maxTokensAfterContextError(parsed!, 10_000)).toBe(4390);
  });
});
