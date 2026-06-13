# HARNESS.md — "Don't Go Blind" Decision Stress-Tester

A **harness** is the framework an AI agent lives inside. This document describes the architecture
and design of the harness in this repo: what the agent gets for free, how it is constrained, how its
output is checked, how material flows in and out, and what fires when something goes wrong.

The worker is an LLM (BYOK — Anthropic or OpenAI). The domain is **resource-intensive decisions**:
the harness runs a bounded, skeptical review that stress-tests a decision's hidden assumptions, weak
evidence, contradictions, external realities, and failure modes, then returns a fair,
confidence-calibrated, actionable assessment.

> **Design principle: "the model proposes, the harness disposes."** Each turn the model proposes the
> next action; the harness validates it, forces it when only one move is legal, or terminates the
> run. The model never controls budgets, completeness, output validity, guardrails, or alarms.

---

## 1. Architecture — the model-directed control loop

The loop lives in `apps/api/src/agent/`:

| Module | Role |
|---|---|
| `agent-runner.service.ts` | The control loop: perceive → decide → act → observe, until a terminal action. All post-processing (intake routing, confidence cap, guardrail checklist, bounded loop, eval, metrics, **alarms**, **checkpoints**). |
| `agent-decider.ts` | Per-turn selection: `forced` (one legal action) / `model` (several legal) / `fallback` (model error or illegal proposal). |
| `action-space.ts` | `legalActions(state)` — preconditions gate every choice so a stage can never be skipped and `finalize` is illegal until the run is complete. |
| `agent-state.ts` | Immutable blackboard (working memory) — `completedActions` drives the completeness gate. |
| `observation.ts` | Formats the last result + remaining gaps for the model each turn. |
| `termination.ts` + `AGENT_BUDGET` | Hard ceilings: `MAX_TURNS=32`, `MAX_TOOL_CALLS=8`, `MAX_COST_USD=2.0`. |
| `policy.ts` | Forced-action / precondition policy. |
| `action-handlers.ts` | Thin wrappers around the structured review stages + the tool. |

The action space (`@dgb/shared/constants/agent-actions.ts`) is typed: nine review stages, an
`external_check` tool action, and three terminal control actions (`finalize`, `refuse_unsupported`,
`request_clarification`).

---

## 2. The four pillars (each a distinct, identifiable component, separate from the worker)

### Pillar 1 — Guardrails (constrain behavior; *declared, not implicit*)
- **Where:** `apps/api/src/guardrails/guardrail-registry.ts` + `guardrail-checklist.ts`.
- **Declared:** `GUARDRAIL_REGISTRY` is an array of 11 entries, each the 7-field shape
  (`category`, `trigger_condition`, `required_behavior`, `confidence_effect`,
  `terminal_state_effect`, `next_action_effect`, `user_facing_explanation`). It is validated at
  module load (`guardrailRegistryEntrySchema.parse`) — a malformed entry throws at startup.
- **Behavior change, not warning:** `runPreOutputChecklist` runs before output is assembled; a High
  confidence resting on weak/unverified evidence is **downgraded and capped**, which forces a limited
  review. Unsupported requests are reframed and refused. Triggers are emitted as `guardrail_triggered`.

### Pillar 2 — Checkpoints (evaluate outputs; *explicit pass/fail*)
- **Where:** `apps/api/src/eval/structural-evaluator.ts` + `eval-harness.service.ts`.
- **Explicit criteria:** `evaluateStructure(output)` applies deterministic rules across 12 dimensions
  (confidence calibration, fake precision, next-action quality, evidence discipline, …) and
  aggregates to `pass | weak | fail`: any `critical_failure` → `fail`; any `weak` → `weak`.
- **Persisted (replayable):** the result is written to the `EvalResult` table with
  `human_review_required = true` (a hard lock). A run's verdict can be read back without re-running
  any stage; see replay (§4).

### Pillar 3 — Material handling (clean interfaces in/out)
- **In:** `apps/api/src/ingestion/context-ingestion.service.ts` parses attachments (PDF/DOCX/PPTX/
  spreadsheet) + fetches URLs into validated `IngestedContextItem`s. The external-check interface is
  `apps/api/src/tools/tool-adapter.ts` — a `ToolAdapter` with a typed `ToolRequest`/`ToolResult`
  contract; `evidence-classifier.ts` decides what needs checking and folds results back immutably.
- **Out:** every review is assembled and validated against `reviewOutputSchema`
  (`packages/shared/src/schemas/review.ts`) at `finalize` before it is persisted — material never
  leaves the harness unvalidated.

### Pillar 4 — Alarms (fire when something goes wrong; *structured output*)
- **Where:** `apps/api/src/alarms/alarm-registry.ts` + `alarm.service.ts`; contract in
  `packages/shared/src/schemas/alarm.ts`.
- **Declared:** `ALARM_REGISTRY` binds each named alarm type (from the frozen `ERROR_TYPES` taxonomy)
  to a **severity** (`recoverable | limited | blocking | terminal`), a **category**, and a fixed
  **recommended action**. Validated at module load.
- **Structured output:** `AlarmService.raise()` produces a validated `Alarm`
  = `{ type, severity, stage, message, context, recommended_action }`, persists it to the `Alarm`
  table, and emits an `alarm_raised` trace event (carrying `error_type` + `error_severity` columns +
  the recommended action in `details`). Fully fail-safe — an alarm can never break the run it reports.
