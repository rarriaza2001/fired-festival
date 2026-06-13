import type { ContextItem } from './api';

export interface FollowUpInput {
  text: string;
  contextItems: ContextItem[];
}

/**
 * Compose a follow-up review from the original submission plus the user's added
 * detail (clarification / extra context). The original decision stays the
 * primary text with the new detail appended, and prior context refs are merged
 * with any newly added items (deduped by ref). Each follow-up is submitted as
 * its own fresh, independently-bounded review run — this only shapes the input.
 */
export function buildFollowUp(
  originalText: string,
  originalContextItems: ContextItem[],
  message: string,
  newContextItems: ContextItem[] = [],
): FollowUpInput {
  const addition = message.trim();
  const base = originalText.trim();
  const text = addition ? `${base}\n\n${addition}` : base;
  const seen = new Set<string>();
  const merged: ContextItem[] = [];
  for (const item of [...originalContextItems, ...newContextItems]) {
    if (seen.has(item.ref)) continue;
    seen.add(item.ref);
    merged.push(item);
  }
  return { text, contextItems: merged };
}
