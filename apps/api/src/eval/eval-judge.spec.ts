import { describe, it, expect, vi, type Mock } from 'vitest';
import { EvalJudge } from './eval-judge';
import { EVAL_DIMENSIONS } from '@dgb/shared';
import type { ReviewOutput, DimensionResult } from '@dgb/shared';
import type { StructuredLlmService } from '../llm/structured-llm.service';
import type { Byok } from '../llm/llm.types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_BYOK: Byok = {
  providerName: 'anthropic',
  apiKey: 'sk-test-key',
  model: 'claude-3-5-haiku-latest',
};

/** Builds a valid ReviewOutput for testing. */
function mockOutput(): ReviewOutput {
  return {
    mode: 'full',
    terminal_state: 'review_complete',
    decision_summary: 'Whether to expand the coffee shop to a second location.',
    artifact: {
      decision: { value: 'Expand to second location', source: 'user_stated' },
      current_state: { value: 'Profitable single-location café', source: 'user_stated' },
      end_goal: { value: 'Grow revenue 40% in 12 months', source: 'user_stated' },
      commitment_consequence: { value: 'Signing a 3-year lease', source: 'user_stated' },
      decision_stage: { value: 'Early exploration', source: 'inferred' },
      extraction_confidence: 'High',
      inferred_reframe: null,
    },
    missing_context: { missing_items: [], inferred_items: [] },
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
    assumptions: [],
    evidence: {
      items: [
        {
          statement: 'Current location has 20% profit margin',
          kind: 'evidence',
          state: 'assessed',
          source_trust: 'high_trust',
          strength: 'strong',
          note: 'Internal financials',
          sources: [],
        },
      ],
      critical_gaps: [],
    },
    reality_checks: [],
    failure_modes: [],
    confidence: {
      label: 'Medium',
      why: 'Strong internal data but demand unvalidated',
      why_not_higher: 'No external demand study',
      what_would_raise: 'Completed foot-traffic study',
      what_would_lower: 'Competitor opening nearby',
      capped: false,
    },
    next_action: {
      action_type: 'validate_assumption',
      primary_action: 'Run a 4-week pop-up trial',
      target: 'Demand assumption',
      how: 'Partner with a local event',
      pass_signal: 'Daily sales exceed breakeven for 3 consecutive weeks',
      fail_signal: 'Daily sales remain below breakeven for 2 of 4 weeks',
      commitment_rule: 'Do not sign lease until pop-up pass signal is met',
      sources: [],
    },
    secondary_actions: [],
    guardrail_triggers: [],
    review_trace_summary: 'Review complete with medium confidence.',
  };
}

/** Builds a valid mock LLM judge response with all 12 dimensions. */
function mockJudgeData(verdictOverride = 'adequate' as DimensionResult['verdict']): unknown {
  return {
    dimensions: EVAL_DIMENSIONS.map((dim) => ({
      dimension: dim,
      verdict: verdictOverride,
      note: `Mock note for ${dim}`,
    })),
    critical_failures: [],
    required_correction: null,
  };
}

// ---------------------------------------------------------------------------
// Factory for a mocked StructuredLlmService
// ---------------------------------------------------------------------------

