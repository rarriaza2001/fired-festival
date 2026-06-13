/** Supported context attachment kinds for review submissions. */
export const CONTEXT_ITEM_KINDS = [
  'link',
  'pdf',
  'docx',
  'pptx',
  'xlsx',
  'csv',
] as const;

export type ContextItemKind = (typeof CONTEXT_ITEM_KINDS)[number];

/** Prefix for server-stored attachment refs in context_items. */
export const ATTACHMENT_REF_PREFIX = 'attachment://' as const;

/** Ingestion outcome for a parsed or fetched context item. */
export const INGESTION_STATUSES = [
  'parsed',
  'fetch_failed',
  'parse_failed',
  'unsupported',
  'too_large',
] as const;

export type IngestionStatus = (typeof INGESTION_STATUSES)[number];

/** LLM triage verdict on whether an attachment is worth using. */
export const CONTEXT_ATTACHMENT_WORTH = [
  'material',
  'supplementary',
  'noise',
  'unusable',
] as const;

export type ContextAttachmentWorth = (typeof CONTEXT_ATTACHMENT_WORTH)[number];

/** LLM triage weight for how much an attachment should influence the review. */
export const CONTEXT_ATTACHMENT_WEIGHT = [
  'high',
  'medium',
  'low',
  'none',
] as const;

export type ContextAttachmentWeight = (typeof CONTEXT_ATTACHMENT_WEIGHT)[number];

/** Bounded limits for context attachments. */
export const CONTEXT_LIMITS = {
  MAX_ITEMS_PER_REVIEW: 5,
  MAX_FILE_BYTES: 10 * 1024 * 1024,
  MAX_EXTRACTED_CHARS: 50_000,
  EXCERPT_CHARS: 2_000,
  LINK_FETCH_TIMEOUT_MS: 10_000,
  ATTACHMENT_TTL_HOURS: 24,
} as const;

/** Static per-format warnings injected before LLM triage. */
export const CONTEXT_KIND_WARNINGS: Readonly<Record<ContextItemKind, readonly string[]>> = {
  pdf: [
    'PDFs may be scanned images with poor text extraction.',
    'Content may be cherry-picked or unverifiable in authorship.',
    'Document may be stale relative to the decision.',
  ],
  docx: [
    'Word documents are editable narratives, not proof of facts.',
    'Formatting can hide gaps or contradictions.',
    'Author intent may not match extracted text structure.',
  ],
  pptx: [
    'Slides summarize at a high level and may omit nuance.',
    'Presentation content often carries marketing spin.',
    'Bullet points are not evidence without underlying support.',
  ],
  xlsx: [
    'Spreadsheets may contain formula errors or selective ranges.',
    'Model assumptions are often unstated in exported text.',
    'Data may be stale or manually edited without audit trail.',
  ],
  csv: [
    'CSV exports may omit formulas, metadata, and data lineage.',
    'Column selection can bias interpretation.',
    'Data may be stale or manually edited without audit trail.',
  ],
  link: [
    'Web pages can be stale, paywalled, or biased.',
    'Fetch failure does not validate or invalidate the underlying claim.',
    'Scraped text may miss critical context from the full page.',
    'Requires independent corroboration before treating as evidence.',
  ],
};
