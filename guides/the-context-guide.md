# The context guide

This guide treats the context window as the scarce resource it is: a fixed budget spent every turn, by things you chose and things you did not. It covers what actually occupies the window, how to measure it, how to defer loading until it is needed, what compaction costs, where state should live once it leaves the window, and how to size an MCP surface without quietly eating a fifth of your budget.

**Prerequisites:** a working FORGE install and one long session already behind you — ideally one that hit a compaction. Concepts from [getting started](getting-started.md) are assumed. [The orchestration guide](the-orchestration-guide.md) is the companion piece; every extra agent is another full window.

---

## Contents

- [Why the window is the constraint](#why-the-window-is-the-constraint)
- [What actually fills the window](#what-actually-fills-the-window)
- [Measuring it](#measuring-it)
- [Progressive disclosure](#progressive-disclosure)
- [Retrieval instead of reading](#retrieval-instead-of-reading)
- [The subagent as a context firewall](#the-subagent-as-a-context-firewall)
- [Compaction: what it buys, what it costs](#compaction-what-it-buys-what-it-costs)
- [Session storage and resumption](#session-storage-and-resumption)
- [Memory, file, or rule](#memory-file-or-rule)
- [The MCP tool-surface tax](#the-mcp-tool-surface-tax)
- [A budget worksheet](#a-budget-worksheet)
- [Maintenance cadence](#maintenance-cadence)
- [Anti-patterns](#anti-patterns)

---

## Why the window is the constraint

FORGE's operating claim is one sentence:

> Optimize the context window. Persist everything else.

The reasoning is mechanical. Everything the model can reason about this turn is in the window. Everything else does not exist. Output quality does not degrade at the moment the window overflows — it degrades well before that, as relevant material gets diluted by irrelevant material and as the model starts attending to the wrong parts of a very long prompt.

Three practical consequences.

**A full window is worse than a small one.** A 190k-token window where 40k is your actual task and 150k is a directory listing, three abandoned approaches, and the raw output of a test run performs worse than a 50k window containing only the task and the relevant files.

**The expensive mistakes are early.** A file read in turn three is still costing you in turn ninety. A rule pack installed once costs you in every turn of every session forever. Decisions about what loads are compounding.

**Persistence is the escape hatch.** Anything that must survive but does not need to be resident belongs in a file, a session record, or the memory vault — and gets pulled back in on demand. That is the second half of the claim, and it is what makes the first half survivable.

---

## What actually fills the window

The window is a stack, and most of it is spent before you type anything.

```text
  ┌────────────────────────────────────────────────┐  turn N context
  │ harness system prompt                          │  fixed, not yours
  ├────────────────────────────────────────────────┤
  │ tool definitions (built-in + every MCP tool)   │  ~500 tok/tool, always
  ├────────────────────────────────────────────────┤
  │ rules layer (rules/common + language packs)    │  always-on, yours
  ├────────────────────────────────────────────────┤
  │ CLAUDE.md chain (user + project + subdirs)     │  always-on, yours
  ├────────────────────────────────────────────────┤
  │ SessionStart injection (summaries, instincts)  │  capped, tunable
  ├────────────────────────────────────────────────┤
  │ skill bodies loaded this session               │  on demand
  ├────────────────────────────────────────────────┤
  │ files read                                     │  grows, never shrinks
  ├────────────────────────────────────────────────┤
  │ tool output (test runs, greps, fetches, MCP)   │  the usual culprit
  ├────────────────────────────────────────────────┤
  │ conversation history (yours and the model's)   │  grows every turn
  └────────────────────────────────────────────────┘
```

Rough magnitudes, using the `context-budget` skill's own estimation rules — prose at `words × 1.3`, code at `chars / 4`:

| Consumer | Typical size | Frequency | Controllable |
|---|---:|---|---|
| Harness system prompt | Several thousand tokens | Every turn | No |
| One built-in tool definition | Hundreds of tokens | Every turn | Partly |
| One MCP tool definition | ~500 tokens | Every turn | Yes — disable servers |
| One rule file | 300–1,500 tokens | Every turn | Yes — install fewer packs |
| `CLAUDE.md` chain | 1,000–5,000 tokens | Every turn | Yes — keep it short |
| One skill body | 1,000–6,000 tokens | When triggered | Yes — by description quality |
| One agent definition | 500–3,000 tokens | On each spawn | Yes — trim frontmatter |
| One 400-line source file | ~4,000 tokens | Once, forever | Yes — read ranges |
| One verbose test run | 2,000–20,000 tokens | Per run | Yes — filter output |
| One unfiltered `ls -R` | 5,000+ tokens | Per call | Yes — never do this |

The `context-budget` skill flags a component when it crosses a threshold, and those thresholds are useful defaults even if you never run the skill:

| Component | Flagged when |
|---|---|
| Agent file | Over 200 lines |
| Agent `description` frontmatter | Over 30 words |
| Skill `SKILL.md` | Over 400 lines |
| Rule file | Over 100 lines |
| `CLAUDE.md` chain, combined | Over 300 lines |
| MCP server | Over 20 tools |
| MCP servers configured | More than 10 |

The agent-description threshold surprises people. An agent's description is not loaded lazily — it is part of the delegation surface, so every bloated description is paid on every spawn decision.

---

## Measuring it

Estimating beats guessing, and measuring beats estimating. Four instruments, cheapest first.

### The harness's own accounting

Claude Code reports context usage directly. Check it whenever a session starts feeling sluggish — that feeling is usually correct and usually late.

### The context-budget skill

```text
Use the context-budget skill to audit my context consumption.
```

It runs four phases: inventory every agent, skill, rule, MCP server, and `CLAUDE.md` in the chain with a token estimate; classify each into **always needed** / **sometimes needed** / **rarely needed**; detect the issue patterns above; and report total overhead against the window with the effective headroom left.

The classification is the valuable output. "Rarely needed" — no command references it, its content overlaps another component, it does not match this project's stack — is a removal list, and removing a rule pack you never use is the single highest-return context action available.

### The live context monitor

`scripts/hooks/forge-context-monitor.js` runs as a PostToolUse hook and injects agent-facing warnings when a threshold is crossed. Its constants tell you what FORGE considers dangerous:

| Signal | Threshold | Meaning |
|---|---|---|
| Context remaining | 35% | Warning |
| Context remaining | 25% | Critical |
| Session cost | $5 / $10 / $50 | Notice / warning / critical |
| Files touched | 20 | Scope-creep warning |
| Identical consecutive tool calls | 5 | Loop warning |
| Bridge staleness | 60 seconds | Metrics considered stale |

The loop detector requires all five of the last five calls to be byte-identical before firing, deliberately: at three, ordinary retries and polling produced false positives. Subscription users who do not want the API-rate cost estimates can keep the context and loop warnings while silencing the cost ones:

```bash
export FORGE_CONTEXT_MONITOR_COST_WARNINGS=off
```

### Reading the transcript directly

The most honest number lives in the session transcript's `usage` records. `suggest-compact.js` computes true context size as:

```text
context_size = input_tokens + cache_read_input_tokens + cache_creation_input_tokens
```

Cached tokens still occupy the window. Reading only `input_tokens` will make a nearly-full session look comfortable. If you build your own tooling on top of transcripts, use all three fields.

---

## Progressive disclosure

Progressive disclosure is the discipline of loading a capability's *description* always and its *body* only when needed. FORGE's five surfaces sit at different points on that spectrum, and putting a capability on the wrong surface is the most common self-inflicted context wound.

```text
  always resident ──────────────────────────────► loaded on demand

  rules          CLAUDE.md      agents          skills         scripts
  ─────          ─────────      ──────          ──────         ───────
  full body      full body      description     description    nothing
  every turn     every turn     always,         always,        until run
                                body on spawn   body on match
```

`docs/capability-surface-selection.md` gives the routing questions in order. Ask them in this sequence and stop at the first yes:

1. Should this happen every time a path or event matches, with no model judgment? → **rule**
2. Is it a playbook or workflow that should load only when the task needs it? → **skill**
3. Does it need a structured tool interface used repeatedly across sessions or clients? → **MCP**
4. Is it a deterministic local action that does not need a live server? → **CLI or repo script**
5. Is it one narrow remote step inside a larger workflow? → **direct API call from a skill**

The failure mode this prevents: writing a 600-line playbook as a rule file. It is now in every turn of every session, whether or not you are doing that kind of work. Rules are for invariants — path-scoped constraints, safety floors, things that must not depend on model discretion. `rules/common` ships ten of them, covering agents, code review, coding style, development workflow, git workflow, hooks, patterns, performance, security, and testing. Add exactly one language pack on top:

```bash
cp -R rules/common      ~/.claude/rules/forge/
cp -R rules/typescript  ~/.claude/rules/forge/
```

122 rule files ship in the repository. Installing all of them is a context decision disguised as a convenience.

**Skill descriptions are load-bearing.** A skill's body is deferred, but its description is not — and the description is also the only thing deciding whether the body ever loads. A vague description means either the skill never triggers (dead weight in the catalog) or it triggers constantly (dead weight in the window). Write descriptions that state the trigger condition, not the topic. Details in [`../docs/SKILL-AUTHORING.md`](../docs/SKILL-AUTHORING.md).

**Keep the `CLAUDE.md` chain short.** It is resident in every turn, and it stacks: user-level, project-level, and subdirectory files all load. The threshold is 300 combined lines. Anything longer than a page belongs in a skill the file *points at*, not in the file itself. If a recurring principle keeps appearing across several skills, the `rules-distill` skill extracts it into a rule file rather than leaving it duplicated in five places.

---

## Retrieval instead of reading

Most context waste is reading things you did not need. The fix is to search first, read narrowly, and read again only when the first read proved insufficient.

| Instead of | Do | Saves |
|---|---|---|
| Reading a 900-line file | `grep -n "functionName" path` then read that range | ~90% |
| Reading every file in a directory | `git grep -l "pattern" -- 'src/**'` then read the hits | Most of it |
| `ls -R` on a repository | `git ls-files \| head -50`, or a targeted glob | Most of it |
| Full test output | `npm test 2>&1 \| tail -40`, or run only the relevant file | Most of it |
| `git log` | `git log --oneline -10` | Most of it |
| Full `git diff` | `git diff --stat` first, then diff specific files | Varies |
| Re-reading a file you already read | Trust the earlier read, or read only the changed range | 100% |

Two FORGE skills formalize this.

**`search-first`** runs before implementation: check whether an existing tool, library, or in-repo pattern already solves the problem before writing code. Its parallel-search phase queries package registries, the skill catalog, and the web concurrently, then scores candidates on functionality, maintenance, community, docs, license, and dependencies, and returns an adopt / extend / build decision. The context win is incidental — the primary win is not writing code that already exists — but avoiding a from-scratch implementation avoids the exploration that would have preceded it.

**`iterative-retrieval`** addresses the subagent context problem: a delegated agent does not know which files it needs until it starts working. The three obvious approaches all fail — sending everything overflows, sending nothing starves, guessing is usually wrong. The skill replaces them with a dispatch → evaluate → refine → loop cycle: dispatch with a minimal context set, evaluate whether the agent got far enough, refine the retrieval based on what it actually reached for, and repeat. Each pass costs a round trip and saves an over-broad initial load.

A rule of thumb worth adopting: **read a file only when you intend to edit it or quote it.** Everything else is a grep.

---

## The subagent as a context firewall

The most underused context technique is delegation, because a subagent's window is not your window.

```text
  main session                          subagent
  ────────────                          ────────
  "find where rate limiting          ┌─ reads 30 files
   is configured"          ─────────►│  greps the repo
                                     │  runs a build
  ◄──── 200-token answer ────────────┘  burns 60k tokens
```

The 60k tokens are spent and discarded. Your window grew by the answer, not by the search. This makes exploration, dependency archaeology, log triage, and "which of these forty files matches X" nearly free at the main-session level, at the cost of real token spend in the subagent.

Two conditions make it work:

**The question must be answerable in a summary.** "Which module owns retry logic and what is its interface" delegates well. "Refactor the retry logic" does not — the edits have to happen somewhere, and a subagent that edits files without your window seeing the diff is a review problem, not a context win.

**The subagent should run on a cheaper tier.** Exploration does not need a frontier model:

```json
{
  "env": {
    "CLAUDE_CODE_SUBAGENT_MODEL": "haiku"
  }
}
```

The related dial is `MAX_THINKING_TOKENS`, which defaults to 31,999 and reserves output budget for internal reasoning on every request. Reducing it to 10,000 is a large saving on routine work; raising it deliberately for architecture work is the right use of the knob.

```json
{
  "model": "sonnet",
  "env": {
    "MAX_THINKING_TOKENS": "10000",
    "CLAUDE_CODE_SUBAGENT_MODEL": "haiku"
  }
}
```

Full settings reference in [`../docs/token-optimization.md`](../docs/token-optimization.md) and [`../docs/CONFIGURATION.md`](../docs/CONFIGURATION.md).

---

## Compaction: what it buys, what it costs

Compaction replaces conversation history with a summary. It buys room. It costs fidelity, and the cost is not evenly distributed.

**What survives compaction well:** decisions and their rationale, the current task, file paths, the shape of the plan, what has been tried.

**What is routinely lost:** exact error strings, precise line numbers, the specific reason an approach was abandoned, subtle constraints stated once thirty turns ago, and the difference between "we chose A" and "we chose A because B was ruled out for a reason that still applies".

That asymmetry drives the whole strategy: **compact at a boundary, not at a threshold.**

Auto-compaction fires when the window fills, which is frequently mid-task — halfway through a refactor, between a failing test and its fix. The summary then has to represent an incomplete thought, and it does so badly. The `strategic-compact` skill exists to move the event earlier, to a point you choose.

| Transition | Compact? | Why |
|---|---|---|
| Exploration finished, implementation starting | Yes | Research detail is spent; the plan is the artifact |
| Milestone shipped, next one starting | Yes | Clean boundary, nothing in flight |
| Switching to an unrelated task | Yes | Old context is pure dilution |
| Mid-refactor, tests currently red | No | The failure detail is the working state |
| Mid-debug, hypothesis unconfirmed | No | The evidence chain is the work |
| Right before a review | No | The reviewer needs the diff's history |

FORGE's `suggest-compact.js` runs as a PreToolUse hook on Edit and Write and combines two signals:

- **Context size (primary).** From the transcript's `usage` records. Suggests at a window-scaled threshold — 160k on a 200k window, 250k on a 1M window — and re-reminds every additional 60k of growth.
- **Tool-call count (secondary).** Default 50 calls, then every 25 after.

Tool count alone is a poor proxy: three large file reads can fill a window in three calls, and fifty trivial calls can leave it nearly empty. The context-size signal is the one that fires when it matters.

Tuning:

```bash
export COMPACT_CONTEXT_THRESHOLD=120000   # suggest earlier; 0 disables the context signal
export COMPACT_CONTEXT_INTERVAL=40000     # re-remind more often
export COMPACT_THRESHOLD=80               # loosen the tool-count signal
export COMPACT_STATE_TTL_DAYS=14          # sweep stale per-session state
export FORGE_CONTEXT_WINDOW_TOKENS=400000 # explicit window size
```

The window is auto-detected from a `[1m]` model marker, or inferred once observed tokens exceed 200k. On a large-window model carrying neither signal, set `FORGE_CONTEXT_WINDOW_TOKENS` explicitly — otherwise the threshold defaults to a 200k window and every session looks more full than it is. `CLAUDE_CODE_AUTO_COMPACT_WINDOW` is honored as a fallback.

**Before compacting, persist.** The `pre:compact` hook exists for this, but the reliable habit is explicit:

```text
/save-session
```

Then compact. A summary you wrote deliberately beats a summary generated under pressure, and the session file survives the compaction, the session, and the machine reboot.

A note on overrides: some Claude Code builds have been reported to treat `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` as lower-bound only, so values intended to delay compaction can cause it to fire earlier. If that happens, remove the override and rely on manual `/compact` plus the `strategic-compact` suggestions.

---

## Session storage and resumption

Compaction discards. Session storage keeps. They are complementary, and using compaction without session storage is how a week of decisions evaporates.

### Saving

```text
/save-session
```

Writes `~/.claude/session-data/YYYY-MM-DD-<short-id>-session.tmp` describing what was built, what was decided, what failed and why, and what remains. The filename shape is enforced by `SESSION_FILENAME_REGEX` in `session-manager.js`: letters, digits, hyphens, and underscores, minimum one character. Prefer 8+ lowercase characters for new files to avoid collisions.

Run it at the end of a session, before a compaction, and after solving anything you would be annoyed to re-derive.

### Resuming

```text
/resume-session                                              # most recent
/resume-session 2026-04-08                                   # most recent for a date
/resume-session ~/.claude/session-data/2026-04-08-a1b2c3d4-session.tmp
```

`/resume-session` loads and absorbs the file before doing any work — the point is orientation, not a file read you then have to interpret.

### Browsing

```text
/sessions list --limit 10
/sessions list --date 2026-04-08
/sessions info
```

`/sessions info` returns operator-surface context — branch, worktree path, session recency — which is what you actually need when reattaching to a multi-agent wave.

From the shell, the CLI reads the same state from FORGE's SQLite store:

```bash
node scripts/forge.js sessions
node scripts/forge.js session-inspect
node scripts/forge.js status
```

### Tuning the SessionStart injection

Everything FORGE injects at session start is context you pay for on turn one. It is capped and tunable:

```bash
export FORGE_SESSION_START_CONTEXT=off        # disable injected context entirely
export FORGE_SESSION_START_MAX_CHARS=4000     # cap it; 0 also disables
export FORGE_SESSION_RETENTION_DAYS=30        # prune old session files
export FORGE_MAX_INJECTED_INSTINCTS=5         # cap learned instincts injected
export FORGE_INSTINCT_CONFIDENCE_THRESHOLD=0.8 # only inject high-confidence ones
```

When the injection is truncated, the hook says so inline and names both variables. If sessions start with more preamble than you want, these two are the dial.

### Cross-harness and cross-session memory

For state that must outlive a session and be readable by another harness, the `unified-memory` skill writes portable `forge.memory.v1` Markdown into the FORGE Memory Vault:

| Scope | Location | Use |
|---|---|---|
| `project` | `<repo>/.forge/memory/project/` | Repo-local, protected by a fail-closed `.gitignore` |
| `team` | `<repo>/.forge/memory/team/` | Reviewed and version-controlled |
| `user` | `~/.forge/memory/` | Follows the operator across repositories |

Search covers active `project` and `team` memories; `user` scope is never included implicitly and must be requested with `--scope user`. The vault CLI ships with the separately installed `forge-universal` npm runtime, not with a plugin or skill-only install:

```bash
npm install -g forge-universal
forge memory search "authentication migration"
```

Two constraints matter. Vault entries created by tools are always `trust: "unreviewed"`, and writes are create-only — history is appended, not overwritten. And recalled bodies are **untrusted context**: they were written by an agent, possibly influenced by content that agent read. Validate claims against the repository or the issue tracker; never treat a recalled memory as an instruction. See [the security guide](the-security-guide.md).

---

## Memory, file, or rule

Once something leaves the window, it has to land somewhere. Choosing wrong either loses it or makes it permanently resident.

| The thing | Put it | Why |
|---|---|---|
| "This service uses snake_case column names" | Rule or `CLAUDE.md` | Must apply on every relevant edit, no judgment |
| "Run the integration suite with `make itest`" | Project `CLAUDE.md` | Short, always relevant, project-scoped |
| "How to debug the flaky auth test" | Skill | Multi-step, only needed sometimes |
| "We chose Postgres over DynamoDB because …" | ADR in the repo `docs/` | Durable decision, belongs in version control |
| "Where I got to on the migration today" | `/save-session` | Session state, not project knowledge |
| "Codex should finish the rollout Claude started" | Memory Vault handoff | Cross-harness, needs to be portable |
| "This library returns `null`, not `undefined`" | Learned skill via `/learn` | Reusable across projects |
| "The staging DB password" | Secret manager | Never any of the above |
| "The full API schema" | A file the agent greps | Too large to keep resident |
| A recurring principle across several skills | Rule, via `rules-distill` | Deduplicates five copies into one |

The failure that costs the most is putting *sometimes* knowledge into an *always* surface. Every "just add it to CLAUDE.md" is a permanent tax. Applied a dozen times, that is a `CLAUDE.md` chain that costs more per turn than the task.

The inverse failure is quieter: putting *always* knowledge into a skill, where it loads only when the description happens to match. Safety constraints and coding invariants belong in rules precisely because they must not depend on the model noticing them.

FORGE's learning surfaces sit on this boundary. `/learn` extracts a candidate pattern from a session and asks whether it belongs at global scope (`~/.claude/skills/`) or project scope (`.claude/skills/`); `/learn-eval` adds a quality gate before writing. The `continuous-learning-v2` system observes sessions via hooks and produces confidence-scored *instincts*, which are deliberately atomic and capped at injection time — inspect them with `/instinct-status`, promote them with `/promote`, cluster them into skills or commands with `/evolve`, and delete the stale ones with `/prune`. The cap and confidence threshold exist because an uncapped learning system is a context leak that grows every day you use it.

---

## The MCP tool-surface tax

MCP tool definitions are resident. Every tool on every connected server contributes its schema to every turn, at roughly 500 tokens each by the `context-budget` estimate. This is the most commonly underestimated line in the whole budget.

```text
   3 servers x  8 tools =  24 tools ≈  12,000 tokens/turn
   6 servers x 12 tools =  72 tools ≈  36,000 tokens/turn
  10 servers x 15 tools = 150 tools ≈  75,000 tokens/turn   ← over a third of a 200k window
```

At 150 tools you have also created a selection problem. The model must choose among 150 similarly-described options every turn, and accuracy degrades well before the window does.

`context-budget` flags two patterns specifically:

**Over-subscription.** More than 10 servers, or any single server exposing more than 20 tools.

**CLI wrappers.** A server whose tools shell out to a command the agent already has — `gh`, `git`, `npm`, a cloud CLI, a package manager. These are pure cost: the Bash tool already covers them, at zero marginal schema.

The routing question from `docs/capability-surface-selection.md` applies directly. MCP earns its keep when the capability needs a structured tool interface used repeatedly across sessions and clients, and the long-lived server process is worth the operational overhead. It does not earn its keep when the job is a one-shot local command or the server's only behavior is a single shell-out.

Practical controls:

```bash
export FORGE_DISABLED_MCPS=some-server,another-server
export FORGE_MCP_CONFIG_PATH=/path/to/a/smaller/mcp.json
```

FORGE's `pre:mcp-health-check` and `post:mcp-health-check` hooks track server availability so a dead server is reported rather than silently retried; `FORGE_MCP_HEALTH_TIMEOUT_MS` bounds the check. Guidance on selecting and scoping servers is in [`../docs/MCP-GUIDE.md`](../docs/MCP-GUIDE.md), and the trust implications of connecting one are in [`../docs/MCP-CONNECTOR-POLICY.md`](../docs/MCP-CONNECTOR-POLICY.md).

The test to apply to every server: *would I notice if this were gone?* If the honest answer is no, it is costing you a turn's worth of budget every turn to produce nothing.

---

## A budget worksheet

Fill this in once for your setup. It takes fifteen minutes and it will change what you install.

### Step 1 — Fixed overhead

| Line | How to get the number | Yours |
|---|---|---|
| Window size | Model's context window (200k typical; 1M on `[1m]` models) | ______ |
| Rule files installed | `find ~/.claude/rules -name '*.md' \| wc -l` × ~600 tokens | ______ |
| `CLAUDE.md` chain | `wc -w` on each file in the chain × 1.3 | ______ |
| MCP tools | Tool count × ~500 | ______ |
| SessionStart injection | `FORGE_SESSION_START_MAX_CHARS` ÷ 4 | ______ |
| **Fixed subtotal** | Sum of the above | ______ |

### Step 2 — Working budget

```text
working budget = window - fixed overhead - compaction reserve
```

Reserve at least 20% for compaction headroom and the model's own output. A 200k window with 30k of fixed overhead leaves roughly 130k of genuine working room, not 170k.

### Step 3 — Per-task allocation

| Category | Suggested share | Notes |
|---|---:|---|
| Task statement and plan | 5% | If it needs more, it needs decomposing |
| Files read | 30% | Read ranges, not whole files |
| Tool output | 25% | Filter test and build output aggressively |
| Conversation history | 30% | This is what compaction reclaims |
| Slack | 10% | Never plan to spend it |

### Step 4 — Health check

| Number | Healthy | Investigate |
|---|---|---|
| Fixed overhead as share of window | Under 15% | Over 25% |
| Rule packs installed | `common` plus 1–2 | 5 or more |
| MCP servers connected | 0–4 | 8 or more |
| `CLAUDE.md` chain, combined | Under 300 lines | Over 500 lines |
| Compactions per working session | 0–1 | 3 or more |
| Turns before the first read exceeds 10k tokens | Over 5 | Under 3 |

Three or more compactions in a session is not a context problem, it is a scoping problem. The session is doing several unrelated jobs and should have been several sessions with `/save-session` between them.

### Step 5 — Verify against reality

```text
Use the context-budget skill to audit my context consumption.
```

Compare its estimate with your worksheet. Where they disagree, the skill is usually right about component sizes and you are usually right about which components you actually use. Both inputs matter.

---

## Maintenance cadence

Context debt accumulates silently. A short recurring pass keeps it bounded.

| Cadence | Action | Surface |
|---|---|---|
| Per session | Save before compacting | `/save-session` |
| Per session | Extract anything reusable | `/learn` or `/learn-eval` |
| Weekly | Delete stale low-confidence instincts | `/prune` |
| Monthly | Audit total consumption | `context-budget` skill |
| Monthly | Sweep `~/.claude` for stale and orphaned items | `config-gc` skill |
| Monthly | Split daily-use components from library components | `agent-sort` skill |
| Quarterly | Fold recurring principles into rules | `rules-distill` skill |
| Quarterly | Audit skill quality and overlap | `skill-stocktake` skill |
| After adding components | Re-audit before adding more | `context-budget` skill |

`config-gc` walks `~/.claude` — skills, memory, hooks, permissions, MCP servers, caches — and proposes deletions one at a time with confirmation. `agent-sort` classifies every agent, skill, command, rule, hook, and extra into DAILY and LIBRARY buckets using repository evidence, then hands the resulting install change to `configure-forge` rather than inventing a parallel installer.

---

## Anti-patterns

| Anti-pattern | Why it hurts | Instead |
|---|---|---|
| Installing every rule pack | 122 files resident, forever | `rules/common` plus your stack |
| Long playbook as a rule file | Loaded on every turn regardless of relevance | Make it a skill |
| Everything in `CLAUDE.md` | Permanent tax, and it grows | Point at skills; keep under 300 lines |
| Reading whole files by default | The most common single waste | Grep, then read the range |
| Unfiltered tool output | One verbose test run can cost 20k | Pipe through `tail`, run one test file |
| Connecting MCP servers speculatively | ~500 tokens per tool, every turn | Connect on demand; disable the rest |
| MCP server wrapping a CLI | Duplicates a free capability | Use Bash |
| Waiting for auto-compaction | Fires mid-task, summarizes badly | `strategic-compact` at boundaries |
| Compacting without saving | Detail is gone with no record | `/save-session` first |
| One session for several jobs | Repeated compactions, diluted context | Save, exit, start fresh |
| Uncapped learned instincts | Grows the session preamble every day | `FORGE_MAX_INJECTED_INSTINCTS`, `/prune` |
| Doing exploration in the main window | Burns your budget on discardable work | Delegate to a subagent on a cheap tier |
| Re-reading a file to "be sure" | Doubles the cost for no information | Trust the earlier read |

---

## Related reading

| Topic | Where |
|---|---|
| Reference form of this material | [`../docs/CONTEXT-ENGINEERING.md`](../docs/CONTEXT-ENGINEERING.md) |
| Settings and env vars | [`../docs/CONFIGURATION.md`](../docs/CONFIGURATION.md), [`../docs/token-optimization.md`](../docs/token-optimization.md) |
| Surface routing decisions | [`../docs/capability-surface-selection.md`](../docs/capability-surface-selection.md), [`../docs/CONCEPTS.md`](../docs/CONCEPTS.md) |
| Memory design | [`../docs/MEMORY-GUIDE.md`](../docs/MEMORY-GUIDE.md) |
| MCP scoping and trust | [`../docs/MCP-GUIDE.md`](../docs/MCP-GUIDE.md) |
| Model tiers and cost | [`../docs/COST-AND-MODEL-ROUTING.md`](../docs/COST-AND-MODEL-ROUTING.md) |
| Rule layer design | [`../docs/RULES-GUIDE.md`](../docs/RULES-GUIDE.md), [`../RULES.md`](../RULES.md) |
| Multi-agent context cost | [the orchestration guide](the-orchestration-guide.md) |
| Session operating notes | [`../WORKING-CONTEXT.md`](../WORKING-CONTEXT.md) |
