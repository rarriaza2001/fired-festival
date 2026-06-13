'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listReviews, type ReviewSummary } from '@/lib/api';
import { ThemedCard } from '@/components/ui/themed-card';
import { StaggeredList } from '@/components/ui/staggered-list';
import FadeContent from '@/components/ui/FadeContent';

function statusLabel(review: ReviewSummary): string {
  if (!review.terminalState) return 'In progress';
  if (
    review.terminalState === 'review_complete' ||
    review.terminalState === 'review_complete_limited'
  ) {
    return 'Review complete';
  }
  return 'In progress';
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '';
  }
}

export function RecentReviews() {
  const [reviews, setReviews] = useState<ReviewSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    listReviews()
      .then((data) => {
        if (active) setReviews(data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!loaded || reviews.length === 0) return null;

  return (
    <FadeContent delay={300} duration={500} triggerOnMount className="mt-6">
      <ThemedCard title="Recent reviews">
        <p className="hint mb-3 mt-0">
          Open any past run to replay its reasoning step by step.
        </p>
        <StaggeredList>
          {reviews.map((review) => (
            <div key={review.runId} className="border-t border-[var(--border)] first:border-t-0">
              <Link
                href={`/review/${review.runId}`}
                className="group flex flex-col gap-1.5 py-3 no-underline text-[var(--text)]"
              >
                <span className="text-sm leading-snug transition-colors group-hover:text-[var(--accent)]">
                  {review.inputPreview || '(no decision text)'}
                </span>
                <span className="flex flex-wrap items-center gap-2.5">
                  <span className="text-xs text-[var(--muted)]">{statusLabel(review)}</span>
                  <span className="ml-auto whitespace-nowrap text-xs text-[var(--muted)]">
                    {formatTime(review.createdAt)}
                  </span>
                </span>
              </Link>
            </div>
          ))}
        </StaggeredList>
      </ThemedCard>
    </FadeContent>
  );
}
