'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  streamUrl,
  getReviewResult,
  type TraceEvent,
  type ReviewResult,
} from '@/lib/api';
import { TraceStream } from '@/components/trace-stream';
import { ReviewResultView } from '@/components/review-result';
import { FollowUpChat } from '@/components/followup-chat';
import { BrandTitle } from '@/components/layout/brand-title';
import { ThemedCard } from '@/components/ui/themed-card';
import FadeContent from '@/components/ui/FadeContent';
import { ContentContainer } from '@/components/layout/content-container';

const REVEAL_INTERVAL_MS = 220;

interface TerminalNotice {
  title: string;
  body: string;
  items: string[];
}

interface FollowUpCopy {
  heading: string;
  placeholder: string;
  submitLabel: string;
}

/** Chat-bar copy tuned to why the user is being asked for more input. */
function followUpCopy(terminalState: string | null): FollowUpCopy {
  if (terminalState === 'input_insufficient') {
    return {
      heading: 'Add the missing detail and run it again',
      placeholder: 'Answer the questions above or add the missing context…',
      submitLabel: 'Run updated review →',
    };
  }
  if (terminalState === 'unsupported_request') {
    return {
      heading: 'Reframe this as a concrete decision and try again',
      placeholder: 'Describe a specific, resource-intensive decision to stress-test…',
      submitLabel: 'Run updated review →',
    };
  }
  return {
    heading: 'Add context or push back, then re-run',
    placeholder: 'Add detail, challenge a finding, or refine the decision…',
    submitLabel: 'Re-run with this →',
  };
}

function terminalNotice(
  terminalState: string | null,
  events: TraceEvent[],
): TerminalNotice | null {
  if (terminalState === 'input_insufficient') {
    const ev = events.find((e) => e.event_name === 'clarification_requested');
    const details = (ev?.details ?? {}) as Record<string, unknown>;
    const items = Array.isArray(details.questions)
      ? details.questions.filter((q): q is string => typeof q === 'string')
      : [];
    return {
      title: 'More detail needed before a stress test',
      body: 'This decision is missing blocking information. Add the following, then submit again:',
      items,
    };
  }
  if (terminalState === 'unsupported_request') {
    const ev = events.find((e) => e.event_name === 'guardrail_triggered');
    const details = (ev?.details ?? {}) as Record<string, unknown>;
    const body =
      typeof details.explanation === 'string'
        ? details.explanation
        : 'This request is not a concrete, resource-intensive decision I can stress-test.';
    return { title: 'Not a reviewable decision', body, items: [] };
  }
  return null;
}

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'live' | 'replay'>('live');

  useEffect(() => {
    let cancelled = false;
    const queue: TraceEvent[] = [];
    const seen = new Set<string>();
    let streamClosed = false;
    let finished = false;
    let pendingResult: ReviewResult | null = null;
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    function finish(): void {
      if (finished || cancelled) return;
      finished = true;
      setDone(true);
      if (pendingResult) {
        setResult(pendingResult);
        return;
      }
      getReviewResult(id)
        .then((r) => {
          if (!cancelled) {
            pendingResult = r;
            setResult(r);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : 'Failed to load result.');
          }
        });
    }

    function tick(): void {
      const next = queue.shift();
      if (next) {
        // Dedupe by event_id at the state level: in dev, React StrictMode mounts
        // the effect twice (each with its own local `seen`), so the same event
        // can be queued by both mounts — guard here so it renders only once.
        setEvents((prev) =>
          prev.some((e) => e.event_id === next.event_id) ? prev : [...prev, next],
        );
        if (next.event_name === 'run_completed' || next.event_name === 'run_failed') {
          finish();
        }
        return;
      }
      if (streamClosed && !finished) finish();
    }

    function openStream(): void {
      source = new EventSource(streamUrl(id));
      source.onmessage = (e: MessageEvent) => {
        try {
          const ev = JSON.parse(e.data) as TraceEvent;
          if (seen.has(ev.event_id)) return;
          seen.add(ev.event_id);
          queue.push(ev);
        } catch {
          // Ignore malformed frames.
        }
      };
      source.onerror = () => {
        if (source && source.readyState === EventSource.CLOSED) {
          streamClosed = true;
        }
      };
    }

    getReviewResult(id)
      .then((r) => {
        if (cancelled) return;
        if (r.terminalState) {
          setMode('replay');
          pendingResult = r;
        }
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        openStream();
        timer = setInterval(tick, REVEAL_INTERVAL_MS);
      });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (source) source.close();
    };
  }, [id]);

  const output = result?.output ?? null;
  const failed =
    result?.terminalState === 'failed' ||
    events.some((e) => e.event_name === 'run_failed');
  const notice =
    done && !output && !failed
      ? terminalNotice(result?.terminalState ?? null, events)
      : null;

  return (
    <ContentContainer className="pb-20 pt-8">
      <BrandTitle size="sm" />
      <p className="mb-6 mt-1">
        <Link href="/" className="text-[var(--accent)] hover:text-[var(--detail)]">
          ← New review
        </Link>
      </p>

      <TraceStream events={events} done={done} mode={mode} />

      {error ? <p className="error">{error}</p> : null}

      {done && failed && !output ? (
        <ThemedCard>
          <p className="error m-0">
            This review ended in a failed state. Check your API key and model, then
            try again.
          </p>
        </ThemedCard>
      ) : null}

      {notice ? (
        <FadeContent triggerOnMount duration={500}>
          <ThemedCard title={notice.title}>
            <p>{notice.body}</p>
            {notice.items.length > 0 ? (
              <ul className="list">
                {notice.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </ThemedCard>
          {result ? (
            <FollowUpChat
              originalText={result.inputText}
              contextItems={result.contextItems}
              {...followUpCopy(result.terminalState)}
            />
          ) : null}
        </FadeContent>
      ) : null}

      {output ? <ReviewResultView output={output} /> : null}

      {output && result ? (
        <div className="mt-6">
          <FollowUpChat
            originalText={result.inputText}
            contextItems={result.contextItems}
            {...followUpCopy(result.terminalState)}
          />
        </div>
      ) : null}
    </ContentContainer>
  );
}
