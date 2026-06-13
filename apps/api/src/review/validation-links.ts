import type {
  Assumption,
  EvidenceAssessment,
  EvidenceItem,
  FailureMode,
  NextAction,
  RealityCheck,
} from '@dgb/shared';
import {
  isExternalEvidenceSource,
  isHttpUrl,
  validationSearchUrl,
} from '@dgb/shared';
import { semanticSimilarity } from './text-similarity';
import type { ReviewSectionBundle } from './output-dedup';

export interface ValidationLinkContext {
  readonly ingestedLinkUrls?: readonly string[];
}

function uniqueHttpUrls(sources: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of sources) {
    if (!isHttpUrl(s)) continue;
    const key = s.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function collectValidationUrlPool(
  evidence: EvidenceAssessment,
  ingestedLinkUrls: readonly string[] = [],
): readonly string[] {
  const urls = new Set<string>();
  for (const item of evidence.items) {
    for (const s of item.sources) {
      if (isHttpUrl(s)) urls.add(s.trim());
    }
  }
  for (const u of ingestedLinkUrls) {
    if (isHttpUrl(u)) urls.add(u.trim());
  }
  return [...urls];
}

function bestPoolUrl(text: string, pool: readonly string[]): string | null {
  if (pool.length === 0) return null;
  let best = pool[0]!;
  let bestScore = semanticSimilarity(text, best);
  for (let i = 1; i < pool.length; i += 1) {
    const candidate = pool[i]!;
    const score = semanticSimilarity(text, candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

export function ensureHttpValidation(text: string, sources: readonly string[], pool: readonly string[]): string[] {
  const http = uniqueHttpUrls(sources);
  if (http.length > 0) {
    return http;
  }
  const fromPool = bestPoolUrl(text, pool);
  if (fromPool) {
    return [fromPool];
  }
  return [validationSearchUrl(text)];
}

function ensureEvidenceItemSources(item: EvidenceItem, pool: readonly string[]): EvidenceItem {
  const exterior = item.sources.filter(isExternalEvidenceSource);
  const http = ensureHttpValidation(item.statement, exterior, pool);
  return { ...item, sources: http };
}

function ensureAssumptionSources(a: Assumption, pool: readonly string[]): Assumption {
  return { ...a, sources: ensureHttpValidation(a.statement, a.sources, pool) };
}

function ensureRealitySources(r: RealityCheck, pool: readonly string[]): RealityCheck {
  return { ...r, sources: ensureHttpValidation(r.challenges, r.sources, pool) };
}

function ensureFailureSources(f: FailureMode, pool: readonly string[]): FailureMode {
  const text = `${f.if_condition} ${f.then_failure_path}`;
  return { ...f, sources: ensureHttpValidation(text, f.sources, pool) };
}

export function ensureValidationLinks(
  bundle: ReviewSectionBundle,
  nextAction: NextAction,
  context: ValidationLinkContext = {},
): { bundle: ReviewSectionBundle; nextAction: NextAction } {
  const pool = collectValidationUrlPool(bundle.evidence, context.ingestedLinkUrls ?? []);

  const evidence: EvidenceAssessment = {
    ...bundle.evidence,
    items: bundle.evidence.items.map((i) => ensureEvidenceItemSources(i, pool)),
  };

  const refreshedPool = collectValidationUrlPool(evidence, context.ingestedLinkUrls ?? []);

  return {
    bundle: {
      assumptions: bundle.assumptions.map((a) => ensureAssumptionSources(a, refreshedPool)),
      evidence,
      reality_checks: bundle.reality_checks.map((r) => ensureRealitySources(r, refreshedPool)),
      failure_modes: bundle.failure_modes.map((f) => ensureFailureSources(f, refreshedPool)),
    },
    nextAction: {
      ...nextAction,
      sources: ensureHttpValidation(
        `${nextAction.primary_action} ${nextAction.target}`,
        nextAction.sources,
        refreshedPool,
      ),
    },
  };
}
