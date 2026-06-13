import { describe, expect, it } from 'vitest';
import { CONTEXT_LIMITS } from '@dgb/shared';
import { inferKindFromFilename, KIND_MIME_ALLOWLIST } from './link-fetcher.service';

describe('attachment upload validation helpers', () => {
  it('infers kinds from supported filenames', () => {
    expect(inferKindFromFilename('report.pdf')).toBe('pdf');
    expect(inferKindFromFilename('notes.docx')).toBe('docx');
    expect(inferKindFromFilename('deck.pptx')).toBe('pptx');
    expect(inferKindFromFilename('model.xlsx')).toBe('xlsx');
    expect(inferKindFromFilename('rows.csv')).toBe('csv');
    expect(inferKindFromFilename('image.png')).toBeNull();
  });

  it('defines MIME allowlists for each file kind', () => {
    for (const kind of ['pdf', 'docx', 'pptx', 'xlsx', 'csv'] as const) {
      expect(KIND_MIME_ALLOWLIST[kind]?.length).toBeGreaterThan(0);
    }
  });

  it('enforces max file size constant', () => {
    expect(CONTEXT_LIMITS.MAX_FILE_BYTES).toBe(10 * 1024 * 1024);
    expect(CONTEXT_LIMITS.MAX_ITEMS_PER_REVIEW).toBe(5);
  });
});
