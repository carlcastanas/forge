# Cost and model routing

This page is the reference for where an agent session's money goes and which controls change
it: the components of session cost and how each one scales, how to route work to model tiers,
the tier distribution this repository actually ships, what caching buys, the cost surfaces
FORGE provides, and how to tell whether a cost reduction quietly cost quality too.

No per-token prices appear here. Provider rates change, and a number copied into a document
outlives its accuracy. Where a ratio matters — cache reads against fresh input, for instance —
the ratio is stated and the source in the repository is named.

Prerequisites: [CONTEXT-ENGINEERING.md](CONTEXT-ENGINEERING.md), because almost every cost
lever is a context lever wearing different units.

## The cost model of a session

Six components. They scale differently, which is why a single "reduce token usage" instinct
optimizes the wrong one about half the time.

| Component | Scales with | Notes |
| --- | --- | --- |
| Input tokens | Window contents x turns | Everything resident is re-sent every turn |
| Output tokens | What the model writes, including reasoning | Priced well above input on every tier |
| Cache writes | First occurrence of cached content | Charged above the input rate |
| Cache reads | Cached content x turns | Charged far below the input rate |
| Tool-call round trips | Number of tool calls | Each one re-sends the whole window |
| Subagent fan-out | Number of concurrent lanes | Each lane pays full fixed overhead |

### Input dominates through repetition

The single most counter-intuitive property is that input tokens are charged per turn, not per
session. A resident 30,000-token preamble in a forty-turn session is charged forty times. This
is why the rule layer, the `CLAUDE.md` chain, and MCP tool schemas are the highest-leverage
cost items in a long session, and why trimming them beats almost any other intervention.

```text
  cost(session) ≈ Σ over turns [ resident + accumulated_history + new_input ]
                + Σ over turns [ output ]
```

The accumulated-history term is why cost grows superlinearly in session length. Turn sixty pays
for everything read on turn three.

### Output is a different animal

Output tokens are priced above input on every tier, and internal reasoning counts as output.
`MAX_THINKING_TOKENS` is the quiet control here: it applies per request and, in a wave,
multiplies by the number of workers.

```json
{
  "model": "sonnet",
  "env": {
    "MAX_THINKING_TOKENS": "10000",
    "CLAUDE_CODE_SUBAGENT_MODEL": "haiku"
  }
}
```

Lowering it is a large saving on routine work. Raising it deliberately for architecture and
design work is the correct use of the knob; leaving it high everywhere is not.

### Tool calls are turns

Every tool call is a round trip, and every round trip re-sends the window. A session that runs
forty greps has forty windows' worth of input, not one. Two consequences: batch independent
reads into a single turn where the harness allows it, and treat an unbounded retry loop as a
cost incident rather than a nuisance. FORGE's context monitor fires a loop warning when the
last five tool calls are byte-identical, which is the signature of exactly that.

### Retries

Retry policy belongs in the design, not in the reflex. The pattern in
[`skills/cost-aware-llm-pipeline/`](../skills/cost-aware-llm-pipeline/) is narrow by
construction: retry only on transient errors — connection failures, rate limits, server errors
— with exponential backoff and a hard attempt cap, and fail immediately on authentication or
bad-request errors. Retrying a request that will never succeed is pure spend.

### Subagent fan-out multiplies fixed overhead

```text
  single agent                     wave of four
  ───────────────                  ─────────────────────────────────
  system prompt      x1            system prompt      x4
  tool definitions   x1            tool definitions   x4
  rules layer        x1            rules layer        x4
  task context       x1            task context       x4 + split cost
  work tokens        the point     work tokens        the point
                                   merge + verify     new, not free
```

The practical rule that follows: **subagent tier matters more than orchestrator tier.** A wave
multiplies whatever tier the workers run on, so `CLAUDE_CODE_SUBAGENT_MODEL` changes a wave's
economics far more than the orchestrator's own model does. Wave shapes and their overheads are
catalogued in [ORCHESTRATION-PATTERNS.md](ORCHESTRATION-PATTERNS.md).

## Routing to model tiers

FORGE uses three tier names throughout — `haiku`, `sonnet`, `opus` — in agent frontmatter, in
the routing command, and in the cost tracker's rate table.

### The routing heuristic

