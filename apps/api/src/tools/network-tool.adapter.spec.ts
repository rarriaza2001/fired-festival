import { describe, it, expect, vi, beforeEach } from 'vitest';

const braveWebSearch = vi.fn();
const loadEnv = vi.fn();

vi.mock('./web-search.service', () => ({
  braveWebSearch: (...args: unknown[]) => braveWebSearch(...args),
}));
vi.mock('../config/env', () => ({
  loadEnv: () => loadEnv(),
}));

import { BASE_RATE_NOTE_PREFIX } from '@dgb/shared';
import { NetworkToolAdapter } from './network-tool.adapter';
import type { ContextIngestionService } from '../ingestion/context-ingestion.service';

const ingestionStub = {} as ContextIngestionService;

describe('NetworkToolAdapter — base_rate primitive', () => {
  const adapter = new NetworkToolAdapter(ingestionStub);

  beforeEach(() => {
    braveWebSearch.mockReset();
    loadEnv.mockReset();
  });

  it('returns a completed reference-class result with the outside-view note', async () => {
    // Arrange
    loadEnv.mockReturnValue({ BRAVE_SEARCH_API_KEY: 'k' });
    braveWebSearch.mockResolvedValue({
      query: 'q',
      hits: [
        { title: 'Pivot success rates', url: 'https://a.test/1', snippet: '30% succeed' },
        { title: 'Sales-led timelines', url: 'https://b.test/2', snippet: 'median 18mo' },
      ],
    });

    // Act
    const result = await adapter.invoke({
      primitive: 'base_rate',
      query: 'base rate for self-serve to sales-led',
    });

    // Assert
    expect(result.available).toBe(true);
    expect(result.evidenceState).toBe('external_check_completed');
    expect(result.sourceTrust).toBe('medium_trust');
    expect(result.note.startsWith(BASE_RATE_NOTE_PREFIX)).toBe(true);
    expect(result.sourceUrls).toEqual(['https://a.test/1', 'https://b.test/2']);
  });

  it('returns unavailable (no fabrication) when the API key is missing', async () => {
    // Arrange
    loadEnv.mockReturnValue({ BRAVE_SEARCH_API_KEY: undefined });

    // Act
    const result = await adapter.invoke({ primitive: 'base_rate', query: 'q' });

    // Assert
    expect(result.available).toBe(false);
    expect(result.evidenceState).toBe('external_check_unavailable');
    expect(result.content).toBeNull();
    expect(braveWebSearch).not.toHaveBeenCalled();
  });

  it('returns unavailable when the reference-class search has no hits', async () => {
    // Arrange
    loadEnv.mockReturnValue({ BRAVE_SEARCH_API_KEY: 'k' });
    braveWebSearch.mockResolvedValue({ query: 'q', hits: [] });

    // Act
    const result = await adapter.invoke({ primitive: 'base_rate', query: 'q' });

    // Assert
    expect(result.available).toBe(false);
    expect(result.evidenceState).toBe('external_check_unavailable');
  });
});
