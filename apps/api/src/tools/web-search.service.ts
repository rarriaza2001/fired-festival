export interface WebSearchHit {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
}

export interface WebSearchResult {
  readonly hits: readonly WebSearchHit[];
  readonly query: string;
}

/** Brave Web Search API — indexed web results when BRAVE_SEARCH_API_KEY is set. */
export async function braveWebSearch(
  query: string,
  apiKey: string,
  maxResults = 3,
): Promise<WebSearchResult> {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(Math.min(maxResults, 5)));

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': apiKey,
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`Brave search failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };

  const hits = (payload.web?.results ?? [])
    .filter((r): r is { title: string; url: string; description?: string } =>
      Boolean(r.title && r.url),
    )
    .slice(0, maxResults)
    .map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.description ?? '',
    }));

  return { hits, query };
}
