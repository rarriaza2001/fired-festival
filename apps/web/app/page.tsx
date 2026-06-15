'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FIXED_PROVIDER_CONFIG, startReview } from '@/lib/api';
import { assertContextWithinLimit, resolveContextItems } from '@/lib/context-submit';
import { RecentReviews } from '@/components/recent-reviews';
import { HeroSection } from '@/components/layout/hero-section';
import { ContentContainer } from '@/components/layout/content-container';
import type { ContextItem } from '@dgb/shared';
import type { PendingContextItem } from '@/components/context-attachments';

export default function HomePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(
    text: string,
    contextItems: ContextItem[],
    pendingFiles: PendingContextItem[],
  ): Promise<void> {
    setError(null);
    if (!text.trim()) {
      setError('Describe the decision you want stress-tested.');
      return;
    }
    setSubmitting(true);
    try {
      const resolved = await resolveContextItems(contextItems, pendingFiles, FIXED_PROVIDER_CONFIG);
      assertContextWithinLimit(resolved);
      const runId = await startReview(text.trim(), FIXED_PROVIDER_CONFIG, resolved);
      router.push(`/review/${runId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start the review.');
      setSubmitting(false);
    }
  }

  return (
    <>
      <HeroSection
        onSubmit={onSubmit}
        submitting={submitting}
        error={error}
      />
      <ContentContainer className="pb-20 pt-4">
        <RecentReviews />
      </ContentContainer>
    </>
  );
}
