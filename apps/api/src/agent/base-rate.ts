/**
 * Agent harness — base-rate ("outside view") helpers.
 *
 * These pure functions decide when an evidence statement is a *predictive* claim
 * (a forecast, timeline, or success-rate projection) and reframe it into a
 * reference-class search query. They embody the decision-science "outside view"
 * (Kahneman's inside-vs-outside view; Tetlock's reference-class forecasting):
 * rather than verifying a single inside-view assertion, we ask how often
 * comparable decisions actually played out the claimed way.
 *
 * No I/O and no LLM here — selection and framing only. The `base_rate` tool
 * primitive (network adapter) gathers the reference-class material; the existing
 * evidence/confidence stages reason over it unchanged.
 */

/** Time units that, when paired with a number, signal a timeline/forecast. */
const TIME_UNIT = '(?:day|days|week|weeks|month|months|quarter|quarters|year|years)';

/**
 * Signals that a statement is a forward-looking prediction rather than a
 * present-tense factual claim. Any single match is sufficient.
 */
const PREDICTIVE_PATTERNS: readonly RegExp[] = [
  /%/, // an explicit rate or percentage
  new RegExp(`\\b\\d+\\s*${TIME_UNIT}\\b`, 'i'), // "12 months", "3 weeks"
  /\bq[1-4]\b/i, // fiscal quarter reference
  /\b(?:by|in|before|after)\s+20\d\d\b/i, // "by 2026"
  /\b(?:will|won't|shall|expect|expects|expected|anticipate|anticipated|project|projected|projection|projections|forecast|forecasted|estimate|estimated|predict|predicted|likely|should|plan to|plans to|aim to|aims to|going to|on track to)\b/i,
  /\b(?:hit|reach|grow to|scale to|double|triple|10x|cut|reduce|increase)\b.*\b(?:by|to|within|in)\b/i,
];

/**
 * True when the statement reads as a predictive claim worth grounding in a
 * reference class (success rate / timeline / projection). Present-tense facts
 * ("users churn after step three") return false and keep the plain search path.
 */
export function isPredictiveClaim(statement: string): boolean {
  const text = statement.trim();
  if (!text) {
    return false;
  }
  return PREDICTIVE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Reframe a predictive statement into a reference-class ("outside view") query:
 * how often comparable decisions achieve the claimed outcome. When the decision
 * class is known (the artifact's decision text), it anchors the comparison set.
 */
export function buildBaseRateQuery(
  statement: string,
  decisionContext?: string,
): string {
  const claim = statement.trim();
  const context = decisionContext?.trim();
  const anchor = context
    ? `for decisions like "${context}"`
    : 'for comparable decisions';
  return `base rate and historical success rate ${anchor}: how often do similar cases actually achieve "${claim}"? reference class outcomes, typical timelines, failure rates`;
}
