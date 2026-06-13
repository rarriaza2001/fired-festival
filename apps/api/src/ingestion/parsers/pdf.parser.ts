import pdf from 'pdf-parse';

/** Extract plain text from a PDF buffer. */
export async function parsePdf(buffer: Buffer): Promise<string> {
  const result = await pdf(buffer);
  return result.text.trim();
}
