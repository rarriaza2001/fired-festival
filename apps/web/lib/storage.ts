import type { ProviderConfig } from './api';
import { DEFAULT_MODEL_BY_PROVIDER, DEFAULT_PROVIDER } from '@dgb/shared';

const STORAGE_KEY = 'dgb.provider';

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
    return { ...DEFAULT_PROVIDER_CONFIG, ...parsed };
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