function makeMockLlm(resolveWith: unknown): StructuredLlmService {
  const complete: Mock = vi.fn().mockResolvedValue({ data: resolveWith, model: 'mock', costUsd: 0, costAccuracy: 'exact' });
  return { complete } as unknown as StructuredLlmService;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EvalJudge.judge', () => {
  it('returns an EvalResultRecord with human_review_required===true', async () => {
    // Arrange
    const llm = makeMockLlm(mockJudgeData('adequate'));
    const judge = new EvalJudge(llm);

    // Act
    const record = await judge.judge(MOCK_BYOK, mockOutput());

    // Assert
    expect(record.human_review_required).toBe(true);
  });

  it('returns evaluator_type of automated_assist', async () => {
    // Arrange
    const llm = makeMockLlm(mockJudgeData('adequate'));
    const judge = new EvalJudge(llm);

    // Act
    const record = await judge.judge(MOCK_BYOK, mockOutput());

    // Assert
    expect(record.evaluator_type).toBe('automated_assist');
  });

  it('returns exactly 12 dimensions in the record', async () => {
    // Arrange
    const llm = makeMockLlm(mockJudgeData('adequate'));
    const judge = new EvalJudge(llm);

    // Act
    const record = await judge.judge(MOCK_BYOK, mockOutput());

    // Assert
    expect(record.dimensions).toHaveLength(12);
  });

  it('all returned dimension names match EVAL_DIMENSIONS', async () => {
    // Arrange
    const llm = makeMockLlm(mockJudgeData('adequate'));
    const judge = new EvalJudge(llm);

    // Act
    const record = await judge.judge(MOCK_BYOK, mockOutput());

    // Assert
    const returnedDims = record.dimensions.map((d) => d.dimension);
    expect(returnedDims).toEqual([...EVAL_DIMENSIONS]);
  });

  it('sets result=pass when all dimensions are adequate', async () => {
    // Arrange
    const llm = makeMockLlm(mockJudgeData('adequate'));
    const judge = new EvalJudge(llm);

    // Act
    const record = await judge.judge(MOCK_BYOK, mockOutput());

    // Assert
    expect(record.result).toBe('pass');
  });

  it('sets result=weak when at least one dimension is weak and none is critical_failure', async () => {
    // Arrange
    const data = mockJudgeData('adequate') as {
      dimensions: DimensionResult[];
      critical_failures: string[];
      required_correction: null;
    };
    (data.dimensions[0] as DimensionResult) = {
      dimension: 'decision_extraction',
      verdict: 'weak',
      note: 'Extraction was incomplete',
    };

    const llm = makeMockLlm(data);
    const judge = new EvalJudge(llm);

    // Act
    const record = await judge.judge(MOCK_BYOK, mockOutput());

    // Assert
    expect(record.result).toBe('weak');
    expect(record.weak_dimensions).toContain('decision_extraction');
  });

  it('sets result=fail when at least one dimension is critical_failure', async () => {
    // Arrange
    const data = mockJudgeData('adequate') as {
      dimensions: DimensionResult[];
      critical_failures: string[];
      required_correction: null;
    };
    (data.dimensions[6] as DimensionResult) = {
      dimension: 'confidence_calibration',
      verdict: 'critical_failure',
      note: 'High confidence with weak evidence',
    };
    data.critical_failures = ['High confidence with weak evidence'];

    const llm = makeMockLlm(data);
    const judge = new EvalJudge(llm);

    // Act
    const record = await judge.judge(MOCK_BYOK, mockOutput());

    // Assert
    expect(record.result).toBe('fail');
    expect(record.critical_failures).toContain('High confidence with weak evidence');
  });

  it('populates strong_dimensions correctly', async () => {
    // Arrange
    const data = mockJudgeData('adequate') as {
      dimensions: DimensionResult[];
      critical_failures: string[];
      required_correction: null;
    };
    (data.dimensions[0] as DimensionResult) = {
      dimension: 'decision_extraction',
      verdict: 'strong',
      note: 'Perfect extraction',
    };

    const llm = makeMockLlm(data);
    const judge = new EvalJudge(llm);

    // Act
    const record = await judge.judge(MOCK_BYOK, mockOutput());

    // Assert
    expect(record.strong_dimensions).toContain('decision_extraction');
  });

  it('calls StructuredLlmService.complete exactly once per judge call', async () => {
    // Arrange
    const llm = makeMockLlm(mockJudgeData('adequate'));
    const judge = new EvalJudge(llm);

    // Act
    await judge.judge(MOCK_BYOK, mockOutput());

    // Assert
    expect((llm.complete as Mock)).toHaveBeenCalledTimes(1);
  });

  it('passes the serialised ReviewOutput as user content to the LLM', async () => {
    // Arrange
    const llm = makeMockLlm(mockJudgeData('adequate'));
    const judge = new EvalJudge(llm);
    const output = mockOutput();

    // Act
    await judge.judge(MOCK_BYOK, output);

    // Assert
    const callArgs = (llm.complete as Mock).mock.calls[0] as unknown[];
    const userContent = callArgs[3] as string;
    expect(userContent).toBe(JSON.stringify(output));
  });

  it('triggered_regression_labels is an empty array (judge does not set labels)', async () => {
    // Arrange
    const llm = makeMockLlm(mockJudgeData('adequate'));
    const judge = new EvalJudge(llm);

    // Act
    const record = await judge.judge(MOCK_BYOK, mockOutput());

    // Assert
    expect(record.triggered_regression_labels).toEqual([]);
  });
});
