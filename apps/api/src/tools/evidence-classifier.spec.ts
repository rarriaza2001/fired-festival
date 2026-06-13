import { describe, it, expect } from 'vitest';
import type { EvidenceAssessment, EvidenceItem } from '@dgb/shared';
import type { ToolResult } from './tool-adapter';
import {
  needsExternalCheck,
  itemsNeedingCheck,
  recommendSearchDepth,
  applyToolResult,
  searchStopReasonFor,
} from './evidence-classifier';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    statement: 'test statement',
    kind: 'user_claim',
    state: 'provided_but_unassessed',
    source_trust: null,
    strength: null,
    note: null,
      sources: [],
    ...overrides,
  };
}

function makeAssessment(
  items: EvidenceItem[],
  critical_gaps: string[] = [],
): EvidenceAssessment {
  return { items, critical_gaps };
}

function makeToolResult(overrides: Partial<ToolResult> = {}): ToolResult {
  return {
    available: true,
    evidenceState: 'external_check_completed',
    content: 'some content',
    sourceTrust: 'high_trust',
    costUsd: 0,
    costAccuracy: 'exact',
    note: 'check completed',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// needsExternalCheck
// ---------------------------------------------------------------------------

describe('needsExternalCheck', () => {
  it('returns true when state is external_check_needed regardless of kind', () => {
    // Arrange
    const item = makeItem({ kind: 'assumption', state: 'external_check_needed' });

    // Act
    const result = needsExternalCheck(item);

    // Assert
    expect(result).toBe(true);
  });

  it('returns true for a user_claim with provided_but_unassessed state and null source_trust', () => {
    // Arrange
    const item = makeItem({ kind: 'user_claim', state: 'provided_but_unassessed', source_trust: null });

    // Act & Assert
    expect(needsExternalCheck(item)).toBe(true);
  });

  it('returns true for evidence with provided_but_unassessed state and unverified source_trust', () => {
    // Arrange
    const item = makeItem({ kind: 'evidence', state: 'provided_but_unassessed', source_trust: 'unverified' });

    // Act & Assert
    expect(needsExternalCheck(item)).toBe(true);
  });

  it('returns true for user_claim with provided_but_unassessed state and anecdotal source_trust', () => {
    // Arrange
    const item = makeItem({ kind: 'user_claim', state: 'provided_but_unassessed', source_trust: 'anecdotal' });

    // Act & Assert
    expect(needsExternalCheck(item)).toBe(true);
  });

  it('returns false for user_claim with provided_but_unassessed state and medium_trust source_trust', () => {
    // Arrange
    const item = makeItem({ kind: 'user_claim', state: 'provided_but_unassessed', source_trust: 'medium_trust' });

    // Act & Assert
    expect(needsExternalCheck(item)).toBe(false);
  });

  it('returns false for assumption even when provided_but_unassessed and null source_trust', () => {
    // Arrange
    const item = makeItem({ kind: 'assumption', state: 'provided_but_unassessed', source_trust: null });

    // Act & Assert
    expect(needsExternalCheck(item)).toBe(false);
  });

  it('returns false for speculation even when provided_but_unassessed and null source_trust', () => {
    // Arrange
    const item = makeItem({ kind: 'speculation', state: 'provided_but_unassessed', source_trust: null });

    // Act & Assert
    expect(needsExternalCheck(item)).toBe(false);
  });

  it('returns false for missing_support even when provided_but_unassessed and null source_trust', () => {
    // Arrange
    const item = makeItem({ kind: 'missing_support', state: 'provided_but_unassessed', source_trust: null });

    // Act & Assert
    expect(needsExternalCheck(item)).toBe(false);
  });

  it('returns false when state is assessed', () => {
    // Arrange
    const item = makeItem({ kind: 'user_claim', state: 'assessed', source_trust: null });

    // Act & Assert
    expect(needsExternalCheck(item)).toBe(false);
  });

  it('returns false when state is external_check_completed', () => {
    // Arrange
    const item = makeItem({ kind: 'evidence', state: 'external_check_completed', source_trust: null });

    // Act & Assert
    expect(needsExternalCheck(item)).toBe(false);
  });

  it('returns false when state is external_check_unavailable', () => {
    // Arrange
    const item = makeItem({ kind: 'user_claim', state: 'external_check_unavailable', source_trust: null });

    // Act & Assert
    expect(needsExternalCheck(item)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// itemsNeedingCheck
// ---------------------------------------------------------------------------

describe('itemsNeedingCheck', () => {
  it('returns only items that need an external check', () => {
    // Arrange
    const checkable = makeItem({ kind: 'user_claim', state: 'provided_but_unassessed', source_trust: null });
    const assessed = makeItem({ kind: 'evidence', state: 'assessed', source_trust: 'high_trust' });
    const assumption = makeItem({ kind: 'assumption', state: 'provided_but_unassessed', source_trust: null });
    const assessment = makeAssessment([checkable, assessed, assumption]);

    // Act
    const result = itemsNeedingCheck(assessment);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(checkable);
  });

  it('returns an empty array when no items need checking', () => {
    // Arrange
    const assessment = makeAssessment([
      makeItem({ kind: 'assumption', state: 'provided_but_unassessed', source_trust: null }),
      makeItem({ kind: 'evidence', state: 'assessed', source_trust: 'high_trust' }),
    ]);

    // Act & Assert
    expect(itemsNeedingCheck(assessment)).toHaveLength(0);
  });

  it('returns all items when all need checking', () => {
    // Arrange
    const items = [
      makeItem({ kind: 'user_claim', state: 'external_check_needed' }),
      makeItem({ kind: 'evidence', state: 'provided_but_unassessed', source_trust: 'unverified' }),
    ];
    const assessment = makeAssessment(items);

    // Act & Assert
    expect(itemsNeedingCheck(assessment)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// recommendSearchDepth
// ---------------------------------------------------------------------------

describe('recommendSearchDepth', () => {
  it('returns no_search when no items need checking', () => {
    // Arrange
    const assessment = makeAssessment([
      makeItem({ kind: 'assumption', state: 'provided_but_unassessed', source_trust: null }),
    ]);

    // Act & Assert
    expect(recommendSearchDepth(assessment)).toBe('no_search');
  });

  it('returns shallow_search when 1 item needs checking and no critical gaps', () => {
    // Arrange
    const assessment = makeAssessment([
      makeItem({ kind: 'user_claim', state: 'provided_but_unassessed', source_trust: null }),
    ]);

    // Act & Assert
    expect(recommendSearchDepth(assessment)).toBe('shallow_search');
  });

  it('returns shallow_search when 2 items need checking and no critical gaps', () => {
    // Arrange
    const assessment = makeAssessment([
      makeItem({ kind: 'user_claim', state: 'provided_but_unassessed', source_trust: null }),
      makeItem({ kind: 'evidence', state: 'provided_but_unassessed', source_trust: 'unverified' }),
    ]);

    // Act & Assert
    expect(recommendSearchDepth(assessment)).toBe('shallow_search');
  });

  it('returns standard_search when 3 or more items need checking', () => {
    // Arrange
    const assessment = makeAssessment([
      makeItem({ kind: 'user_claim', state: 'provided_but_unassessed', source_trust: null }),
      makeItem({ kind: 'evidence', state: 'provided_but_unassessed', source_trust: 'unverified' }),
      makeItem({ kind: 'user_claim', state: 'external_check_needed' }),
    ]);

    // Act & Assert
    expect(recommendSearchDepth(assessment)).toBe('standard_search');
  });

  it('returns standard_search when critical_gaps are present even with only 1 item needing check', () => {
    // Arrange
    const assessment = makeAssessment(
      [makeItem({ kind: 'user_claim', state: 'provided_but_unassessed', source_trust: null })],
      ['missing market size data'],
    );

    // Act & Assert
    expect(recommendSearchDepth(assessment)).toBe('standard_search');
  });

  it('never returns deep_search', () => {
    // Arrange — worst case scenario
    const manyItems = Array.from({ length: 10 }, () =>
      makeItem({ kind: 'user_claim', state: 'external_check_needed' }),
    );
    const assessment = makeAssessment(manyItems, ['gap1', 'gap2', 'gap3']);

    // Act
    const depth = recommendSearchDepth(assessment);

    // Assert
    expect(depth).not.toBe('deep_search');
  });
});

// ---------------------------------------------------------------------------
// applyToolResult
// ---------------------------------------------------------------------------

describe('applyToolResult', () => {
  it('updates state and source_trust when result is available and external_check_completed', () => {
    // Arrange
    const item = makeItem({ kind: 'user_claim', state: 'external_check_needed', source_trust: null });
    const result = makeToolResult({
      available: true,
      evidenceState: 'external_check_completed',
      sourceTrust: 'high_trust',
      note: 'verified via source',
    });

    // Act
    const updated = applyToolResult(item, result);

    // Assert
    expect(updated.state).toBe('external_check_completed');
    expect(updated.source_trust).toBe('high_trust');
    expect(updated.note).toBe('verified via source');
  });

  it('appends toolRef to sources when provided', () => {
    const item = makeItem({ sources: ['user input'] });
    const result = makeToolResult({
      available: false,
      evidenceState: 'external_check_unavailable',
      sourceTrust: null,
      note: 'no network',
    });

    const updated = applyToolResult(item, result, 'external check: search');

    expect(updated.sources).toEqual(['user input', 'external check: search']);
  });

  it('appends sourceUrls from web search results', () => {
    const item = makeItem({ sources: [] });
    const result = makeToolResult({
      available: true,
      evidenceState: 'external_check_completed',
      sourceTrust: 'medium_trust',
      note: 'Web search (2 results).',
      sourceUrls: ['https://example.com/a', 'https://example.com/b'],
    });

    const updated = applyToolResult(item, result, undefined, result.sourceUrls);

    expect(updated.sources).toEqual(['https://example.com/a', 'https://example.com/b']);
  });

  it('sets state to external_check_unavailable when result is unavailable', () => {
    // Arrange
    const item = makeItem({ kind: 'user_claim', state: 'external_check_needed', source_trust: null });
    const result = makeToolResult({
      available: false,
      evidenceState: 'external_check_unavailable',
      sourceTrust: null,
      note: 'no network',
    });

    // Act
    const updated = applyToolResult(item, result);

    // Assert
    expect(updated.state).toBe('external_check_unavailable');
    expect(updated.source_trust).toBeNull();
  });

  it('does not mutate the input item', () => {
    // Arrange
    const item = makeItem({ kind: 'user_claim', state: 'external_check_needed' });
    const originalState = item.state;
    const result = makeToolResult({
      available: true,
      evidenceState: 'external_check_completed',
      sourceTrust: 'medium_trust',
    });

    // Act
    applyToolResult(item, result);

    // Assert — original is unchanged
    expect(item.state).toBe(originalState);
  });

  it('appends result note to existing note without overwriting it', () => {
    // Arrange
    const item = makeItem({ note: 'original note' });
    const result = makeToolResult({ note: 'new note', available: false, evidenceState: 'external_check_unavailable' });

    // Act
    const updated = applyToolResult(item, result);

    // Assert
    expect(updated.note).toBe('original note | new note');
  });

  it('uses only the result note when the item has no existing note', () => {
    // Arrange
    const item = makeItem({ note: null });
    const result = makeToolResult({ note: 'fresh note', available: false, evidenceState: 'external_check_unavailable' });

    // Act
    const updated = applyToolResult(item, result);

    // Assert
    expect(updated.note).toBe('fresh note');
  });

  it('does not duplicate the note when existing and incoming are identical', () => {
    // Arrange
    const item = makeItem({ note: 'same note' });
    const result = makeToolResult({ note: 'same note', available: false, evidenceState: 'external_check_unavailable' });

    // Act
    const updated = applyToolResult(item, result);

    // Assert
    expect(updated.note).toBe('same note');
  });

  it('preserves unrelated fields (statement, kind, strength) when applying an unavailable result', () => {
    // Arrange
    const item = makeItem({
      statement: 'we will achieve 10x growth',
      kind: 'user_claim',
      strength: 'weak',
      state: 'external_check_needed',
    });
    const result = makeToolResult({ available: false, evidenceState: 'external_check_unavailable', note: 'offline' });

    // Act
    const updated = applyToolResult(item, result);

    // Assert
    expect(updated.statement).toBe('we will achieve 10x growth');
    expect(updated.kind).toBe('user_claim');
    expect(updated.strength).toBe('weak');
  });
});

// ---------------------------------------------------------------------------
// searchStopReasonFor
// ---------------------------------------------------------------------------

describe('searchStopReasonFor', () => {
  it('returns search_not_needed when nothing required checking', () => {
    // Arrange
    const assessment = makeAssessment([
      makeItem({ kind: 'assumption', state: 'provided_but_unassessed', source_trust: null }),
    ]);

    // Act & Assert
    expect(searchStopReasonFor(assessment, false)).toBe('search_not_needed');
    expect(searchStopReasonFor(assessment, true)).toBe('search_not_needed');
  });

  it('returns non_material_result when items needed checking but external retrieval was unavailable', () => {
    // Arrange
    const assessment = makeAssessment([
      makeItem({ kind: 'user_claim', state: 'external_check_needed' }),
    ]);

    // Act & Assert
    expect(searchStopReasonFor(assessment, false)).toBe('non_material_result');
  });

  it('returns material_question_answered when items needed checking and at least one was available', () => {
    // Arrange
    const assessment = makeAssessment([
      makeItem({ kind: 'user_claim', state: 'external_check_needed' }),
    ]);

    // Act & Assert
    expect(searchStopReasonFor(assessment, true)).toBe('material_question_answered');
  });
});
