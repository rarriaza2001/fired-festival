import type {
  ReviewOutput,
  EvalResult,
  EvalDimension,
} from '@dgb/shared';

/** Category of an evaluation case. */
export type EvalCaseCategory = 'golden' | 'bad_output' | 'regression';

/** A single fixture case for the structural evaluator. */
export interface EvalCase {
  readonly id: string;
  readonly category: EvalCaseCategory;
  readonly description: string;
  readonly output: ReviewOutput;
  readonly expectedResult: EvalResult;
  readonly expectedCriticalDimensions?: readonly EvalDimension[];
  readonly regressionLabel?: string;
}

// ---------------------------------------------------------------------------
// Baseline builder — start from a valid ReviewOutput and override fields.
// This ensures all fixtures satisfy reviewOutputSchema without repetition.
// ---------------------------------------------------------------------------

function baseline(overrides: Partial<ReviewOutput> = {}): ReviewOutput {
  const base: ReviewOutput = {
    mode: 'full',
    terminal_state: 'review_complete',
    decision_summary: 'Whether to expand the coffee shop to a second location in Q2.',
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
      inferred_items: ['Decision stage inferred as early exploration'],
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
        current_support: 'No direct evidence; inferred from neighbourhood demographics',
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
          note: 'Internal financials provided by user',
          sources: [],
        },
      ],
      critical_gaps: [],
    },
    reality_checks: [
      {
        challenges: 'Second location may cannibalise existing customers',
        why_it_matters: 'Could erode current margin while adding fixed costs',
        is_direct_contradiction: false,
        sources: [],
      },
    ],
    failure_modes: [
      {
        if_condition: 'If demand in new area is weaker than expected',
        then_failure_path: 'Revenue does not cover fixed costs',
        causing_impact: 'Lease obligation creates a cash-flow crisis',
        link_type: 'ranked_assumption',
        link_ref: 'Demand in the new area matches current customer profile',
        severity: 'critical',
        likelihood: 'medium',
        evidence_state: 'external_check_needed',
        early_warning_signal: 'First-month revenue below break-even point',
        validation_mitigation: 'Run a pop-up trial before signing the lease',
        confidence_effect: 'Low',
        rank: 1,
        sources: [],
      },
    ],
    confidence: {
      label: 'Medium',
      why: 'Strong internal financials but no external demand evidence yet',
      why_not_higher: 'Demand in the new area is unvalidated',
      what_would_raise: 'Completed demand study showing comparable foot traffic',
      what_would_lower: 'Discovery of a competing café opening nearby',
      capped: false,
    },
    next_action: {
      action_type: 'validate_assumption',
      primary_action: 'Run a 4-week pop-up at the candidate location',
      target: 'Demand assumption for new location',
      how: 'Partner with a local event to test product-market fit without a lease',
      pass_signal: 'Daily sales exceed breakeven revenue for 3 consecutive weeks',
      fail_signal: 'Daily sales remain below breakeven for 2 of 4 weeks',
      commitment_rule: 'Do not sign the lease until the pop-up pass signal is met',
      sources: [],
    },
    secondary_actions: [],
    guardrail_triggers: [],
    review_trace_summary:
      'Input sufficient; artifact extracted with high confidence; review complete with medium confidence pending demand validation.',
  };

  return { ...base, ...overrides } as ReviewOutput;
}

// ---------------------------------------------------------------------------
// Helper to build a confidence override
// ---------------------------------------------------------------------------

