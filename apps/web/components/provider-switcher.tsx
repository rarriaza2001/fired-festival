'use client';

import { defaultModelForProvider, type Provider } from '@dgb/shared';
import type { ProviderConfig } from '@/lib/api';

const SWITCHABLE_PROVIDERS = ['anthropic', 'openai'] as const satisfies readonly Provider[];

interface ProviderSwitcherProps {
  value: ProviderConfig;
  onChange: (next: ProviderConfig) => void;
}

function AnthropicMark({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={`h-4 w-4 ${active ? 'text-[#D4A574]' : 'text-[var(--muted)]'}`}
      fill="currentColor"
    >
      <path d="M12 2 3 20h3.5l1.4-3.5h8.2l1.4 3.5H21L12 2zm0 6.2 2.8 7H9.2L12 8.2z" />
    </svg>
  );
}

function OpenAiMark({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={`h-4 w-4 ${active ? 'text-[#10A37F]' : 'text-[var(--muted)]'}`}
      fill="currentColor"
    >
      <path d="M12 2a7.5 7.5 0 0 0-2.4 14.6 6 6 0 0 0 .8-2.4c0-2.2 1.8-4 4-4a4 4 0 0 1 3.1 6.5A7.5 7.5 0 1 0 12 2zm-1 8.5a2.5 2.5 0 1 1 5 0 2.5 2.5 0 0 1-5 0z" />
    </svg>
  );
}

function providerLabel(name: Provider): string {
  return name === 'anthropic' ? 'Claude' : 'OpenAI';
}

export function ProviderSwitcher({ value, onChange }: ProviderSwitcherProps) {
  function select(providerName: Provider): void {
    if (providerName === value.providerName) return;
    onChange({
      providerName,
      model: defaultModelForProvider(providerName),
    });
  }

  return (
    <div
      className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--main-1)] p-1"
      role="group"
      aria-label="Choose AI provider"
    >
      {SWITCHABLE_PROVIDERS.map((provider) => {
        const active = value.providerName === provider;
        return (
          <button
            key={provider}
            type="button"
            onClick={() => select(provider)}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? 'bg-[var(--main-2)] text-[var(--text)] ring-1 ring-[var(--accent-muted)]'
                : 'text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            {provider === 'anthropic' ? (
              <AnthropicMark active={active} />
            ) : (
              <OpenAiMark active={active} />
            )}
            <span>{providerLabel(provider)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ProviderBadge({ providerName }: { providerName: string }) {
  const isAnthropic = providerName === 'anthropic';
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--main-1)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]"
      title={isAnthropic ? 'Using Claude (Anthropic)' : 'Using OpenAI'}
    >
      {isAnthropic ? <AnthropicMark active /> : <OpenAiMark active />}
      {providerLabel(isAnthropic ? 'anthropic' : 'openai')}
    </span>
  );
}
