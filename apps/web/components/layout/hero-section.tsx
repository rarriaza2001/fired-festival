'use client';

import { memo, useState, type FormEvent } from 'react';
import { BrandTitle } from '@/components/layout/brand-title';
import type { ContextItem } from '@dgb/shared';
import {
  ContextAttachments,
  type PendingContextItem,
} from '@/components/context-attachments';
import BlurText from '@/components/ui/BlurText';
import DecryptedText from '@/components/ui/DecryptedText';
import StarBorder from '@/components/ui/StarBorder';
import Threads from '@/components/ui/Threads';
import FadeContent from '@/components/ui/FadeContent';

const HERO_THREADS_COLOR: [number, number, number] = [0.83, 0.69, 0.22];

const HeroThreadsBackground = memo(function HeroThreadsBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 opacity-50">
      <Threads
        color={HERO_THREADS_COLOR}
        amplitude={1.2}
        distance={0.15}
        enableMouseInteraction
      />
    </div>
  );
});

interface HeroDecisionFormProps {
  onSubmit: (text: string, contextItems: ContextItem[], pendingFiles: PendingContextItem[]) => void | Promise<void>;
  submitting: boolean;
  error: string | null;
}

function HeroDecisionForm({
  onSubmit,
  submitting,
  error,
}: HeroDecisionFormProps) {
  const [text, setText] = useState('');
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingContextItem[]>([]);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    await onSubmit(text, contextItems, pendingFiles);
  }

  return (
    <FadeContent triggerOnMount delay={200} duration={600} className="w-full">
      <form onSubmit={handleSubmit} className="w-full">
        <div className="w-full rounded-[20px] border border-[var(--accent-muted)] bg-[var(--main-2)] shadow-[0_0_40px_rgba(212,175,55,0.08)]">
          <div className="relative w-full p-4 md:p-5">
            <label htmlFor="decision" className="sr-only">
              What decision do you want to check?
            </label>
            <textarea
              id="decision"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="Describe your startup idea…"
              className="chat-bar-input min-h-[88px] resize-none border-0 bg-transparent text-base leading-relaxed shadow-none focus:ring-0 md:text-lg"
            />
            <ContextAttachments
              items={contextItems}
              pendingFiles={pendingFiles}
              onItemsChange={setContextItems}
              onPendingFilesChange={setPendingFiles}
              disabled={submitting}
            />
            <div className="mt-3 flex justify-end border-t border-[var(--border)] pt-3">
              <StarBorder
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-50"
                color="#D4AF37"
              >
                {submitting ? 'Starting review…' : 'Review this decision →'}
              </StarBorder>
            </div>
          </div>
        </div>
        {error ? <p className="error mt-3 text-center">{error}</p> : null}
      </form>
    </FadeContent>
  );
}

interface HeroSectionProps {
  onSubmit: (text: string, contextItems: ContextItem[], pendingFiles: PendingContextItem[]) => void | Promise<void>;
  submitting: boolean;
  error: string | null;
}

export function HeroSection({
  onSubmit,
  submitting,
  error,
}: HeroSectionProps) {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-5 py-16">
      <HeroThreadsBackground />

      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[var(--main-0)] to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[var(--main-0)] to-transparent" />

      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3">
          <BrandTitle size="lg" centered />
          <BlurText
            text="Stress-test your startup ideas before you commit resources."
            delay={60}
            animateBy="words"
            direction="bottom"
            className="max-w-xl justify-center text-center text-base text-[var(--muted)] md:text-lg"
          />
          <DecryptedText
            text="Bounded skeptical review"
            animateOn="view"
            speed={40}
            maxIterations={12}
            className="text-center font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--accent-muted)]"
          />
        </div>

        <HeroDecisionForm
          onSubmit={onSubmit}
          submitting={submitting}
          error={error}
        />
      </div>
    </section>
  );
}
