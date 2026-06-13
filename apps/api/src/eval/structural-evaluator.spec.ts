import { describe, it, expect } from 'vitest';
import { evaluateStructure } from './structural-evaluator';
import { EVAL_CASES } from './eval-cases';
import type { ReviewOutput } from '@dgb/shared';

// ---------------------------------------------------------------------------
// Shared baseline fixture builder (mirrors eval-cases.ts)
// ---------------------------------------------------------------------------

function baseline(overrides: Partial<ReviewOutput> = {}): ReviewOutput {
  const base: ReviewOutput = {
    mode: 'full',
    terminal_state: 'review_complete',
    decision_summary: 'Whether to expand the coffee shop to a second location.',
    artifact: {
      decision: { value: 'Expand to a second location', source: 'user_stated' },
      current_state: { value: 'Profitable single-location café', source: 'user_stated' },
      end_goal: { value: 'Grow revenue by 40% within 12 months', source: 'user_stated' },
      commitment_consequence: {
        value: 'Signing a 3-year lease and hiring 4 staff',
        source: 'user_stated',
      },
      decision_stage: { value: 'Early exploration', source: 'inferred' },
      extraction_confidence: 'High',
      inferred_reframe: null,
    },
    missing_context: {
      missing_items: ['Lease cost for second location'],
      inferred_items: ['Decision stage inferred'],
    },
    main_competitors: [
      {
        name: 'Regional specialty coffee chain',
        website: 'https://example-coffee.com',
        logo_url: null,
        threat_summary:
          'An established local chain already owns morning foot traffic and supplier relationships in your target area.',
        sources: ['https://search.brave.com/search?q=austin+specialty+coffee+competitors'],
      },
      {
        name: 'Starbucks',
        website: 'https://starbucks.com',
        logo_url: null,
        threat_summary:
          'National scale and loyalty programs set price and convenience expectations your second location must match.',
        sources: ['https://www.starbucks.com'],
      },
      {
        name: 'Local fast-casual cafe group',
        website: null,
        logo_url: null,
        threat_summary:
          'Smaller operators often win on neighbourhood identity and lower rent — they can saturate your catchment before you open.',
        sources: ['https://search.brave.com/search?q=austin+independent+coffee+shops'],
      },
    ],
    assumptions: [
      {
        statement: 'Demand in the new area matches current customer profile',
        current_support: 'No direct evidence',
        evidence_state: 'external_check_needed',
        connects_to_commitment: true,
        rank: 1,
        rank_rationale: 'Directly determines revenue viability',
      sources: [],
      },
    ],
    evidence: {
      items: [
        {
          statement: 'Current location has 20% profit margin',
          kind: 'evidence',
          state: 'assessed',
          source_trust: 'high_trust',
          strength: 'moderate',
          note: 'Internal financials',
          sources: [],
        },
      ],
      critical_gaps: [],
    },
    reality_checks: [
      {
        challenges: 'Second location may cannibalise existing customers',
        why_it_matters: 'Could erode current margin',
        is_direct_contradiction: false,
        sources: [],
      },
    ],
    failure_modes: [
      {
        if_condition: 'If demand in new area is weaker than expected',
        then_failure_path: 'Revenue does not cover fixed costs',
        causing_impact: 'Cash-flow crisis',
        link_type: 'ranked_assumption',
        link_ref: 'Demand in the new area',
        severity: 'critical',
        likelihood: 'medium',
        evidence_state: 'external_check_needed',
        early_warning_signal: 'First-month revenue below break-even',
        validation_mitigation: 'Run a pop-up trial',
        confidence_effect: 'Low',
        rank: 1,
        sources: [],
      },
    ],
    confidence: {
      label: 'Medium',
      why: 'Strong internal financials but no external demand evidence',
      why_not_higher: 'Demand in the new area is unvalidated',
      what_would_raise: 'Completed demand study showing comparable foot traffic',
      what_would_lower: 'Discovery of a competing café opening nearby',
      capped: false,
    },
    next_action: {
      action_type: 'validate_assumption',
      primary_action: 'Run a 4-week pop-up at the candidate location',
      target: 'Demand assumption for new location',
      how: 'Partner with a local event to test product-market fit',
      pass_signal: 'Daily sales exceed breakeven revenue for 3 consecutive weeks',
      fail_signal: 'Daily sales remain below breakeven for 2 of 4 weeks',
      commitment_rule: 'Do not sign the lease until the pop-up pass signal is met',
      sources: [],
    },
    secondary_actions: [],
    guardrail_triggers: [],
    review_trace_summary: 'Input sufficient; review complete with medium confidence.',
  };

  return { ...base, ...overrides } as ReviewOutput;
}

