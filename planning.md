# Dont Go Blind
The Decision Stress Tester helps people making resource-intensive decisions avoid unchecked commitment by systematically challenging hidden assumptions, weak evidence, contradictions, external realities, competitive pressure, and failure modes before they act. It succeeds only if the critique is specific, evidence-aware, challengeable, confidence-calibrated, and actionable. It fails if it leaves the user blindly confident, unnecessarily discouraged, under-challenged, over-challenged, or unable to take a concrete next step.

Reviews concrete, resource-intensive decisions with real consequences and challengeable assumptions. It accepts conversational input, but must extract a structured decision artifact before serious review. It outputs a fair, bias-aware, confidence-calibrated assessment that surfaces assumptions, evidence gaps, contradictions, risks, confidence limits, and next actions. It does not support blind validation, pure ideation, pure implementation, pure fact lookup, low-stakes preferences, professional determinations, emotional reassurance, certainty seeking, or final-decision delegation.

## Architecture: an agentic harness

The review is driven by a **model-directed agent control loop** (`apps/api/src/agent/`),
not a hardcoded stage sequence. Each turn the model chooses the next action from the
legal action space; the harness validates, forces, or terminates it — *"the model
proposes, the harness disposes."* This is what makes the system classifiable as an
agentic harness rather than a workflow, while preserving every original behavior.

- **Control loop** — `AgentRunner.run()` runs perceive → decide → act → observe until termination.
- **Action space** — stage actions (the 9 review stages), the `external_check` tool action, and control actions (`finalize` / `refuse_unsupported` / `request_clarification`). See `constants/agent-actions.ts`.
- **Decision** — `agent-decider.ts`: forced when one action is legal, model-proposed when several are, deterministic fallback on model error/illegal choice.
- **State / memory** — `agent-state.ts`, an immutable blackboard updated across turns.
- **Observation** — `observation.ts` reformats the last result + remaining gaps for the next decision.
- **Termination & budgets** — `termination.ts` + `AGENT_BUDGET` (max turns / tool calls / cost).
- **Guardrail interceptors** — the existing guardrail checklist, loop controller, intake gate, confidence cap, and eval run *around* every action, logic unchanged.
- **Observability** — the loop emits `agent_turn_started`, `action_selected`, `action_executed`, and `agent_terminated` trace events; the web view renders the user-visible decisions + termination.

**Functional invariant (hard constraint):** the harness changes *how the next step is
chosen*, never *what happens*. Every stage still runs, every guardrail still fires, every
loop is still bounded, the same terminal states are reached, and the output still validates
against `reviewOutputSchema`. The API test suite (228 tests) is the contract and stays green.
See `AGENTIC-HARNESS-PLAN.md` for the full design and `HARNESS-SCOPE-CHANGES.txt` for the
deviations from the planned scope.


