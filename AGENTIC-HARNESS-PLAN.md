# Adapting "Don't Go Blind" into an Agentic Harness

**Goal:** Make the system *unambiguously classifiable as an agentic harness* — a model that
directs its own process through a control loop over a tool/action space — **without changing what
the product does**. It still serves its original purpose: bounded, skeptical review of
resource-intensive decisions, with the same guardrails, tools, loops, intake gate, confidence
calibration, and review output.

> ## ⛔ Hard constraint: functionality is invariant
> "Full replace" means we replace **how the next step is chosen** (hardcoded order → model-directed
> loop). It does **not** mean we change **what happens**. Every stage still runs, every guardrail
> still fires, every loop is still bounded the same way, the same terminal states are reached, and
> the output still validates against `reviewOutputSchema`. The existing test + eval suite is the
> contract: it must stay green, unchanged, on the new agent path. If a behavior the suite asserts
> would change, the refactor is wrong — not the test.

**Decisions taken:**
- **Full replace** — the agent loop becomes the only execution path; the hardcoded stage sequence
  in `review-orchestrator.service.ts` is removed. (Behavior preserved; see §3.)
- **Visible** — the agent's per-turn decisions, action choices, and termination are surfaced in the
  existing trace UI so "it's an agent" is demonstrable live.

---

## 1. Why it isn't a harness today (the gap)

`apps/api/src/review/review-orchestrator.service.ts` runs a **fixed sequence** of structured LLM
stages (`runStage('sufficiency')` → `artifact` → `scope` → `assumptions` → `evidence` →
`realityRisks` → `confidence` → `nextAction` → `assembly`). Tools are invoked by *orchestrator code*,
not chosen by the model. The "loop" is a single guardrail-forced reassessment.

In the standard taxonomy this is a **workflow** (LLM calls orchestrated through predetermined code
paths), not an **agent** (LLM dynamically directs its own process and tool use in a loop). A reviewer
can correctly say: *not an agentic harness*. We change the control mechanism only.

## 2. What makes it a harness (target traits)

An agentic harness must exhibit all of:

1. **Model-directed control loop** — the LLM chooses the next action each turn; code does not hardcode the order.
2. **Action space** — a typed set of actions/tools the model selects from.
3. **State / working memory** — context carried and updated across loop iterations.
4. **Observation formatting** — action results fed back to the model to inform the next decision.
5. **Termination conditions** — explicit stop criteria and budgets.
6. **Guardrail interceptors** — policy enforced around every action.
7. **Observability / eval** — traces and evaluators over the loop.

Traits 2, 6, 7 already exist. This plan adds **1, 3, 4, 5** and re-frames 2/6/7 around the loop —
all while holding §3 invariant.

## 3. Functional invariants — the behavioral contract that MUST NOT change

The original purpose (from `planning.md`): *systematically challenge hidden assumptions, weak
evidence, contradictions, external realities, competitive pressure, and failure modes before the
user commits — specific, evidence-aware, challengeable, confidence-calibrated, actionable.* Every
row below is an existing, enforced behavior with a test/eval that proves it. The agent path must
reproduce **all** of them, with the **same tests passing unchanged**.

| # | Invariant (original behavior) | Enforced by (unchanged module) | Proven by (stays green) |
|---|---|---|---|
| I1 | Unsupported requests are refused/reframed, never answered | `intake-controller.ts` → `terminateUnsupported`; `guardrail-registry` | `bad7`, `reg4` (`guardrail_compliance`) |
| I2 | Missing blocking fields → terminate `input_insufficient` with clarifications (no stall) | `decideIntake` / `decideProgressBoundedIntake` | `intake-controller.spec`, `reg2` (`intake_stall_not_terminated`) |
| I3 | Weak-evidence intake caps confidence → `limited` review | `decideIntake` (`sufficient_limited`) + `capConfidence` | `golden3` (limited mode) |
| I4 | High confidence on weak/unverified evidence is downgraded + capped | `guardrail-checklist.runPreOutputChecklist` | `guardrail-checklist.spec`, `bad1`, `bad10` |
| I5 | Loops only on **material change**, hard-capped, forbidden purposes rejected | `loop-controller.evaluateLoop` (`MAX_LOOP_COUNT`) | `loop-controller.spec`, `reg1` (`loop_discipline`) |
| I6 | Tools never fabricate: unverifiable claims → `external_check_unavailable`, failures are limitations not contradictions | `model-only-tool.adapter`, `evidence-classifier` | `model-only-tool.adapter.spec`, `evidence-classifier.spec` |
| I7 | Evidence discipline: user_claim cannot be `strong`; gaps tracked | `evidence-classifier`, structural evaluator | `bad6` (`evidence_discipline`) |
| I8 | Output is categorical only — no fake numeric precision | structural evaluator | `bad2/3/8/11`, `reg3` (`output_clarity_boundedness`) |
| I9 | Next action has observable, non-identical pass/fail signals + commitment rule | structural evaluator | `bad4/5/9` (`next_action_quality`) |
| I10 | Output always validates `reviewOutputSchema`; terminal states unchanged | `reviewOutputSchema.parse` at assembly | all 6 golden cases |
| I11 | Per-run structural eval runs; human review remains a hard lock; eval is non-fatal | `eval-harness.service` | `structural-evaluator.spec`, `eval-judge.spec` |
| I12 | Cost + run metrics recorded on every terminal path; non-fatal | `metrics.service`, `metrics-builder` | `metrics-builder.spec` |

