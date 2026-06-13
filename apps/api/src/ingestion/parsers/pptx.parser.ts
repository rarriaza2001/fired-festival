import { parseOffice } from 'officeparser';

/** Extract plain text from a PPTX buffer. */
export async function parsePptx(buffer: Buffer): Promise<string> {
  const text = await parseOffice(buffer, { fileType: 'pptx' });
  return String(text).trim();
}
