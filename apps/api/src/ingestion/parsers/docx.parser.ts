import mammoth from 'mammoth';

/** Extract plain text from a DOCX buffer. */
export async function parseDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}
