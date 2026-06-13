import { CONTEXT_LIMITS, type ContextItem } from '@dgb/shared';

const MAX_LABEL_LEN = 48;

/** Build a short chip label from a URL (hostname + path). */
export function labelFromUrl(url: string): string {
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^www\./, '');
  const path = parsed.pathname === '/' ? '' : parsed.pathname;
  const raw = path ? `${host}${path}` : host;
  if (raw.length <= MAX_LABEL_LEN) return raw;
  return `${raw.slice(0, MAX_LABEL_LEN - 1)}…`;
}

export type TryAddLinkResult =
  | { readonly ok: true; readonly items: ContextItem[]; readonly normalizedUrl: string }
  | { readonly ok: false; readonly error: string };

/** Validate and append a link context item, enforcing limit and duplicate refs. */
export function tryAddLink(
  rawUrl: string,
  items: readonly ContextItem[],
  existingRefs: ReadonlySet<string>,
  totalCount: number,
): TryAddLinkResult {
  const url = rawUrl.trim();
  if (!url) {
    return { ok: false, error: 'Enter a URL to add.' };
  }

  let normalizedUrl: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: 'Only http and https links are supported.' };
    }
    normalizedUrl = parsed.href;
  } catch {
    return { ok: false, error: 'Enter a valid URL.' };
  }

  if (totalCount >= CONTEXT_LIMITS.MAX_ITEMS_PER_REVIEW) {
    return {
      ok: false,
      error: `Maximum ${CONTEXT_LIMITS.MAX_ITEMS_PER_REVIEW} context items (files + links combined).`,
    };
  }

  if (existingRefs.has(normalizedUrl) || items.some((item) => item.ref === normalizedUrl)) {
    return { ok: false, error: 'That link is already attached.' };
  }

  return {
    ok: true,
    normalizedUrl,
    items: [
      ...items,
      {
        label: labelFromUrl(normalizedUrl),
        ref: normalizedUrl,
        kind: 'link',
      },
    ],
  };
}

/** Collect refs from all context item buckets for duplicate detection. */
export function collectContextRefs(
  existingItems: readonly ContextItem[],
  items: readonly ContextItem[],
  pendingFiles: readonly ContextItem[],
): Set<string> {
  const refs = new Set<string>();
  for (const item of [...existingItems, ...items, ...pendingFiles]) {
    refs.add(item.ref);
  }
  return refs;
}
