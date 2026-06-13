import { Injectable } from '@nestjs/common';
import { BASE_RATE_NOTE_PREFIX } from '@dgb/shared';
import type { ToolAdapter, ToolRequest, ToolResult } from './tool-adapter';
import { ContextIngestionService } from '../ingestion/context-ingestion.service';
import { loadEnv } from '../config/env';
import { braveWebSearch } from './web-search.service';

function searchUnavailable(note: string): ToolResult {
  return {
    available: false,
    evidenceState: 'external_check_unavailable',
    content: null,
    sourceTrust: null,
    costUsd: 0,
    costAccuracy: 'exact',
    note,
  };
}

@Injectable()
export class NetworkToolAdapter implements ToolAdapter {
  readonly name = 'network';

  constructor(private readonly ingestion: ContextIngestionService) {}

  async invoke(request: ToolRequest): Promise<ToolResult> {
    if (request.primitive === 'search') {
      const apiKey = loadEnv().BRAVE_SEARCH_API_KEY;
      if (!apiKey) {
        return searchUnavailable('Web search is not configured (set BRAVE_SEARCH_API_KEY).');
      }
      try {
        const result = await braveWebSearch(request.query, apiKey, 3);
        if (!result.hits.length) {
          return searchUnavailable('Web search returned no results.');
        }
        const content = result.hits
          .map((h, i) => `${i + 1}. ${h.title}\n${h.url}\n${h.snippet}`)
          .join('\n\n');
        const sourceUrls = result.hits.map((h) => h.url);
        return {
          available: true,
          evidenceState: 'external_check_completed',
          content,
          sourceTrust: 'medium_trust',
          costUsd: 0,
          costAccuracy: 'exact',
          note: `Web search (${result.hits.length} results).`,
          sourceUrls,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'search failed';
        return searchUnavailable(message);
      }
    }

    if (request.primitive === 'fetch') {
      const fetched = await this.ingestion.fetchUrl(request.query);
      if (!fetched.content) {
        return {
          available: false,
          evidenceState: 'external_check_unavailable',
          content: null,
          sourceTrust: null,
          costUsd: 0,
          costAccuracy: 'exact',
          note: fetched.note,
        };
      }
      return {
        available: true,
        evidenceState: 'external_check_completed',
        content: fetched.content,
        sourceTrust: 'medium_trust',
        costUsd: 0,
        costAccuracy: 'exact',
        note: fetched.note,
        sourceUrls: [request.query],
      };
    }

    if (request.primitive === 'base_rate') {
      const apiKey = loadEnv().BRAVE_SEARCH_API_KEY;
      if (!apiKey) {
        return searchUnavailable('Web search is not configured (set BRAVE_SEARCH_API_KEY).');
      }
      try {
        const result = await braveWebSearch(request.query, apiKey, 3);
        if (!result.hits.length) {
          return searchUnavailable('Reference-class search returned no results.');
        }
        const content = result.hits
          .map((h, i) => `${i + 1}. ${h.title}\n${h.url}\n${h.snippet}`)
          .join('\n\n');
        const sourceUrls = result.hits.map((h) => h.url);
        return {
          available: true,
          evidenceState: 'external_check_completed',
          content,
          sourceTrust: 'medium_trust',
          costUsd: 0,
          costAccuracy: 'exact',
          note: `${BASE_RATE_NOTE_PREFIX} (${result.hits.length} sources).`,
          sourceUrls,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'search failed';
        return searchUnavailable(message);
      }
    }

    const ingested = await this.ingestion.ingestRef(request.query);
    return {
      available: Boolean(ingested.content),
      evidenceState: ingested.content ? 'provided_but_unassessed' : 'external_check_unavailable',
      content: ingested.content,
      sourceTrust: 'unverified',
      costUsd: 0,
      costAccuracy: 'exact',
      note: ingested.note,
    };
  }
}
