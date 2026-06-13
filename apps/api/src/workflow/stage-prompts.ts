import { z } from 'zod';
import {
  mainCompetitorSchema,
  decisionArtifactSchema,
  assumptionSchema,
  evidenceAssessmentSchema,
  realityCheckSchema,
  failureModeSchema,
  confidenceCalibrationSchema,
  nextActionSchema,
  secondaryActionSchema,
  missingContextSchema,
  intakeAssessmentSchema,
  type ReviewInput,
  type ContextTriage,
  type IngestedContextItem,
} from '@dgb/shared';

/**
 * Phase 3 workflow spine — per-stage prompts + output schemas. Each stage is a
 * structured LLM call whose JSON output is validated against the @dgb/shared
 * schema (single source of truth). The orchestrator runs these in spine order.
 *
 * Reality checks (Step 9) and failure modes (Step 10) are produced together so
 * each failure mode can link directly to a reality check.
 */

/** Step 5 — Review Scope Confirmation (no shared schema; defined here). */
export const reviewScopeSchema = z.object({
  in_scope: z.array(z.string()).min(1),
  out_of_scope: z.array(z.string()).default([]),
  rationale: z.string().min(1),
});
export type ReviewScope = z.infer<typeof reviewScopeSchema>;

/** Steps 6-7 — assumptions discovered AND ranked in one structured call. */
export const assumptionsResultSchema = z.object({
  assumptions: z.array(assumptionSchema).min(1),
});

/** Steps 9-10 — reality/contradiction checks plus the causal failure modes. */
export const realityRisksSchema = z.object({
  main_competitors: z.array(mainCompetitorSchema).min(1),
  reality_checks: z.array(realityCheckSchema).min(1),
  failure_modes: z.array(failureModeSchema).min(1),
});

/** Step 12 — exactly one primary action; secondary must not compete. */
export const nextActionResultSchema = z.object({
  next_action: nextActionSchema,
  secondary_actions: z.array(secondaryActionSchema).default([]),
});

/** Step 13/14 — prose assembly fields (must not invent new analysis). */
export const assemblyResultSchema = z.object({
  decision_summary: z.string().min(1),
  missing_context: missingContextSchema,
  review_trace_summary: z.string().min(1),
});

export type StageKey =
  | 'sufficiency'
  | 'artifact'
  | 'scope'
  | 'assumptions'
  | 'evidence'
  | 'realityRisks'
  | 'confidence'
  | 'nextAction'
  | 'assembly';

export const STAGE_SCHEMAS = {
  sufficiency: intakeAssessmentSchema,
  artifact: decisionArtifactSchema,
  scope: reviewScopeSchema,
  assumptions: assumptionsResultSchema,
  evidence: evidenceAssessmentSchema,
  realityRisks: realityRisksSchema,
  confidence: confidenceCalibrationSchema,
  nextAction: nextActionResultSchema,
  assembly: assemblyResultSchema,
} as const;

const PERSONA = `You are "Don't Go Blind", a Decision Stress Tester. You perform a bounded, skeptical review of a concrete, resource-intensive decision BEFORE the user commits resources.

Address the user directly as "you"/"your" — never "the user". Do NOT restate or echo back what they told you; they already know what they said. Be concise and high-signal: no filler, no padding, no repeating the same point across sections.

You are a REAL stress-tester, not a research to-do list. Use your own domain knowledge and base rates to (a) SUPPLY the context the user is missing — that is your job; they came to you precisely because their own view is incomplete — and (b) mount concrete, specific challenges a sharp domain expert would actually raise. Do NOT punt everything to "needs external research" or label every assumption "unverified" — that is not a stress test, it is a shrug. Give a genuine, reasoned assessment, and reserve "external check needed" for the few things that truly require the user's private data or a live lookup you cannot reason about.

You challenge weak reasoning, but you NEVER invent fake risks when a decision is reasonably supported. Confidence is CATEGORICAL only — High, Medium, Low, or Unknown. Never use numeric scores, percentages, or fake precision.`;

const VALIDATION_LINK_RULE = `EXTERIOR VALIDATION LINKS (mandatory): Every assumption, evidence item, reality check, failure mode, and the primary next action MUST include at least one https:// URL in "sources" that a user can open to validate or research the point — e.g. government data (BLS, Census), industry reports, reputable news, or the user's submitted link. Use web-search results from external checks when available. Never cite model training or domain knowledge as a source. If no authoritative page exists yet, use state "external_check_needed" so the harness can search.

`;