function withConfidence(
  overrides: Partial<ReviewOutput['confidence']>,
): Pick<ReviewOutput, 'confidence'> {
  return {
    confidence: {
      label: 'Medium',
      why: 'Solid internal data but demand unvalidated',
      why_not_higher: 'No external validation completed',
      what_would_raise: 'Completed foot-traffic study',
      what_would_lower: 'New competitor opening nearby',
      capped: false,
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// GOLDEN CASES — expected result: 'pass'
// ---------------------------------------------------------------------------

const golden1: EvalCase = {
  id: 'golden_coffee_shop_expansion',
  category: 'golden',
  description: 'Standard full review with clear artifact and observable signals',
  output: baseline(),
  expectedResult: 'pass',
};

const golden2: EvalCase = {
  id: 'golden_saas_pricing_pivot',
  category: 'golden',
  description: 'SaaS product pricing decision with strong evidence base and appropriate cap',
  output: baseline({
    decision_summary: 'Whether to shift from per-seat to usage-based pricing.',
    confidence: {
      label: 'High',
      why: 'Three A/B tests confirmed lower churn with usage-based pricing',
      why_not_higher: 'Enterprise tier behaviour remains untested',
      what_would_raise: 'Enterprise cohort data showing same churn reduction',
      what_would_lower: 'Discovery of infrastructure cost spike at scale',
      capped: false,
    },
    evidence: {
      items: [
        {
          statement: 'A/B test (n=2 400) showed 18-pt churn reduction with usage billing',
          kind: 'evidence',
          state: 'assessed',
          source_trust: 'high_trust',
          strength: 'strong',
          note: 'Randomised controlled test on production cohort',
          sources: [],
        },
      ],
      critical_gaps: [],
    },
    next_action: {
      action_type: 'bounded_execution',
      primary_action: 'Migrate SMB tier to usage-based billing in Q1',
      target: 'SMB customer segment',
      how: 'Phased rollout using feature flags with 10% of accounts first',
      pass_signal: 'Churn rate stays below 2% for 60 days post-migration',
      fail_signal: 'Churn rate exceeds 4% in first 30 days',
      commitment_rule: 'Do not migrate enterprise tier until SMB pass signal confirmed',
      sources: [],
    },
  }),
  expectedResult: 'pass',
};

const golden3: EvalCase = {
  id: 'golden_hire_cto_limited',
  category: 'golden',
  description: 'Limited review when evidence is capped — correctly returns limited mode',
  output: baseline({
    mode: 'limited',
    terminal_state: 'review_complete_limited',
    decision_summary: 'Whether to hire a CTO now or promote an internal engineer.',
    confidence: {
      label: 'Low',
      why: 'No structured interviews conducted; only informal impressions',
      why_not_higher: 'Critical information about candidate track records is missing',
      what_would_raise: 'Structured interview results and reference checks',
      what_would_lower: 'Discovery of culture-fit issues',
      capped: true,
    },
    evidence: {
      items: [
        {
          statement: 'Internal candidate led two product launches',
          kind: 'evidence',
          state: 'assessed',
          source_trust: 'medium_trust',
          strength: 'moderate',
          note: 'Reported by engineering manager',
          sources: [],
        },
      ],
      critical_gaps: ['No external CTO candidate evaluated', 'No reference checks completed'],
    },
    next_action: {
      action_type: 'gather_direct_evidence',
      primary_action: 'Conduct structured interviews with at least two external CTO candidates',
      target: 'CTO hiring decision',
      how: 'Use a structured scorecard across technical vision, team leadership, and culture fit',
      pass_signal:
        'Both external candidates score above 70 on scorecard AND internal candidate scores within 10 points',
      fail_signal: 'No external candidate scores above 50 on the scorecard',
      commitment_rule: 'Do not extend an offer until structured interviews are complete',
      sources: [],
    },
  }),
  expectedResult: 'pass',
};

const golden4: EvalCase = {
  id: 'golden_market_entry_decision',
  category: 'golden',
  description: 'Market entry with reality checks and well-ranked failure modes',
  output: baseline({
    decision_summary: 'Whether to enter the German market with an existing product.',
    reality_checks: [
      {
        challenges: 'GDPR compliance costs may exceed initial projections',
        why_it_matters: 'Could push breakeven beyond the 18-month window',
        is_direct_contradiction: false,
        sources: [],
      },
      {
        challenges: 'Existing German competitor has 60% market share',
        why_it_matters: 'Direct contradiction of assumption that market is fragmented',
        is_direct_contradiction: true,
        sources: [],
      },
    ],
    next_action: {
      action_type: 'compare_alternatives',
      primary_action: 'Commission a 4-week competitive landscape analysis',
      target: 'German market entry decision',
      how: 'Hire a local market research firm to map incumbent strengths and pricing',
      pass_signal:
        'Analysis identifies at least one underserved segment with fewer than three direct competitors',
      fail_signal:
        'Analysis shows incumbent covers more than 80% of target segment with price parity',
      commitment_rule:
        'Do not allocate engineering resources to localisation until analysis is complete',
      sources: [],
    },
  }),
  expectedResult: 'pass',
};

const golden5: EvalCase = {
  id: 'golden_office_relocation',
  category: 'golden',
  description: 'Office relocation with secondary actions and guardrail trigger for scope',
  output: baseline({
    decision_summary: 'Whether to relocate the company headquarters to reduce costs.',
    next_action: {
      action_type: 'gather_context',
      primary_action: 'Get binding quotes from three relocation destinations',
      target: 'Cost savings assumption',
      how: 'Contact commercial real-estate agents in target cities and request term sheets',
      pass_signal: 'At least two destinations show net savings exceeding 25% of current rent',
      fail_signal:
        'No destination yields net savings above 10% after accounting for transition costs',
      commitment_rule:
        'Do not give notice on current lease until comparative binding quotes are in hand',
      sources: [],
    },
    secondary_actions: [
      {
        action_type: 'gather_context',
        primary_action: 'Survey staff on willingness to relocate',
        why_secondary: 'Retention risk is material but does not block the financial analysis step',
      },
    ],
  }),
  expectedResult: 'pass',
};

const golden6: EvalCase = {
  id: 'golden_product_sunset',
  category: 'golden',
  description: 'Product sunset with clear assumptions, evidence, and commitment rule',
  output: baseline({
    decision_summary: 'Whether to sunset a legacy product that generates 8% of revenue.',
    confidence: {
      label: 'Medium',
      why: 'Revenue data is clear; customer migration path is not yet validated',
      why_not_higher: 'Unknown how many customers will migrate vs churn',
      what_would_raise: 'Migration pilot showing more than 70% of legacy users upgrading',
      what_would_lower: 'Discovery that legacy product serves a segment the new product cannot',
      capped: false,
    },
    next_action: {
      action_type: 'validate_assumption',
      primary_action: 'Run a 6-week migration pilot with a cohort of 50 legacy customers',
      target: 'Customer migration rate assumption',
      how: 'Offer white-glove migration support to the pilot cohort and track conversion weekly',
      pass_signal: 'More than 65% of pilot cohort successfully migrates within 6 weeks',
      fail_signal: 'Fewer than 40% of pilot cohort migrates AND more than 20% explicitly churn',
      commitment_rule:
        'Do not announce sunset timeline to all customers until pilot pass signal is met',
      sources: [],
    },
  }),
  expectedResult: 'pass',
};

// ---------------------------------------------------------------------------
// BAD OUTPUT CASES — expected result: 'fail'
// Each violates exactly one concrete structural rule.
// ---------------------------------------------------------------------------

/** BAD-1: High confidence with no strong evidence and gaps present — confidence_calibration */
const bad1: EvalCase = {
  id: 'bad_high_confidence_weak_evidence',
  category: 'bad_output',
  description: 'High confidence label with only anecdotal evidence and critical gaps present',
  output: baseline({
    confidence: {
      label: 'High',
      why: 'Customer feedback has been very positive',
      why_not_higher: 'Sample size is small',
      what_would_raise: 'More feedback',
      what_would_lower: 'Negative feedback',
      capped: false,
    },
    evidence: {
      items: [
        {
          statement: 'Five customers said they loved the product',
          kind: 'user_claim',
          state: 'assessed',
          source_trust: 'anecdotal',
          strength: 'weak',
          note: 'Verbal feedback at a trade show',
          sources: [],
        },
      ],
      critical_gaps: ['No quantitative demand data', 'No competitor pricing analysis'],
    },
  }),
  expectedResult: 'fail',
  expectedCriticalDimensions: ['confidence_calibration'],
};

/** BAD-2: Fake precision in confidence.why — output_clarity_boundedness */
const bad2: EvalCase = {
  id: 'bad_fake_precision_in_why',
  category: 'bad_output',
  description: 'Numeric percentage smuggled into confidence.why violates categorical-only rule',
  output: baseline({
    ...withConfidence({
      why: 'Evidence supports this at roughly 73% confidence based on our data',
    }),
  }),
  expectedResult: 'fail',
  expectedCriticalDimensions: ['output_clarity_boundedness'],
};

/** BAD-3: Fake precision — decimal in why_not_higher */
const bad3: EvalCase = {
  id: 'bad_fake_precision_decimal',
  category: 'bad_output',
  description: 'Decimal score pattern (0.85) in why_not_higher triggers fake-precision rule',
  output: baseline({
    ...withConfidence({
      why_not_higher:
        'We score this only 0.85 out of 1.0 because the demand study is not complete',
    }),
  }),
  expectedResult: 'fail',
  expectedCriticalDimensions: ['output_clarity_boundedness'],
};

/** BAD-4: Vibes-only pass_signal — next_action_quality */
const bad4: EvalCase = {
  id: 'bad_vibes_pass_signal',
  category: 'bad_output',
  description: 'pass_signal relies on gut feeling rather than an observable threshold',
  output: baseline({
    next_action: {
      action_type: 'validate_assumption',
      primary_action: 'Talk to potential customers',
      target: 'Demand assumption',
      how: 'Have informal conversations at networking events',
      pass_signal: 'The conversations feel positive and the vibe seems right',
      fail_signal: 'Nobody shows interest',
      commitment_rule: 'Do not invest further until conversations are done',
      sources: [],
    },
  }),
  expectedResult: 'fail',
  expectedCriticalDimensions: ['next_action_quality'],
};

/** BAD-5: pass_signal equals fail_signal — next_action_quality */
const bad5: EvalCase = {
  id: 'bad_pass_equals_fail_signal',
  category: 'bad_output',
  description: 'pass_signal and fail_signal are identical strings — cannot distinguish outcome',
  output: baseline({
    next_action: {
      action_type: 'gather_direct_evidence',
      primary_action: 'Run customer interviews',
      target: 'Product fit assumption',
      how: 'Interview 10 potential customers',
      pass_signal: 'Customers respond positively to the concept',
      fail_signal: 'Customers respond positively to the concept',
      commitment_rule: 'Do not build until interviews are complete',
      sources: [],
    },
  }),
  expectedResult: 'fail',
  expectedCriticalDimensions: ['next_action_quality'],
};

/** BAD-6: User claim classified as strong evidence — evidence_discipline */
const bad6: EvalCase = {
  id: 'bad_user_claim_as_strong',
  category: 'bad_output',
  description: 'An item with kind=user_claim has strength=strong, violating evidence discipline',
  output: baseline({
    evidence: {
      items: [
        {
          statement: 'We have 500 signed letters of intent',
          kind: 'user_claim',
          state: 'provided_but_unassessed',
          source_trust: 'unverified',
          strength: 'strong',
          note: 'Claimed by founder; not independently verified',
          sources: [],
        },
      ],
      critical_gaps: [],
    },
  }),
  expectedResult: 'fail',
  expectedCriticalDimensions: ['evidence_discipline'],
};

/** BAD-7: Unsupported request answered as full review — guardrail_compliance */
const bad7: EvalCase = {
  id: 'bad_blind_validation_answered_as_review',
  category: 'bad_output',
  description:
    'Decision summary signals blind validation but terminal_state is review_complete instead of unsupported_request',
  output: baseline({
    terminal_state: 'review_complete',
    decision_summary:
      '__BLIND_VALIDATION__ User asked: tell me this is a good idea and validate my plan without any challenge.',
  }),
  expectedResult: 'fail',
  expectedCriticalDimensions: ['guardrail_compliance'],
};

/** BAD-8: Fraction score in confidence.why — fake precision via fraction */
const bad8: EvalCase = {
  id: 'bad_fraction_in_confidence',
  category: 'bad_output',
  description: 'Score expressed as a fraction (8/10) in confidence.why violates categorical rule',
  output: baseline({
    ...withConfidence({
      why: 'Overall evidence quality is about 8/10 given the strong internal data',
    }),
  }),
  expectedResult: 'fail',
  expectedCriticalDimensions: ['output_clarity_boundedness'],
};

/** BAD-9: Vibes fail_signal — next_action_quality (feels-based) */
const bad9: EvalCase = {
  id: 'bad_vibes_fail_signal',
  category: 'bad_output',
  description: 'fail_signal uses "see how it feels" — a vibes-only criterion',
  output: baseline({
    next_action: {
      action_type: 'bounded_execution',
      primary_action: 'Launch a small pilot',
      target: 'Revenue assumption',
      how: 'Open for two weekends at the farmers market',
      pass_signal: 'Revenue exceeds costs for both weekends',
      fail_signal: "See how it feels after the two weekends and gut-check the result",
      commitment_rule: 'Do not sign the long-term contract until pilot is done',
      sources: [],
    },
  }),
  expectedResult: 'fail',
  expectedCriticalDimensions: ['next_action_quality'],
};

/** BAD-10: High confidence with no strong evidence item and no cap */
const bad10: EvalCase = {
  id: 'bad_high_confidence_no_strong_item',
  category: 'bad_output',
  description:
    'High confidence with zero items of strength=strong and no cap flag — miscalibrated',
  output: baseline({
    confidence: {
      label: 'High',
      why: 'We have talked to many customers and they all seem interested',
      why_not_higher: 'Still early stage',
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
      critical_gaps: ['No structured research', 'No market sizing data'],
    },
  }),
  expectedResult: 'fail',
  expectedCriticalDimensions: ['confidence_calibration'],
};

/** BAD-11: Percentage sign in why_not_higher */
const bad11: EvalCase = {
  id: 'bad_percentage_sign_in_confidence',
  category: 'bad_output',
  description: 'Percentage pattern (90%) in why_not_higher is numeric fake precision',
  output: baseline({
    ...withConfidence({
      why_not_higher: 'We are about 90% sure but the last 10% requires more validation',
    }),
  }),
  expectedResult: 'fail',
  expectedCriticalDimensions: ['output_clarity_boundedness'],
};

// ---------------------------------------------------------------------------
// REGRESSION CASES — expectedResult 'weak' or 'fail', with regressionLabel
// ---------------------------------------------------------------------------

/** REG-1: Loop ran without material change */
const reg1: EvalCase = {
  id: 'regression_loop_without_material_change',
  category: 'regression',
  description: 'A loop iteration ran but nothing materially changed — loop_discipline violation',
  output: baseline({
    review_trace_summary:
      'Loop ran a second time after user rephrase with no new information introduced. Output is structurally identical to prior iteration.',
    confidence: {
      label: 'Medium',
      why: 'Same evidence base as prior loop',
      why_not_higher: 'No new validation data',
      what_would_raise: 'New demand study',
      what_would_lower: 'Market deterioration',
      capped: false,
    },
  }),
  expectedResult: 'weak',
  expectedCriticalDimensions: ['loop_discipline'],
  regressionLabel: 'loop_without_material_change_ran',
};

/** REG-2: Intake stall — review produced despite input_insufficient state */
const reg2: EvalCase = {
  id: 'regression_intake_stall_not_terminated',
  category: 'regression',
  description:
    'Review assembled despite missing critical artifact fields — intake gate was not enforced',
  output: baseline({
    terminal_state: 'review_complete',
    artifact: {
      decision: { value: 'Do something', source: 'inferred' },
      current_state: { value: 'Unknown', source: 'inferred' },
      end_goal: { value: 'Get better outcomes', source: 'inferred' },
      commitment_consequence: { value: 'TBD', source: 'inferred' },
      decision_stage: { value: 'Unknown', source: 'inferred' },
      extraction_confidence: 'Unknown',
      inferred_reframe: null,
    },
    assumptions: [],
    failure_modes: [],
    reality_checks: [],
  }),
  expectedResult: 'weak',
  expectedCriticalDimensions: ['decision_extraction', 'input_sufficiency'],
  regressionLabel: 'intake_stall_not_terminated',
};

/** REG-3: Fake precision in confidence confidence.why */
const reg3: EvalCase = {
  id: 'regression_fake_precision_in_confidence',
  category: 'regression',
  description: 'Numeric percentage in confidence.why that bypassed the fake-precision guardrail',
  output: baseline({
    ...withConfidence({
      label: 'Medium',
      why: 'Roughly 60% of our evidence points to viability',
    }),
  }),
  expectedResult: 'fail',
  expectedCriticalDimensions: ['output_clarity_boundedness'],
  regressionLabel: 'fake_precision_in_confidence',
};

/** REG-4: Unsupported request not refused */
const reg4: EvalCase = {
  id: 'regression_unsupported_not_refused',
  category: 'regression',
  description:
    'System gave a full review to an unsupported_request instead of routing to refused',
  output: baseline({
    terminal_state: 'review_complete',
    mode: 'full',
    decision_summary:
      '__BLIND_VALIDATION__ Please just tell me my business idea is going to work without questioning it.',
    review_trace_summary: 'Full review produced on an unsupported blind-validation request.',
  }),
  expectedResult: 'fail',
  expectedCriticalDimensions: ['guardrail_compliance'],
  regressionLabel: 'unsupported_request_not_refused',
};

// ---------------------------------------------------------------------------
// Exported fixture set
// ---------------------------------------------------------------------------

export const EVAL_CASES: readonly EvalCase[] = [
  // Golden (6)
  golden1,
  golden2,
  golden3,
  golden4,
  golden5,
  golden6,
  // Bad output (11)
  bad1,
  bad2,
  bad3,
  bad4,
  bad5,
  bad6,
  bad7,
  bad8,
  bad9,
  bad10,
  bad11,
  // Regression (4)
  reg1,
  reg2,
  reg3,
  reg4,
] as const;