// ---------------------------------------------------------------------------
// REGRESSION SUITE — every EVAL_CASE must resolve correctly
// ---------------------------------------------------------------------------

describe('REGRESSION SUITE: evaluateStructure matches expectedResult for every EVAL_CASE', () => {
  for (const evalCase of EVAL_CASES) {
    it(`${evalCase.id} [${evalCase.category}] → expects "${evalCase.expectedResult}"`, () => {
      // Arrange
      const output = evalCase.output;

      // Act
      const report = evaluateStructure(output);

      // Assert
      expect(report.result, `case ${evalCase.id}`).toBe(evalCase.expectedResult);
    });
  }
});

describe('REGRESSION SUITE: golden cases never produce critical_failures', () => {
  const goldenCases = EVAL_CASES.filter((c) => c.category === 'golden');

  it(`has at least 6 golden cases`, () => {
    expect(goldenCases.length).toBeGreaterThanOrEqual(6);
  });

  for (const goldenCase of goldenCases) {
    it(`${goldenCase.id}: no critical_failures in findings`, () => {
      // Arrange / Act
      const report = evaluateStructure(goldenCase.output);

      // Assert
      expect(report.criticalFailures, `case ${goldenCase.id}`).toHaveLength(0);
    });
  }
});

describe('REGRESSION SUITE: bad_output cases produce result=fail', () => {
  const badCases = EVAL_CASES.filter((c) => c.category === 'bad_output');

  it('has at least 8 bad_output cases', () => {
    expect(badCases.length).toBeGreaterThanOrEqual(8);
  });

  for (const badCase of badCases) {
    it(`${badCase.id}: result is "fail"`, () => {
      // Arrange / Act
      const report = evaluateStructure(badCase.output);

      // Assert
      expect(report.result, `case ${badCase.id}`).toBe('fail');
    });
  }
});

describe('REGRESSION SUITE: regression cases have regressionLabel defined', () => {
  const regressionCases = EVAL_CASES.filter((c) => c.category === 'regression');

  it('has at least 4 regression cases', () => {
    expect(regressionCases.length).toBeGreaterThanOrEqual(4);
  });

  for (const regCase of regressionCases) {
    it(`${regCase.id}: has a regressionLabel`, () => {
      expect(regCase.regressionLabel).toBeDefined();
      expect(typeof regCase.regressionLabel).toBe('string');
    });
  }
});

// ---------------------------------------------------------------------------
// Unit tests — confidence_calibration rule
// ---------------------------------------------------------------------------

