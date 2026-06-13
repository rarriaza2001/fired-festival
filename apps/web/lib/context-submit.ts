import { ATTACHMENT_REF_PREFIX, CONTEXT_LIMITS, type ContextItem } from '@dgb/shared';
import { uploadAttachment, type ProviderConfig } from './api';
import type { PendingContextItem } from '@/components/context-attachments';

const CONTEXT_LIMIT_MESSAGE = `Maximum ${CONTEXT_LIMITS.MAX_ITEMS_PER_REVIEW} context items (files + links combined).`;

export function assertContextWithinLimit(items: readonly ContextItem[]): void {
  if (items.length > CONTEXT_LIMITS.MAX_ITEMS_PER_REVIEW) {
    throw new Error(CONTEXT_LIMIT_MESSAGE);
  }
}

export async function resolveContextItems(
  links: readonly ContextItem[],
  pendingFiles: readonly PendingContextItem[],
  provider: ProviderConfig,
): Promise<ContextItem[]> {
  const uploaded: ContextItem[] = [];
  for (const pending of pendingFiles) {
    if (!pending._file) continue;
    const result = await uploadAttachment(pending._file, provider);
    uploaded.push({
      label: pending.label,
      ref: `${ATTACHMENT_REF_PREFIX}${result.id}`,
      kind: result.kind,
    });
  }
  return [...links, ...uploaded];
}
