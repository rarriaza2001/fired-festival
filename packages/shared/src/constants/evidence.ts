// Phase 2 / Phase 3 Step 8 — Evidence contract.
// Separate claims, evidence, assumptions, speculation, and missing support.
// Source trust and evidence strength are classified SEPARATELY.

/** What kind of support a statement actually provides. */
export const EVIDENCE_KINDS = [
  'user_claim',
  'evidence',
  'assumption',
  'speculation',
  'missing_support',
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** Evidence assessment state (Phase 2J / Phase 8 error taxonomy). */
export const EVIDENCE_STATES = [
  'assessed',
  'provided_but_unassessed',
  'external_check_needed',
  'external_check_completed',
  'external_check_unavailable',
  'evidence_state_unknown',
] as const;
export type EvidenceState = (typeof EVIDENCE_STATES)[number];

/** Source trust classification (separate from strength). */
export const SOURCE_TRUST_LEVELS = [
  'high_trust',
  'medium_trust',
  'low_trust',
  'unverified',
  'anecdotal',
] as const;
export type SourceTrustLevel = (typeof SOURCE_TRUST_LEVELS)[number];

/** Evidence strength classification (separate from source trust). */
export const EVIDENCE_STRENGTHS = ['strong', 'moderate', 'weak', 'none'] as const;
export type EvidenceStrength = (typeof EVIDENCE_STRENGTHS)[number];


/** Source labels that reflect model training — omit from user-facing citations. */
export const INTERNAL_EVIDENCE_SOURCE_MARKERS = [
  'domain knowledge',
  'base rates',
  'model assessment',
  'internal reasoning',
  'training data',
] as const;

/** True when a citation is exterior (web URL, attachment) — not model training. */
export function isExternalEvidenceSource(source: string): boolean {
  const trimmed = source.trim();
  if (!trimmed) {
    return false;
  }
  const lower = trimmed.toLowerCase();
  if (INTERNAL_EVIDENCE_SOURCE_MARKERS.some((m) => lower.includes(m))) {
    return false;
  }
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    return true;
  }
  if (lower.startsWith('attachment:')) {
    return true;
  }
  if (/^[\w-]+(\.[\w-]+)+(\/[\w\-./?#=&%+:]*)?$/i.test(trimmed)) {
    return true;
  }
  return lower.includes('external check: http');
}


/** Fallback exterior link when no authoritative URL was retrieved. */
export function validationSearchUrl(query: string): string {
  const q = query.trim().slice(0, 200);
  return `https://search.brave.com/search?q=${encodeURIComponent(q)}`;
}

export function isHttpUrl(source: string): boolean {
  const t = source.trim();
  return t.startsWith('http://') || t.startsWith('https://');
}


/**
 * Note prefix marking an evidence item as an outside-view / reference-class base
 * rate (Kahneman's outside view; Tetlock's reference-class forecasting). The
 * `base_rate` tool writes this prefix; the UI keys off it to surface a dedicated
 * "Outside view" section.
 */
export const BASE_RATE_NOTE_PREFIX = 'Outside view — reference-class base rate';

/** True when an evidence item's note marks it as an outside-view base rate. */
export function isBaseRateNote(note: string | null | undefined): boolean {
  return typeof note === 'string' && note.includes(BASE_RATE_NOTE_PREFIX);
}
