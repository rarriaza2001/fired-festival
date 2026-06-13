import { describe, expect, it } from 'vitest';
import { buildFollowUp } from './followup';

describe('buildFollowUp', () => {
  it('merges context items and dedupes by ref', () => {
    const result = buildFollowUp(
      'Original decision',
      [{ label: 'RFC', ref: 'https://example.test/rfc', kind: 'link' }],
      'More detail',
      [
        { label: 'RFC', ref: 'https://example.test/rfc', kind: 'link' },
        { label: 'Budget', ref: 'attachment://abc', kind: 'xlsx' },
      ],
    );
    expect(result.text).toContain('Original decision');
    expect(result.text).toContain('More detail');
    expect(result.contextItems).toHaveLength(2);
    expect(result.contextItems.map((i) => i.ref)).toEqual([
      'https://example.test/rfc',
      'attachment://abc',
    ]);
  });
});
