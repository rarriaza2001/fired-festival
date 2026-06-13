import { describe, it, expect } from 'vitest';
import type { ConfidenceCalibration, EvidenceAssessment } from '@dgb/shared';
import {
  runPreOutputChecklist,
  isEvidenceWeak,
  unsupportedTrigger,
} from './guardrail-checklist';
import { GUARDRAIL_REGISTRY } from './guardrail-registry';

function confidence(overrides: Partial<ConfidenceCalibration> = {}): ConfidenceCalibration {
  return {
    label: 'High',
    why: 'strong revenue data',
    why_not_higher: 'one untested assumption',
    what_would_raise: 'a signed LOI',
    what_would_lower: 'a demand miss',
    capped: false,
    ...overrides,
  };
}

function strongEvidence(): EvidenceAssessment {
  return {
    items: [
      {
        statement: 'audited revenue',
        kind: 'evidence',
        state: 'assessed',
        source_trust: 'high_trust',
        strength: 'strong',
        note: null,
        sources: [],
      },
    ],
    critical_gaps: [],
  };
}

function weakEvidence(): EvidenceAssessment {
  return {
    items: [
      {
        statement: 'a friend said it works',
        kind: 'user_claim',
        state: 'provided_but_unassessed',
        source_trust: 'anecdotal',
        strength: 'weak',
        note: null,
        sources: [],
      },
    ],
    critical_gaps: ['no demand data'],
  };
}

describe('guardrail registry', () => {
  it('validates every entry and includes the 7th next_action_effect field', () => {
    expect(GUARDRAIL_REGISTRY.length).toBeGreaterThanOrEqual(12);
    for (const entry of GUARDRAIL_REGISTRY) {
      expect(entry).toHaveProperty('next_action_effect');
      expect(entry.user_facing_explanation.length).toBeGreaterThan(0);
    }
  });
});

describe('isEvidenceWeak', () => {
  it('is weak when there are critical gaps', () => {
    expect(isEvidenceWeak(weakEvidence())).toBe(true);
  });

  it('is strong when an item reaches strong and there are no gaps', () => {
    expect(isEvidenceWeak(strongEvidence())).toBe(false);
  });
});

describe('runPreOutputChecklist (executable guardrail)', () => {
  it('downgrades and caps High confidence resting on weak evidence', () => {
    const result = runPreOutputChecklist({
      confidence: confidence({ label: 'High' }),
      evidence: weakEvidence(),
    });
    expect(result.confidence.label).toBe('Medium');
    expect(result.confidence.capped).toBe(true);
    expect(result.confidenceChanged).toBe(true);
    expect(result.triggers).toHaveLength(1);
    expect(result.triggers[0]?.category).toBe('unsupported_confidence');
  });

  it('leaves High confidence intact when evidence is strong', () => {
    const result = runPreOutputChecklist({
      confidence: confidence({ label: 'High' }),
      evidence: strongEvidence(),
    });
    expect(result.confidence.label).toBe('High');
    expect(result.confidenceChanged).toBe(false);
    expect(result.triggers).toHaveLength(0);
  });

  it('does not touch a Low label even on weak evidence (no false trigger)', () => {
    const result = runPreOutputChecklist({
      confidence: confidence({ label: 'Low' }),
      evidence: weakEvidence(),
    });
    expect(result.confidence.label).toBe('Low');
    expect(result.triggers).toHaveLength(0);
  });
});

describe('unsupportedTrigger', () => {
  it('reframes a blind validation request with an observable explanation', () => {
    const trigger = unsupportedTrigger('blind_validation');
    expect(trigger.category).toBe('blind_validation');
    expect(trigger.terminal_state_effect).toBe('unsupported_request');
    expect(trigger.explanation_shown.length).toBeGreaterThan(0);
  });

  it('blocks final-decision delegation as final_decision_ownership', () => {
    const trigger = unsupportedTrigger('final_decision_delegation');
    expect(trigger.category).toBe('final_decision_ownership');
    expect(trigger.required_behavior).toBe('block_final_ownership');
  });
});
