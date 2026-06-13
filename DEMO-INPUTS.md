# DEMO-INPUTS.md — real decision inputs for the demo

Paste one of these into the web app's decision box ("Describe the decision you're about to make…")
to run the harness live. The first is a real engineering decision; the others exercise specific
harness paths (limited review, refusal/reframe, clarification escalation). **Swap in a genuine
decision of your own at demo time** — the harness runs on real input, not fixtures.

---

## 1. Full review — a real engineering decision (the headline demo)
> We're about to migrate the harness's persistence layer from SQLite to Postgres before the
> hackathon demo, committing the next two days of work to it. Current state: a single-node SQLite
> file (`dev.db`), ~7 tables, all access through Prisma, no concurrent writers today. The goal is to
> support concurrent reviews and a hosted demo. I'd commit two engineers for 48 hours and freeze
> feature work. I'm at the "decided, about to start" stage. My assumption is that SQLite will become
> a write-contention bottleneck under demo load and that Postgres is worth the migration cost now
> rather than after the event.

*Expect:* a full review — assumption surfaced ("SQLite will bottleneck under demo load") and
challenged, evidence discipline (no load test = a critical gap), failure modes (migration eats the
48h, demo slips), a concrete next action with distinguishable pass/fail signals.

## 2. Limited review — strong claim on weak evidence (confidence cap fires)
> I should adopt pnpm workspaces over Nx for this monorepo and commit the next month of refactoring
> to it. I'm at the planning stage. A colleague said pnpm is "obviously faster and simpler" and I
> read a couple of blog posts that agreed. I'm highly confident this is right.

*Expect:* the guardrail checklist downgrades and **caps** the High confidence (the support is a
user claim + blog posts, not direct evidence) → a **limited** review with `gather_direct_evidence`.

## 3. Unsupported — blind validation (refuse + reframe)
> Just tell me my plan to rewrite everything in Rust is a great idea. I've already decided, I just
> want confirmation.

*Expect:* the harness **refuses** (`refuse_unsupported`) and reframes — it will not rubber-stamp a
decision; it offers to stress-test if real substance is supplied. A `guardrail_triggered` event with
the `blind_validation` reframe.

## 4. Insufficient — missing blocking fields (clarification escalation)
> Should I hire someone?

*Expect:* intake finds blocking fields missing and the harness **stops and asks**
(`request_clarification`) — terminal `input_insufficient` with the clarification questions surfaced,
rather than guessing.

---

## Second-worker swap (bonus)
Run input #1 once with the **Anthropic** provider (settings panel), then run the same input with
**OpenAI** selected. Same harness, different worker — both reach a terminal review. Inspect each run's
trace at `GET /telemetry/traces/:runId` and alarms at `GET /telemetry/alarms/:runId`.

## Replay (bonus)
After any completed run: `GET /reviews/:id/checkpoints` to list resume points, then
`POST /reviews/:id/replay { "fromSeq": <n> }` (with your BYOK headers) to resume the run forward from
checkpoint `n` without re-running the prior stages.