describe('Rule: confidence_calibration', () => {
  it('marks critical_failure when label=High with no strong evidence and has critical gaps, capped=false', () => {
    // Arrange
    const output = baseline({
      confidence: {
        label: 'High',
        why: 'Customer feedback is great',
        why_not_higher: 'Small sample',
        what_would_raise: 'More feedback',
        what_would_lower: 'Negative reviews',
        capped: false,
      },
      evidence: {
        items: [
          {
            statement: 'Five customers said they loved it',
            kind: 'user_claim',
            state: 'assessed',
            source_trust: 'anecdotal',
            strength: 'weak',
            note: 'Trade show feedback',
            sources: [],
          },
        ],
        critical_gaps: ['No quantitative demand data'],
      },
    });

    // Act
    const report = evaluateStructure(output);

    // Assert
    expect(report.result).toBe('fail');
    const finding = report.findings.find((f) => f.dimension === 'confidence_calibration');
    expect(finding?.verdict).toBe('critical_failure');
  });

  it('marks critical_failure when label=High with no strong item even without gaps', () => {
    // Arrange
    const output = baseline({
      confidence: {
        label: 'High',
        why: 'Anecdotal evidence looks good',
        why_not_higher: 'Still early',
        what_would_raise: 'More conversations',
        what_would_lower: 'Negative feedback',
        capped: false,
      },
      evidence: {
        items: [
          {
            statement: 'Informal conversations suggest interest',
            kind: 'user_claim',
            state: 'provided_but_unassessed',
            source_trust: 'anecdotal',
            strength: 'weak',
            note: 'Anecdotal',
            sources: [],
          },
        ],
        critical_gaps: [],
      },
    });

    // Act
    const report = evaluateStructure(output);

    // Assert
    expect(report.result).toBe('fail');
    const finding = report.findings.find((f) => f.dimension === 'confidence_calibration');
    expect(finding?.verdict).toBe('critical_failure');
  });

  it('returns pass when label=High with a strong evidence item and no gaps', () => {
    // Arrange
    const output = baseline({
      confidence: {
        label: 'High',
        why: 'Three A/B tests confirmed lower churn with usage billing',
        why_not_higher: 'Enterprise tier untested',
        what_would_raise: 'Enterprise cohort data',
        what_would_lower: 'Infrastructure cost spike',
        capped: false,
      },
      evidence: {
        items: [
          {
            statement: 'A/B test (n=2400) showed 18-pt churn reduction',
            kind: 'evidence',
            state: 'assessed',
            source_trust: 'high_trust',
            strength: 'strong',
            note: 'Randomised production test',
            sources: [],
          },
        ],
        critical_gaps: [],
      },
    });

    // Act
    const report = evaluateStructure(output);

    // Assert
    const finding = report.findings.find((f) => f.dimension === 'confidence_calibration');
    expect(finding?.verdict).not.toBe('critical_failure');
  });

  it('marks weak when label=Unknown with no critical_gaps listed', () => {
    // Arrange
    const output = baseline({
      confidence: {
        label: 'Unknown',
        why: 'Insufficient context to assess',
        why_not_higher: 'No data available',
        what_would_raise: 'Market research',
        what_would_lower: 'Discovery of a flaw',
        capped: false,
      },
      evidence: { items: [], critical_gaps: [] },
    });

    // Act
    const report = evaluateStructure(output);

    // Assert
    const finding = report.findings.find((f) => f.dimension === 'confidence_calibration');
    expect(finding?.verdict).toBe('weak');
  });
});

// ---------------------------------------------------------------------------
// Unit tests — output_clarity_boundedness (fake precision) rule
// ---------------------------------------------------------------------------

describe('Rule: output_clarity_boundedness (fake precision)', () => {
  it('marks critical_failure when confidence.why contains a percentage', () => {
    // Arrange
    const output = baseline({
      confidence: {
        label: 'Medium',
        why: 'Evidence supports this at roughly 73% confidence',
        why_not_higher: 'Not enough data',
        what_would_raise: 'More research',
        what_would_lower: 'Market change',
        capped: false,
      },
    });

    // Act
    const report = evaluateStructure(output);

    // Assert
    expect(report.result).toBe('fail');
    const finding = report.findings.find((f) => f.dimension === 'output_clarity_boundedness');
    expect(finding?.verdict).toBe('critical_failure');
  });

  it('marks critical_failure when confidence.why_not_higher contains a decimal score', () => {
    // Arrange
    const output = baseline({
      confidence: {
        label: 'Medium',
        why: 'Solid evidence base',
        why_not_higher: 'We score this only 0.85 out of 1.0 because demand study incomplete',
        what_would_raise: 'Completed demand study',
        what_would_lower: 'Competitor entry',
        capped: false,
      },
    });

    // Act
    const report = evaluateStructure(output);

    // Assert
    expect(report.result).toBe('fail');
    const finding = report.findings.find((f) => f.dimension === 'output_clarity_boundedness');
    expect(finding?.verdict).toBe('critical_failure');
  });

  it('marks critical_failure when confidence.why contains a fraction score', () => {
    // Arrange
    const output = baseline({
      confidence: {
        label: 'Medium',
        why: 'Overall evidence quality is about 8/10 given the strong internal data',
        why_not_higher: 'Demand still unvalidated',
        what_would_raise: 'Demand study',
        what_would_lower: 'Competitor opening',
        capped: false,
      },
    });

    // Act
    const report = evaluateStructure(output);

    // Assert
    expect(report.result).toBe('fail');
    const finding = report.findings.find((f) => f.dimension === 'output_clarity_boundedness');
    expect(finding?.verdict).toBe('critical_failure');
  });

  it('returns adequate for a well-formed categorical confidence block', () => {
    // Arrange
    const output = baseline();

    // Act
    const report = evaluateStructure(output);

    // Assert
    const finding = report.findings.find((f) => f.dimension === 'output_clarity_boundedness');
    expect(finding?.verdict).toBe('adequate');
  });
});

