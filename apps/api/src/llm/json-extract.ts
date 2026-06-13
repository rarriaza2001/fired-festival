/**
 * Extract a JSON object from model text. Uses balanced-brace scanning so nested
 * objects/strings are handled more reliably than first-{ to last-}.
 */
export function extractJsonBlock(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fence?.[1] ?? trimmed).trim();
  if (!candidate) return null;

  const start = candidate.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < candidate.length; i += 1) {
    const ch = candidate[i]!;
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return candidate.slice(start, i + 1);
      }
    }
  }

  // Truncated output — return the tail so callers can surface a parse error.
  return candidate.slice(start);
}

export function parseJsonObject(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const json = extractJsonBlock(text);
  if (json === null) {
    return { ok: false, error: 'No JSON object found in response.' };
  }
  try {
    return { ok: true, value: JSON.parse(json) };
  } catch {
    const truncated = !text.trim().endsWith('}');
    return {
      ok: false,
      error: truncated
        ? 'Response was not parseable JSON (output may have been truncated — increase max_tokens).'
        : 'Response was not parseable JSON.',
    };
  }
}
