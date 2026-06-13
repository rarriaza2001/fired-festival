import { describe, expect, it } from 'vitest';
import { CONTEXT_LIMITS } from '@dgb/shared';
import { collectContextRefs, labelFromUrl, tryAddLink } from './context-items';
import { assertContextWithinLimit } from './context-submit';

describe('labelFromUrl', () => {
  it('uses hostname and path without www', () => {
    expect(labelFromUrl('https://www.sec.gov/archives/edgar/data/10k')).toBe(
      'sec.gov/archives/edgar/data/10k',
    );
  });

  it('uses hostname only for root paths', () => {
    expect(labelFromUrl('https://example.com/')).toBe('example.com');
  });
});

describe('tryAddLink', () => {
  const emptyRefs = new Set<string>();

  it('adds multiple distinct links', () => {
    const first = tryAddLink('https://a.example.com/one', [], emptyRefs, 0);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const refs = collectContextRefs([], first.items, []);
    const second = tryAddLink('https://b.example.com/two', first.items, refs, 1);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.items).toHaveLength(2);
  });

  it('rejects duplicate links', () => {
    const first = tryAddLink('https://example.com/report', [], emptyRefs, 0);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const refs = collectContextRefs([], first.items, []);
    const dup = tryAddLink('https://example.com/report', first.items, refs, 1);
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.error).toContain('already attached');
  });

  it('rejects when at combined limit', () => {
    const result = tryAddLink(
      'https://example.com/new',
      [],
      emptyRefs,
      CONTEXT_LIMITS.MAX_ITEMS_PER_REVIEW,
    );
    expect(result.ok).toBe(false);
  });
});

describe('assertContextWithinLimit', () => {
  it('throws when merged items exceed cap', () => {
    const items = Array.from({ length: CONTEXT_LIMITS.MAX_ITEMS_PER_REVIEW + 1 }, (_, i) => ({
      label: `item-${i}`,
      ref: `https://example.com/${i}`,
      kind: 'link' as const,
    }));
    expect(() => assertContextWithinLimit(items)).toThrow(/Maximum 5 context items/);
  });
});
