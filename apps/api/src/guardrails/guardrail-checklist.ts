import {
  type ConfidenceCalibration,
  type EvidenceAssessment,
  type GuardrailTrigger,
  type UnsupportedMode,
} from '@dgb/shared';
import { registryEntry, UNSUPPORTED_MODE_GUARDRAILS } from './guardrail-registry';

/**
 * Phase 6 — Pre-output checklist gate. Runs at the pre-output checkpoint of the
 * review spine (before assembly). Guardrails here are executable: when a rule
 * fires it changes the review (downgrades/caps confidence) and records an
 * observable trigger. Pure and framework-free — the orchestrator emits the
 * trace events and the loop controller decides whether a confidence change
 * warrants a next-action reassessment loop.
 *
 * NOTE: the spec called this a "Nest interceptor", but the review runs detached
 * from the HTTP request, where interceptor semantics do not apply. Same
 * behavior, correct fit: a pure checkpoint module invoked by the orchestrator.
 */

/** Evidence is weak when there are critical gaps or nothing reaches `strong`. */
export function isEvidenceWeak(evidence: EvidenceAssessment): boolean {
  if (evidence.critical_gaps.length > 0) {
    return true;
  }
  return !evidence.items.some((item) => item.strength === 'strong');
}

export interface ChecklistContext {
  readonly confidence: ConfidenceCalibration;
  readonly evidence: EvidenceAssessment;
}

export interface ChecklistResult {
  /** Confidence after guardrail effects (possibly downgraded and capped). */
  readonly confidence: ConfidenceCalibration;
  readonly triggers: readonly GuardrailTrigger[];
  /** True when a guardrail materially changed confidence (may trigger a loop). */
  readonly confidenceChanged: boolean;
}

/**
 * Pre-output checklist. Executes the unsupported_confidence guardrail: a High
 * label resting on weak or unverified evidence is downgraded and capped, which
 * forces a limited review. Returns the corrected confidence plus the observable
 * triggers; never mutates its inputs.
 */
export function runPreOutputChecklist(ctx: ChecklistContext): ChecklistResult {
  const triggers: GuardrailTrigger[] = [];
  let confidence = ctx.confidence;

  if (confidence.label === 'High' && isEvidenceWeak(ctx.evidence)) {
    const entry = registryEntry('unsupported_confidence');
    const newLabel = entry.confidence_effect ?? 'Medium';
    confidence = { ...confidence, label: newLabel, capped: true };
    triggers.push({
      category: entry.category,
      review_state: 'confidence_calibrated',
      required_behavior: entry.required_behavior,
      confidence_effect: newLabel,
      terminal_state_effect: entry.terminal_state_effect,
      next_action_effect: entry.next_action_effect,
      explanation_shown: entry.user_facing_explanation,
    });
  }

  const confidenceChanged =
    confidence.label !== ctx.confidence.label ||
    confidence.capped !== ctx.confidence.capped;

  return { confidence, triggers, confidenceChanged };
}

/**
 * Map an unsupported-request mode (detected at intake) to its observable
 * guardrail trigger. The reframe text is single-sourced from the registry.
 */
export function unsupportedTrigger(mode: UnsupportedMode): GuardrailTrigger {
  const mapping = UNSUPPORTED_MODE_GUARDRAILS[mode];
  const entry = registryEntry(mapping.category);
  return {
    category: mapping.category,
    review_state: 'unsupported_request',
    required_behavior: mapping.behavior,
    confidence_effect: null,
    terminal_state_effect: 'unsupported_request',
    next_action_effect: mapping.nextActionEffect,
    explanation_shown: entry.user_facing_explanation,
  };
}
