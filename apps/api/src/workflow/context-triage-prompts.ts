import { contextTriageSchema, type ContextTriage, type IngestedContextItem, type ReviewInput } from '@dgb/shared';

const PERSONA = `You are "Don't Go Blind", a Decision Stress Tester. User-supplied attachments are NOT automatically credible or worthwhile. Your job is to judge each attachment's materiality, trust, and whether it should influence the review. Presence of a file or link does not mean it is evidence.`;

const JSON_RULE = `Respond with ONLY a single JSON object matching exactly the requested fields. No prose, no markdown, no code fences.`;

const TRIAGE_INSTRUCTIONS = `Assess each ingested context attachment for the decision below. Return:
{
  "items": [
    {
      "ref": string,
      "worth": "material" | "supplementary" | "noise" | "unusable",
      "weight": "high" | "medium" | "low" | "none",
      "dangers_acknowledged": string[],
      "should_influence_review": boolean,
      "rationale": string
    }
  ],
  "overall_evidence_weak": boolean
}

Rules:
- Acknowledge the per-format dangers listed for each item (do not ignore them).
- "material" only when content clearly bears on the decision and parse/fetch succeeded with usable text.
- "unusable" for failed fetches/parses or content with no decision relevance.
- "noise" for tangential marketing, boilerplate, or content that should not steer the review.
- Set should_influence_review=false for noise/unusable items even if parsed successfully.
- Set overall_evidence_weak=true unless at least one material attachment with high or medium weight exists.
- One assessment per ingested item; ref must match exactly.`;

function ingestionBlock(items: readonly IngestedContextItem[]): string {
  const lines = items.map((item) => {
    const warnings = item.warnings.map((w: string) => `    - ${w}`).join('\n');
    return [
      `- ${item.label} (${item.kind})`,
      `  ref: ${item.ref}`,
      `  status: ${item.status}`,
      `  char_count: ${item.char_count}`,
      warnings ? `  warnings:\n${warnings}` : null,
      item.excerpt ? `  excerpt: """${item.excerpt}"""` : '  excerpt: null',
    ]
      .filter(Boolean)
      .join('\n');
  });
  return `Ingested attachments (parsed/fetched — NOT verified as evidence):\n${lines.join('\n\n')}`;
}

export interface ContextTriagePrompt {
  readonly system: string;
  readonly user: string;
  readonly schema: typeof contextTriageSchema;
}

export function buildContextTriagePrompt(
  input: ReviewInput,
  ingested: readonly IngestedContextItem[],
): ContextTriagePrompt {
  return {
    schema: contextTriageSchema,
    system: `${PERSONA}\n\n${TRIAGE_INSTRUCTIONS}\n\n${JSON_RULE}`,
    user: `User's decision (verbatim):\n"""\n${input.text}\n"""\n\n${ingestionBlock(ingested)}`,
  };
}

export type { ContextTriage };
