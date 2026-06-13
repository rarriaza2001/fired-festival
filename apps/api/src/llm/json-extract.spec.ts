import { describe, expect, it } from 'vitest';
import { extractJsonBlock, parseJsonObject } from './json-extract';

describe('extractJsonBlock', () => {
  it('extracts nested JSON from prose', () => {
    const block = extractJsonBlock('Here you go:\n{"a": {"b": 1}}\nThanks');
    expect(block).toBe('{"a": {"b": 1}}');
    expect(JSON.parse(block!)).toEqual({ a: { b: 1 } });
  });

  it('extracts JSON from code fences', () => {
    const block = extractJsonBlock('```json\n{"ok": true}\n```');
    expect(block).toBe('{"ok": true}');
  });
});

describe('parseJsonObject', () => {
  it('reports truncation hint when JSON is incomplete', () => {
    const result = parseJsonObject('{"items": [{"x": 1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('truncated');
    }
  });
});
