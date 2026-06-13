import { describe, it, expect } from 'vitest';
import { type ErrorType } from '@dgb/shared';
import { ALARM_REGISTRY, alarmEntry, alarmRegistryEntrySchema } from './alarm-registry';

describe('ALARM_REGISTRY', () => {
  it('validates every entry at load with a non-empty recommended_action', () => {
    for (const entry of ALARM_REGISTRY) {
      expect(() => alarmRegistryEntrySchema.parse(entry)).not.toThrow();
      expect(entry.recommended_action.length).toBeGreaterThan(0);
    }
  });

  it('declares each alarm type at most once', () => {
    const types = ALARM_REGISTRY.map((e) => e.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('covers every type the runner raises', () => {
    const raised: ErrorType[] = [
      'tool_error',
      'cost_budget_exceeded',
      'retry_budget_exceeded',
      'critical_failure_detected',
      'schema_validation_error',
      'unknown_error',
    ];
    for (const type of raised) {
      expect(() => alarmEntry(type), `type ${type}`).not.toThrow();
    }
  });
});

describe('alarmEntry', () => {
  it('returns the declared severity + recommended action for a known type', () => {
    const entry = alarmEntry('tool_error');
    expect(entry.severity).toBe('recoverable');
    expect(entry.category).toBe('tool');
    expect(entry.recommended_action.length).toBeGreaterThan(0);
  });

  it('throws on an undeclared type rather than returning undefined', () => {
    // 'artifact_mismatch' is a real ERROR_TYPE that is intentionally NOT a
    // declared alarm — proving raise() can never invent a severity.
    expect(() => alarmEntry('artifact_mismatch' as ErrorType)).toThrowError(
      /no alarm registry entry/i,
    );
  });
});
