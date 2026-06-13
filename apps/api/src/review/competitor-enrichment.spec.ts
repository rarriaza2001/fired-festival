import { describe, expect, it } from 'vitest';
import { MAIN_COMPETITOR_COUNT } from '@dgb/shared';
import { enrichMainCompetitors, logoUrlForWebsite } from './competitor-enrichment';

describe('logoUrlForWebsite', () => {
  it('builds a favicon URL from a website', () => {
    expect(logoUrlForWebsite('https://www.stripe.com')).toContain('stripe.com');
  });
});

describe('enrichMainCompetitors', () => {
  it('returns exactly three enriched competitors', () => {
    const result = enrichMainCompetitors(
      [
        {
          name: 'Stripe',
          website: 'https://stripe.com',
          logo_url: null,
          threat_summary: 'Stripe already owns payments infrastructure for startups.',
          sources: ['https://stripe.com'],
        },
      ],
      {
        artifact: null,
        decisionText: 'Build a payments API',
        realityChecks: [],
        evidence: { items: [], critical_gaps: [] },
        urlPool: ['https://stripe.com'],
      },
    );

    expect(result).toHaveLength(MAIN_COMPETITOR_COUNT);
    expect(result[0]!.name).toBe('Stripe');
    expect(result[0]!.logo_url).toMatch(/^https:\/\//);
    expect(result[0]!.sources[0]).toMatch(/^https:\/\//);
    for (const c of result) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.sources[0]).toMatch(/^https:\/\//);
    }
  });

  it('pads with fallbacks when the model omitted competitors', () => {
    const result = enrichMainCompetitors(null, {
      artifact: {
        decision: { value: 'Open a specialty coffee shop in Austin', source: 'user_stated' },
        current_state: { value: 'Planning', source: 'inferred' },
        end_goal: { value: 'Profitable cafe', source: 'inferred' },
        commitment_consequence: { value: 'Lease and buildout', source: 'inferred' },
        decision_stage: { value: 'Pre-commitment', source: 'inferred' },
        extraction_confidence: 'Medium',
        inferred_reframe: null,
      },
      decisionText: 'Open a specialty coffee shop in Austin',
      realityChecks: [],
      evidence: { items: [], critical_gaps: [] },
      urlPool: [],
    });

    expect(result).toHaveLength(MAIN_COMPETITOR_COUNT);
    expect(new Set(result.map((c) => c.name)).size).toBe(MAIN_COMPETITOR_COUNT);
  });
});