- **Where it fires (in the runner):** tool/external-check failure (`tool_error`), hard budget
  ceilings (`cost_budget_exceeded` / `retry_budget_exceeded`), an evaluation critical failure
  (`critical_failure_detected`), and any unhandled / schema-validation failure
  (`schema_validation_error` / `unknown_error`).
- **Read it:** `GET /telemetry/alarms/:runId` (also visible inline on the trace).

| Pillar | Distinct component | Declared / explicit | Persisted |
|---|---|---|---|
| Guardrails | `guardrails/` | `GUARDRAIL_REGISTRY` (11 entries, validated) | `guardrail_triggers` in output |
| Checkpoints | `eval/` | 12 dimensions → `pass\|weak\|fail` | `EvalResult` table |
| Material | `tools/` + `ingestion/` | `ToolAdapter` contract / `reviewOutputSchema` | `Review.outputJson` |
| Alarms | `alarms/` | `ALARM_REGISTRY` (type→severity→action) | `Alarm` table + trace |

---

## 3. Behavior changes meaningfully on guardrail/checkpoint feedback

- **Confidence cap:** `doConfidence` caps a calibrated High to Medium when intake flagged weak
  evidence; `runPreOutputChecklist` downgrades again if a High still rests on unverified support.
- **Bounded reassessment loop:** when confidence changes materially, `loop/loop-controller.ts`
  (`evaluateLoop`) grants **exactly one** re-selection of the next action, hard-capped and forbidden
  without material change. The agent literally re-frames its recommendation in response to the
  checkpoint feedback (`agent-runner.service.ts:applyGuardrailsAndLoop`).

---

## 4. "Should" / Bonus capabilities

### Swappable agent interface (drop in a different worker, no harness changes)
`apps/api/src/providers/` defines `ProviderAdapter` (`provider-adapter.ts`) — a single
`complete(request, apiKey)` method over provider-agnostic `CompletionRequest`/`CompletionResult`
types (`provider.types.ts`). `ProviderRegistry` (`provider.registry.ts`) resolves a `ProviderName`
to its adapter; **Anthropic and OpenAI adapters are both registered today**. The harness loop,
stages, guardrails, checkpoints, and alarms never know which provider ran. Adding a worker = implement
`ProviderAdapter`, register it, add its name to the `Provider` union — zero loop changes.

**Second-worker swap demo:** submit a decision with `X-Provider-Name: anthropic`, then submit the
same decision with `X-Provider-Name: openai` (toggle in the web settings panel). Identical harness,
different worker, both reach a terminal review.

### Checkpoint persistence + replay-from-checkpoint
- `apps/api/src/agent/checkpoint.ts` defines the serializable run-state snapshot. After **every**
  completed stage, the runner persists a `Checkpoint` row (seq, action, JSON snapshot) — fail-safe.
- `AgentRunner.replay(runId, fromSeq, byok)` rehydrates the snapshot and resumes the **same loop**.
  Because `legalActions(state)` is derived from `completedActions`, prior stages are never re-offered
  or re-run — the run continues *forward* from the checkpoint.
- API: `GET /reviews/:id/checkpoints` (list resume points) and `POST /reviews/:id/replay { fromSeq }`.
- **The BYOK key is never part of a checkpoint** — it is re-supplied per replay request.

### Human-in-the-loop escalation (knows when to stop and ask)
`apps/api/src/workflow/intake-controller.ts` classifies intake. When a request is **unsupported** the
harness forces `refuse_unsupported` (reframe, never answer); when **blocking fields are missing** it
forces `request_clarification` and surfaces the questions (`clarification_requested`) rather than
guessing. Both are terminal — the harness stops and asks.

---

## 5. Observability

The `phase8.v1` trace spine (`@dgb/shared/constants/trace-events.ts`) records every state transition
and reason (never hidden reasoning): control-loop turns (`agent_turn_started`, `action_selected`,
`action_executed`, `agent_terminated`), every stage, tool call, confidence change, guardrail trigger,
loop, **`alarm_raised`**, and terminal event. Every event is persisted (`TraceService`) and an
additive, fail-safe OpenTelemetry bridge (`apps/api/src/telemetry/`, gated on `OTEL_ENABLED`) exports
spans + metrics. Read APIs: `GET /telemetry/traces/:runId`, `/telemetry/metrics/:runId`,
`/telemetry/alarms/:runId`.

---

## 6. Running it

```bash
pnpm install
pnpm --filter @dgb/shared build      # build shared contracts first
pnpm --filter @dgb/api exec prisma migrate deploy   # apply DB migrations (SQLite)
pnpm dev                             # api + web in parallel
```
- Typecheck: `pnpm -r typecheck` (all three projects).
- Test: `pnpm --filter @dgb/api test` (262 tests — the behavioral contract).
- Demo: open the web app, paste a decision from `DEMO-INPUTS.md`, watch the live agent trace.

---

## 7. Invariants (the behavioral contract)

The harness changes *how the next step is chosen*, never *what happens*. Functional invariants
**I1–I12** are specified in `AGENTIC-HARNESS-PLAN.md §3` (e.g. I1 unsupported requests refused; I4
High-on-weak-evidence downgraded + capped; I5 loops only on material change; I6 tools never fabricate;
I10 output validates `reviewOutputSchema`; I11 per-run eval + human-review lock). The 262-test API
suite (`pnpm --filter @dgb/api test`) is the contract — alarms and replay were added **additively**
(new modules, one new trace event, two new tables) with every pre-existing spec still green.
