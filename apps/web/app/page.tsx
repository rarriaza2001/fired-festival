'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { startReview, type ProviderConfig } from '@/lib/api';
import { loadProvider, saveProvider } from '@/lib/storage';
import { assertContextWithinLimit, resolveContextItems } from '@/lib/context-submit';
import { RecentReviews } from '@/components/recent-reviews';
import { HeroSection } from '@/components/layout/hero-section';
import { ContentContainer } from '@/components/layout/content-container';
import { DEFAULT_MODEL_BY_PROVIDER, DEFAULT_PROVIDER } from '@dgb/shared';
import type { ContextItem } from '@dgb/shared';
import type { PendingContextItem } from '@/components/context-attachments';

export default function HomePage() {
  const router = useRouter();
  const [provider, setProvider] = useState<ProviderConfig>({
    providerName: DEFAULT_PROVIDER,
    model: DEFAULT_MODEL_BY_PROVIDER[DEFAULT_PROVIDER],
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProvider(loadProvider());
  }, []);

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
    saveProvider(provider);
    setSubmitting(true);
    try {
      const resolved = await resolveContextItems(contextItems, pendingFiles, provider);
      assertContextWithinLimit(resolved);
      const runId = await startReview(text.trim(), provider, resolved);
      router.push(`/review/${runId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start the review.');
      setSubmitting(false);
    }
  }

  return (
    <>
      <HeroSection
        provider={provider}
        onProviderChange={setProvider}
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
