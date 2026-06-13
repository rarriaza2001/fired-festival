'use client';

import type { ReactNode } from 'react';
import type { EvidenceItem, MainCompetitor } from '@dgb/shared';
import { isExternalEvidenceSource, isHttpUrl, isBaseRateNote } from '@dgb/shared';
import type { ReviewOutput } from '@/lib/api';
import { ThemedCard } from '@/components/ui/themed-card';
import FadeContent from '@/components/ui/FadeContent';
import GradientText from '@/components/ui/GradientText';

interface ReviewResultViewProps {
  output: ReviewOutput;
}

interface SectionProps {
  index: number;
  title: ReactNode;
  children?: ReactNode;
}

function Section({ index, title, children }: SectionProps) {
  return (
    <FadeContent triggerOnMount delay={index * 80} duration={450} className="result-section">
      <h3>{title}</h3>
      {children}
    </FadeContent>
  );
}

function linkLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Validate';
  }
}

function ValidationLinks({ sources }: { sources: readonly string[] }) {
  const urls = [...new Set(sources.filter(isHttpUrl))];
  if (urls.length === 0) return null;
  return (
    <div className="mt-1.5 text-xs">
      <span className="text-[var(--muted)]">Validate: </span>
      {urls.map((url) => (
        <a
          key={url}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mr-2 text-[var(--accent)] underline-offset-2 hover:text-[var(--detail)] hover:underline"
        >
          {linkLabel(url)} ↗
        </a>
      ))}
    </div>
  );
}

function CompetitorCard({ competitor }: { competitor: MainCompetitor }) {
  return (
    <div className="flex gap-4 rounded-xl border border-[var(--border)] bg-[var(--main-1)] p-4">
      {competitor.logo_url ? (
        <img
          src={competitor.logo_url}
          alt={`${competitor.name} logo`}
          width={56}
          height={56}
          className="h-14 w-14 shrink-0 rounded-lg bg-[var(--main-3)] object-contain p-1.5"
        />
      ) : (
        <div
          aria-hidden
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[var(--main-3)] text-lg font-semibold text-[var(--accent)]"
        >
          {competitor.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold text-[var(--text)]">{competitor.name}</p>
        {competitor.website ? (
          <a
            href={competitor.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--accent)] hover:text-[var(--detail)]"
          >
            {linkLabel(competitor.website)} ↗
          </a>
        ) : null}
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{competitor.threat_summary}</p>
        <ValidationLinks sources={competitor.sources} />
      </div>
    </div>
  );
}

function exteriorSources(item: EvidenceItem): readonly string[] {
  return item.sources.filter(isExternalEvidenceSource);
}

export function ReviewResultView({ output }: ReviewResultViewProps) {
  const outsideViewItems = output.evidence.items.filter((e) => isBaseRateNote(e.note));
  const insideViewItems = output.evidence.items.filter((e) => !isBaseRateNote(e.note));
  return (
    <ThemedCard
      title="Stress-test result"
      headingExtra={<span className="tag">Review complete</span>}
    >
      <Section index={0} title="1 · Your Hidden Assumptions">
        <ul className="list">
          {output.assumptions.map((a, i) => (
            <li key={i}>
              {a.statement}
              <ValidationLinks sources={a.sources} />
            </li>
          ))}
        </ul>
      </Section>

      <Section index={1} title="2 · Main Competitors">
        <div className="flex flex-col gap-4">
          {output.main_competitors.map((competitor, i) => (
            <CompetitorCard key={i} competitor={competitor} />
          ))}
        </div>
      </Section>

      <Section index={2} title="3 · Evidence assessment">
        <ul className="list">
          {insideViewItems.map((e, i) => {
            const sources = exteriorSources(e).length ? exteriorSources(e) : e.sources;
            return (
              <li key={i}>
                {e.statement}
                <ValidationLinks sources={sources} />
              </li>
            );
          })}
        </ul>
      </Section>

      <Section index={3} title="4 · Reality Checks">
        <ul className="list">
          {output.reality_checks.map((r, i) => (
            <li key={i}>
              {r.challenges}
              <ValidationLinks sources={r.sources} />
            </li>
          ))}
        </ul>
      </Section>

      <Section index={4} title="5 · Biggest Risks">
        <ul className="list">
          {output.failure_modes.map((f, i) => (
            <li key={i}>
              {f.if_condition} — {f.then_failure_path}
              <ValidationLinks sources={f.sources} />
            </li>
          ))}
        </ul>
      </Section>

      {outsideViewItems.length > 0 && (
        <Section index={5} title="6 · Outside view (base rates)">
          <ul className="list">
            {outsideViewItems.map((e, i) => {
              const sources = exteriorSources(e).length ? exteriorSources(e) : e.sources;
              return (
                <li key={i}>
                  {e.statement}
                  <ValidationLinks sources={sources} />
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section
        index={outsideViewItems.length > 0 ? 6 : 5}
        title={`${outsideViewItems.length > 0 ? 7 : 6} · Your next action`}
      >
        <div className="next-action">
          <GradientText
            colors={['#4ADE80', '#D4AF37', '#4ADE80']}
            animationSpeed={6}
            className="text-base font-semibold"
          >
            {output.next_action.primary_action}
          </GradientText>
          <ValidationLinks sources={output.next_action.sources} />
        </div>
      </Section>
    </ThemedCard>
  );
}