[`commands/model-route.md`](../commands/model-route.md) states it in three lines, and returns a
recommendation, a confidence level, the reasoning, and a fallback tier:

| Tier | For |
| --- | --- |
| `haiku` | Deterministic, low-risk, mechanical changes |
| `sonnet` | Default for implementation and refactors |
| `opus` | Architecture, deep review, ambiguous requirements |

```text
/model-route [task-description] [--budget low|med|high]
```

The complementary heuristic in [`skills/cost-aware-llm-pipeline/`](../skills/cost-aware-llm-pipeline/)
routes programmatically on input size rather than on judgment: above a character threshold or an
item-count threshold the work goes to the larger tier, below it to the smaller. That is the
right shape for a pipeline processing many similar inputs, where per-item judgment is not
available.

### Escalate on evidence, not on anticipation

Start at the tier the work looks like and escalate when something concrete happens: the smaller
tier produced an answer that failed verification, the task turned out to be ambiguous in a way
that needs a decision, or the blast radius turned out to be larger than the request implied.
Escalating pre-emptively on every task is the most common way a cost profile doubles without
anyone deciding to double it.

### The tier distribution this repository ships

Measured by reading the `model:` frontmatter across every file in
[`../agents/`](../agents/). All 68 agents declare a tier; none inherits a default.

| Tier | Agents | Share |
| --- | ---: | ---: |
| `sonnet` | 58 | 85% |
| `haiku` | 6 | 9% |
| `opus` | 4 | 6% |
| **Total** | **68** | **100%** |

The four `opus` agents are [`architect`](../agents/architect.md),
[`planner`](../agents/planner.md), [`spec-miner`](../agents/spec-miner.md), and
[`healthcare-reviewer`](../agents/healthcare-reviewer.md). Three of the four sit at the front
of the workflow, where a bad decision is the expensive kind — architecture, planning, and
extracting a specification from an ambiguous request. The fourth is a domain reviewer in a
regulated area. This matches the repository's stated convention, which is that anything above
`sonnet` must be justified in the agent's own definition.

The six `haiku` agents are [`comment-analyzer`](../agents/comment-analyzer.md),
[`conversation-analyzer`](../agents/conversation-analyzer.md),
[`doc-updater`](../agents/doc-updater.md), [`docs-lookup`](../agents/docs-lookup.md),
[`opensource-forker`](../agents/opensource-forker.md), and
[`opensource-packager`](../agents/opensource-packager.md). All six are mechanical: look
something up, restate it, package it, or classify it. None of them makes a decision another
agent depends on.

Two observations about the shape of that distribution, offered as an interpretation rather than
a rule. The heavy `sonnet` middle is deliberate — implementation and review are where a wrong
answer is cheap to catch and expensive to have been wrong about, which is exactly the middle
tier's territory. And the small `haiku` group is arguably the underused one: several of the 58
`sonnet` agents perform read-and-report work that would likely survive a tier drop, which makes
tier review a real optimization opportunity for an operator willing to measure it.

Background work already defaults down. The session summarizer defaults to `haiku`
(`FORGE_LLM_SUMMARY_MODEL`), as does the observer loop (`FORGE_OBSERVER_MODEL`). Both are
overridable, and both are the right shape for the cheapest tier: high volume, low stakes, no
downstream dependency on the output being subtle.

### Where a tier is set

| Level | Mechanism | Wins over |
| --- | --- | --- |
| Agent | `model:` in the agent's frontmatter | The session default for that agent |
| Subagent default | `CLAUDE_CODE_SUBAGENT_MODEL` | The session model for delegated work |
| Session | Harness `model` setting | The account default |
| Background summarizer | `FORGE_LLM_SUMMARY_MODEL` | Its own default of `haiku` |
| Background observer | `FORGE_OBSERVER_MODEL` | Its own default of `haiku` |

## Caching

Caching is the one lever that reduces cost without reducing what the model sees. The tracker's
rate table in [`scripts/hooks/cost-tracker.js`](../scripts/hooks/cost-tracker.js) encodes the
economics as ratios against the input rate for the same tier: a cache write costs 1.25x input,
and a cache read costs 0.1x input. Those ratios are the tracker's model of provider billing at
the time it was written; the file names its source and should be treated as the authority for
what the tracker computes rather than as a live price list.