// ---------------------------------------------------------------------------
// Unit tests — next_action_quality rule
// ---------------------------------------------------------------------------

describe('Rule: next_action_quality', () => {
  it('marks critical_failure when pass_signal uses vibe language ("vibe seems right")', () => {
    // Arrange
    const output = baseline({
      next_action: {
        action_type: 'validate_assumption',
        primary_action: 'Talk to customers',
        target: 'Demand',
        how: 'Informal chats',
        pass_signal: 'The vibe seems right after conversations',
        fail_signal: 'Nobody shows interest',
        commitment_rule: 'Do not invest until conversations done',
        sources: [],
      },
    });

    // Act
    const report = evaluateStructure(output);

    // Assert
    expect(report.result).toBe('fail');
    const finding = report.findings.find((f) => f.dimension === 'next_action_quality');
    expect(finding?.verdict).toBe('critical_failure');
  });

  it('marks critical_failure when fail_signal uses gut language', () => {
    // Arrange
    const output = baseline({
      next_action: {
        action_type: 'bounded_execution',
        primary_action: 'Run a pilot',
        target: 'Revenue assumption',
        how: 'Open for two weekends',
        pass_signal: 'Revenue exceeds costs for both weekends',
        fail_signal: 'Gut check says it did not work out',
        commitment_rule: 'Do not sign long-term contract until pilot done',
        sources: [],
      },
    });

    // Act
    const report = evaluateStructure(output);

    // Assert
    expect(report.result).toBe('fail');
    const finding = report.findings.find((f) => f.dimension === 'next_action_quality');
    expect(finding?.verdict).toBe('critical_failure');
  });

  it('marks critical_failure when pass_signal and fail_signal are identical', () => {
    // Arrange
    const output = baseline({
      next_action: {
        action_type: 'gather_direct_evidence',
        primary_action: 'Run customer interviews',
        target: 'Product fit',
        how: 'Interview 10 potential customers',
        pass_signal: 'Customers respond positively to the concept',
        fail_signal: 'Customers respond positively to the concept',
        commitment_rule: 'Do not build until interviews complete',
        sources: [],
      },
    });

    // Act
    const report = evaluateStructure(output);

    // Assert
    expect(report.result).toBe('fail');
    const finding = report.findings.find((f) => f.dimension === 'next_action_quality');
    expect(finding?.verdict).toBe('critical_failure');
  });

  it('returns adequate when signals are observable and distinct', () => {
    // Arrange
    const output = baseline();

    // Act
    const report = evaluateStructure(output);

    // Assert
    const finding = report.findings.find((f) => f.dimension === 'next_action_quality');
    expect(finding?.verdict).toBe('adequate');
  });
});

// ---------------------------------------------------------------------------
// Unit tests — evidence_discipline rule (user_claim as strong)
// ---------------------------------------------------------------------------

