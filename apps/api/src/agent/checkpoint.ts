import type {
  Assumption,
  ConfidenceCalibration,
  DecisionArtifact,
  EvidenceAssessment,
  FailureMode,
  GuardrailTrigger,
  MissingContext,
  NextAction,
  MainCompetitor,
  RealityCheck,
  ReviewInput,
  SearchDepth,
  SecondaryAction,
} from '@dgb/shared';
import type { AgentRunState } from './agent-state';
import type { PreparedReviewInput } from '../workflow/stage-prompts';
import type { IntakeDecision } from '../workflow/intake-controller';

/**
 * Checkpoint — the serializable slice of the run's working memory (RunContext)
 * captured after each completed stage. Everything needed to resume the control
 * loop forward, and nothing that must not be persisted: the BYOK key, the trace
 * service, and the prisma handle are deliberately absent (the key is re-supplied
 * per replay request). `checkedStatements` is a Set in memory, stored as an
 * array here.
 */
export interface CheckpointSnapshot {
  readonly input: ReviewInput;
  readonly preparedInput: PreparedReviewInput;
  readonly acc: Record<string, unknown>;
  readonly state: AgentRunState;
  readonly searchDepth: SearchDepth;
  readonly searchAnnounced: boolean;
  readonly anyToolAvailable: boolean;
  readonly lastActionSummary: string | null;
  readonly intake: IntakeDecision | null;
  readonly guardrailTriggers: readonly GuardrailTrigger[];
  readonly checkedStatements: readonly string[];
  readonly artifact: DecisionArtifact | null;
  readonly assumptions: readonly Assumption[];
  readonly evidence: EvidenceAssessment | null;
  readonly realityChecks: readonly RealityCheck[];
  readonly failureModes: readonly FailureMode[];
  readonly mainCompetitors: readonly MainCompetitor[] | null;
  readonly confidence: ConfidenceCalibration | null;
  readonly nextAction: NextAction | null;
  readonly secondaryActions: readonly SecondaryAction[];
  readonly assembly: {
    readonly decision_summary: string;
    readonly missing_context: MissingContext;
    readonly review_trace_summary: string;
  } | null;
}

/** Parse a persisted snapshot JSON string. Throws on malformed JSON. */
export function parseCheckpointSnapshot(json: string): CheckpointSnapshot {
  return JSON.parse(json) as CheckpointSnapshot;
}