const DEDUP_RULE = `SEMANTIC DEDUP (mandatory): Before finalizing each stage output, compare every new item against (1) the user's verbatim decision and any ingested link/attachment text, and (2) ALL prior stage outputs (assumptions, evidence, reality checks, failure modes). If two items convey substantially the same meaning — including paraphrases across sections — keep ONLY the most specific, actionable version and DROP the rest. Do NOT restate what the user already told you. Do NOT repeat the same criticism in different words. Each bullet must add NEW information the user does not already have.

USER LINKS: When the user submitted website links, you MUST read the ingested page text provided below and cite those URLs in evidence sources when you use claims from them. Treat unsubstantiated repetition of link content as noise.

`;

const JSON_RULE = `Respond with ONLY a single JSON object matching exactly the requested fields. No prose, no markdown, no code fences.`;

const INSTRUCTIONS: Record<StageKey, string> = {
  sufficiency: `Steps 1-2 — Input Classification & Sufficiency Gate. Decide whether this input describes a concrete, resource-intensive decision that can be stress-tested. Return:
{
  "classification": "possibly_reviewable" | "incomplete_salvageable" | "insufficient" | "unsupported",
  "blocking_fields": [ { "field": "decision" | "current_state" | "end_goal" | "commitment_consequence" | "decision_stage", "status": "present" | "safely_inferable" | "missing", "value": string | null } ],
  "evidence_weak": boolean,
  "unsupported_mode": "blind_validation" | "final_decision_delegation" | "hype" | "pure_implementation" | "pure_fact_lookup" | "professional_determination" | "emotional_reassurance" | "certainty_seeking" | "low_stakes_preference" | null,
  "clarification_questions": string[]
}
THE BAR IS LOW — be generous, not strict. Your job is to recognize a real decision worth reviewing, NOT to demand a detailed plan, financials, numbers, or specifics. If a reasonable person can tell what the decision is and roughly what is at stake, it is reviewable. A plain one-sentence decision is completely acceptable input.

When ingested attachments are present, treat their text as provided_but_unassessed unless triage marked them material with should_influence_review=true. Attachments are never proof.

Assess ALL FIVE blocking fields, one entry each:
- "present" — the user stated it.
- "safely_inferable" — a reasonable, low-risk reading of the input makes it clear. STRONGLY PREFER this over "missing"; put the inferred reading in "value" (never present it as user-stated). For almost any everyday decision you can safely infer: current_state (the user is at the idea / pre-commitment stage), end_goal (the obvious aim of the decision), commitment_consequence (the resources the decision plainly risks — money, time, a lease, a hire), and decision_stage (usually "exploring, before committing" when the user is asking whether to proceed).
- "missing" — ONLY when a field genuinely cannot be reasonably inferred AND its absence makes the decision impossible to identify or stress-test. Do NOT mark a field missing just because it lacks exact numbers, a budget, or a written plan.

When the input is a real but thin decision (fields present/inferable but little supporting evidence), do NOT mark fields missing — clear them and set evidence_weak=true so the review still runs with capped confidence (sufficient_limited). Reserve classification "insufficient" for input where NO concrete decision can be identified at all.

Worked example — fully reviewable: "I'm thinking about opening a fish stick restaurant in Austin but want to make sure there's a market before investing in a place." -> decision: open a fish stick restaurant in Austin (present); current_state: idea stage, nothing committed yet (safely_inferable); end_goal: a viable restaurant / confirm real demand before spending (safely_inferable); commitment_consequence: capital and time to secure and build out a location (safely_inferable); decision_stage: exploring, before signing a lease (safely_inferable). classification: possibly_reviewable; no missing fields; evidence_weak: true.

Set classification "unsupported" and name the unsupported_mode only when the request is not a reviewable resource-intensive decision (asking to be told it's a good idea = blind_validation; asking you to decide for them = final_decision_delegation; a licensed legal/medical/financial determination = professional_determination). Provide at most 3 targeted clarification questions ONLY for fields you genuinely had to mark "missing", ordered: decision, current_state, end_goal, commitment_consequence, decision_stage. Never ask generic questions like "tell me more". Leave clarification_questions empty when no field is missing.`,

  artifact: `Step 4 — Decision Artifact Extraction. Extract the five blocking fields. Return:
{
  "decision": { "value": string, "source": "user_stated" | "inferred" },
  "current_state": { "value": string, "source": "user_stated" | "inferred" },
  "end_goal": { "value": string, "source": "user_stated" | "inferred" },
  "commitment_consequence": { "value": string, "source": "user_stated" | "inferred" },
  "decision_stage": { "value": string, "source": "user_stated" | "inferred" },
  "extraction_confidence": "High" | "Medium" | "Low" | "Unknown",
  "inferred_reframe": string | null
}
Preserve the user's stated decision. Mark a field "inferred" only when you reasonably inferred it; never present inferred content as user-stated fact. If you reframed the decision, put the reframing in inferred_reframe, else null.`,

  scope: `Step 5 — Review Scope Confirmation. Return:
{ "in_scope": string[], "out_of_scope": string[], "rationale": string }
Scope must be concrete enough to support assumptions and risk ranking. Out-of-scope boundaries must be explicit. Implementation details are out of scope unless the decision itself is technical architecture.`,

  assumptions: `Steps 6-7 — Assumption Discovery & Prioritization. Discover 3-5 material assumptions, then rank them. Return:
{ "assumptions": [ {
  "statement": string (specific, material, falsifiable, tied to the decision),
  "current_support": string,
  "evidence_state": "assessed" | "provided_but_unassessed" | "external_check_needed" | "external_check_completed" | "external_check_unavailable" | "evidence_state_unknown",
  "connects_to_commitment": boolean,
  "rank": integer (1 = highest priority; unique across assumptions),
  "rank_rationale": string,
  "sources": string[] (at least one https:// URL validating or researching this assumption)
} ] }
At least one assumption must have connects_to_commitment=true. Rank by materiality (which outranks testability), evidence weakness, and power to invalidate the decision. Reject generic assumptions like "adoption", "competition", or "execution" unless made specific. In "current_support", give YOUR actual assessment of how plausible the assumption is, using domain knowledge and base rates (e.g. typical dynamics for this kind of decision) — not "research is needed". Default evidence_state to "assessed" with your reasoned judgment; use "external_check_needed" only when it genuinely requires the user's private data or a live lookup. Do NOT restate the same point you will cover in evidence, reality checks, or failure modes — each assumption must be distinct.`,

  evidence: `Step 8 — Evidence Assessment. Return:
{ "items": [ {
  "statement": string,
  "kind": "user_claim" | "evidence" | "assumption" | "speculation" | "missing_support",
  "state": "assessed" | "provided_but_unassessed" | "external_check_needed" | "external_check_completed" | "external_check_unavailable" | "evidence_state_unknown",
  "source_trust": "high_trust" | "medium_trust" | "low_trust" | "unverified" | "anecdotal" | null,
  "strength": "strong" | "moderate" | "weak" | "none" | null,
  "note": string (internal only — reasoning for classification; not shown to user),
  "sources": string[] (REQUIRED — at least one https:// URL per item; EXTERIOR citations ONLY: https:// URLs from web search/fetch, or "attachment: {label}". NEVER cite domain knowledge, base rates, model training, or internal reasoning — leave sources [] for those items.)
} ], "critical_gaps": string[] }
MAIN COMPETITOR RESEARCH: Include at least one evidence item about the competitive landscape for the named market/decision; mark it external_check_needed when live data is required.
USER-SUBMITTED LINKS: For each website link the user provided, add an evidence item that analyzes claims from that page (cite the URL in sources). If live fetch is needed, use state "external_check_needed" with the URL in sources.
MANDATORY WEB INVESTIGATION: At least ONE item MUST use state "external_check_needed" for a market/industry/regulatory fact that web search can verify — the harness will run a reputable web search. Mark other items "assessed" when you can reason from the input alone.
These two templates show the SHAPE only — fill every <...> with a fact derived from THIS decision. Never emit the placeholder text or these illustrative values verbatim.
Shape, exterior item to verify: { "statement": "<a specific market/industry/regulatory fact this decision hinges on>", "kind": "assumption", "state": "external_check_needed", "source_trust": "unverified", "strength": "none", "note": "<why this needs a live lookup>", "sources": [] }
Shape, after search: { "statement": "<what the cited source actually establishes>", "kind": "evidence", "state": "external_check_completed", "source_trust": "high_trust", "strength": "moderate", "note": "<what the source verified>", "sources": ["<https:// URL returned by web search>"] }
Record user claims with kind "user_claim" — never as proof. Classify source_trust and strength SEPARATELY. Do NOT repeat points already stated in assumptions — dedupe across sections. critical_gaps lists only genuine, decision-breaking gaps that cap confidence.`,

  realityRisks: `Steps 9-10 — Reality/Contradiction Check, then Failure Mode Analysis. Generate 2-4 reality checks, then 3-5 ranked causal failure modes derived from them and the ranked assumptions. Return:
{
  "main_competitors": [
    {
      "name": string (REQUIRED — a real named company/product; never generic "competition" or "incumbents"),
      "website": string | null (official https URL when known),
      "logo_url": string | null (leave null — server resolves from website),
      "threat_summary": string (1-2 sentences: why THIS competitor specifically stress-tests the decision),
      "sources": string[] (at least one https:// URL validating the competitor exists and is relevant)
    }
  ] (REQUIRED — exactly THREE distinct, real competitors ranked by relevance to the user's decision; no duplicates),
  "reality_checks": [ { "challenges": string, "why_it_matters": string, "is_direct_contradiction": boolean, "sources": string[] (at least one https:// URL) } ],
  "failure_modes": [ {
    "if_condition": string, "then_failure_path": string, "causing_impact": string,
    "link_type": "ranked_assumption" | "evidence_gap" | "contradiction" | "reality_check",
    "link_ref": string,
    "severity": "critical" | "high" | "moderate" | "low",
    "likelihood": "high" | "medium" | "low" | "unknown",
    "evidence_state": string,
    "early_warning_signal": string (use "hard_to_detect" if none exists),
    "validation_mitigation": string,
    "confidence_effect": "High" | "Medium" | "Low" | "Unknown" | null,
    "rank": integer (1 = highest),
    "sources": string[] (at least one https:// URL supporting this risk)
  } ]
}
Every failure mode must be causal (If X fails, then Y, causing Z) and link back to a ranked assumption, evidence gap, contradiction, or reality check. No generic labels. Ground every reality check and failure mode in concrete domain knowledge and base rates (e.g. typical failure rates and margins for this business type, the specific fragility of a single-novelty concept, the real competitive dynamics of the named market/location). A reality check that merely says "X is unverified, so it might fail" is NOT acceptable — state what a knowledgeable skeptic would actually argue and why it bites HERE, specifically. Reality checks must not be generic pessimism. Do NOT repeat an assumption or evidence item verbatim — each reality check must add a NEW external-world angle not already stated.`,

  confidence: `Step 11 — Confidence Calibration (categorical only). Return:
{ "label": "High" | "Medium" | "Low" | "Unknown", "why": string, "why_not_higher": string, "what_would_raise": string, "what_would_lower": string, "capped": boolean }
High confidence is rare. Mostly user claims, unsupported critical assumptions, or weak anecdotal evidence usually produce Low. Direct unresolved contradictions downgrade to Low or Unknown. Set capped=true when evidence/context is weak (this forces a limited review). Write why / why_not_higher / what_would_raise / what_would_lower in the second person ("you"), one tight sentence each — no restating the decision.`,

  nextAction: `Step 12 — Next-Action Framing. Select exactly ONE primary action targeting the highest unresolved material risk, weakest load-bearing assumption, or confidence-capping evidence gap. Return:
{
  "next_action": { "action_type": "clarify" | "narrow_scope" | "gather_context" | "validate_assumption" | "gather_direct_evidence" | "compare_alternatives" | "revise_decision" | "proceed_under_conditions" | "bounded_execution", "primary_action": string, "target": string, "how": string, "pass_signal": string, "fail_signal": string, "commitment_rule": string, "sources": string[] (at least one https:// URL for how to validate the action) },
  "secondary_actions": [ { "action_type": <same enum>, "primary_action": string, "why_secondary": string } ]
}
Pass/fail signals must be observable, not vibes. The commitment_rule states what you should NOT commit to until the pass signal is met. Phrase primary_action, target, how, and commitment_rule directly to the user (you/your), concisely. secondary_actions MUST be an empty array — the product surface shows only the primary action. Map confidence: Unknown→clarify/narrow/gather context; Low→validate_assumption or gather_direct_evidence; Medium→compare/revise/proceed_under_conditions; High→bounded_execution or proceed_under_conditions. If there are no material blockers, recommend proceed_under_conditions — do not invent fake risks.`,

  assembly: `Steps 13-14 — Review Output Assembly & Trace. Assemble from the prior outputs only; do NOT invent new risks or analysis. Return:
{
  "decision_summary": string (1-2 sentences, second person — "You're weighing…". State the decision crisply; do NOT parrot the user's wording back to them),
  "missing_context": { "missing_items": string[], "inferred_items": string[] },
  "review_trace_summary": string (1-2 sentences, second person, explaining WHY the review landed at its terminal state and confidence — no chain-of-thought, no transcript)
}
missing_context.inferred_items = the context YOU supplied from your own knowledge to fill the gaps in the user's view; populate it with what you assumed/filled in. missing_context.missing_items = ONLY facts that genuinely require the user's private information (their budget, their proprietary data) and that you could not reasonably infer — keep it to at most one short line, and leave it EMPTY if nothing truly blocks. Never offload general market, cost, regulatory, or industry research onto the user as "missing"; you supply your best assessment instead.`,
};

