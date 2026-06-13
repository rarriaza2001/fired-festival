import { describe, it, expect } from 'vitest';
import { isPredictiveClaim, buildBaseRateQuery } from './base-rate';

describe('isPredictiveClaim', () => {
  it('flags a percentage claim as predictive', () => {
    // Arrange
    const statement = 'Conversion will improve by 40%';

    // Act
    const result = isPredictiveClaim(statement);

    // Assert
    expect(result).toBe(true);
  });

  it('flags a number + time-unit timeline as predictive', () => {
    expect(isPredictiveClaim('We will hit $1M ARR in 12 months')).toBe(true);
    expect(isPredictiveClaim('Migration completes in 3 weeks')).toBe(true);
  });

  it('flags fiscal-quarter and year targets as predictive', () => {
    expect(isPredictiveClaim('Ship the rewrite by Q3')).toBe(true);
    expect(isPredictiveClaim('Break even by 2027')).toBe(true);
  });

  it('flags forecast verbs as predictive', () => {
    expect(isPredictiveClaim('We expect churn to drop')).toBe(true);
    expect(isPredictiveClaim('Revenue is projected to double')).toBe(true);
  });

  it('treats present-tense factual claims as non-predictive', () => {
    expect(isPredictiveClaim('Users churn after the third onboarding step')).toBe(false);
    expect(isPredictiveClaim('The billing service uses Postgres')).toBe(false);
  });

  it('returns false for empty or whitespace input', () => {
    expect(isPredictiveClaim('')).toBe(false);
    expect(isPredictiveClaim('   ')).toBe(false);
  });
});

describe('buildBaseRateQuery', () => {
  it('reframes the claim into a reference-class query', () => {
    // Arrange
    const statement = 'reach $1M ARR in 12 months';

    // Act
    const query = buildBaseRateQuery(statement);

    // Assert
    expect(query).toContain('base rate');
    expect(query).toContain('reference class');
    expect(query).toContain('reach $1M ARR in 12 months');
  });

  it('anchors the reference class to the decision context when provided', () => {
    // Arrange
    const statement = 'reach $1M ARR in 12 months';
    const decisionContext = 'move from self-serve to sales-led';

    // Act
    const query = buildBaseRateQuery(statement, decisionContext);

    // Assert
    expect(query).toContain('move from self-serve to sales-led');
  });

  it('falls back to a generic comparison set without context', () => {
    const query = buildBaseRateQuery('reach $1M ARR in 12 months');
    expect(query).toContain('comparable decisions');
  });
});
