# The Harness

This document explains how the "Don't Go Blind" decision reviewer works under the hood.

A harness is the code an AI model runs inside. The model does the thinking. The harness decides what the model is allowed to do next, checks what it produces, and stops it when something goes wrong. In this project the model is an LLM you bring your own key for (Anthropic or OpenAI). The job is to review a resource-intensive decision: take someone's messy description of a choice they are about to make, pull out the real decision, and stress-test it against hidden assumptions, weak evidence, contradictions, outside reality, and ways it could fail. The result is a fair, confidence-calibrated, actionable assessment.

The whole design follows one rule: the model proposes, the harness disposes. Every turn the model suggests the next action. The harness then validates that action, or forces it when only one move is legal, or ends the run. The model never controls the budget, never decides when the review is complete, never decides whether its own output is valid, and never silences a guardrail or an alarm.

## Where the code lives

The control loop is in `apps/api/src/agent/`. Each file does one thing.

- `agent-runner.service.ts` runs the loop. It perceives the current state, asks for a decision, executes the chosen action, records the result, and repeats until a terminal action. It also owns all post-processing: intake routing, the confidence cap, the guardrail checklist, the bounded reassessment loop, the evaluation, metrics, alarms, and checkpoints.
- `agent-decider.ts` picks the action for one turn. It returns one of three sources: `forced` when exactly one action is legal, `model` when several are legal and the model chose, or `fallback` when the model errored or proposed something illegal.
- `action-space.ts` answers one question: given the current state, which actions are legal right now? Preconditions gate every choice, so the model can never skip a stage or run `finalize` before the review is actually complete.
- `agent-state.ts` is the blackboard. It holds everything the loop carries across turns, and every helper returns a new copy instead of mutating the old one.
- `observation.ts` writes the short, deterministic briefing the model reads each turn: where the run stands, what is done, and which actions are legal.
- `termination.ts` holds the hard ceilings. Thirty-two turns, eight tool calls, two dollars.
- `policy.ts` is the gatekeeper. It validates a proposed decision against budget and legality before anything runs.
- `action-handlers.ts` wraps the existing review stages and the external-check tool. It runs them. It does not reimplement them.

The list of actions itself lives in `@dgb/shared/constants/agent-actions.ts`: nine review stages, one `external_check` tool action, and three terminal actions (`finalize`, `refuse_unsupported`, `request_clarification`).

## How one turn works

Read `agent-decider.ts` and `policy.ts` together and the loop is simple.

First the harness asks the action space which actions are legal. If only one is legal, the harness takes it without calling the model at all. This covers most turns, because the review has a natural order and most steps have a single valid successor. A forced move is deterministic, so the spine's guarantees hold even though a model drives the loop.

When several actions are legal, the model has a real choice. The two common forks are "verify another piece of evidence" versus "move on" and "keep going" versus "finalize." The harness sends the model the legal set and accepts its pick only if the pick is in that set. If the model errors, times out, or names an action that is not legal, the harness falls back to a fixed order: drain pending external checks first, then take the earliest legal stage. A broken model call never stalls the run.

Before any action executes, `policy.ts` runs the decision past two checks. If the run is out of budget, it terminates. If the action is illegal, it is rejected and the legal set comes back so the loop can re-prompt. Only a legal, in-budget action runs.

## The action space keeps the review honest

The review has a canonical order, and `action-space.ts` enforces it with preconditions. Each stage names its predecessor: you cannot extract the artifact before you assess sufficiency, you cannot assess evidence before you discover assumptions, and so on down the line. `finalize` stays illegal until every mandatory stage has run. An external check stays illegal until evidence has been assessed, illegal once the tool budget is spent, and illegal when nothing is waiting to be checked.

This is the trick that lets a model choose the order without breaking anything. Functionality is the floor, set by preconditions. Agency is the freedom above that floor. The model gets to make the genuine calls, and the harness guarantees it can never make an invalid one.

## The four pillars

Each pillar is a separate component, declared up front rather than buried in logic, and each leaves a record you can read back.

### Guardrails constrain behavior

The code is in `apps/api/src/guardrails/`. `GUARDRAIL_REGISTRY` is a list of eleven entries. Each entry has the same seven fields: the category, the condition that triggers it, the behavior it requires, its effect on confidence, its effect on the terminal state, its effect on the next action, and a plain explanation for the user. The registry validates when the module loads, so a malformed entry crashes startup instead of failing silently later.

