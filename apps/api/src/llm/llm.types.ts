import type { CostAccuracy } from '@dgb/shared';
import type { ProviderName } from '../providers/provider.types';

/**
 * Provider call descriptor. The apiKey originates client-side, arrives per-request,
 * and is NEVER persisted, logged, or written to the trace. It lives only long
 * enough to be handed to the provider adapter's `complete` call.
 */
export interface Byok {
  readonly providerName: ProviderName;
  readonly apiKey: string;
  readonly model: string;
}

/** A schema-validated structured completion plus its cost metadata. */
export interface StructuredResult<T> {
  readonly data: T;
  readonly model: string;
  readonly costUsd: number | null;
  readonly costAccuracy: CostAccuracy;
}
