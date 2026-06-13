import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import * as cheerio from 'cheerio';
import type { ContextItemKind } from '@dgb/shared';

const PRIVATE_IPV4_RANGES = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
];

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

function isPrivateIpv4(address: string): boolean {
  return PRIVATE_IPV4_RANGES.some((pattern) => pattern.test(address));
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80')
  );
}

function isBlockedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}

async function assertSafeUrl(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs are allowed.');
  }
  if (BLOCKED_HOSTNAMES.has(url.hostname.toLowerCase())) {
    throw new Error('Blocked hostname.');
  }
  const hostIp = isIP(url.hostname);
  if (hostIp && isBlockedAddress(url.hostname)) {
    throw new Error('Blocked IP address.');
  }
  if (!hostIp) {
    const records = await lookup(url.hostname, { all: true });
    if (records.some((record) => isBlockedAddress(record.address))) {
      throw new Error('Hostname resolves to a blocked address.');
    }
  }
}

function htmlToText(html: string, pageUrl: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  const title = $('title').first().text().trim();
  const main =
    $('main').text().trim() ||
    $('article').text().trim() ||
    $('[role="main"]').text().trim() ||
    $('body').text().trim();
  const collapsed = main.replace(/\s+/g, ' ').trim();
  return [title ? `Title: ${title}` : null, `Source: ${pageUrl}`, collapsed]
    .filter(Boolean)
    .join('\n\n');
}

export interface LinkFetchResult {
  readonly text: string;
  readonly finalUrl: string;
}

/** SSRF-safe fetch of a public web page, returning extracted text. */
export async function fetchLinkText(
  urlString: string,
  timeoutMs: number,
): Promise<LinkFetchResult> {
  const initial = new URL(urlString);
  await assertSafeUrl(initial);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(initial.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'DontGoBlind/1.0 (+context-ingestion)' },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const finalUrl = response.url || initial.toString();
    await assertSafeUrl(new URL(finalUrl));
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      throw new Error(`Unsupported content type: ${contentType || 'unknown'}`);
    }
    const body = await response.text();
    const text =
      contentType.includes('text/html') ? htmlToText(body, finalUrl) : body.trim();
    return { text, finalUrl };
  } finally {
    clearTimeout(timer);
  }
}

/** Map file kinds to expected MIME families for upload validation. */
export const KIND_MIME_ALLOWLIST: Readonly<Record<Exclude<ContextItemKind, 'link'>, readonly string[]>> = {
  pdf: ['application/pdf'],
  docx: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ],
  pptx: [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
  ],
  xlsx: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ],
  csv: ['text/csv', 'application/csv', 'text/plain'],
};

export const KIND_EXTENSION_ALLOWLIST: Readonly<
  Record<Exclude<ContextItemKind, 'link'>, readonly string[]>
> = {
  pdf: ['.pdf'],
  docx: ['.docx', '.doc'],
  pptx: ['.pptx', '.ppt'],
  xlsx: ['.xlsx', '.xls'],
  csv: ['.csv'],
};

export function inferKindFromFilename(filename: string): Exclude<ContextItemKind, 'link'> | null {
  const lower = filename.toLowerCase();
  for (const [kind, extensions] of Object.entries(KIND_EXTENSION_ALLOWLIST) as Array<
    [Exclude<ContextItemKind, 'link'>, readonly string[]]
  >) {
    if (extensions.some((ext) => lower.endsWith(ext))) {
      return kind;
    }
  }
  return null;
}
