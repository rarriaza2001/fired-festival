import { describe, expect, it } from 'vitest';
import { confidenceCalibrationSchema } from '@dgb/shared';

/**
 * Resilience contract for the confidence stage: the model occasionally emits a
 * verdict-style value for `label` (e.g. "Pause/reframe") instead of one of the
 * four categorical levels. That used to be an unrecoverable enum violation that
 * failed the entire review. It must now coerce to an Unknown, capped (limited)
 * calibration instead — while valid labels pass through untouched.
 */
describe('confidenceCalibrationSchema', () => {
  const base = {
    why: 'a',
    why_not_higher: 'b',
    what_would_raise: 'c',
    what_would_lower: 'd',
  };

  it('coerces an out-of-enum verdict label to Unknown and forces capped', () => {
    const result = confidenceCalibrationSchema.safeParse({
      label: 'Pause/reframe',
      capped: false,
      ...base,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.label).toBe('Unknown');
      expect(result.data.capped).toBe(true);
    }
  });

  it('coerces a missing label to Unknown and forces capped', () => {
    const result = confidenceCalibrationSchema.safeParse({ ...base, capped: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.label).toBe('Unknown');
      expect(result.data.capped).toBe(true);
    }
  });

  it('leaves a valid label and its capped flag untouched', () => {
    for (const label of ['High', 'Medium', 'Low', 'Unknown'] as const) {
      const result = confidenceCalibrationSchema.safeParse({ label, capped: false, ...base });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.label).toBe(label);
        expect(result.data.capped).toBe(false);
      }
    }
  });
});
