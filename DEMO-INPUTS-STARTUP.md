# DEMO-INPUTS-STARTUP.md — startup / business decision inputs for the demo

Same harness as `DEMO-INPUTS.md`, different domain. Paste one of these into the web app's decision
box ("Describe the decision you're about to make…") to run the stress-tester on a **startup /
business** decision instead of an engineering one. The harness is decision-agnostic — it only needs
the five blocking fields filled (`decision`, `current_state`, `end_goal`, `commitment_consequence`,
`decision_stage`), so each input below is written to carry them. **Swap in your own real startup
decision at demo time** — the value is in stress-testing a genuine bet, not a fixture.

Each input maps to one of the four harness paths (full review, limited/confidence-cap, refuse +
reframe, clarification escalation).

---

## 1. Full review — a real startup bet (the headline demo)
> We're about to go all-in on a B2B vertical SaaS for independent physical-therapy clinics —
> scheduling, insurance billing, and patient intake in one tool. Current state: a two-founder team,
> 8 weeks of runway-funded prototype, 12 clinics on a waitlist from cold outreach, zero paying
> customers yet, and one signed LOI. The goal is to hit $10k MRR in 6 months and use that to raise a
> pre-seed. The commitment: both founders quit our jobs next month and put $40k of savings into the
> first year, forgoing other consulting income. I'm at the "decided, about to commit" stage. My
> core assumption is that clinics are underserved by existing tools (Jane, WebPT) and will switch for
> a cheaper all-in-one, and that the waitlist will convert to paying customers at >30%.

*Expect:* a full review — the load-bearing assumption surfaced ("clinics will switch / waitlist
converts >30%") and challenged, evidence discipline (a waitlist + one LOI is not validated demand →
a critical gap), external reality (incumbents Jane/WebPT, switching costs, insurance-billing
complexity), failure modes (runway dies before $10k MRR, billing compliance sink), and a concrete
next action with a distinguishable pass/fail signal (e.g. "convert N waitlist clinics to a paid
pilot before quitting").

## 2. Limited review — strong claim on weak evidence (confidence cap fires)
> I should pivot our consumer fitness app to an AI personal-trainer subscription and spend the next
> quarter rebuilding around it. Current state: a live app with 2k MAU and flat growth, a 3-person
> team, ~5 months runway. End goal is to 5x revenue within the year off the AI tier. The commitment
> is a full quarter of roadmap and our remaining design budget. I'm at the planning stage. An advisor
> said AI fitness is "obviously where the market is going" and I read a few Twitter threads and a
> TechCrunch piece that agreed. I'm highly confident this is the right pivot.

*Expect:* the guardrail checklist downgrades and **caps** the High confidence — the support is an
advisor opinion + press/social posts, not direct evidence of *your users'* willingness to pay → a
**limited** review whose next action is `gather_direct_evidence` (e.g. a fake-door / pre-sell test to
your own 2k MAU before committing the quarter).

## 3. Unsupported — blind validation (refuse + reframe)
> Just tell me my idea — an Uber but for dog walking — is a great startup. I've already decided to
> raise money for it, I just want the confirmation so I can pitch with confidence.

*Expect:* the harness **refuses** (`refuse_unsupported`, `blind_validation` mode) and reframes — it
will not rubber-stamp the idea. It offers to stress-test the bet if real substance is supplied
(market, unit economics, what's been validated). A `guardrail_triggered` event with the
`blind_validation` reframe.

## 4. Insufficient — missing blocking fields (clarification escalation)
> Should I start a company?

*Expect:* intake finds the blocking fields missing (no decision specifics, no current state, no
goal, no stakes, no stage) and the harness **stops and asks** (`request_clarification`) — terminal
`input_insufficient` with the clarification questions surfaced, rather than guessing what company,
with what resources, at what stage.

---

## More startup variants (swap-ins)

These also produce **full reviews** — use them if you want a second live run in a different business
flavor. Each carries all five blocking fields.

**Pricing change.**
> We're about to triple our SaaS price from $29 to $99/mo for all new customers and grandfather
> existing ones. Current state: $18k MRR across 600 self-serve accounts, 4% monthly churn, mostly
> SMB. Goal is to move upmarket and hit $50k MRR in a year without growing headcount. Commitment: a
> full pricing-page + positioning relaunch and pausing our current lead-gen ads for two weeks during
> the switch. I'm at the "decided, scheduling it" stage. My assumption is that we're badly
> underpriced and that demand is inelastic enough that conversion won't collapse at 3x.

**Hire vs. agency.**
> I'm about to hire a full-time VP of Sales instead of continuing with a fractional sales agency.
> Current state: founder-led sales, $30k MRR, ~$220k cash in the bank, closing 2-3 deals/month
> myself. Goal is to take myself out of the sales seat and double new-logo rate in 9 months.
> Commitment: a ~$180k/yr base+OTE hire plus 3 months of ramp where pipeline may dip. I'm at the
> "have two finalist candidates, about to make an offer" stage. My assumption is that a senior hire
> will outperform the agency and that our motion is repeatable enough to hand off.

**Raise vs. bootstrap.**
> We're about to raise a $1.5M seed round rather than keep bootstrapping. Current state: $40k MRR
> growing 8% MoM, profitable, 5 people, no outside capital. Goal is to hit $1M ARR in 18 months and
> own a category before a well-funded competitor does. Commitment: 3 months of fundraising attention
> off the product, ~18% dilution, and a board seat. I'm at the "decided to raise, building the deck"
> stage. My assumption is that capital will accelerate us faster than profitable reinvestment and
> that the competitive window is closing.

## Second-worker swap & replay (bonus)
Same as `DEMO-INPUTS.md`: run input #1 once with **Anthropic** and once with **OpenAI** (settings
panel) to show one harness / two workers; inspect each run's trace at
`GET /telemetry/traces/:runId`. After any completed run, list resume points with
`GET /reviews/:id/checkpoints` and resume forward with `POST /reviews/:id/replay { "fromSeq": <n> }`.
