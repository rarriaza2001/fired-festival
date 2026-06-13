import { describe, expect, it } from 'vitest';
import { fetchLinkText } from './link-fetcher.service';

describe('fetchLinkText SSRF guards', () => {
  it('rejects file protocol', async () => {
    await expect(fetchLinkText('file:///etc/passwd', 1000)).rejects.toThrow(
      'Only http and https',
    );
  });

  it('rejects localhost', async () => {
    await expect(fetchLinkText('http://localhost/secret', 1000)).rejects.toThrow();
  });

  it('rejects private IP literals', async () => {
    await expect(fetchLinkText('http://127.0.0.1/', 1000)).rejects.toThrow();
  });
});
