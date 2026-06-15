import {
  DEFAULT_MODEL_BY_PROVIDER,
  DEFAULT_PROVIDER,
  type TraceEvent,
  type ReviewOutput,
  type ContextItem,
  type AttachmentUpload,
} from '@dgb/shared';

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'http://localhost:3001';

/** Client-side provider choice — API keys live on the server. */
export interface ProviderConfig {
  providerName: string;
  model: string;
}

/** Fixed provider for all reviews (UI does not expose provider selection). */
export const FIXED_PROVIDER_CONFIG: ProviderConfig = {
  providerName: DEFAULT_PROVIDER,
  model: DEFAULT_MODEL_BY_PROVIDER[DEFAULT_PROVIDER],
};

/** @deprecated Use ProviderConfig */
export type Byok = ProviderConfig;

interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export interface ReviewResult {
  runId: string;
  reviewState: string;
  terminalState: string | null;
  mode: string | null;
  output: ReviewOutput | null;
  inputText: string;
  contextItems: ContextItem[];
}

export interface ReviewSummary {
  runId: string;
  createdAt: string;
  inputPreview: string;
  terminalState: string | null;
  mode: string | null;
  confidence: string | null;
}

function providerHeaders(provider: ProviderConfig): Record<string, string> {
  return {
    'X-Provider-Name': provider.providerName,
    'X-Provider-Model': provider.model,
  };
}

export async function uploadAttachment(
  file: File,
  provider: ProviderConfig,
): Promise<AttachmentUpload> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/attachments`, {
    method: 'POST',
    headers: providerHeaders(provider),
    body: form,
  });
  const json = (await res.json()) as ApiResponse<AttachmentUpload>;
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error ?? `Upload failed (${res.status}).`);
  }
  return json.data;
}

export async function startReview(
  text: string,
  provider: ProviderConfig,
  contextItems: ContextItem[] = [],
): Promise<string> {
  const res = await fetch(`${API_BASE}/reviews`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...providerHeaders(provider),
    },
    body: JSON.stringify({ text, context_items: contextItems }),
  });
  const json = (await res.json()) as ApiResponse<{ runId: string }>;
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error ?? `Request failed (${res.status}).`);
  }
  return json.data.runId;
}

export async function getReviewResult(id: string): Promise<ReviewResult> {
  const res = await fetch(`${API_BASE}/reviews/${id}`);
  const json = (await res.json()) as ApiResponse<ReviewResult>;
  if (!res.ok || !json.data) {
    throw new Error(json.error ?? `Could not load review (${res.status}).`);
  }
  return json.data;
}

export async function listReviews(): Promise<ReviewSummary[]> {
  const res = await fetch(`${API_BASE}/reviews`);
  const json = (await res.json()) as ApiResponse<ReviewSummary[]>;
  if (!res.ok || !json.data) {
    throw new Error(json.error ?? `Could not load reviews (${res.status}).`);
  }
  return json.data;
}

export function streamUrl(id: string): string {
  return `${API_BASE}/reviews/${id}/stream`;
}

export type { TraceEvent, ReviewOutput, ContextItem, AttachmentUpload };