describe('Rule: evidence_discipline (user_claim as strong)', () => {
  it('marks critical_failure when a user_claim item has strength=strong', () => {
    // Arrange
    const output = baseline({
      evidence: {
        items: [
          {
            statement: 'We have 500 signed letters of intent',
            kind: 'user_claim',
            state: 'provided_but_unassessed',
            source_trust: 'unverified',
            strength: 'strong',
            note: 'Claimed by founder',
            sources: [],
          },
        ],
        critical_gaps: [],
      },
    });

    // Act
    const report = evaluateStructure(output);

    // Assert
    const finding = report.findings.find((f) => f.dimension === 'evidence_discipline');
    expect(finding?.verdict).toBe('critical_failure');
    expect(report.result).toBe('fail');
  });

  it('returns adequate when user_claim items have appropriate non-strong strength', () => {
    // Arrange
    const output = baseline({
      evidence: {
        items: [
          {
            statement: 'User says they would pay for this',
            kind: 'user_claim',
            state: 'provided_but_unassessed',
            source_trust: 'unverified',
            strength: 'weak',
            note: 'Unverified claim',
            sources: [],
          },
        ],
        critical_gaps: [],
      },
    });

    // Act
    const report = evaluateStructure(output);

    // Assert
    const finding = report.findings.find((f) => f.dimension === 'evidence_discipline');
    expect(finding?.verdict).toBe('adequate');
  });
});

// ---------------------------------------------------------------------------
// Unit tests — guardrail_compliance rule
// ---------------------------------------------------------------------------

describe('Rule: guardrail_compliance (blind validation not refused)', () => {
  it('marks critical_failure when decision_summary has __BLIND_VALIDATION__ marker and terminal_state is review_complete', () => {
    // Arrange
    const output = baseline({
      terminal_state: 'review_complete',
      decision_summary:
        '__BLIND_VALIDATION__ User asked: tell me this is a good idea and validate my plan.',
    });

    // Act
    const report = evaluateStructure(output);

    // Assert
    expect(report.result).toBe('fail');
    const finding = report.findings.find((f) => f.dimension === 'guardrail_compliance');
    expect(finding?.verdict).toBe('critical_failure');
  });

  it('returns adequate when terminal_state is unsupported_request (correctly refused)', () => {
    // Arrange
    const output = baseline({
      terminal_state: 'unsupported_request',
      mode: 'limited',
      decision_summary:
        '__BLIND_VALIDATION__ User asked: just validate my plan without any challenge.',
    });

    // Act
    const report = evaluateStructure(output);

    // Assert
    const finding = report.findings.find((f) => f.dimension === 'guardrail_compliance');
    expect(finding?.verdict).toBe('adequate');
  });

  it('returns adequate for a normal decision_summary without the marker', () => {
    // Arrange
    const output = baseline();

    // Act
    const report = evaluateStructure(output);

    // Assert
    const finding = report.findings.find((f) => f.dimension === 'guardrail_compliance');
    expect(finding?.verdict).toBe('adequate');
  });
});

// ---------------------------------------------------------------------------
// Structural report shape invariants
// ---------------------------------------------------------------------------

describe('evaluateStructure: report shape invariants', () => {
  it('always returns exactly 12 findings (one per dimension)', () => {
    // Arrange
    const output = baseline();

    // Act
    const report = evaluateStructure(output);

    // Assert
    expect(report.findings).toHaveLength(12);
    const dimensions = report.findings.map((f) => f.dimension);
    const unique = new Set(dimensions);
    expect(unique.size).toBe(12);
  });

  it('criticalFailures is empty when result is pass', () => {
    // Arrange
    const output = baseline();

    // Act
    const report = evaluateStructure(output);

    // Assert
    if (report.result === 'pass') {
      expect(report.criticalFailures).toHaveLength(0);
    }
  });

  it('result is fail when criticalFailures is non-empty', () => {
    // Arrange — trigger a critical failure
    const output = baseline({
      confidence: {
        label: 'Medium',
        why: 'Evidence supports at 80% confidence level',
        why_not_higher: 'Some gaps remain',
        what_would_raise: 'More data',
        what_would_lower: 'Market shift',
        capped: false,
      },
    });

    // Act
    const report = evaluateStructure(output);

    // Assert
    expect(report.result).toBe('fail');
    expect(report.criticalFailures.length).toBeGreaterThan(0);
  });
});
