import { Injectable } from '@nestjs/common';
import {
  ATTACHMENT_REF_PREFIX,
  CONTEXT_KIND_WARNINGS,
  CONTEXT_LIMITS,
  ingestedContextItemSchema,
  type ContextItem,
  type IngestedContextItem,
  type IngestionStatus,
} from '@dgb/shared';
import { AttachmentStoreService } from './attachment-store.service';
import { fetchLinkText } from './link-fetcher.service';
import { parsePdf } from './parsers/pdf.parser';
import { parseDocx } from './parsers/docx.parser';
import { parsePptx } from './parsers/pptx.parser';
import { parseSpreadsheet } from './parsers/spreadsheet.parser';
import { loadEnv } from '../config/env';
import { PrismaService } from '../persistence/prisma.service';

function truncateText(text: string): { text: string; truncated: boolean } {
  if (text.length <= CONTEXT_LIMITS.MAX_EXTRACTED_CHARS) {
    return { text, truncated: false };
  }
  return {
    text: `${text.slice(0, CONTEXT_LIMITS.MAX_EXTRACTED_CHARS)}\n\n[truncated]`,
    truncated: true,
  };
}

function makeExcerpt(text: string | null): string | null {
  if (!text) return null;
  if (text.length <= CONTEXT_LIMITS.EXCERPT_CHARS) return text;
  return `${text.slice(0, CONTEXT_LIMITS.EXCERPT_CHARS)}…`;
}

@Injectable()
export class ContextIngestionService {
  private readonly linkTimeoutMs: number;

  constructor(
    private readonly attachmentStore: AttachmentStoreService,
    private readonly prisma: PrismaService,
  ) {
    this.linkTimeoutMs = loadEnv().LINK_FETCH_TIMEOUT_MS;
  }

  async ingestItems(items: readonly ContextItem[]): Promise<readonly IngestedContextItem[]> {
    const results: IngestedContextItem[] = [];
    for (const item of items) {
      results.push(await this.ingestOne(item));
    }
    return results;
  }

  async ingestOne(item: ContextItem): Promise<IngestedContextItem> {
    const baseWarnings = [...CONTEXT_KIND_WARNINGS[item.kind]];
    try {
      if (item.kind === 'link') {
        return await this.ingestLink(item, baseWarnings);
      }
      return await this.ingestAttachment(item, baseWarnings);
    } catch {
      const status: IngestionStatus =
        item.kind === 'link' ? 'fetch_failed' : 'parse_failed';
      return ingestedContextItemSchema.parse({
        label: item.label,
        kind: item.kind,
        ref: item.ref,
        status,
        extracted_text: null,
        excerpt: null,
        char_count: 0,
        warnings: baseWarnings,
      });
    }
  }

  private async ingestLink(
    item: ContextItem,
    warnings: string[],
  ): Promise<IngestedContextItem> {
    try {
      const fetched = await fetchLinkText(item.ref, this.linkTimeoutMs);
      const { text, truncated } = truncateText(fetched.text);
      if (truncated) {
        warnings.push('Extracted link text was truncated to the configured limit.');
      }
      return ingestedContextItemSchema.parse({
        label: item.label,
        kind: item.kind,
        ref: fetched.finalUrl,
        status: 'parsed',
        extracted_text: text,
        excerpt: makeExcerpt(text),
        char_count: text.length,
        warnings,
      });
    } catch (error: unknown) {
      const note = error instanceof Error ? error.message : 'fetch failed';
      return ingestedContextItemSchema.parse({
        label: item.label,
        kind: item.kind,
        ref: item.ref,
        status: 'fetch_failed',
        extracted_text: null,
        excerpt: null,
        char_count: 0,
        warnings: [...warnings, `Link fetch failed: ${note}`],
      });
    }
  }

  private async ingestAttachment(
    item: ContextItem,
    warnings: string[],
  ): Promise<IngestedContextItem> {
    const attachmentId = this.attachmentStore.parseAttachmentId(item.ref);
    if (!attachmentId) {
      return ingestedContextItemSchema.parse({
        label: item.label,
        kind: item.kind,
        ref: item.ref,
        status: 'unsupported',
        extracted_text: null,
        excerpt: null,
        char_count: 0,
        warnings: [...warnings, 'Ref is not a valid attachment:// id.'],
      });
    }

    const record = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!record || record.expiresAt < new Date()) {
      return ingestedContextItemSchema.parse({
        label: item.label,
        kind: item.kind,
        ref: item.ref,
        status: 'unsupported',
        extracted_text: null,
        excerpt: null,
        char_count: 0,
        warnings: [...warnings, 'Attachment not found or expired.'],
      });
    }

    const stored = await this.attachmentStore.readById(attachmentId);
    if (!stored) {
      return ingestedContextItemSchema.parse({
        label: item.label,
        kind: item.kind,
        ref: item.ref,
        status: 'parse_failed',
        extracted_text: null,
        excerpt: null,
        char_count: 0,
        warnings: [...warnings, 'Attachment file missing from storage.'],
      });
    }

    const parsed = await this.parseBuffer(stored.buffer, record.kind as ContextItem['kind']);
    if (!parsed) {
      return ingestedContextItemSchema.parse({
        label: item.label,
        kind: item.kind,
        ref: item.ref,
        status: 'parse_failed',
        extracted_text: null,
        excerpt: null,
        char_count: 0,
        warnings,
      });
    }

    const { text, truncated } = truncateText(parsed);
    if (truncated) {
      warnings.push('Extracted document text was truncated to the configured limit.');
    }
    if (!text.trim()) {
      return ingestedContextItemSchema.parse({
        label: item.label,
        kind: item.kind,
        ref: item.ref,
        status: 'parse_failed',
        extracted_text: null,
        excerpt: null,
        char_count: 0,
        warnings: [...warnings, 'No extractable text found in document.'],
      });
    }

    return ingestedContextItemSchema.parse({
      label: item.label,
      kind: item.kind,
      ref: `${ATTACHMENT_REF_PREFIX}${attachmentId}`,
      status: 'parsed',
      extracted_text: text,
      excerpt: makeExcerpt(text),
      char_count: text.length,
      warnings,
    });
  }

  private async parseBuffer(
    buffer: Buffer,
    kind: ContextItem['kind'],
  ): Promise<string | null> {
    switch (kind) {
      case 'pdf':
        return parsePdf(buffer);
      case 'docx':
        return parseDocx(buffer);
      case 'pptx':
        return parsePptx(buffer);
      case 'xlsx':
      case 'csv':
        return parseSpreadsheet(buffer, kind);
      default:
        return null;
    }
  }

  /** Used by NetworkToolAdapter for fetch/ingest primitives. */
  async fetchUrl(url: string): Promise<{ content: string | null; note: string }> {
    try {
      const result = await fetchLinkText(url, this.linkTimeoutMs);
      const { text } = truncateText(result.text);
      return { content: text, note: `Fetched ${result.finalUrl}` };
    } catch (error: unknown) {
      const note = error instanceof Error ? error.message : 'fetch failed';
      return { content: null, note };
    }
  }

  async ingestRef(ref: string): Promise<{ content: string | null; note: string }> {
    const attachmentId = this.attachmentStore.parseAttachmentId(ref);
    if (!attachmentId) {
      return { content: ref, note: 'Ingested raw reference text.' };
    }
    const record = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!record) {
      return { content: null, note: 'Attachment not found.' };
    }
    const ingested = await this.ingestOne({
      label: record.filename,
      ref,
      kind: record.kind as ContextItem['kind'],
    });
    return {
      content: ingested.extracted_text,
      note: ingested.status,
    };
  }
}
