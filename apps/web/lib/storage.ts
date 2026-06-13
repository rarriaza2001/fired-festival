import type { ProviderConfig } from './api';
import { DEFAULT_MODEL_BY_PROVIDER, DEFAULT_PROVIDER } from '@dgb/shared';

const STORAGE_KEY = 'dgb.provider';

function normalizeAnthropicModel(model: string | undefined): string {
  const current = DEFAULT_MODEL_BY_PROVIDER.anthropic;
  if (!model?.trim()) return current;
  const normalized = model.trim().toLowerCase();
  if (normalized === current) return current;
  const legacyOrWeak =
    normalized.includes('haiku') ||
    normalized.includes('sonnet') ||
    normalized.startsWith('claude-3') ||
    normalized === 'claude-opus-4-6' ||
    normalized.includes('instant');
  return legacyOrWeak ? current : model.trim();
}

function normalizeStoredProvider(parsed: Partial<ProviderConfig>): ProviderConfig {
  const providerName = parsed.providerName === 'anthropic' ? 'anthropic' : DEFAULT_PROVIDER;
  const defaultModel =
    providerName === 'anthropic'
      ? DEFAULT_MODEL_BY_PROVIDER.anthropic
      : DEFAULT_MODEL_BY_PROVIDER.openai;
  const model =
    providerName === 'anthropic'
      ? normalizeAnthropicModel(parsed.model)
      : (parsed.model?.trim() || defaultModel);
  return { providerName, model };
}

const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  providerName: DEFAULT_PROVIDER,
  model: DEFAULT_MODEL_BY_PROVIDER[DEFAULT_PROVIDER],
};

export function loadProvider(): ProviderConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_PROVIDER_CONFIG };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROVIDER_CONFIG };
    const parsed = JSON.parse(raw) as Partial<ProviderConfig>;
    return { ...DEFAULT_PROVIDER_CONFIG, ...normalizeStoredProvider(parsed) };
  } catch {
    return { ...DEFAULT_PROVIDER_CONFIG };
  }
}

export function saveProvider(config: ProviderConfig): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export const loadByok = loadProvider;
export const saveByok = saveProvider;
