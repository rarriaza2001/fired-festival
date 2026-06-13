import {
  guardrailRegistryEntrySchema,
  type GuardrailRegistryEntry,
  type GuardrailCategory,
  type GuardrailBehavior,
  type UnsupportedMode,
  type NextActionType,
} from '@dgb/shared';

/**
 * Phase 6 / Phase 8 §10 — Executable Guardrail Registry.
 *
 * Guardrails must change behavior when triggered, not merely warn. Each entry
 * is the 7-field shape (category, trigger_condition, required_behavior,
 * confidence_effect, terminal_state_effect, next_action_effect,
 * user_facing_explanation). The pre-output checklist evaluates the executable
 * subset before a review is assembled; intake maps unsupported requests through
 * UNSUPPORTED_MODE_GUARDRAILS. The full registry is validated at module load so
 * a malformed entry fails fast rather than silently.
 */
const RAW_REGISTRY: readonly GuardrailRegistryEntry[] = [
  {
    category: 'blind_validation',
    trigger_condition:
      'The request asks the system to confirm a decision is good without supplying reviewable substance.',
    required_behavior: 'reframe',
    confidence_effect: null,
    terminal_state_effect: 'unsupported_request',
    next_action_effect: null,
    user_facing_explanation:
      'I cannot rubber-stamp a decision. I can stress-test it if you share the decision, your current state, goal, what you would commit, and the stage you are at.',
  },
  {
    category: 'final_decision_ownership',
    trigger_condition: 'The request asks the system to make or own the final decision.',
    required_behavior: 'block_final_ownership',
    confidence_effect: null,
    terminal_state_effect: 'unsupported_request',
    next_action_effect: null,
    user_facing_explanation:
      'The decision stays yours. I can pressure-test the reasoning and surface what would change your confidence, but I will not make the call for you.',
  },
  {
    category: 'unsupported_confidence',
    trigger_condition:
      'A High confidence label rests on user claims, unverified evidence, or critical evidence gaps.',
    required_behavior: 'downgrade_confidence',
    confidence_effect: 'Medium',
    terminal_state_effect: null,
    next_action_effect: 'validate_assumption',
    user_facing_explanation:
      'Confidence was lowered because the strongest support is unverified or has critical gaps. Validate the load-bearing assumption before committing.',
  },
  {
    category: 'fake_precision',
    trigger_condition:
      'A numeric score, percentage, or false-precision figure is presented for a categorical judgement.',
    required_behavior: 'block_fake_precision',
    confidence_effect: null,
    terminal_state_effect: null,
    next_action_effect: null,
    user_facing_explanation:
      'Confidence here is categorical (High/Medium/Low/Unknown). Numeric certainty would be fake precision.',
  },
  {
    category: 'speculation_as_fact',
    trigger_condition: 'Speculation or inference is presented as established fact.',
    required_behavior: 'downgrade_confidence',
    confidence_effect: null,
    terminal_state_effect: null,
    next_action_effect: null,
    user_facing_explanation:
      'Some support was inference, not verified fact, so it is labelled as such and weighted accordingly.',
  },
  {
    category: 'weak_evidence_for_strong_conclusion',
    trigger_condition:
      'A strong conclusion is drawn from weak, anecdotal, or low-trust evidence.',
    required_behavior: 'cap_confidence',
    confidence_effect: 'Low',
    terminal_state_effect: 'review_complete_limited',
    next_action_effect: 'gather_direct_evidence',
    user_facing_explanation:
      'The conclusion outruns its evidence, so this is a limited review. Gather direct evidence before relying on it.',
  },
  {
    category: 'professional_determination',
    trigger_condition:
      'The request needs a licensed professional determination (legal, medical, financial, tax).',
    required_behavior: 'block_professional_determination',
    confidence_effect: null,
    terminal_state_effect: 'unsupported_request',
    next_action_effect: null,
    user_facing_explanation:
      'This needs a qualified professional. I can frame what to ask and what would change the decision, but I cannot make that determination.',
  },
  {
    category: 'over_challenge',
    trigger_condition:
      'The review invents risks or skepticism not grounded in the decision or evidence.',
    required_behavior: 'remove_noise',
    confidence_effect: null,
    terminal_state_effect: null,
    next_action_effect: null,
    user_facing_explanation:
      'Manufactured doubts were removed; a stress test challenges real weak points, not imaginary ones.',
  },
  {
    category: 'under_challenge',
    trigger_condition:
      'A material assumption or risk was accepted without the scrutiny it warrants.',
    required_behavior: 'downgrade_confidence',
    confidence_effect: null,
    terminal_state_effect: null,
    next_action_effect: null,
    user_facing_explanation:
      'A load-bearing assumption was under-examined, so confidence reflects that gap.',
  },
  {
    category: 'unsupported_request',
    trigger_condition:
      'The request is not a reviewable resource-intensive decision (pure lookup, implementation, reassurance, low stakes).',
    required_behavior: 'reframe',
    confidence_effect: null,
    terminal_state_effect: 'unsupported_request',
    next_action_effect: null,
    user_facing_explanation:
      'This is not a decision I can stress-test. Bring a concrete, resource-intensive choice and I will pressure-test it.',
  },
  {
    category: 'tool_overuse',
    trigger_condition: 'External tools or searches are invoked beyond what the review needs.',
    required_behavior: 'stop_search',
    confidence_effect: null,
    terminal_state_effect: null,
    next_action_effect: null,
    user_facing_explanation:
      'External lookups were stopped once they stopped changing the assessment.',
  },
  {
    category: 'loop_without_material_change',
    trigger_condition:
      'A reassessment loop is requested without new information or a material change.',
    required_behavior: 'stop_loop',
    confidence_effect: null,
    terminal_state_effect: null,
    next_action_effect: null,
    user_facing_explanation:
      'Re-running the review would not change the outcome without new information, so it was stopped.',
  },
];

