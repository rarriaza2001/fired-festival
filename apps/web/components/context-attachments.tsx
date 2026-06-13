'use client';

import { useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import {
  ATTACHMENT_REF_PREFIX,
  CONTEXT_LIMITS,
  type ContextItem,
  type ContextItemKind,
} from '@dgb/shared';
import { collectContextRefs, tryAddLink } from '@/lib/context-items';

const FILE_ACCEPT =
  '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';

const KIND_LABELS: Record<ContextItemKind, string> = {
  link: 'link',
  pdf: 'PDF',
  docx: 'Word',
  pptx: 'PowerPoint',
  xlsx: 'Spreadsheet',
  csv: 'CSV',
};

function inferKindFromName(filename: string): Exclude<ContextItemKind, 'link'> | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx') || lower.endsWith('.doc')) return 'docx';
  if (lower.endsWith('.pptx') || lower.endsWith('.ppt')) return 'pptx';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'xlsx';
  if (lower.endsWith('.csv')) return 'csv';
  return null;
}

export interface PendingContextItem extends ContextItem {
  readonly _file?: File;
}

export function isPendingFileItem(item: ContextItem): item is PendingContextItem {
  return item.ref.startsWith('pending://');
}

export function toAttachmentRef(id: string): string {
  return `${ATTACHMENT_REF_PREFIX}${id}`;
}

export interface ContextAttachmentsProps {
  items: ContextItem[];
  pendingFiles: PendingContextItem[];
  onItemsChange: (items: ContextItem[]) => void;
  onPendingFilesChange: (items: PendingContextItem[]) => void;
  existingItems?: readonly ContextItem[];
  readOnlyExisting?: boolean;
  disabled?: boolean;
}

export function ContextAttachments({
  items,
  pendingFiles,
  onItemsChange,
  onPendingFilesChange,
  existingItems = [],
  readOnlyExisting = false,
  disabled = false,
}: ContextAttachmentsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const totalCount = existingItems.length + items.length + pendingFiles.length;
  const atLimit = totalCount >= CONTEXT_LIMITS.MAX_ITEMS_PER_REVIEW;
  const inputsDisabled = disabled || atLimit;

  function commitLink(rawUrl: string): boolean {
    setLocalError(null);
    const refs = collectContextRefs(existingItems, items, pendingFiles);
    const result = tryAddLink(rawUrl, items, refs, totalCount);
    if (!result.ok) {
      setLocalError(result.error);
      return false;
    }
    onItemsChange(result.items);
    setLinkUrl('');
    return true;
  }

  function onLinkKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    commitLink(linkUrl);
  }

  function onLinkBlur(): void {
    if (!linkUrl.trim()) return;
    commitLink(linkUrl);
  }

  function onFilesSelected(event: ChangeEvent<HTMLInputElement>): void {
    setLocalError(null);
    const fileList = event.target.files;
    if (!fileList?.length) return;

    const baseCount = existingItems.length + items.length + pendingFiles.length;
    const next = [...pendingFiles];
    for (const file of Array.from(fileList)) {
      if (existingItems.length + items.length + next.length >= CONTEXT_LIMITS.MAX_ITEMS_PER_REVIEW) {
        setLocalError(
          `Maximum ${CONTEXT_LIMITS.MAX_ITEMS_PER_REVIEW} context items (files + links combined).`,
        );
        break;
      }
      if (file.size > CONTEXT_LIMITS.MAX_FILE_BYTES) {
        setLocalError(
          `"${file.name}" exceeds the ${Math.round(CONTEXT_LIMITS.MAX_FILE_BYTES / (1024 * 1024))}MB limit.`,
        );
        continue;
      }
      const kind = inferKindFromName(file.name);
      if (!kind) {
        setLocalError(`Unsupported file type: ${file.name}`);
        continue;
      }
      next.push({
        label: file.name,
        ref: `pending://${file.name}-${file.size}-${baseCount + next.length}`,
        kind,
        _file: file,
      });
    }
    onPendingFilesChange(next);
    event.target.value = '';
  }

  function removeLink(index: number): void {
    onItemsChange(items.filter((_, i) => i !== index));
  }

  function removePending(index: number): void {
    onPendingFilesChange(pendingFiles.filter((_, i) => i !== index));
  }

  return (
    <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
      {readOnlyExisting && existingItems.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {existingItems.map((item, index) => (
            <li
              key={`existing:${item.kind}:${item.ref}:${index}`}
              className="rounded-full border border-[var(--border)] bg-[var(--main-1)] px-3 py-1 text-xs text-[var(--detail)]"
            >
              {item.label} <span className="text-[var(--muted)]">({KIND_LABELS[item.kind]})</span>
            </li>
          ))}
        </ul>
      ) : null}

      {items.length > 0 || pendingFiles.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {items.map((item, index) => (
            <li
              key={`link:${item.kind}:${item.ref}:${index}`}
              className="flex items-center gap-2 rounded-full border border-[var(--accent-muted)] bg-[var(--main-1)] px-3 py-1 text-xs text-[var(--detail)]"
            >
              <span>
                {item.label} <span className="text-[var(--muted)]">({KIND_LABELS[item.kind]})</span>
              </span>
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => removeLink(index)}
                  className="text-[var(--accent)] hover:text-[var(--detail)]"
                  aria-label={`Remove ${item.label}`}
                >
                  ×
                </button>
              ) : null}
            </li>
          ))}
          {pendingFiles.map((item, index) => (
            <li
              key={`pending:${item.kind}:${item.ref}:${index}`}
              className="flex items-center gap-2 rounded-full border border-[var(--accent-muted)] bg-[var(--main-1)] px-3 py-1 text-xs text-[var(--detail)]"
            >
              <span>
                {item.label} <span className="text-[var(--muted)]">({KIND_LABELS[item.kind]})</span>
              </span>
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => removePending(index)}
                  className="text-[var(--accent)] hover:text-[var(--detail)]"
                  aria-label={`Remove ${item.label}`}
                >
                  ×
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor="context-link" className="text-xs text-[var(--muted)]">
          Web link
        </label>
        <input
          id="context-link"
          type="url"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          onKeyDown={onLinkKeyDown}
          onBlur={onLinkBlur}
          placeholder="https://… (press Enter)"
          disabled={inputsDisabled}
          className="chat-bar-input rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept={FILE_ACCEPT}
          multiple
          className="hidden"
          onChange={onFilesSelected}
          disabled={inputsDisabled}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={inputsDisabled}
          className="rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--accent)] transition-colors hover:text-[var(--detail)] disabled:opacity-50"
        >
          Attach files
        </button>
        <span className="text-xs text-[var(--muted)]">
          {totalCount}/{CONTEXT_LIMITS.MAX_ITEMS_PER_REVIEW} items · PDF, Word, PowerPoint, Excel, CSV
          for reports and decks
        </span>
      </div>

      {atLimit && !disabled ? (
        <p className="text-xs text-[var(--muted)]">
          Maximum {CONTEXT_LIMITS.MAX_ITEMS_PER_REVIEW} context items reached. Remove one to add more.
        </p>
      ) : null}

      {localError ? <p className="error text-sm">{localError}</p> : null}
    </div>
  );
}

