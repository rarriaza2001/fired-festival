import type { DecisionArtifact, EvidenceAssessment, MainCompetitor, RealityCheck } from '@dgb/shared';
import { isHttpUrl, MAIN_COMPETITOR_COUNT, validationSearchUrl } from '@dgb/shared';
import { ensureHttpValidation, collectValidationUrlPool } from './validation-links';

/** Resolve a displayable logo from a public website (Google favicon service). */
export function logoUrlForWebsite(website: string | null | undefined): string | null {
  if (!website?.trim()) {
    return null;
  }
  try {
    const normalized = website.startsWith('http') ? website : `https://${website}`;
    const host = new URL(normalized).hostname.replace(/^www\./, '');
    if (!host.includes('.')) {
      return null;
    }
    return `https://www.google.com/s2/favicons?domain=${host}&sz=128`;
  } catch {
    return null;
  }
}

function competitorKeywords(text: string): boolean {
  return /\b(competitor|competition|competing|incumbent|rival|market leader|alternative)\b/i.test(text);
}

function extractNameFromChallenge(text: string): string {
  const quoted = text.match(/["“]([^"”]{2,80})["”]/);
  if (quoted?.[1]) {
    return quoted[1];
  }
  const named = text.match(
    /\b([A-Z][A-Za-z0-9&.-]{1,40}(?:\s+[A-Z][A-Za-z0-9&.-]{1,40}){0,3})\b(?:\s+(?:has|have|is|are|controls|dominates|offers))/,
  );
  if (named?.[1]) {
    return named[1];
  }
  return 'Primary category incumbent';
}

function hostAsWebsite(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function enrichOne(base: MainCompetitor, pool: readonly string[]): MainCompetitor {
  const website =
    base.website ??
    (base.sources.find(isHttpUrl) ? hostAsWebsite(base.sources.find(isHttpUrl)!) : null);

  const sources = ensureHttpValidation(base.threat_summary, base.sources, pool);
  const logo_url = base.logo_url ?? logoUrlForWebsite(website);

  return {
    ...base,
    name: base.name.trim(),
    website,
    logo_url,
    sources,
  };
}

function inferFromRealityChecks(checks: readonly RealityCheck[]): MainCompetitor[] {
  const out: MainCompetitor[] = [];
  for (const check of checks) {
    if (!competitorKeywords(check.challenges)) {
      continue;
    }
    const url = check.sources.find(isHttpUrl);
    out.push({
      name: extractNameFromChallenge(check.challenges),
      website: url ? hostAsWebsite(url) : null,
      logo_url: null,
      threat_summary: check.challenges,
      sources: check.sources.filter(isHttpUrl),
    });
  }
  return out;
}

const FALLBACK_NAMES = [
  'Leading incumbent in this space',
  'Fast-growing challenger',
  'Adjacent category leader',
] as const;

const FALLBACK_SUMMARIES = [
  'An established player likely already owns customer trust, distribution, and pricing power in this category.',
  'A newer entrant may be undercutting on price or moving faster on product — validate who is gaining share.',
  'A neighboring category leader could bundle or cross-sell into your space before you establish a moat.',
] as const;

function fallbackCompetitor(
  artifact: DecisionArtifact | null,
  decisionText: string,
  slot: number,
): MainCompetitor {
  const focus = artifact?.decision.value ?? decisionText.slice(0, 120);
  const queries = [
    `${focus} market leader competitor`,
    `${focus} startup competitor`,
    `${focus} alternative incumbent`,
  ];
  const idx = Math.min(slot, FALLBACK_NAMES.length - 1);
  return {
    name: FALLBACK_NAMES[idx]!,
    website: null,
    logo_url: null,
    threat_summary: FALLBACK_SUMMARIES[idx]!,
    sources: [validationSearchUrl(queries[idx] ?? queries[0]!)],
  };
}

export interface CompetitorEnrichmentContext {
  readonly artifact: DecisionArtifact | null;
  readonly decisionText: string;
  readonly realityChecks: readonly RealityCheck[];
  readonly evidence: EvidenceAssessment;
  readonly urlPool: readonly string[];
}

function dedupeCandidates(candidates: readonly MainCompetitor[]): MainCompetitor[] {
  const seen = new Set<string>();
  const out: MainCompetitor[] = [];
  for (const c of candidates) {
    if (!c.name?.trim()) continue;
    const key = normalizeName(c.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** Ensure exactly MAIN_COMPETITOR_COUNT enriched, distinct competitors. */
export function enrichMainCompetitors(
  candidates: readonly MainCompetitor[] | null | undefined,
  ctx: CompetitorEnrichmentContext,
): MainCompetitor[] {
  const pool = ctx.urlPool.length
    ? ctx.urlPool
    : collectValidationUrlPool(ctx.evidence);

  let merged = dedupeCandidates([
    ...(candidates ?? []),
    ...inferFromRealityChecks(ctx.realityChecks),
  ]);

  if (merged.length === 0) {
    merged = [fallbackCompetitor(ctx.artifact, ctx.decisionText, 0)];
  }

  const enriched: MainCompetitor[] = [];
  const usedNames = new Set<string>();

  for (const candidate of merged) {
    if (enriched.length >= MAIN_COMPETITOR_COUNT) break;
    const one = enrichOne(candidate, pool);
    const key = normalizeName(one.name);
    if (usedNames.has(key)) continue;
    usedNames.add(key);
    enriched.push(one);
  }

  for (let slot = enriched.length; slot < MAIN_COMPETITOR_COUNT; slot += 1) {
    const filler = fallbackCompetitor(ctx.artifact, ctx.decisionText, slot);
    const one = enrichOne(filler, pool);
    const key = normalizeName(one.name);
    if (usedNames.has(key)) {
      one.name = `${one.name} (${slot + 1})`;
    }
    usedNames.add(normalizeName(one.name));
    enriched.push(one);
  }

  return enriched.slice(0, MAIN_COMPETITOR_COUNT);
}

/** @deprecated Use enrichMainCompetitors */
export function enrichMainCompetitor(
  candidate: MainCompetitor | null | undefined,
  ctx: CompetitorEnrichmentContext,
): MainCompetitor {
  return enrichMainCompetitors(candidate ? [candidate] : [], ctx)[0]!;
}
