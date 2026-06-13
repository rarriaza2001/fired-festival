import { BadRequestException } from '@nestjs/common';
import { PROVIDERS, type Provider } from '@dgb/shared';
import { loadEnv } from './env';

const SERVER_CONFIGURED_PROVIDERS = ['anthropic', 'openai'] as const satisfies readonly Provider[];
export type ServerConfiguredProvider = (typeof SERVER_CONFIGURED_PROVIDERS)[number];

export function isServerConfiguredProvider(name: string): name is ServerConfiguredProvider {
  return (SERVER_CONFIGURED_PROVIDERS as readonly string[]).includes(name);
}

/** Resolve the server-side API key for anthropic or openai. Never logged or persisted. */
export function resolveServerApiKey(provider: ServerConfiguredProvider): string {
  const env = loadEnv();
  const key =
    provider === 'anthropic' ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY;
  if (!key) {
    throw new BadRequestException(
      `${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} is not configured on the server (set ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} in apps/api/.env).`,
    );
  }
  return key;
}

export function resolveProvider(name: string | undefined): ServerConfiguredProvider {
  const candidate = (name ?? 'anthropic').toLowerCase();
  if (!isServerConfiguredProvider(candidate)) {
    throw new BadRequestException(
      `Unsupported provider: ${name}. Use anthropic or openai.`,
    );
  }
  if (!PROVIDERS.includes(candidate)) {
    throw new BadRequestException(`Unsupported provider: ${name}`);
  }
  return candidate;
}