**Rule:** the harness wraps these modules; it does not modify them. `guardrails/*`, `tools/*`,
`workflow/intake-controller.ts`, `loop/loop-controller.ts`, `eval/*`, `metrics/*` and their specs
are touched **only** to be invoked from the runner, never to change logic.

## 4. The four pillars are preserved

| Pillar | Today | After |
|---|---|---|
| **Functionality** | Staged spine → `ReviewOutput` | Same stages, same `reviewOutputSchema`, same terminal states — now reached as *actions* the agent selects (§3 invariants) |
| **Guardrails** | `guardrails/guardrail-checklist.ts`, `guardrail-registry.ts` | **Post-action interceptors** wrapping the loop (logic unchanged) |
| **Tools** | `tools/tool-adapter.ts`, `model-only-tool.adapter.ts`, `evidence-classifier.ts` | The **action space** the model picks from (already pluggable) |
| **Loops** | `loop/loop-controller.ts` "material change or don't loop" | The runner's **re-entry policy**, same cap, same forbidden-purpose rejection |
| **Protection** | Intake gate, confidence caps, eval/human-review lock, cost tracking | **Harness policy**: preconditions, budgets, termination, validation enforced by the runner — *not* left to model whim |

> **Key principle that keeps protection and functionality deterministic under a model-driven loop:**
> *The model proposes, the harness disposes.* The model selects the next action; the harness
> validates preconditions, runs guardrails, enforces budgets, validates output with Zod, and
> guarantees completeness (every required stage runs before `finalize`). An illegal/unsafe/incomplete
> action is rejected or auto-corrected. Control flow becomes genuinely agentic without weakening any
> guarantee in §3.

---

## 5. Target architecture

New module: `apps/api/src/agent/`

```
agent/
  agent-runner.service.ts     # the control loop (replaces orchestrator internals)
  action-space.ts             # registry: action name -> handler + preconditions
  action-handlers.ts          # thin adapters wrapping existing stages + tools (no logic changes)
  agent-state.ts              # working memory (blackboard) + immutable updates
  observation.ts              # formats action result + remaining-gaps for the model
  agent-decision.ts           # "which action next + rationale" prompt + schema
  termination.ts              # stop conditions + budget checks
  policy.ts                   # pre/post-action guardrail + budget + completeness enforcement
  agent.module.ts
  *.spec.ts
```

### Action space (what the model chooses from)
- **Stage actions** (each = one existing structured LLM stage, unchanged prompt/schema via
  `workflow/stage-prompts.ts`): `assess_sufficiency`, `extract_artifact`, `confirm_scope`,
  `discover_assumptions`, `assess_evidence`, `check_reality_and_risks`, `calibrate_confidence`,
  `frame_next_action`, `assemble_output`.
- **Tool actions** (via existing `ToolAdapter`): `external_check` (search / fetch / ingest).
- **Control actions**: `finalize`, `refuse_unsupported`, `request_clarification`.

### The loop (perceive → decide → act → observe)
```
state = initial(input)
while not terminated:
  budget.check()                         # protection: max turns / tool calls / cost (I12-adjacent)
  decision = model.selectNextAction(observation(state, legalActions(state)))   # trait 1
  policy.validatePreconditions(decision, state)   # harness disposes (auto-correct/reject)
  result = actionSpace[decision.action].run(state)       # calls the SAME stage/tool code
  state = applyObservation(state, result)         # traits 3 + 4
  triggers = guardrails.intercept(state)          # I1, I4 — pillar: guardrails as interceptors
  state = applyGuardrails(state, triggers)         # I5 loop policy decides re-entry
  emitTrace(decision, result, triggers)           # visible in UI
terminate(state)                                   # trait 5 — same terminal states (I10)
```

### Completeness & ordering (how §3 survives a model-chosen order)
- **`legalActions(state)`** only offers actions whose preconditions are met, so the model cannot
  skip a required stage (e.g. `assemble_output` is illegal until evidence + confidence exist → I10;
  intake must resolve first → I1/I2).
- The decision prompt **steers toward the canonical spine order** as the default; deviation is
  allowed only when it still satisfies preconditions. Functionality is the floor, agency is the
  freedom above it.
- `finalize` is gated on a **completeness check** in `policy.ts`: all mandatory stages present, the
  pre-output guardrail checklist has run (I4), confidence reconciled with intake cap (I3), output
  parses (I10). Fail → the only legal next actions are the missing stages.

