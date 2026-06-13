import * as XLSX from 'xlsx';

function sheetToText(sheet: XLSX.WorkSheet, name: string): string {
  const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
    header: 1,
    defval: '',
  });
  const lines = rows.map((row) =>
    Array.isArray(row) ? row.map((cell) => String(cell ?? '')).join('\t') : '',
  );
  return [`## Sheet: ${name}`, ...lines].join('\n');
}

/** Extract tabular plain text from XLSX or CSV buffers. */
export function parseSpreadsheet(buffer: Buffer, kind: 'xlsx' | 'csv'): string {
  const input = kind === 'csv' ? buffer.toString('utf8') : buffer;
  const workbook = XLSX.read(input, {
    type: kind === 'csv' ? 'string' : 'buffer',
    raw: false,
  });
  const parts = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    return sheet ? sheetToText(sheet, name) : '';
  });
  return parts.filter(Boolean).join('\n\n').trim();
}
