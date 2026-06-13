import type { CostAccuracy, EvidenceState, SourceTrustLevel } from '@dgb/shared';

/** The three primitive operations that cover all 6 conceptual tool slots. */
export type ToolPrimitive = 'search' | 'fetch' | 'ingest';

/** A request to invoke one primitive operation. */
export interface ToolRequest {
  /** Which primitive to invoke. */
  readonly primitive: ToolPrimitive;
  /**
   * The query, reference URL, or ingest reference depending on the primitive:
   * - search: the web search query string
   * - fetch: the URL or document reference to retrieve
   * - ingest: the context item reference or raw text to parse
   */
  readonly query: string;
}

/** The outcome produced by a ToolAdapter after invoking a primitive. */
export interface ToolResult {
  /** false in model-only mode for search/fetch; true when content was actually retrieved. */
  readonly available: boolean;
  /** The resulting EvidenceState for the claim that was checked. */
  readonly evidenceState: EvidenceState;
  /** Retrieved or parsed content; null when the primitive was unavailable. */
  readonly content: string | null;
  /** Trust classification of the source; null when no source was consulted. */
  readonly sourceTrust: SourceTrustLevel | null;
  /** Monetary cost in USD for this invocation; 0 when no network call was made. */
  readonly costUsd: number | null;
  /** Accuracy characterisation of the reported cost. */
  readonly costAccuracy: CostAccuracy;
  /** Short human-readable reason; never contains raw secrets or prompts. */
  readonly note: string;
  /** Reputable URLs consulted (web search / fetch). */
  readonly sourceUrls?: readonly string[];
}

/** Pluggable adapter that maps ToolRequest → ToolResult for a given execution mode. */
export interface ToolAdapter {
  /** Stable identifier for this adapter (e.g. 'model_only', 'perplexity'). */
  readonly name: string;
  /** Invoke the primitive and return a result. Must never throw on expected failure paths. */
  invoke(request: ToolRequest): Promise<ToolResult>;
}

/** NestJS injection token for the active ToolAdapter. */
export const TOOL_ADAPTER = Symbol('TOOL_ADAPTER');
