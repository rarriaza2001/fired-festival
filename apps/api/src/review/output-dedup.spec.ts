import { describe, it, expect } from 'vitest';
import {
  dedupeReviewSections,
  ensureExternalInvestigation,
  ensureUserLinkInvestigation,
  buildUserContextLines,
  type ReviewSectionBundle,
} from './output-dedup';
import { isExternalEvidenceSource } from '@dgb/shared';

function bundle(overrides: Partial<ReviewSectionBundle> = {}): ReviewSectionBundle {
  return {
    assumptions: [
      {
        statement: 'Market demand for this service may be insufficient in your target segment.',
        current_support: 'Unverified',
        evidence_state: 'assessed',
        connects_to_commitment: true,
        rank: 1,
        rank_rationale: null,
      sources: [],
      },
      {
        statement: 'Marketing will reach the target audience effectively.',
        current_support: 'Weak',
        evidence_state: 'assessed',
        connects_to_commitment: false,
        rank: 2,
        rank_rationale: null,
      sources: [],
      },
    ],
    evidence: {
      items: [
        {
          statement: 'Market demand for the service is unverified and may be insufficient.',
          kind: 'assumption',
          state: 'assessed',
          source_trust: 'unverified',
          strength: 'none',
          note: 'internal',
          sources: ['domain knowledge / base rates'],
        },
      ],
      critical_gaps: [],
    },
    reality_checks: [
      {
        challenges: 'Market demand for this service may be insufficient in your target segment.',
        why_it_matters: 'No clients',
        is_direct_contradiction: false,
        sources: [],
      },
    ],
    failure_modes: [
      {
        if_condition: 'Demand is lower than expected',
        then_failure_path: 'You fail to sign clients',
        causing_impact: 'Wasted time and money',
        link_type: 'ranked_assumption',
        link_ref: 'demand',
        severity: 'high',
        likelihood: 'medium',
        evidence_state: 'assessed',
        early_warning_signal: 'Low inquiries',
        validation_mitigation: 'Survey',
        confidence_effect: 'Medium',
        rank: 1,
        sources: [],
      },
    ],
    ...overrides,
  };
}

describe('dedupeReviewSections', () => {
  it('drops duplicate assumptions, keeping distinct items', () => {
    const duplicate =
      'Market demand for this service may be insufficient in your target segment.';
    const input = bundle({
      assumptions: [
        {
          statement: duplicate,
          current_support: 'Unverified',
          evidence_state: 'assessed',
          connects_to_commitment: true,
          rank: 1,
          rank_rationale: null,
        sources: [],
        },
        {
          statement: duplicate,
          current_support: 'Also unverified',
          evidence_state: 'assessed',
          connects_to_commitment: false,
          rank: 2,
          rank_rationale: null,
        sources: [],
        },
        {
          statement: 'Marketing will reach the target audience effectively.',
          current_support: 'Weak',
          evidence_state: 'assessed',
          connects_to_commitment: false,
          rank: 3,
          rank_rationale: null,
        sources: [],
        },
      ],
    });
    const out = dedupeReviewSections(input);

    expect(out.assumptions.length).toBe(2);
    expect(out.assumptions.filter((a) => a.statement === duplicate).length).toBe(1);
  });

  it('keeps at least one item in each section when all lines are identical', () => {
    const input = bundle({
      assumptions: [
        {
          statement: 'Demand exists',
          current_support: 'x',
          evidence_state: 'assessed',
          connects_to_commitment: true,
          rank: 1,
          rank_rationale: null,
        sources: [],
        },
      ],
      evidence: {
        items: [
          {
            statement: 'Demand exists for the product',
            kind: 'assumption',
            state: 'assessed',
            source_trust: null,
            strength: 'weak',
            note: null,
            sources: [],
          },
        ],
        critical_gaps: [],
      },
      reality_checks: [
        {
          challenges: 'Demand exists',
          why_it_matters: 'x',
          is_direct_contradiction: false,
        sources: [],
        },
      ],
      failure_modes: [
        {
          if_condition: 'Demand exists',
          then_failure_path: 'fail',
          causing_impact: 'bad',
          link_type: 'ranked_assumption',
          link_ref: 'a',
          severity: 'high',
          likelihood: 'medium',
          evidence_state: 'assessed',
          early_warning_signal: 'x',
          validation_mitigation: 'y',
          confidence_effect: null,
          rank: 1,
        sources: [],
        },
      ],
    });

    const out = dedupeReviewSections(input);
    expect(out.assumptions.length).toBe(1);
    expect(out.evidence.items.length).toBe(1);
    expect(out.reality_checks.length).toBe(1);
    expect(out.failure_modes.length).toBe(1);
  });
});

describe('isExternalEvidenceSource', () => {
  it('rejects internal training markers', () => {
    expect(isExternalEvidenceSource('domain knowledge / base rates')).toBe(false);
    expect(isExternalEvidenceSource('model assessment')).toBe(false);
  });

  it('accepts URLs and attachment refs', () => {
    expect(isExternalEvidenceSource('https://www.bls.gov/data')).toBe(true);
    expect(isExternalEvidenceSource('attachment: market-report.pdf')).toBe(true);
  });
});

describe('ensureExternalInvestigation', () => {
  it('marks a candidate item when nothing is pending', () => {
    const evidence = {
      items: [
        {
          statement: 'Competition is moderate',
          kind: 'assumption' as const,
          state: 'assessed' as const,
          source_trust: null,
          strength: 'weak' as const,
          note: null,
          sources: [],
        },
      ],
      critical_gaps: [],
    };

    const updated = ensureExternalInvestigation(evidence);
    expect(updated.items[0]?.state).toBe('external_check_needed');
  });
});

describe('ensureUserLinkInvestigation', () => {
  it('queues fetch for user-submitted links', () => {
    const evidence = { items: [], critical_gaps: [] };
    const updated = ensureUserLinkInvestigation(evidence, [
      { label: 'Competitor', ref: 'https://example.com/competitor', kind: 'link' },
    ]);
    expect(updated.items.length).toBe(1);
    expect(updated.items[0]?.state).toBe('external_check_needed');
    expect(updated.items[0]?.sources).toEqual(['https://example.com/competitor']);
  });
});

describe('buildUserContextLines', () => {
  it('includes decision text chunks', () => {
    const lines = buildUserContextLines('I plan to open a bakery in Denver.');
    expect(lines.some((l) => l.includes('bakery'))).toBe(true);
  });
});
