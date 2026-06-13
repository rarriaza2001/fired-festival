import { z } from 'zod';

/** Number of competitors surfaced in every review output. */
export const MAIN_COMPETITOR_COUNT = 3;

/** One direct competitor for the user's decision. */
export const mainCompetitorSchema = z.object({
  name: z.string().min(1),
  website: z.string().url().nullable().default(null),
  /** Public logo/favicon URL — resolved server-side when null. */
  logo_url: z.string().url().nullable().default(null),
  threat_summary: z.string().min(1),
  sources: z.array(z.string()).default([]),
});

export type MainCompetitor = z.infer<typeof mainCompetitorSchema>;

export const mainCompetitorsSchema = z
  .array(mainCompetitorSchema)
  .min(MAIN_COMPETITOR_COUNT)
  .max(MAIN_COMPETITOR_COUNT);

export type MainCompetitors = z.infer<typeof mainCompetitorsSchema>;