const ATTACHMENT_DANGER_PREAMBLE = `ATTACHMENT CAUTION: User-supplied files and links are NOT automatically credible. They require analysis for worth, weight, and relevance. Treat parsed attachment text as provided_but_unassessed unless triage marked it material with should_influence_review=true. Never treat attachments as proof.`;

/** Enriched review input after pre-loop ingestion and triage (internal only). */
export interface PreparedReviewInput extends ReviewInput {
  readonly ingested_items?: readonly IngestedContextItem[];
  readonly context_triage?: ContextTriage;
}

const LINK_PROMPT_CHARS = 12_000;

function contextBodyForPrompt(item: IngestedContextItem): string | null {
  if (item.kind === 'link' && item.extracted_text && item.status === 'parsed') {
    const body = item.extracted_text.slice(0, LINK_PROMPT_CHARS);
    return `    page_text: """\n${body}\n"""`;
  }
  if (item.excerpt) {
    return `    excerpt: """${item.excerpt}"""`;
  }
  return null;
}

function attachmentContextBlock(prepared: PreparedReviewInput): string {
  if (!prepared.ingested_items?.length) return '';

  const ingestionLines = prepared.ingested_items.map((item) => {
    const warn = item.warnings.map((w: string) => `      - ${w}`).join('\n');
    return [
      `  - ${item.label} (${item.kind}, ${item.status})`,
      `    ref: ${item.ref}`,
      warn ? `    warnings:\n${warn}` : null,
      contextBodyForPrompt(item),
    ]
      .filter(Boolean)
      .join('\n');
  });

  const triageLines = prepared.context_triage?.items.map(
    (t: { ref: string; worth: string; weight: string; should_influence_review: boolean; rationale: string }) =>
      `  - ${t.ref}: worth=${t.worth}, weight=${t.weight}, influence=${t.should_influence_review}, rationale=${t.rationale}`,
  );

  return [
    `\n\n${ATTACHMENT_DANGER_PREAMBLE}`,
    '\nIngestion results:',
    ...ingestionLines,
    triageLines?.length ? '\nTriage verdicts:' : null,
    ...(triageLines ?? []),
  ]
    .filter(Boolean)
    .join('\n');
}

