# CLAUDE.md — Don't Go Blind (Decision Stress-Tester)

A bounded, skeptical reviewer for resource-intensive decisions. It extracts a structured
decision artifact from conversational input, then challenges hidden assumptions, weak
evidence, contradictions, external realities, and failure modes — producing a fair,
confidence-calibrated, actionable assessment. See `planning.md` for product intent.

## The system is an agentic harness

The review is driven by a **model-directed control loop** in `apps/api/src/agent/`, not a
hardcoded sequence. Each turn the model proposes the next action; the harness validates,
forces, or terminates it — **"the model proposes, the harness disposes."**

Key modules (`apps/api/src/agent/`):
- `agent-runner.service.ts` — the control loop + all post-processing (intake routing,
  confidence cap, guardrail checklist, bounded reassessment loop, eval, metrics, trace).
  **Note: ~1010 lines, over the 800-line guideline — a known refactor candidate.**
- `agent-decider.ts` — pure per-turn selection: `forced` (one legal action) / `model`
  (several legal) / `fallback` (model error or illegal proposal).
- `action-space.ts` — `legalActions(state)`; preconditions gate the choice so a stage can
  never be skipped and `finalize` is illegal until the run is complete.
- `agent-state.ts` — immutable blackboard (working memory).
- `observation.ts` — formats the last result + remaining gaps for the model.
- `termination.ts` + `AGENT_BUDGET` — max turns / tool calls / cost.
- `policy.ts` — forced-action / precondition policy.
- `action-handlers.ts` — thin wrappers around the existing stages + tool (no logic changes).

Contracts live in `@dgb/shared`: `constants/agent-actions.ts` (action space + budgets),
`schemas/agent.ts` (`agentDecisionSchema`), `constants/trace-events.ts` (the four agent
events: `agent_turn_started`, `action_selected`, `action_executed`, `agent_terminated`).

## ⛔ Hard invariant — functionality must not change

The harness changes *how the next step is chosen*, never *what happens*. Every stage runs,
every guardrail fires, every loop stays bounded, the same terminal states are reached, and
output still validates against `reviewOutputSchema`. The modules under `guardrails/`,
`tools/`, `workflow/`, `loop/`, `eval/`, `metrics/` are **invoked by the runner, never
modified**. The 228-test API suite is the behavioral contract: if a change would make an
existing spec or eval verdict move, the change is wrong — not the test.

## Monorepo layout (pnpm workspace)

- `@dgb/shared` — Zod schemas + constants (single source of truth; edit first).
- `@dgb/api` — NestJS backend (the harness + review feature; all 16 spec files live here).
- `@dgb/web` — Next.js frontend (`apps/web/app/review/[id]/` renders the live agent trace;
  styling reuses the home-screen tokens/classes in `app/globals.css`).

## Commands

- Typecheck: `pnpm -r typecheck` (all three projects must pass).
- Test: `pnpm --filter @dgb/api test` (228 tests). `pnpm -r test` fails only because
  `@dgb/shared` has a `test` script but no spec files — pre-existing, not a regression.
- Dev: `pnpm dev` (api + web in parallel).

## Conventions

- TypeScript strict incl. `noUncheckedIndexedAccess`. Immutable updates only (spread,
  `readonly`); no mutation. No `console.log` (use the structured logger). Validate at
  boundaries with Zod. The BYOK provider key is per-request only — never persisted or logged.
- Import extensions: `@dgb/shared` uses `.js` on relative imports; `apps/api` uses **no**
  extension on relative imports.
- A GateGuard hook fires on the first Bash/Write/first-Edit of a file each session and asks
  you to state callers/affected-API/schemas/verbatim-instruction, then retry. Disable for a
  session with `ECC_GATEGUARD=off` if appropriate.

## Observability (OpenTelemetry — additive, off by default)

`apps/api/src/telemetry/` bridges the existing `phase8.v1` trace + metrics into OpenTelemetry.
It is **additive and fail-safe**: gated on `OTEL_ENABLED` (default `false`), every bridge call
is wrapped so it can never break a review, and the locked `metrics/` module is untouched (the
metrics tap lives in the runner; the trace tap at `TraceService.emit`). Set `OTEL_ENABLED=true`
to access:
- OTel metrics: `GET http://localhost:9464/metrics` (Prometheus; `OTEL_PROMETHEUS_PORT`).
- Per-run rollups: `GET /telemetry/metrics` and `GET /telemetry/metrics/:runId`.
- Full trace: `GET /telemetry/traces/:runId` (the `/telemetry/*` JSON endpoints read the
  persisted tables and work even with OTel disabled).
- Optional OTLP push: set `OTEL_EXPORTER_OTLP_ENDPOINT` (e.g. a Jaeger collector).

## Reference docs

- `AGENTIC-HARNESS-PLAN.md` — full design, invariants table (I1–I12), acceptance bars.
- `HARNESS-SCOPE-CHANGES.txt` — what deviated from the planned scope and what was traded off.
