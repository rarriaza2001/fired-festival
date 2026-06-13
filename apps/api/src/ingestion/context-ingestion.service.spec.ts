import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ATTACHMENT_REF_PREFIX } from '@dgb/shared';

vi.mock('pdf-parse', () => ({
  default: vi.fn().mockResolvedValue({ text: 'pdf text' }),
}));

vi.mock('./link-fetcher.service', () => ({
  fetchLinkText: vi.fn(),
}));

vi.mock('../config/env', () => ({
  loadEnv: () => ({
    LINK_FETCH_TIMEOUT_MS: 1000,
  }),
}));

import { fetchLinkText } from './link-fetcher.service';
import { ContextIngestionService } from './context-ingestion.service';

describe('ContextIngestionService', () => {
  const attachmentStore = {
    parseAttachmentId: vi.fn(),
    readById: vi.fn(),
  };
  const prisma = {
    attachment: { findUnique: vi.fn() },
  };

  let service: ContextIngestionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ContextIngestionService(
      attachmentStore as never,
      prisma as never,
    );
  });

  it('ingests links with per-kind warnings on fetch failure', async () => {
    vi.mocked(fetchLinkText).mockRejectedValue(new Error('blocked'));
    const result = await service.ingestOne({
      label: 'Article',
      ref: 'https://example.com/post',
      kind: 'link',
    });
    expect(result.status).toBe('fetch_failed');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('Link fetch failed'))).toBe(true);
  });

  it('returns unsupported for invalid attachment refs', async () => {
    attachmentStore.parseAttachmentId.mockReturnValue(null);
    const result = await service.ingestOne({
      label: 'Bad ref',
      ref: 'not-an-attachment',
      kind: 'pdf',
    });
    expect(result.status).toBe('unsupported');
  });

  it('returns unsupported when attachment record is missing', async () => {
    const id = 'abc-123';
    attachmentStore.parseAttachmentId.mockReturnValue(id);
    prisma.attachment.findUnique.mockResolvedValue(null);
    const result = await service.ingestOne({
      label: 'Deck',
      ref: `${ATTACHMENT_REF_PREFIX}${id}`,
      kind: 'pdf',
    });
    expect(result.status).toBe('unsupported');
    expect(result.warnings.some((w) => w.includes('not found'))).toBe(true);
  });

  it('parses CSV attachments from storage', async () => {
    const id = 'csv-1';
    attachmentStore.parseAttachmentId.mockReturnValue(id);
    prisma.attachment.findUnique.mockResolvedValue({
      id,
      kind: 'csv',
      expiresAt: new Date(Date.now() + 60_000),
    });
    attachmentStore.readById.mockResolvedValue({
      buffer: Buffer.from('col1,col2\na,b'),
    });
    const result = await service.ingestOne({
      label: 'Data',
      ref: `${ATTACHMENT_REF_PREFIX}${id}`,
      kind: 'csv',
    });
    expect(result.status).toBe('parsed');
    expect(result.extracted_text).toContain('col1');
  });
});
