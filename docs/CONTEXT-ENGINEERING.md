# Context engineering

This page is the lookup surface for context budgeting: what occupies the window and roughly
how much, how to measure it rather than guess, every control FORGE exposes with the exact
environment variable or setting that drives it, arithmetic for a 200k window, and the symptoms
that identify a badly budgeted session.

The argument for treating the window as the scarce resource, and the habits that follow from
it, are in [`../guides/the-context-guide.md`](../guides/the-context-guide.md). This page
assumes you have read that once and now need a number, a default, or a variable name.

Prerequisites: [CONCEPTS.md](CONCEPTS.md) for which primitive is resident and which is
deferred, and [capability-surface-selection.md](capability-surface-selection.md) for the
routing questions that decide where a capability belongs.

## What consumes the window

Two things determine cost: the size of a component and how often it is charged. A small
component charged every turn beats a large one charged once.

| Consumer | Charged | Typical magnitude | Set by |
| --- | --- | --- | --- |
| Harness system prompt | Every turn | Several thousand tokens | The harness; not yours |
| Built-in tool definitions | Every turn | Hundreds of tokens per tool | The harness; partly yours |
| MCP tool definitions | Every turn | About 500 tokens per tool | Which servers you connect |
| Rule files | Every turn | 300–1,500 tokens each | Which rule packs you install |
| `CLAUDE.md` chain | Every turn | 1,000–5,000 tokens combined | How long you let it grow |
| SessionStart injection | Turn one, then resident | Capped, default 8,000 characters | `FORGE_SESSION_START_MAX_CHARS` |
| Agent descriptions | Every delegation decision | 500–3,000 tokens per agent | Frontmatter length |
| Skill bodies | On trigger, then resident | 1,000–6,000 tokens each | Description quality |
| Files read | Once, then resident forever | About 4,000 tokens per 400 source lines | Read ranges, not files |
| Tool output | Per call, then resident | 2,000–20,000 tokens for a verbose test run | Filtering |
| Conversation history | Grows every turn | Unbounded until compaction | Session scoping |

