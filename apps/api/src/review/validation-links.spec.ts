import { describe, expect, it } from 'vitest';
import { ensureValidationLinks } from './validation-links';
import type { NextAction } from '@dgb/shared';

const nextAction: NextAction = {
  action_type: 'validate_assumption',
  primary_action: 'Survey ten target customers',
  target: 'Willingness to pay',
  how: 'Run structured interviews',
  pass_signal: '6+ would pay',
  fail_signal: 'Fewer than 3',
  commitment_rule: 'Do not sign a lease until pass',
  sources: [],
};

describe('ensureValidationLinks', () => {
  it('adds http validation URL to every section when missing', () => {
    const { bundle, nextAction: action } = ensureValidationLinks(
      {
        assumptions: [
          {
            statement: 'Demand exists for premium coaching',
            current_support: 'Weak',
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
              statement: 'Market size is growing',
              kind: 'evidence',
              state: 'assessed',
              source_trust: 'medium_trust',
              strength: 'moderate',
              note: null,
              sources: [],
            },
          ],
          critical_gaps: [],
        },
        reality_checks: [
          {
            challenges: 'Incumbents may undercut on price',
            why_it_matters: 'Margin pressure',
            is_direct_contradiction: false,
            sources: [],
          },
        ],
        failure_modes: [
          {
            if_condition: 'Customer acquisition cost exceeds LTV',
            then_failure_path: 'You burn cash without profit',
            causing_impact: 'Business failure',
            link_type: 'ranked_assumption',
            link_ref: 'Demand',
            severity: 'high',
            likelihood: 'medium',
            evidence_state: 'assessed',
            early_warning_signal: 'High CAC',
            validation_mitigation: 'Test channels',
            confidence_effect: 'Low',
            rank: 1,
            sources: [],
          },
        ],
      },
      nextAction,
    );

    expect(bundle.assumptions[0]?.sources[0]).toMatch(/^https:\/\//);
    expect(bundle.evidence.items[0]?.sources[0]).toMatch(/^https:\/\//);
    expect(bundle.reality_checks[0]?.sources[0]).toMatch(/^https:\/\//);
    expect(bundle.failure_modes[0]?.sources[0]).toMatch(/^https:\/\//);
    expect(action.sources[0]).toMatch(/^https:\/\//);
  });

  it('reuses evidence URL pool for related items', () => {
    const { bundle } = ensureValidationLinks(
      {
        assumptions: [
          {
            statement: 'Austin coaching market is competitive',
            current_support: 'Unknown',
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
              statement: 'Austin has many career coaches',
              kind: 'evidence',
              state: 'external_check_completed',
              source_trust: 'high_trust',
              strength: 'moderate',
              note: null,
              sources: ['https://www.bls.gov/ooh/business-and-financial/career-coaches.htm'],
            },
          ],
          critical_gaps: [],
        },
        reality_checks: [],
        failure_modes: [],
      },
      nextAction,
    );

    expect(bundle.assumptions[0]?.sources[0]).toBe(
      'https://www.bls.gov/ooh/business-and-financial/career-coaches.htm',
    );
  });
});