/** Validated registry — a malformed entry throws at module load. */
export const GUARDRAIL_REGISTRY: readonly GuardrailRegistryEntry[] = RAW_REGISTRY.map(
  (entry) => guardrailRegistryEntrySchema.parse(entry),
);

/** Look up an executable registry entry by category. */
export function registryEntry(category: GuardrailCategory): GuardrailRegistryEntry {
  const entry = GUARDRAIL_REGISTRY.find((e) => e.category === category);
  if (!entry) {
    // Registry covers every category; a miss is a programming error.
    throw new Error(`No guardrail registry entry for category: ${category}`);
  }
  return entry;
}

/** How an unsupported-request mode (Phase 3 Step 1) maps to a guardrail. */
interface UnsupportedModeGuardrail {
  readonly category: GuardrailCategory;
  readonly behavior: GuardrailBehavior;
  readonly nextActionEffect: NextActionType | null;
}

/**
 * Phase 3 Step 1 — each unsupported request mode resolves to a guardrail
 * category + required behavior. The user-facing reframe is taken from the
 * registry entry for that category, so the message stays single-sourced.
 */
export const UNSUPPORTED_MODE_GUARDRAILS: Record<
  UnsupportedMode,
  UnsupportedModeGuardrail
> = {
  blind_validation: { category: 'blind_validation', behavior: 'reframe', nextActionEffect: null },
  final_decision_delegation: {
    category: 'final_decision_ownership',
    behavior: 'block_final_ownership',
    nextActionEffect: null,
  },
  hype: { category: 'blind_validation', behavior: 'reframe', nextActionEffect: null },
  pure_implementation: {
    category: 'unsupported_request',
    behavior: 'reframe',
    nextActionEffect: null,
  },
  pure_fact_lookup: {
    category: 'unsupported_request',
    behavior: 'reframe',
    nextActionEffect: null,
  },
  professional_determination: {
    category: 'professional_determination',
    behavior: 'block_professional_determination',
    nextActionEffect: null,
  },
  emotional_reassurance: {
    category: 'unsupported_request',
    behavior: 'reframe',
    nextActionEffect: null,
  },
  certainty_seeking: {
    category: 'unsupported_confidence',
    behavior: 'reframe',
    nextActionEffect: null,
  },
  low_stakes_preference: {
    category: 'unsupported_request',
    behavior: 'reframe',
    nextActionEffect: null,
  },
};
