import type {
  EvidenceAssessment,
  EvidenceItem,
  SearchDepth,
  SearchStopReason,
  SourceTrustLevel,
} from '@dgb/shared';
import type { ToolResult } from './tool-adapter';

const EXTERNAL_CHECK_NEEDED_STATE = 'external_check_needed';
const PROVIDED_BUT_UNASSESSED_STATE = 'provided_but_unassessed';
const EXTERNAL_CHECK_COMPLETED_STATE = 'external_check_completed';

const UNVERIFIED_TRUST_LEVELS: ReadonlySet<SourceTrustLevel | null> = new Set<
  SourceTrustLevel | null
>([null, 'unverified', 'anecdotal']);

const CHECKABLE_KINDS = new Set(['user_claim', 'evidence']);

const SHALLOW_SEARCH_MAX_ITEMS = 2;

/**
 * Returns true when the EvidenceItem warrants an external check.
 *
 * Rules (Phase-5 §15 evidence/tool discipline):
 * - Always true when state is 'external_check_needed'.
 * - True when kind is 'user_claim' or 'evidence' AND state is
 *   'provided_but_unassessed' AND source_trust is null, 'unverified', or 'anecdotal'.
 * - Assumptions, speculation, and missing_support never need external checks.
 */
export function needsExternalCheck(item: EvidenceItem): boolean {
  if (item.state === EXTERNAL_CHECK_NEEDED_STATE) {
    return true;
  }

  return (
    CHECKABLE_KINDS.has(item.kind) &&
    item.state === PROVIDED_BUT_UNASSESSED_STATE &&
    UNVERIFIED_TRUST_LEVELS.has(item.source_trust)
  );
}

/**
 * Filters the evidence assessment to items that require an external check.
 */
export function itemsNeedingCheck(evidence: EvidenceAssessment): EvidenceItem[] {
  return evidence.items.filter(needsExternalCheck);
}

/**
 * Recommends the shallowest sufficient search depth for the given assessment.
 *
 * - 'no_search'       — nothing needs checking
 * - 'shallow_search'  — 1–2 items need checking and there are no critical gaps
 * - 'standard_search' — 3+ items need checking OR any critical gaps present
 *
 * 'deep_search' is never auto-recommended; it requires explicit escalation.
 */
export function recommendSearchDepth(evidence: EvidenceAssessment): SearchDepth {
  const needingCheck = itemsNeedingCheck(evidence);

  if (needingCheck.length === 0) {
    return 'no_search';
  }

  const hasCriticalGaps = evidence.critical_gaps.length > 0;
  const manyItems = needingCheck.length > SHALLOW_SEARCH_MAX_ITEMS;

  if (hasCriticalGaps || manyItems) {
    return 'standard_search';
  }

  return 'shallow_search';
}

/**
 * Applies a ToolResult to an EvidenceItem, returning a new immutable item.
 *
 * - When the result is available and state is 'external_check_completed':
 *   updates state and source_trust from the result.
 * - Otherwise: sets state to result.evidenceState, keeps other fields,
 *   and appends result.note to the existing note without destroying it.
 * - When toolRef is provided, appends a user-facing citation to sources.
 *
 * Never mutates the input item.
 */
export function applyToolResult(
  item: EvidenceItem,
  result: ToolResult,
  toolRef?: string,
  sourceUrls?: readonly string[],
): EvidenceItem {
  const combinedNote = combineNotes(item.note, result.note);
  let sources = appendSource(item.sources, toolRef);
  if (sourceUrls?.length) {
    for (const url of sourceUrls) {
      sources = appendSource(sources, url);
    }
  }

  if (result.available && result.evidenceState === EXTERNAL_CHECK_COMPLETED_STATE) {
    return {
      ...item,
      state: result.evidenceState,
      source_trust: result.sourceTrust,
      note: combinedNote,
      sources,
    };
  }

  return {
    ...item,
    state: result.evidenceState,
    note: combinedNote,
    sources,
  };
}

/**
 * Derives the SearchStopReason for a completed evidence-checking pass.
 *
 * - 'search_not_needed'           — nothing needed checking in the first place
 * - 'non_material_result'         — external retrieval was unavailable (anyAvailable===false)
 * - 'material_question_answered'  — at least one retrieval succeeded
 */
export function searchStopReasonFor(
  evidence: EvidenceAssessment,
  anyAvailable: boolean,
): SearchStopReason {
  const needingCheck = itemsNeedingCheck(evidence);

  if (needingCheck.length === 0) {
    return 'search_not_needed';
  }

  if (!anyAvailable) {
    return 'non_material_result';
  }

  return 'material_question_answered';
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function combineNotes(existing: string | null, incoming: string): string | null {
  if (!existing) {
    return incoming;
  }
  if (existing === incoming) {
    return existing;
  }
  return `${existing} | ${incoming}`;
}

function appendSource(sources: readonly string[], toolRef?: string): string[] {
  if (!toolRef || sources.includes(toolRef)) {
    return [...sources];
  }
  return [...sources, toolRef];
}