A guardrail changes behavior. It does not just print a warning. `runPreOutputChecklist` runs before the output is assembled. A High confidence that rests on weak or unverified evidence gets downgraded and capped, which forces a more limited review. An unsupported request gets reframed and refused. Every trigger emits a `guardrail_triggered` trace event.

### Checkpoints evaluate the output

The code is in `apps/api/src/eval/`. `evaluateStructure(output)` runs deterministic rules across twelve dimensions, including confidence calibration, fake precision, the quality of the recommended next action, and evidence discipline. It rolls those up to one verdict: `pass`, `weak`, or `fail`. Any critical failure makes it `fail`. Any single weak finding makes it `weak`. The harness writes the result to the `EvalResult` table and sets `human_review_required` to true, which is a hard lock. You can read a run's verdict back later without rerunning a single stage.

### Material handling keeps clean interfaces in and out

On the way in, `apps/api/src/ingestion/context-ingestion.service.ts` parses attachments (PDF, DOCX, PPTX, spreadsheets) and fetches URLs into validated context items. External checks go through one typed contract, `ToolAdapter` in `apps/api/src/tools/tool-adapter.ts`, with a `ToolRequest` in and a `ToolResult` out. The classifier decides what actually needs checking and folds results back into state immutably. On the way out, every review validates against `reviewOutputSchema` at `finalize` before it is saved. Nothing leaves the harness unvalidated.

### Alarms fire when something breaks

The code is in `apps/api/src/alarms/`. `ALARM_REGISTRY` maps each named error type, drawn from a frozen taxonomy, to a severity (`recoverable`, `limited`, `blocking`, or `terminal`), a category, and a fixed recommended action. The registry validates at module load. `AlarmService.raise()` produces a validated alarm object, saves it to the `Alarm` table, and emits an `alarm_raised` trace event. The whole path is fail-safe, so raising an alarm can never break the run that the alarm reports on.

Alarms fire on tool failure, on hitting a hard budget ceiling, on an evaluation critical failure, and on any unhandled or schema-validation error. Read them at `GET /telemetry/alarms/:runId`, or see them inline on the trace.

## Behavior really does change on feedback

This is the part that separates a real agent from a fixed script.

The confidence cap works in two places. `doConfidence` caps a calibrated High down to Medium when intake already flagged the evidence as weak. The pre-output checklist downgrades again if a High still rests on unverified support by the end.

When confidence shifts in a material way, the loop controller in `apps/api/src/loop/loop-controller.ts` grants exactly one chance to reselect the next action. The pass is hard-capped at one and is forbidden without a material change, so the loop cannot spin. The agent uses that pass to reframe its recommendation in response to the checkpoint feedback. The wiring is in `applyGuardrailsAndLoop` in the runner.

## Swapping the worker

The model behind the harness is replaceable without touching the loop. `apps/api/src/providers/provider-adapter.ts` defines one method, `complete(request, apiKey)`, over provider-agnostic request and result types. The registry resolves a provider name to its adapter. Both the Anthropic and OpenAI adapters are registered today, and the loop, the stages, the guardrails, the checkpoints, and the alarms never know which one ran.

To demonstrate it, submit a decision with the header `X-Provider-Name: anthropic`, then submit the same decision with `X-Provider-Name: openai` (the web settings panel toggles this). Same harness, different worker, both reach a terminal review. Adding a third worker means writing one adapter, registering it, and adding its name to the provider union. The loop does not change.

## Checkpoints and replay

After every completed stage the runner saves a `Checkpoint` row: a sequence number, the action, and a JSON snapshot of run state. The save is fail-safe. `AgentRunner.replay(runId, fromSeq, byok)` rehydrates a snapshot and resumes the same loop from that point. Because the legal action set comes from what has already completed, replay never reoffers or reruns a finished stage. It moves forward from the checkpoint, not backward.

The API is `GET /reviews/:id/checkpoints` to list resume points and `POST /reviews/:id/replay { fromSeq }` to resume. The BYOK key is never part of a checkpoint. You resupply it on each replay request.

## Knowing when to stop and ask

`apps/api/src/workflow/intake-controller.ts` classifies the input first. When the request is something the reviewer should not answer, the harness forces `refuse_unsupported` and reframes instead of answering. When required fields are missing, it forces `request_clarification`, surfaces the specific questions, and stops rather than guessing. Both outcomes are terminal. The harness would rather stop and ask than fill in a blank itself.

