import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const STRIPPED_KEYS = new Set([
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'pattern',
]);

/** Convert a Zod schema to an Anthropic structured-output JSON Schema. */
export function zodToAnthropicJsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  const raw = zodToJsonSchema(schema as never, {
    $refStrategy: 'none',
    target: 'openApi3',
  }) as Record<string, unknown>;
  return normalizeAnthropicSchema(raw);
}

function normalizeAnthropicSchema(node: unknown): Record<string, unknown> {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return { type: 'string' };
  }

  const input = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (key === 'definitions' || key === '$schema') continue;
    if (STRIPPED_KEYS.has(key)) continue;
    out[key] = value;
  }

  if (out.type === 'object') {
    out.additionalProperties = false;
    if (out.properties && typeof out.properties === 'object' && !Array.isArray(out.properties)) {
      const props: Record<string, unknown> = {};
      for (const [name, child] of Object.entries(out.properties as Record<string, unknown>)) {
        props[name] = normalizeAnthropicSchema(child);
      }
      out.properties = props;
    }
  }

  if (out.type === 'array' && out.items) {
    out.items = normalizeAnthropicSchema(out.items);
  }

  if (Array.isArray(out.anyOf)) {
    out.anyOf = out.anyOf.map((child) => normalizeAnthropicSchema(child));
  }

  if (Array.isArray(out.allOf)) {
    out.allOf = out.allOf.map((child) => normalizeAnthropicSchema(child));
  }

  return out;
}
