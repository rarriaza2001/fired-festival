import { describe, expect, it } from 'vitest';
import {
  chunkUserContext,
  isSemanticallySimilar,
  semanticSimilarity,
} from './text-similarity';

describe('semanticSimilarity', () => {
  it('scores paraphrases higher than unrelated text', () => {
    const a = 'Market demand for career coaching in Austin may be insufficient.';
    const b = 'Insufficient market demand for coaching services in the Austin area.';
    const c = 'The lease terms require a five-year commitment with personal guarantee.';

    expect(semanticSimilarity(a, b)).toBeGreaterThan(0.45);
    expect(semanticSimilarity(a, b)).toBeGreaterThan(semanticSimilarity(a, c));
  });

  it('detects cross-section duplicate phrasing from review output', () => {
    const a =
      'Market demand for this service may be insufficient in your target segment.';
    const b =
      'Market demand for the service is unverified and may be insufficient.';
    expect(isSemanticallySimilar(a, b)).toBe(true);
  });
});

describe('chunkUserContext', () => {
  it('splits long user input into sentence chunks', () => {
    const chunks = chunkUserContext(
      'I want to open a cafe downtown with a full kitchen and liquor license. '.repeat(4) +
        'I worry about competition from established chains nearby.',
    );
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });
});