## Observability

A single trace spine, `phase8.v1` in `@dgb/shared/constants/trace-events.ts`, records every state change and the reason for it. That includes each loop turn (`agent_turn_started`, `action_selected`, `action_executed`, `agent_terminated`), every stage, every tool call, every confidence change, every guardrail trigger, every reassessment loop, every alarm, and the terminal event. The trace records decisions and reasons, not hidden chain-of-thought.

`TraceService` persists every event. An OpenTelemetry bridge in `apps/api/src/telemetry/` exports spans and metrics; it is additive, fail-safe, and off unless you set `OTEL_ENABLED=true`. Read the data at `GET /telemetry/traces/:runId`, `GET /telemetry/metrics/:runId`, and `GET /telemetry/alarms/:runId`. These read APIs work whether or not the OTel export is on, because they read the persisted tables.

### Fleet-wide metrics: `GET /telemetry/metrics/summary`

This route returns one aggregate rollup across every recorded run, so you can read fleet health in a single call instead of paging the per-run list. It mirrors the established instruments. Count breakdowns cover terminal state, eval result, final confidence, search depth, and cost accuracy. Distributions report the average plus p50, p95, p99, and max for duration, cost, loop count, and tool calls. Reliability totals cover retries, clarifications, guardrail triggers, and the number of runs that hit the loop cap.

```json
{
  "total_runs": 142,
  "duration_ms":     { "count": 142, "avg": 18450, "p50": 16200, "p95": 41800, "p99": 58000, "max": 61000 },
  "cost_usd":        { "count": 138, "avg": 0.093, "p50": 0.081, "p95": 0.21, "p99": 0.28, "max": 0.31, "total": 12.84 },
  "loop_count":      { "count": 142, "avg": 0.4, "p50": 0, "p95": 1, "p99": 2, "max": 3 },
  "tool_call_count": { "count": 142, "avg": 1.2, "p50": 1, "p95": 4, "p99": 6, "max": 8 },
  "max_loop_reached_count": 3,
  "retry_count": 7,
  "clarification_count": 9,
  "guardrail_triggers": 38,
  "terminal_state": { "review_complete": 130, "failed": 4, "refused": 8 },
  "eval_result": { "pass": 110, "weak": 25, "fail": 7 },
  "final_review_confidence": { "High": 40, "Medium": 78, "Low": 12 },
  "search_depth": { "no_search": 90, "shallow_search": 40, "deep_search": 12 },
  "cost_accuracy": { "exact": 100, "estimated": 38, "unknown": 4 }
}
```

Three behaviors to know when you read it:

- Percentiles use the nearest-rank method, so p95 is the smallest sample at or above the 95th percentile. There is no interpolation inventing a value between two runs.
- The cost distribution covers only runs that recorded a cost, and `count` tells you how many. A null cost means unknown, not zero, so folding it in would drag every percentile down. `total` still sums every recorded cost.
- Turn count and the per-run action mix are not in this aggregate. They live on the `agent_terminated` trace event and the `run_metrics` log line, because the persisted `Metric` table does not carry a turn-count column.

With no runs recorded yet, the route returns the empty rollup (`total_runs: 0`, empty breakdowns, zeroed distributions), not a 404.

## Running it

```bash
pnpm install
pnpm --filter @dgb/shared build                      # build the shared contracts first
pnpm --filter @dgb/api exec prisma migrate deploy     # apply the SQLite migrations
pnpm dev                                              # run the api and web together
```

- Typecheck everything: `pnpm -r typecheck`.
- Run the API tests: `pnpm --filter @dgb/api test`.
- Try it: open the web app, paste a decision from `DEMO-INPUTS.md`, and watch the trace play out live.

## The contract

The harness changes how the next step gets chosen. It never changes what happens. Every stage still runs, every guardrail still fires, every loop stays bounded, and the output still validates against `reviewOutputSchema`. The invariants are written out as I1 through I12 in `AGENTIC-HARNESS-PLAN.md`. A few of them: unsupported requests get refused (I1), a High built on weak evidence gets downgraded and capped (I4), the loop runs only on a material change (I5), tools never fabricate a result (I6), and the output always validates (I10).

The API test suite is the real contract. If a change would move an existing test or an evaluation verdict, the change is wrong, not the test. Alarms and replay were added on top of that suite as new modules, one new trace event, and two new tables, with every earlier test still passing.