The consequence is simple arithmetic. Content that is re-sent more than about twice pays for
its own cache write and then costs a tenth of the alternative for every turn after that. In a
forty-turn session, caching a stable preamble is nearly a 90% saving on that preamble.

What that implies for how a prompt is arranged:

- **Put stable content first and variable content last.** Caching works on prefixes. A prompt
  whose first line changes every turn caches nothing.
- **Stable means the rule layer, the `CLAUDE.md` chain, and long system instructions.** These
  are the components most worth caching precisely because they are the components charged every
  turn.
- **Do not chase the cache by making variable content stable.** Padding a prompt to hit a cache
  boundary trades one cost for another and usually loses.
- **Cached tokens still occupy the context window.** Caching changes the price of the window, not
  its size. The budgeting arithmetic in [CONTEXT-ENGINEERING.md](CONTEXT-ENGINEERING.md) is
  unaffected by it.

The mechanics of marking a prefix cacheable, for code you write yourself rather than for the
harness, are shown in [`skills/cost-aware-llm-pipeline/`](../skills/cost-aware-llm-pipeline/).

## Cost surfaces in this repository

Each was verified to exist at the path shown.

| Surface | What it does |
| --- | --- |
| `stop:cost-tracker` hook — [`scripts/hooks/cost-tracker.js`](../scripts/hooks/cost-tracker.js) | Reads the transcript on `Stop`, sums usage across assistant turns, and appends one row to `~/.claude/metrics/costs.jsonl` |
| [`commands/cost-report.md`](../commands/cost-report.md) | Summarizes that log by day, model, and session; `csv` exports recent rows |
| [`skills/cost-tracking/`](../skills/cost-tracking/) | The skill behind cost questions: reading the metrics log, breakdowns, budgets |
| [`skills/cost-aware-llm-pipeline/`](../skills/cost-aware-llm-pipeline/) | Patterns for code you write: routing by complexity, immutable cost tracking against a budget limit, narrow retry, prompt caching |
| [`skills/token-budget-advisor/`](../skills/token-budget-advisor/) | Offers the user an explicit choice of response depth before answering, when depth is the thing being controlled |
| `FORGE_CONTEXT_MONITOR_COST_WARNINGS` | Gates the cost warnings emitted by [`scripts/hooks/forge-context-monitor.js`](../scripts/hooks/forge-context-monitor.js); defaults on |
| [`skills/context-budget/`](../skills/context-budget/) | Audits resident overhead, which is the input-side driver of session cost |

### Reading the tracker correctly

The row schema is:

```text
{ timestamp, session_id, transcript_path, model, input_tokens, output_tokens,
  cache_write_tokens, cache_read_tokens, estimated_cost_usd }
```

Each row is a **cumulative snapshot for that session**, because `Stop` fires per assistant
response rather than once per session. Per-session cost is therefore the *latest* row for a
`session_id`, and total spend is the sum of those latest rows. Summing every row multiplies the
count. This is the entire reason [`/cost-report`](../commands/cost-report.md) exists rather than
a shell one-liner over the file.

Two accuracy caveats stated in the hook's own header. The hard-coded rate table cannot represent
long-context or extended-cache billing tiers, so it under-counts on long sessions. And summing a
full transcript double-counts work carried across a `--resume` boundary. When the statusline
publishes an authoritative per-session figure to a fresh cache file, the hook prefers it over
its own estimate; absent that writer, the estimate stands. Treat the log as a good relative
signal and a rough absolute one.

### The live warnings

[`scripts/hooks/forge-context-monitor.js`](../scripts/hooks/forge-context-monitor.js) emits
agent-facing notices at 5, 10, and 50 USD of estimated session cost, alongside its context,
file-count, and loop signals. Subscription users, for whom per-request cost estimates are not
meaningful, can silence the cost tier while keeping the rest:

```bash
export FORGE_CONTEXT_MONITOR_COST_WARNINGS=off
```

### What the tracker does not see

External-model workflows are outside it. [`/multi-plan`](../commands/multi-plan.md),
[`/multi-execute`](../commands/multi-execute.md), [`/multi-backend`](../commands/multi-backend.md),
[`/multi-frontend`](../commands/multi-frontend.md), and
[`/multi-workflow`](../commands/multi-workflow.md) route work through the external
`ccg-workflow` runtime, which is a second vendor's cost surface that never reaches
`costs.jsonl`. Budget for those separately.

