import type {
  Assumption,
  ContextItem,
  EvidenceAssessment,
  EvidenceItem,
  FailureMode,
  IngestedContextItem,
  RealityCheck,
} from '@dgb/shared';
import { chunkUserContext, isSemanticallySimilar } from './text-similarity';

const MIN_ASSUMPTIONS = 1;
const MIN_EVIDENCE_ITEMS = 1;
const MIN_REALITY_CHECKS = 1;
const MIN_FAILURE_MODES = 1;

/** Semantic overlap at or above this drops the shorter duplicate. */
const SIMILARITY_THRESHOLD = 0.58;

/** Stricter threshold when comparing output to user-provided text. */
const USER_CONTEXT_THRESHOLD = 0.52;

export interface ReviewSectionBundle {
  readonly assumptions: readonly Assumption[];
  readonly evidence: EvidenceAssessment;
  readonly reality_checks: readonly RealityCheck[];
  readonly failure_modes: readonly FailureMode[];
}

export interface DedupeOptions {
  /** User decision text + ingested excerpts — drop output that repeats these. */
  readonly userContextLines?: readonly string[];
}

interface IndexedLine {
  readonly section: 'assumptions' | 'evidence' | 'reality_checks' | 'failure_modes';
  readonly index: number;
  readonly text: string;
}

const SECTION_DROP_PRIORITY: Record<IndexedLine['section'], number> = {
  assumptions: 0,
  evidence: 1,
  reality_checks: 2,
  failure_modes: 3,
};

function pickLoser(a: IndexedLine, b: IndexedLine): IndexedLine {
  if (a.text.length !== b.text.length) {
    return a.text.length >= b.text.length ? b : a;
  }
  return SECTION_DROP_PRIORITY[a.section] <= SECTION_DROP_PRIORITY[b.section] ? a : b;
}

function isSimilar(a: string, b: string, threshold = SIMILARITY_THRESHOLD): boolean {
  return isSemanticallySimilar(a, b, threshold);
}

function assumptionText(a: Assumption): string {
  return a.statement;
}

function failureText(f: FailureMode): string {
  return `${f.if_condition} ${f.then_failure_path} ${f.causing_impact}`;
}

function collectLines(bundle: ReviewSectionBundle): IndexedLine[] {
  const lines: IndexedLine[] = [];
  bundle.assumptions.forEach((a, index) => {
    lines.push({ section: 'assumptions', index, text: assumptionText(a) });
  });
  bundle.evidence.items.forEach((e, index) => {
    lines.push({ section: 'evidence', index, text: e.statement });
  });
  bundle.reality_checks.forEach((r, index) => {
    lines.push({ section: 'reality_checks', index, text: r.challenges });
  });
  bundle.failure_modes.forEach((f, index) => {
    lines.push({ section: 'failure_modes', index, text: failureText(f) });
  });
  return lines;
}

function minFor(section: IndexedLine['section']): number {
  switch (section) {
    case 'assumptions':
      return MIN_ASSUMPTIONS;
    case 'evidence':
      return MIN_EVIDENCE_ITEMS;
    case 'reality_checks':
      return MIN_REALITY_CHECKS;
    case 'failure_modes':
      return MIN_FAILURE_MODES;
  }
}

function markUserContextDuplicates(
  lines: readonly IndexedLine[],
  userContextLines: readonly string[],
): Set<string> {
  const drop = new Set<string>();
  const key = (line: IndexedLine): string => `${line.section}:${line.index}`;
  if (userContextLines.length === 0) {
    return drop;
  }
  for (const line of lines) {
    for (const userLine of userContextLines) {
      if (isSimilar(line.text, userLine, USER_CONTEXT_THRESHOLD)) {
        drop.add(key(line));
        break;
      }
    }
  }
  return drop;
}

/**
 * Drop near-duplicate lines across assumptions, evidence, reality checks, and
 * failure modes. Uses semantic similarity (TF-IDF cosine + trigram Jaccard).
 * Also drops lines that substantially repeat user-provided context.
 */