---

## 6. File-level changes

### `packages/shared/src/` (single source of truth — do first)
- `constants/agent-actions.ts` — `AGENT_ACTIONS` enum + `MAX_AGENT_TURNS`, budget constants.
- `schemas/agent.ts` — `agentDecisionSchema` (`{ action, rationale, target? }`), `agentStateSchema`.
- `constants/trace-events.ts` — add `agent_turn_started`, `action_selected`, `action_executed`,
  `agent_terminated` (+ `terminationReason`). Existing trace events kept.

### `apps/api/src/agent/` (new — the harness)
- Pure modules first (`agent-state`, `action-space`, `observation`, `termination`, `policy`) + unit
  tests, then `agent-runner.service.ts`.
- `action-handlers.ts` wraps `buildPrompt` / `STAGE_SCHEMAS` and the `ToolAdapter` — every existing
  LLM call and tool call is reused **verbatim**.

### `apps/api/src/review/review-orchestrator.service.ts` (gutted, contract identical)
- Replace the hardcoded stage body with a call into `AgentRunner.run(runId, input, byok)`.
- **Public signature unchanged** → `review.controller.ts`, HTTP API, and web app need no changes.
- The intake routing, external-check pass, guardrail checklist, eval, and metrics rollup **move** into
  the runner/policy/termination modules — same calls, same order-of-effects, just invoked by the loop.

### Kept verbatim (logic) — invoked, not modified
`guardrails/*`, `tools/*`, `workflow/intake-controller.ts` + `stage-prompts.ts`,
`loop/loop-controller.ts`, `eval/*`, `metrics/*`, and **all their specs**.

### `apps/web/app/review/[id]/` + `apps/web/lib/api.ts` (visibility only)
- Render the new trace events: per-turn **action chosen + rationale**, tool calls, **termination
  reason**. Reuse the existing `phase8.v1` trace plumbing in `trace.service.ts`. No output-contract change.

---

## 7. Phasing (incremental, suite stays green at every step)

- **Phase 0 — Contracts.** Add agent action/decision/trace-event schemas to `@dgb/shared`. Typecheck.
- **Phase 1 — Harness core.** Pure modules + unit tests. No wiring. Full suite still green.
- **Phase 2 — Action handlers.** Wrap each existing stage + tool primitive (reuse code unchanged).
- **Phase 3 — Control loop + cutover.** Implement `AgentRunner`; replace `ReviewOrchestrator`
  internals; keep entry identical. Port intake routing, confidence cap, guardrail checklist, eval,
  metrics. **Gate: every existing spec passes unchanged; all 6 golden / 11 bad / 4 regression eval
  cases keep their verdicts (§3).**
- **Phase 4 — Visibility.** Emit agent trace events; render decisions + termination in the web view.
- **Phase 5 — Eval/metrics.** Add turn count + action histogram to metrics; remove dead
  workflow-only code (only after the agent path is proven equivalent).
- **Phase 6 — Verify.** `pnpm typecheck && pnpm test`; classification checklist (§8) + functional
  invariants (§3) both confirmed; update `planning.md` / add CLAUDE.md describing the harness.

## 8. Acceptance — both bars must pass

**A. Functionality preserved (§3):** every existing spec green, unchanged; the 21 eval cases keep
their expected verdicts; terminal states and `reviewOutputSchema` unchanged; intake, guardrail,
loop, tool, eval, metrics behavior identical.

**B. Agentic-harness classification:**

- [ ] **Control loop** — `AgentRunner` runs perceive→decide→act→observe until termination.
- [ ] **Model-directed** — the LLM selects each next action from `legalActions(state)`; order not hardcoded.
- [ ] **Action space** — typed actions (stages, tools, control) the model chooses among.
- [ ] **State / memory** — `AgentState` blackboard updated immutably across turns.
- [ ] **Observation** — action results + remaining gaps reformatted for the next decision.
- [ ] **Termination & budgets** — max turns, max tool calls, max cost, terminal guardrails.
- [ ] **Guardrail interceptors** — policy enforced around every action.
- [ ] **Tool use** — pluggable `ToolAdapter` is the agent's external-action interface.
- [ ] **Observability / eval** — full trace of decisions + structural evaluator over the run.

If either bar fails at review, it isn't presentable — A protects the product, B earns the label.

## 9. Risks & mitigations

- **Behavior drift vs §3** → `legalActions` + completeness gate + post-action guardrail interceptors
  reproduce the invariants the fixed order gave for free; the unchanged spec + eval suite is the
  regression net and a Phase-3 gate.
- **Non-termination / runaway cost** → hard budgets in `termination.ts` (max turns, tool calls, USD).
- **Model picks an illegal/incomplete action** → `policy.validatePreconditions` rejects with the
  reason (bounded retries), then falls back to the only legal action; `finalize` blocked until complete.
- **Output/API contract change** → none: `reviewOutputSchema` and the HTTP/web contract are untouched.
