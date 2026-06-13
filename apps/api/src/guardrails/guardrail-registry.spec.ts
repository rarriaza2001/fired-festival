import { describe, it, expect } from 'vitest';
import {
  GUARDRAIL_CATEGORIES,
  UNSUPPORTED_MODES,
  type GuardrailCategory,
} from '@dgb/shared';
import {
  GUARDRAIL_REGISTRY,
  registryEntry,
  UNSUPPORTED_MODE_GUARDRAILS,
} from './guardrail-registry';

describe('GUARDRAIL_REGISTRY', () => {
  it('has exactly one entry per guardrail category', () => {
    expect(GUARDRAIL_REGISTRY).toHaveLength(GUARDRAIL_CATEGORIES.length);
    for (const category of GUARDRAIL_CATEGORIES) {
      const matches = GUARDRAIL_REGISTRY.filter((e) => e.category === category);
      expect(matches, `category ${category}`).toHaveLength(1);
    }
  });

  it('exposes the full 7-field shape with a non-empty reframe on every entry', () => {
    for (const entry of GUARDRAIL_REGISTRY) {
      expect(entry).toHaveProperty('trigger_condition');
      expect(entry).toHaveProperty('required_behavior');
      expect(entry).toHaveProperty('confidence_effect');
      expect(entry).toHaveProperty('terminal_state_effect');
      expect(entry).toHaveProperty('next_action_effect');
      expect(entry.user_facing_explanation.length).toBeGreaterThan(0);
    }
  });

  it('keeps the executable unsupported_confidence downgrade at Medium', () => {
    const entry = registryEntry('unsupported_confidence');
    expect(entry.required_behavior).toBe('downgrade_confidence');
    expect(entry.confidence_effect).toBe('Medium');
  });
});

describe('registryEntry', () => {
  it('resolves an entry for every known category', () => {
    for (const category of GUARDRAIL_CATEGORIES) {
      expect(registryEntry(category).category).toBe(category);
    }
  });

  it('throws on an unknown category rather than returning undefined', () => {
    const bogus = 'not_a_real_category' as GuardrailCategory;
    expect(() => registryEntry(bogus)).toThrowError(/no guardrail registry entry/i);
  });
});

describe('UNSUPPORTED_MODE_GUARDRAILS', () => {
  it('maps every unsupported mode to a category present in the registry', () => {
    for (const mode of UNSUPPORTED_MODES) {
      const mapping = UNSUPPORTED_MODE_GUARDRAILS[mode];
      expect(mapping, `mode ${mode}`).toBeDefined();
      // registryEntry throws if the mapped category is missing, so a passing
      // lookup proves unsupportedTrigger(mode) can never throw at runtime.
      expect(() => registryEntry(mapping.category)).not.toThrow();
    }
  });

  it('covers exactly the canonical set of unsupported modes', () => {
    expect(Object.keys(UNSUPPORTED_MODE_GUARDRAILS).sort()).toEqual(
      [...UNSUPPORTED_MODES].sort(),
    );
  });
});