export function dedupeReviewSections(
  bundle: ReviewSectionBundle,
  options: DedupeOptions = {},
): ReviewSectionBundle {
  const lines = collectLines(bundle);
  const drop = new Set<string>();
  const key = (line: IndexedLine): string => `${line.section}:${line.index}`;

  for (const userKey of markUserContextDuplicates(lines, options.userContextLines ?? [])) {
    drop.add(userKey);
  }

  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      const a = lines[i]!;
      const b = lines[j]!;
      if (!isSimilar(a.text, b.text)) {
        continue;
      }
      const loser = pickLoser(a, b);
      drop.add(key(loser));
    }
  }

  const countKept = (section: IndexedLine['section']): number =>
    lines.filter((l) => l.section === section && !drop.has(key(l))).length;

  for (const line of lines) {
    if (!drop.has(key(line))) {
      continue;
    }
    if (countKept(line.section) <= minFor(line.section)) {
      drop.delete(key(line));
    }
  }

  const keepIndex = (section: IndexedLine['section'], index: number): boolean =>
    !drop.has(`${section}:${index}`);

  return {
    assumptions: bundle.assumptions.filter((_, i) => keepIndex('assumptions', i)),
    evidence: {
      ...bundle.evidence,
      items: bundle.evidence.items.filter((_, i) => keepIndex('evidence', i)),
    },
    reality_checks: bundle.reality_checks.filter((_, i) => keepIndex('reality_checks', i)),
    failure_modes: bundle.failure_modes.filter((_, i) => keepIndex('failure_modes', i)),
  };
}

function httpUrlFromRef(ref: string): string | null {
  const trimmed = ref.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return null;
}

function evidenceAlreadyCoversUrl(items: readonly EvidenceItem[], url: string): boolean {
  const normalized = url.toLowerCase();
  return items.some(
    (item) =>
      item.sources.some((s) => s.toLowerCase() === normalized) ||
      item.statement.toLowerCase().includes(normalized),
  );
}

function linkInvestigationItem(label: string, url: string): EvidenceItem {
  return {
    statement: `User-submitted link "${label}": verify factual claims against live page content`,
    kind: 'evidence',
    state: 'external_check_needed',
    source_trust: 'unverified',
    strength: 'none',
    note: `Fetch and analyze ${url}`,
    sources: [url],
  };
}

/**
 * Queue a live fetch for each user-submitted website link not already covered.
 */
export function ensureUserLinkInvestigation(
  evidence: EvidenceAssessment,
  contextItems: readonly ContextItem[],
  ingestedItems: readonly IngestedContextItem[] = [],
): EvidenceAssessment {
  const linkRefs = new Map<string, string>();
  for (const item of contextItems) {
    if (item.kind !== 'link') continue;
    const url = httpUrlFromRef(item.ref);
    if (url) linkRefs.set(url, item.label);
  }
  for (const item of ingestedItems) {
    if (item.kind !== 'link') continue;
    const url = httpUrlFromRef(item.ref);
    if (url && !linkRefs.has(url)) linkRefs.set(url, item.label);
  }

  if (linkRefs.size === 0) {
    return evidence;
  }

  const additions: EvidenceItem[] = [];
  for (const [url, label] of linkRefs) {
    if (evidenceAlreadyCoversUrl(evidence.items, url)) continue;
    additions.push(linkInvestigationItem(label, url));
  }

  if (additions.length === 0) {
    return evidence;
  }

  return {
    ...evidence,
    items: [...evidence.items, ...additions],
  };
}

export function ensureExternalInvestigation(evidence: EvidenceAssessment): EvidenceAssessment {
  const hasPending = evidence.items.some((i) => i.state === 'external_check_needed');
  if (hasPending) {
    return evidence;
  }

  const candidate =
    evidence.items.find((i) => i.kind === 'evidence' || i.kind === 'assumption') ??
    evidence.items[0];
  if (!candidate) {
    return evidence;
  }

  return {
    ...evidence,
    items: evidence.items.map((i) =>
      i.statement === candidate.statement
        ? { ...i, state: 'external_check_needed' as const }
        : i,
    ),
  };
}

/** Build user-context lines for dedup from decision text and ingested attachments. */
export function buildUserContextLines(
  decisionText: string,
  ingestedItems: readonly IngestedContextItem[] = [],
): string[] {
  const lines = [...chunkUserContext(decisionText)];
  for (const item of ingestedItems) {
    if (item.excerpt) {
      lines.push(...chunkUserContext(item.excerpt, 400));
    }
    if (item.extracted_text && item.kind === 'link') {
      lines.push(...chunkUserContext(item.extracted_text.slice(0, 8_000), 400));
    }
  }
  return lines;
}
