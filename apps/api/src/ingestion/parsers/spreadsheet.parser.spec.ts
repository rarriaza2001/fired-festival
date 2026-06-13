import { describe, expect, it } from 'vitest';
import { parseSpreadsheet } from './spreadsheet.parser';

describe('parseSpreadsheet', () => {
  it('parses CSV buffer to tabular text', () => {
    const text = parseSpreadsheet(Buffer.from('a,b\n1,2'), 'csv');
    expect(text).toContain('a');
    expect(text).toContain('1');
  });
});
