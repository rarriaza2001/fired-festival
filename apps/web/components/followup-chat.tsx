'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { FIXED_PROVIDER_CONFIG, startReview, type ContextItem } from '@/lib/api';
import { buildFollowUp } from '@/lib/followup';
import { assertContextWithinLimit, resolveContextItems } from '@/lib/context-submit';
import {
  ContextAttachments,
  type PendingContextItem,
} from '@/components/context-attachments';
import StarBorder from '@/components/ui/StarBorder';
import FadeContent from '@/components/ui/FadeContent';

interface FollowUpChatProps {
  originalText: string;
  contextItems: ContextItem[];
  heading?: string;
  placeholder?: string;
  submitLabel?: string;
}

export function FollowUpChat({
  originalText,
  contextItems,
  heading = 'Add detail and run it again',
  placeholder = 'Add the missing context or elaborate on your decision…',
  submitLabel = 'Run updated review →',
}: FollowUpChatProps) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [newLinks, setNewLinks] = useState<ContextItem[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingContextItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    if (!message.trim()) {
      setError('Add the detail you want included before running again.');
      return;
    }
    setSubmitting(true);
    try {
      const uploaded = await resolveContextItems(newLinks, pendingFiles, FIXED_PROVIDER_CONFIG);
      const followUp = buildFollowUp(originalText, contextItems, message.trim(), uploaded);
      assertContextWithinLimit(followUp.contextItems);
      const runId = await startReview(followUp.text, FIXED_PROVIDER_CONFIG, followUp.contextItems);
      router.push(`/review/${runId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start the review.');
      setSubmitting(false);
    }
  }

  return (
    <FadeContent triggerOnMount duration={400} className="w-full">
      <form onSubmit={onSubmit} className="w-full">
        <div className="w-full rounded-[20px] border border-[var(--accent-muted)] bg-[var(--main-2)] shadow-[0_0_40px_rgba(212,175,55,0.08)]">
          <div className="relative w-full p-4 md:p-5">
            <p className="mb-2 text-sm font-medium text-[var(--detail)]">{heading}</p>
            <label htmlFor="followup" className="sr-only">
              {heading}
            </label>
            <textarea
              id="followup"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder={placeholder}
              className="chat-bar-input min-h-[88px] resize-none border-0 bg-transparent text-base leading-relaxed shadow-none focus:ring-0 md:text-lg"
            />
            <ContextAttachments
              items={newLinks}
              pendingFiles={pendingFiles}
              onItemsChange={setNewLinks}
              onPendingFilesChange={setPendingFiles}
              existingItems={contextItems}
              readOnlyExisting
              disabled={submitting}
            />
            <div className="mt-3 flex justify-end border-t border-[var(--border)] pt-3">
              <StarBorder
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-50"
                color="#D4AF37"
              >
                {submitting ? 'Starting review…' : submitLabel}
              </StarBorder>
            </div>
          </div>
        </div>
        {error ? <p className="error mt-3">{error}</p> : null}
      </form>
    </FadeContent>
  );
}