function decisionBlock(input: PreparedReviewInput): string {
  const items = input.context_items.length
    ? `\n\nSubmitted context refs:\n${input.context_items.map((c) => `- ${c.label} (${c.kind}): ${c.ref}`).join('\n')}`
    : '';
  return `User's decision (verbatim):\n"""\n${input.text}\n"""${items}${attachmentContextBlock(input)}`;
}

export interface StagePrompt {
  readonly system: string;
  readonly user: string;
}

/**
 * Build the (system, user) prompt for a stage. Downstream stages receive the
 * accumulated prior results as compact JSON so each step builds on the last.
 */
export function buildPrompt(
  key: StageKey,
  input: PreparedReviewInput,
  priorJson: string,
): StagePrompt {
  const system = `${PERSONA}\n\n${INSTRUCTIONS[key]}\n\n${VALIDATION_LINK_RULE}${DEDUP_RULE}${JSON_RULE}`;
  // The first two stages (sufficiency, artifact) see only the raw decision;
  // later stages also receive the accumulated prior results.
  const isFirstPass = key === 'sufficiency' || key === 'artifact';
  const user = isFirstPass
    ? decisionBlock(input)
    : `${decisionBlock(input)}\n\nReview progress so far (JSON):\n${priorJson}`;
  return { system, user };
}