The magnitudes above follow the estimation rules in
[`skills/context-budget/`](../skills/context-budget/): prose at `words × 1.3`, code at
`chars / 4`, MCP tool schemas at about 500 tokens each. They are estimates for planning, not
measurements — see [measuring](#measuring-consumption) for the real numbers.

Three of these behave differently from how people expect them to.

**Agent descriptions are not deferred.** The body of an agent loads on spawn, but the
description is part of the delegation surface and is present whenever the model considers
delegating. A bloated description is charged even for agents that are never invoked.

**Reads never shrink.** A file read on turn three is still occupying the window on turn
ninety. There is no eviction short of compaction.

**Rules are charged unconditionally.** A rule file applies to every turn of every session
whether or not the turn has anything to do with its subject. 122 rule files ship in this
repository; installing all of them is a context decision disguised as a convenience.

### The thresholds FORGE flags

[`skills/context-budget/`](../skills/context-budget/) raises a finding when a component
crosses one of these. They are useful as design limits even if the skill never runs.

| Component | Flagged when |
| --- | --- |
| Agent file | Over 200 lines |
| Agent `description` frontmatter | Over 30 words |
| Skill `SKILL.md` | Over 400 lines |
| Rule file | Over 100 lines |
| `CLAUDE.md` chain, combined | Over 300 lines |
| One MCP server | Over 20 tools |
| MCP servers configured | More than 10 |

## Measuring consumption

Four instruments, cheapest first. Estimation is better than intuition; measurement is better
than estimation.

**The harness's own accounting.** Claude Code reports context usage directly. Check it when a
session starts feeling sluggish — that impression is usually correct and usually arrives late.

**The context-budget skill.** Invoke [`skills/context-budget/`](../skills/context-budget/) by
description; there is no command shim for it in this repository.

```text
Use the context-budget skill to audit this session's context consumption.
```

It runs four phases: inventory every agent, skill, rule, MCP server, and `CLAUDE.md` in the
chain with a token estimate; classify each as always, sometimes, or rarely needed; detect the
issue patterns above; and report total overhead against the window with the remaining
headroom. The classification is the valuable output — "rarely needed" is a removal list.

**The live context monitor.**
[`scripts/hooks/forge-context-monitor.js`](../scripts/hooks/forge-context-monitor.js) runs as
a PostToolUse hook and injects agent-facing warnings when a threshold is crossed. Its
constants, read out of the source:

| Signal | Constant | Value |
| --- | --- | --- |
| Context remaining, warning | `CONTEXT_WARNING_PCT` | 35% |
| Context remaining, critical | `CONTEXT_CRITICAL_PCT` | 25% |
| Session cost, notice / warning / critical | `COST_NOTICE_USD` / `COST_WARNING_USD` / `COST_CRITICAL_USD` | 5 / 10 / 50 USD |
| Files touched, scope-creep warning | `FILES_WARNING_COUNT` | 20 |
| Identical consecutive tool calls | `LOOP_THRESHOLD` | 5 |
| Metrics bridge staleness | `STALE_SECONDS` | 60 |

The loop detector requires all five of the last five calls to be byte-identical before it
fires. At three, ordinary retries and polling produced false positives.

**Reading the transcript directly.** The most honest number lives in the transcript's `usage`
records.
[`scripts/lib/transcript-context.js`](../scripts/lib/transcript-context.js) computes true
context size as the sum of three fields:

```text
context_size = input_tokens + cache_read_input_tokens + cache_creation_input_tokens
```

Cached tokens still occupy the window. Reading only `input_tokens` makes a nearly-full session
look comfortable. Any tooling built on transcripts must use all three.

The same module resolves the window denominator, and the order matters when a percentage is
reported. An explicit `FORGE_CONTEXT_WINDOW_TOKENS` or `CLAUDE_CODE_AUTO_COMPACT_WINDOW` wins;
then a `[1m]` marker in the model id; then a known large-window model family; then, if
observed tokens already exceed 200,000, the large window is assumed. Absent all of that the
standard 200,000-token window is assumed, and the code marks that result `inferred` so callers
do not present a guessed denominator as fact.

## The levers

Every control below is verified against the source that reads it. Where a default is stated,
it is the constant in the file named.

### Progressive disclosure

Load a capability's description always and its body only when needed. The five surfaces sit at
different points on that spectrum:

```text
  always resident ──────────────────────────────► loaded on demand

  rules          CLAUDE.md      agents          skills         scripts
  ─────          ─────────      ──────          ──────         ───────
  full body      full body      description     description    nothing
  every turn     every turn     always,         always,        until run
                                body on spawn   body on match
```

There is no environment variable for this lever. It is exercised by choosing the right surface
when you author, and by uninstalling what sits on the wrong one. The routing questions are in
[capability-surface-selection.md](capability-surface-selection.md); ask them in order and stop
at the first yes. The common failure is a long playbook written as a rule file, which is then
charged on every turn of every session regardless of relevance.

Rule packs are installed by copying directories, so the lever is what you copy:

```bash
cp -R rules/common      ~/.claude/rules/forge/
cp -R rules/typescript  ~/.claude/rules/forge/
```

### Session-start injection

Everything injected at session start is resident from turn one.

| Variable | Default | Effect |
| --- | --- | --- |
| `FORGE_SESSION_START_CONTEXT` | on | `0`, `false`, `off`, `none`, or `disabled` turns injected context off entirely |
| `FORGE_SESSION_START_MAX_CHARS` | 8000 | Character cap on injected context; `0` also disables |
| `FORGE_SESSION_RETENTION_DAYS` | 30 | How long session files are kept before pruning |
| `FORGE_MAX_INJECTED_INSTINCTS` | 6 | Cap on learned instincts injected at session start |
| `FORGE_INSTINCT_CONFIDENCE_THRESHOLD` | 0.7 | Confidence floor an instinct must clear to be injected |
| `FORGE_INSTINCT_RELEVANCE_RANKING` | on | `off`, `false`, `0`, or `no` disables relevance ranking of instincts |

Defaults are the constants in
[`scripts/hooks/session-start.js`](../scripts/hooks/session-start.js). When the injection is
truncated the hook says so inline and names both variables, so a truncation notice in the
opening context is the signal to lower the cap deliberately rather than let it clip.

The instinct caps exist because an uncapped learning system is a context leak that grows every
day it is used. Details of the learning system itself are in [MEMORY-GUIDE.md](MEMORY-GUIDE.md).

### MCP surface pruning

Tool definitions are resident. At roughly 500 tokens per tool, the arithmetic gets ugly fast:

```text
   3 servers x  8 tools =  24 tools ≈  12,000 tokens/turn
   6 servers x 12 tools =  72 tools ≈  36,000 tokens/turn
  10 servers x 15 tools = 150 tools ≈  75,000 tokens/turn
```

At the bottom row you have also created a selection problem: the model chooses among 150
similarly-described options every turn, and selection accuracy degrades well before the window
does.

| Variable | Effect |
| --- | --- |
| `FORGE_DISABLED_MCPS` | Comma-separated server names filtered out of FORGE-generated configuration at install and sync time |
| `FORGE_MCP_CONFIG_PATH` | Point at a smaller MCP configuration file |
| `FORGE_MCP_HEALTH_TIMEOUT_MS` | Bound on the health check performed by the `pre:mcp-health-check` and `post:mcp-health-check` hooks |
| `FORGE_MCP_HEALTH_FAIL_OPEN` | Whether a failed health check blocks or passes through |

Two patterns are worth removing on sight. A server exposing more than 20 tools is a whole
budget line by itself. A server whose tools shell out to a command the agent already has —
`gh`, `git`, `npm`, a cloud CLI — is pure cost, because the Bash tool covers it at zero
marginal schema. FORGE's own default is exactly one connector, stated in
[MCP-CONNECTOR-POLICY.md](MCP-CONNECTOR-POLICY.md); selection guidance is in
[MCP-GUIDE.md](MCP-GUIDE.md).

### Retrieval instead of reading

Most waste is reading things that were never needed. This lever is behavioral, not
configurable, and it has the highest per-turn return of anything on this page.

| Instead of | Do | Typical saving |
| --- | --- | --- |
| Reading a 900-line file | `grep -n "symbol" path`, then read that range | Most of it |
| Reading a directory | `git grep -l "pattern" -- 'src/**'`, then read the hits | Most of it |
| `ls -R` | `git ls-files \| head -50`, or a targeted glob | Most of it |
| Full test output | `npm test 2>&1 \| tail -40`, or run one test file | Most of it |
| Full `git log` | `git log --oneline -10` | Most of it |
| Full `git diff` | `git diff --stat`, then diff named files | Varies |
| Re-reading a file already read | Trust the earlier read | All of it |

Two skills formalize the discipline. [`skills/search-first/`](../skills/search-first/) checks
whether an existing tool, library, or in-repo pattern already solves the problem before code
gets written. [`skills/iterative-retrieval/`](../skills/iterative-retrieval/) handles the
delegated case, where the subagent does not know which files it needs until it starts: dispatch
with a minimal set, evaluate, refine, repeat.

Delegation is itself a retrieval lever. A subagent's window is not your window, so exploration,
dependency archaeology, and log triage cost your session only the size of the answer. The
relevant dials are harness settings rather than FORGE variables:

```json
{
  "model": "sonnet",
  "env": {
    "MAX_THINKING_TOKENS": "10000",
    "CLAUDE_CODE_SUBAGENT_MODEL": "haiku"
  }
}
```

Tier selection is covered in [COST-AND-MODEL-ROUTING.md](COST-AND-MODEL-ROUTING.md).

### Compaction

[`scripts/hooks/suggest-compact.js`](../scripts/hooks/suggest-compact.js) runs as a PreToolUse
hook on Edit and Write and combines two signals. The primary one is real context size from the
transcript; the secondary is a tool-call count.

| Variable | Default | Effect |
| --- | --- | --- |
| `COMPACT_CONTEXT_THRESHOLD` | 160,000 on a 200k window, 250,000 on a 1M window | Token count at which the first suggestion fires; `0` disables the context signal |
| `COMPACT_CONTEXT_INTERVAL` | 60,000 | Additional context growth before the suggestion repeats |
| `COMPACT_THRESHOLD` | 50 | Tool-call count for the first suggestion, then every 25 |
| `COMPACT_STATE_TTL_DAYS` | 14 | Sweep interval for stale per-session state files |
| `FORGE_CONTEXT_WINDOW_TOKENS` | Detected | Explicit window size; overrides detection |

Tool count alone is a poor proxy — three large reads can fill a window in three calls, and
fifty trivial calls can leave it nearly empty — which is why the context-size signal is
primary.

Set `FORGE_CONTEXT_WINDOW_TOKENS` explicitly on any model whose window is neither 200k nor
marked `[1m]`. Without it the threshold defaults to a 200k denominator and a 400k-window
session reports roughly double its real usage.

Compaction is not free. Decisions, the current task, file paths, and plan shape survive it;
exact error strings, precise line numbers, and the reason an approach was abandoned routinely
do not. That asymmetry is why the useful discipline is to compact at a task boundary rather
than at a threshold, and why `/save-session` belongs before `/compact` rather than after.
[`skills/strategic-compact/`](../skills/strategic-compact/) exists to move the event earlier,
to a point you choose. `PreCompact` fires
[`scripts/hooks/pre-compact.js`](../scripts/hooks/pre-compact.js), which persists state before
the harness discards conversation.

### Hook and observation overhead

Observation writes to disk rather than to the window, so it is a storage cost rather than a
context cost — but the hooks that produce it run on every tool call and the instincts they
produce are injected later.

| Variable | Effect |
| --- | --- |
| `FORGE_HOOK_PROFILE` | `minimal`, `standard`, or `strict`; default `standard` |
| `FORGE_HOOKS_ENABLED` | Master switch for the hook layer |
| `FORGE_DISABLED_HOOKS` | Comma-separated hook ids to turn off individually |
| `FORGE_SKIP_OBSERVE` | Skip the observation runner |
| `FORGE_LLM_SUMMARY_MODEL` | Model for the session summarizer; defaults to `haiku` |
| `FORGE_LLM_SUMMARY_INTERVAL` | Turns between summaries; defaults to 50 |
| `FORGE_LLM_SUMMARY_CONTEXT_THRESHOLD` | Context-percentage floor before summarizing; defaults to 20 |

Turning capture off entirely is a matter of naming the hook ids:

```bash
export FORGE_DISABLED_HOOKS="pre:observe:continuous-learning,post:observe:continuous-learning"
```

The full configuration surface, including precedence between the five sources, is in
[CONFIGURATION.md](CONFIGURATION.md). Hook semantics are in [HOOKS-GUIDE.md](HOOKS-GUIDE.md).

## A worked budget for a 200k window

The arithmetic below is an illustration of the method, not a measurement of any particular
install. Substitute your own numbers from the measurement step.

**Step 1 — fixed overhead, charged every turn.**

```text
  harness system prompt + built-in tools     ~ 12,000
  rules: common (10 files) + 1 language pack ~  9,000     10 files x ~600, plus pack
  CLAUDE.md chain (user + project)           ~  3,000
  MCP: 2 servers x 9 tools = 18 tools        ~  9,000     18 x ~500
  SessionStart injection (8,000 chars / 4)   ~  2,000
  ─────────────────────────────────────────────────────
  fixed subtotal                             ~ 35,000     17.5% of a 200k window
```

**Step 2 — reserve.** Compaction headroom and the model's own output need at least 20% of the
window. On 200k that is 40,000 tokens that never belong to the task.

```text
  working budget = 200,000 - 35,000 - 40,000 = 125,000
```

Note what this says. A 200k window with a routine FORGE install is a 125k working window. The
gap between 200,000 and 125,000 is where most surprise comes from.

**Step 3 — allocate the working budget.**

| Category | Share | Tokens | Note |
| --- | ---: | ---: | --- |
| Task statement and plan | 5% | 6,000 | If it needs more, decompose the task |
| Files read | 30% | 38,000 | About nine 400-line files, or many more ranges |
| Tool output | 25% | 31,000 | Two verbose test runs will exhaust this |
| Conversation history | 30% | 38,000 | What compaction reclaims |
| Slack | 10% | 12,000 | Never plan to spend it |

**Step 4 — check the shape.**

| Number | Healthy | Investigate |
| --- | --- | --- |
| Fixed overhead as a share of the window | Under 15% | Over 25% |
| Rule packs installed | `common` plus one or two | Five or more |
| MCP servers connected | 0–4 | 8 or more |
| `CLAUDE.md` chain, combined | Under 300 lines | Over 500 lines |
| Compactions per working session | 0–1 | 3 or more |
| Turns before the first read exceeds 10k tokens | More than 5 | Fewer than 3 |

Three or more compactions in one session is a scoping problem rather than a context problem.
The session is doing several unrelated jobs and should have been several sessions with a saved
record between them.

**Step 5 — reconcile.** Run the context-budget skill and compare. Where the two disagree, the
skill is usually right about component sizes and you are usually right about which components
you actually use.

## Failure signatures

Symptom first, because that is what you notice.

| Symptom | Likely cause | Check |
| --- | --- | --- |
| The model re-asks something it was told twenty turns ago | Compaction dropped a constraint stated once | Was there a compaction? Was the constraint written to a file? |
| Answers get vaguer as the session runs, with no error | Dilution — relevant material outnumbered by irrelevant | Context percentage; count of files read |
| Sessions start heavy before you type anything | SessionStart injection or rule layer too large | Context-budget skill; `FORGE_SESSION_START_MAX_CHARS` |
| The model picks the wrong tool repeatedly | Too many similarly-described MCP tools | Total tool count; disable servers with `FORGE_DISABLED_MCPS` |
| A skill that should have loaded did not | Description too narrow, or the window was already crowded | Skill run telemetry; the description's trigger wording |
| Compaction fires mid-refactor, every time | Waiting for auto-compaction instead of choosing a boundary | Lower `COMPACT_CONTEXT_THRESHOLD`; use `/save-session` then compact |
| Percentages reported look wrong for the model | Window denominator inferred as 200k | Set `FORGE_CONTEXT_WINDOW_TOKENS` explicitly |
| Cost rises across the board after adding components | Resident overhead grew | Context-budget skill; compare against the previous audit |
| The same tool call repeats with no progress | A loop, not a context problem, but it burns the window | The monitor's loop warning at five identical calls |
| Everything is fine until file twenty | Reads accumulate and never evict | Read ranges; delegate exploration to a subagent |

## Maintenance cadence

Context debt accumulates silently; a short recurring pass keeps it bounded.

| Cadence | Action | Surface |
| --- | --- | --- |
| Per session | Save before compacting | `/save-session` |
| Weekly | Delete stale low-confidence instincts | [`/prune`](../commands/prune.md) |
| Monthly | Audit total consumption | [`skills/context-budget/`](../skills/context-budget/) |
| Monthly | Sweep stale and orphaned configuration | [`skills/config-gc/`](../skills/config-gc/) |
| Monthly | Split daily-use from library components | [`skills/agent-sort/`](../skills/agent-sort/) |
| Quarterly | Fold recurring principles into rules | [`skills/rules-distill/`](../skills/rules-distill/) |
| Quarterly | Audit skill quality and overlap | [`skills/skill-stocktake/`](../skills/skill-stocktake/) |
| After adding components | Re-audit before adding more | [`skills/context-budget/`](../skills/context-budget/) |

## Related pages

| Topic | Where |
| --- | --- |
| Why the window is the constraint, with habits | [`../guides/the-context-guide.md`](../guides/the-context-guide.md) |
| Every setting and its precedence | [CONFIGURATION.md](CONFIGURATION.md), [token-optimization.md](token-optimization.md) |
| Which surface a capability belongs on | [capability-surface-selection.md](capability-surface-selection.md), [CONCEPTS.md](CONCEPTS.md) |
| What persists once it leaves the window | [MEMORY-GUIDE.md](MEMORY-GUIDE.md) |
| MCP scoping and connector trust | [MCP-GUIDE.md](MCP-GUIDE.md), [MCP-CONNECTOR-POLICY.md](MCP-CONNECTOR-POLICY.md) |
| Model tiers and spend | [COST-AND-MODEL-ROUTING.md](COST-AND-MODEL-ROUTING.md) |
| Per-lane context cost of running several agents | [ORCHESTRATION-PATTERNS.md](ORCHESTRATION-PATTERNS.md) |
| Rule layer design | [RULES-GUIDE.md](RULES-GUIDE.md), [`../RULES.md`](../RULES.md) |
| Session operating notes | [`../WORKING-CONTEXT.md`](../WORKING-CONTEXT.md) |
