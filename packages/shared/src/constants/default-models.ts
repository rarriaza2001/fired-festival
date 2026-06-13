import type { Provider } from './cost.js';

/**
 * Default BYOK model per provider when the client omits one. Tuned for deep
 * decision stress-testing (multi-stage audit, attachment triage, evidence gaps)
 * rather than low-latency chat.
 */
export const DEFAULT_MODEL_BY_PROVIDER: Readonly<Record<Provider, string>> = {
  anthropic: 'claude-opus-4-6',
  openai: 'gpt-4o',
  gemini: 'gemini-2.5-pro',
  grok: 'grok-3',
  local: 'local',
};

export const DEFAULT_PROVIDER: Provider = 'anthropic';

export function defaultModelForProvider(provider: Provider): string {
  return DEFAULT_MODEL_BY_PROVIDER[provider];
}
