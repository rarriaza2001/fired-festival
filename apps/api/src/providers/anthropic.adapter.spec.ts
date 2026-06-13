import { describe, expect, it } from 'vitest';
import { anthropicSupportsTemperature } from './anthropic.adapter';

describe('anthropicSupportsTemperature', () => {
  it('blocks temperature on Claude Opus 4.8', () => {
    expect(anthropicSupportsTemperature('claude-opus-4-8')).toBe(false);
  });

  it('allows temperature on legacy Claude 3.5', () => {
    expect(anthropicSupportsTemperature('claude-3-5-haiku-latest')).toBe(true);
  });
});