## Reducing spend, in order of leverage

| Lever | Typical effect | Control |
| --- | --- | --- |
| Remove rule packs you do not use | Large, every turn, forever | What you copy into the rules directory |
| Disconnect unused MCP servers | Large, every turn | `FORGE_DISABLED_MCPS`, `FORGE_MCP_CONFIG_PATH` |
| Cap the session-start injection | Moderate, every turn | `FORGE_SESSION_START_MAX_CHARS` |
| Route subagents down a tier | Large in a wave, none otherwise | `CLAUDE_CODE_SUBAGENT_MODEL` |
| Lower reasoning budget on routine work | Moderate, per request | `MAX_THINKING_TOKENS` |
| Grep instead of reading whole files | Large, and compounds | Behavioral |
| Filter tool output | Moderate, spiky | Behavioral |
| Compact at boundaries instead of thresholds | Moderate | `COMPACT_CONTEXT_THRESHOLD`, `/save-session` |
| Scope sessions to one job | Moderate | Behavioral |
| Cache the stable prefix | Up to ~90% of that prefix after the first turn | Prompt arrangement |
| Drop the orchestrator's own tier | Small | Session model setting |

The last row is where people start and it is nearly the least effective. The first two are
where the money is.

## Did the cost reduction hurt quality?

A cost number alone is not a result, in either direction. The procedure is the same one used
for any other change, applied with cost as the treatment rather than the outcome.

**1. Have a baseline before you cut.** Record pass@1, pass@3, consistency, cost per task, and
wall-clock per task on a fixed set, three runs each, before the change. Without it there is no
way to distinguish "cheaper and equally good" from "cheaper and worse in a way nobody noticed
for a month". Building that set is covered in [EVALUATION-GUIDE.md](EVALUATION-GUIDE.md).

**2. Change one lever.** Tier, thinking budget, rule packs, MCP surface — one at a time. A
combined change that regresses gives no attribution.

**3. Re-run the set and read the per-task deltas, not the aggregate.** Cost reductions
characteristically fail on a subset: the tasks that needed the capability you removed. An
aggregate that holds steady while two hard tasks flip to failing is a regression wearing a flat
number.

**4. Watch the trailing indicators, not just pass rate.** These move before pass rate does:

| Indicator | Rising means |
| --- | --- |
| Human intervention count | The model needs correcting more often |
| Retries and re-prompts per task | First answers are getting worse |
| Wall-clock per task | A cheaper tier is taking more turns to converge |
| Tool calls per task | More exploration to reach the same place |
| Review findings per diff | Output quality dropped where tests do not look |
| Escalations to a higher tier | The routing decision is being overridden in practice |

A tier drop that halves cost while doubling interventions has not saved anything. It moved the
spend from the invoice to the operator, where it is harder to see.

**5. Check the failure shape.** A cheaper tier fails differently rather than uniformly worse.
The characteristic signature is confident, plausible, subtly wrong output on tasks with an
ambiguity the smaller tier did not notice. That is exactly what the should-refuse bucket in an
eval set is for, and exactly what a positive-only set will miss.

**6. Decide explicitly, and write it down.** Some quality losses are worth the saving. Recording
which trade was made, and on which measurements, is what stops it being relitigated every
quarter.

## Related pages

| Topic | Where |
| --- | --- |
| Context economics, which drive input cost | [CONTEXT-ENGINEERING.md](CONTEXT-ENGINEERING.md) |
| Measuring quality alongside cost | [EVALUATION-GUIDE.md](EVALUATION-GUIDE.md) |
| Wave overheads and lane budgets | [ORCHESTRATION-PATTERNS.md](ORCHESTRATION-PATTERNS.md), [`../guides/the-orchestration-guide.md`](../guides/the-orchestration-guide.md) |
| Every environment variable and its precedence | [CONFIGURATION.md](CONFIGURATION.md) |
| Token-reduction settings and habits | [token-optimization.md](token-optimization.md) |
| Choosing a model tier when authoring an agent | [AGENT-AUTHORING.md](AGENT-AUTHORING.md) |
| The agent catalog and routing contract | [`../AGENTS.md`](../AGENTS.md) |
