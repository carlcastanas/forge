<p align="center">
  <strong><code>F O R G E</code></strong>
</p>

<p align="center">
  The engineering system your coding agent is missing.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-000000.svg" alt="MIT license" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-000000.svg" alt="Node 18 or newer" />
  <img src="https://img.shields.io/badge/harnesses-13-000000.svg" alt="13 harnesses" />
</p>

---

# FORGE

Your coding agent can already write code. What it cannot do on its own is run an
engineering process: plan before building, prove the change with tests, review its own
work from a context that is not already convinced, keep what it learned, and do it the
same way tomorrow.

FORGE installs that process once so it becomes part of how the agent works.

```text
plan -> test -> implement -> review -> verify -> remember -> improve
```

> Optimize the context window. Persist everything else.

FORGE is MIT-licensed. It targets Claude Code first, has a supported Codex path, and
ships capability-limited adapters for Cursor, OpenCode, Gemini, Zed, Copilot,
Antigravity, Qwen, and others. Read the [harness matrix](docs/HARNESS-MATRIX.md) before
assuming parity.

| Surface     | Count | What it gives you                                                              |
| ----------- | ----: | ------------------------------------------------------------------------------ |
| Agents      |    68 | Specialists for planning, review, build repair, security, architecture, domains |
| Skills      |  322  | Reusable workflow bundles: TDD, research, security, frontend, data, ops         |
| Commands    |    94 | Slash-entry shims over the skills, for muscle memory                            |
| Rules       |   122 | Always-loaded standards you select by language and project                      |
| Hooks       | Runtime | Lifecycle enforcement, session summaries, context and cost monitoring         |
| Memory      | Runtime | Session storage, learned instincts, continuous improvement                    |
| Forge Shield | Included | Scanning for prompts, hooks, MCP config, permissions, secrets, agent files  |

## Contents

- [Why this exists](#why-this-exists)
- [Install](#install)
- [Verify the install](#verify-the-install)
- [Your first task](#your-first-task)
- [The mental model](#the-mental-model)
- [How a session runs](#how-a-session-runs)
- [What is inside](#what-is-inside)
- [Configuration](#configuration)
- [Running agents in parallel](#running-agents-in-parallel)
- [Context economics](#context-economics)
- [Security](#security)
- [Harness support](#harness-support)
- [Documentation](#documentation)
- [Requirements](#requirements)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Why this exists

A capable model with no process produces a specific, recognisable failure pattern.

| Without a process                                                | With FORGE                                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| Starts editing before the shape of the change is settled          | Produces a plan you can reject cheaply, before any file is touched     |
| Writes the implementation, then tests that agree with it          | Writes the failing test first; the test is the specification           |
| Reviews its own work in the context that just produced it         | Reviews from a fresh context that has not seen the reasoning           |
| Reports success from the diff rather than from a run              | Runs the suite, the build, and the linter, and reports what came back  |
| Forgets the correction you made an hour ago                       | Persists the correction and applies it in the next session             |
| Re-derives the same workflow from your prompt every single time   | Loads a skill that already encodes it                                  |
| Loads whatever seems relevant until the window is full            | Loads the narrow slice the task needs and nothing else                 |

None of that is exotic. It is the process a competent team already follows. FORGE makes
it the default rather than something you have to re-specify in every prompt.

## Install

Pick exactly one path per harness. Stacking a manual install on top of a plugin install
produces duplicated skills and conflicting hooks.

### Claude Code plugin (recommended)

Inside Claude Code:

```text
/plugin marketplace add https://github.com/your-org/forge
/plugin install forge@forge
```

This installs the skills, agents, commands, and plugin-managed hooks together. Stop here.

### Universal package

For Claude Code, Codex, or any supported harness, from a terminal:

```bash
npx forge-universal@latest
```

The installer detects your harness, asks which surfaces you want, asks for a hook profile,
and records the choice so later runs are idempotent. It can install, update, or relocate
an existing install.

If npm reports a stale version, confirm what the registry has before retrying:

```bash
npm view forge-universal version
```

### From a clone

```bash
git clone https://github.com/your-org/forge.git
cd forge
./install.sh          # macOS and Linux
# .\install.ps1       # Windows PowerShell
```

Both wrappers resolve the repo root and delegate to the Node installer in
`scripts/install-apply.js`. They install dependencies on first run.

### Selective install

You rarely want all 322 skills. Preview and pick the surfaces you will actually use:

```bash
forge catalog profiles                      # list the install profiles
forge catalog components --family language  # list components by family
forge plan --profile core --target claude   # dry-run what a profile would write
forge install --profile developer --target claude
```

`forge` with no command routes its arguments to `install`, so `forge typescript` is
shorthand for installing the TypeScript surface. The installer also accepts
`--with`, `--without`, `--skills`, `--modules`, `--no-hooks`, `--profile`, `--target`,
`--locale`, `--json`, and `--dry-run`. Run `forge help install` for the authoritative
list on your version.

The full flag reference is in [docs/INSTALLATION.md](docs/INSTALLATION.md), and the
reasoning behind surface selection is in
[docs/capability-surface-selection.md](docs/capability-surface-selection.md).

### Uninstall

```bash
forge uninstall            # removes only files recorded in install-state
forge uninstall --keep-data
```

The uninstaller works from the install-state manifest, so it removes what FORGE wrote and
leaves your own files alone. `forge repair` fixes a partial or interrupted install without
starting over.

## Verify the install

```bash
forge doctor          # environment, paths, hook profile, harness detection
forge status          # what is installed and where
forge list-installed  # the manifest of files FORGE wrote
```

You are looking for four things: the skills directory resolves, the hook profile is the
one you chose, no hook script errors on load, and the harness adapter matches the tool
you are actually running. If any line is wrong, go to
[TROUBLESHOOTING.md](TROUBLESHOOTING.md) before using it in anger.

## Your first task

Open a repository you know well and give the agent a small, real change.

```text
Add input validation to the signup endpoint. Use TDD.
```

What should happen, in order:

1. A **plan** appears before any edit. It names the files it intends to touch and the
   behaviour it intends to add. Reject it if the shape is wrong; that costs you one
   message instead of a diff review.
2. A **failing test** is written first, and you are shown it failing. If a test passes on
   the first run, it is not testing the new behaviour.
3. The **implementation** lands, and the same test is run again.
4. A **review** pass runs against the diff from a context that did not write it.
5. **Verification** runs the suite, the build, and the linter, and reports the output
   rather than a summary of the output.

If step 1 does not happen, your rule set or hook profile is not loaded. Check
`forge doctor` again.

## The mental model

Six things, and people mix them up constantly. The distinction that matters is *who
decides to load it* and *how long it lives*.

| Thing       | What it is                                             | Who loads it              | Lives for      |
| ----------- | ------------------------------------------------------ | ------------------------- | -------------- |
| **Skill**   | A reusable workflow bundle: procedure, structure, files | The model, by description | One task       |
| **Agent**   | A subagent with its own context, model, and tool list   | The model or you          | One delegation |
| **Command** | A slash-entry shim that invokes a skill                 | You, explicitly           | One invocation |
| **Hook**    | Code that runs on a lifecycle event                     | The harness, automatically | Every event   |
| **Rule**    | A standard held in context for the whole session        | The install, always       | The session    |
| **Memory**  | State that outlives the session                         | Hooks and skills          | Across sessions |

The one-line versions of the distinctions people get wrong:

- **Skill vs command.** The skill is the durable unit; the command is a keyboard shortcut
  to it. Write the skill. Add the command only if you will type it often.
- **Skill vs agent.** A skill changes *how* the current context works. An agent moves the
  work into a *separate* context. Delegate when the work would pollute your window, or
  when you want a reviewer who has not seen the reasoning.
- **Rule vs skill.** A rule is true for every task in the session and costs context the
  whole time. A skill is true for one task. If it is not worth paying for on every
  message, it is not a rule.
- **Hook vs everything else.** A hook is the only one of these the model cannot decide to
  skip. That is the entire point of it, and the reason a hook must never block on a slow
  network call.

Full treatment in [docs/CONCEPTS.md](docs/CONCEPTS.md).

## How a session runs

```text
  you                 FORGE                          your repo
   |                    |                                |
   |-- request -------->|                                |
   |                    |-- rules + memory into context  |
   |                    |-- select skill by description  |
   |<-- plan -----------|                                |
   |-- approve -------->|                                |
   |                    |-- failing test ---------------->|
   |                    |-- implementation -------------->|
   |                    |-- fresh-context review          |
   |                    |-- run suite, build, lint ------>|
   |<-- result ---------|                                |
   |                    |-- persist what was learned      |
```

Hooks fire at the session boundaries and around tool calls: injecting context at start,
enforcing standards before a write lands, capturing a summary at the end. The model does
not choose whether they run.

## What is inside

### Agents (68)

Specialists with their own context window, model tier, and tool allowlist. They exist so
that expensive or context-heavy work does not run in your main window, and so that review
happens somewhere that has not already agreed with itself.

Grouped by domain, with the full table in [AGENTS.md](AGENTS.md):

- **Planning and architecture** — implementation strategy, architecture decisions, PRDs
- **Review** — code review, security review, accessibility, performance
- **Build and repair** — build failure diagnosis, dependency resolution, test repair
- **Language specialists** — TypeScript, Python, Go, Rust, Swift, Kotlin, Java, C++, and more
- **Domain** — data, ML, infrastructure, frontend, mobile, documentation

### Skills (322)

The durable unit. A skill is selected by its description, so the description is really a
router: it decides whether the skill fires at all. Browse the catalog in
[docs/RECIPES.md](docs/RECIPES.md) or read
[docs/SKILL-AUTHORING.md](docs/SKILL-AUTHORING.md) to write one.

Coverage spans testing and TDD, code review, security, research, architecture, frontend
and design systems, backend and API design, databases, infrastructure and deployment,
observability and incident response, data and ML, documentation, and operations.

### Commands (94)

Slash entries over the skills, kept for muscle memory during the move to a skills-first
surface. `/plan`, `/tdd`, `/review-pr`, `/security-scan`, `/refactor-clean`, and the rest
are listed in [COMMANDS-QUICK-REF.md](COMMANDS-QUICK-REF.md).

### Rules (122)

Always-loaded standards, selected by language and project. Rules are the most expensive
surface in the system because they occupy context for the entire session, so the default
set is deliberately small. See [RULES.md](RULES.md).

### Hooks

Lifecycle enforcement that the model cannot skip: session-start context injection,
pre-write standard checks, post-tool validation, session-end summaries, context and cost
monitoring. Three profiles ship — `minimal`, `standard`, `strict` — and
[docs/HOOKS-GUIDE.md](docs/HOOKS-GUIDE.md) explains what each one enforces.

### Memory

What survives the session: summaries, learned instincts, and project context. The design
constraint is that memory must earn its context cost on the next session, which means
most of what happens in a session should *not* be remembered. See
[docs/MEMORY-GUIDE.md](docs/MEMORY-GUIDE.md).

### Forge Shield

A scanner for the agent surface itself: prompt files, hook scripts, MCP server config,
tool permissions, committed secrets, and agent definitions.

```bash
npx forge-shield scan
npx forge-shield scan --fix
```

The threat model it is built against is in [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).

## Configuration

Configuration comes from four places, in increasing precedence: package defaults, the
plugin `userConfig`, global config, and environment variables. The complete surface is
documented in [docs/CONFIGURATION.md](docs/CONFIGURATION.md); the settings you are most
likely to touch are below.

### Hook profile

```bash
# minimal | standard | strict  (default: standard; invalid values fall back to standard)
export FORGE_HOOK_PROFILE=standard

# Turn off individual hooks by id, comma separated
export FORGE_DISABLED_HOOKS=post-write-lint,session-summary

# Turn hooks off entirely
export FORGE_HOOKS_ENABLED=0
```

`minimal` keeps session bookkeeping and nothing that can block. `standard` adds
write-time standard enforcement and verification prompts. `strict` additionally blocks on
failed checks rather than warning.

### Context budget

```bash
# Cap the context injected at session start (default: 8000 characters)
export FORGE_SESSION_START_MAX_CHARS=8000

# Disable session-start injection entirely — for small local models
export FORGE_SESSION_START_CONTEXT=off

# Tell the monitor how large the window actually is
export FORGE_CONTEXT_WINDOW_TOKENS=200000

# Keep context and scope warnings, drop the cost estimates
export FORGE_CONTEXT_MONITOR_COST_WARNINGS=off
```

### Learned instincts

```bash
# How many instincts session start may inject (default: 6)
export FORGE_MAX_INJECTED_INSTINCTS=6

# Minimum confidence for injection, 0-1 (default: 0.7)
export FORGE_INSTINCT_CONFIDENCE_THRESHOLD=0.7

# Rank by project and stack relevance, not confidence alone (default: on)
export FORGE_INSTINCT_RELEVANCE_RANKING=on
```

### Storage and harness

```bash
# Where agent data lives
export FORGE_AGENT_DATA_HOME="$HOME/.forge"

# Force a harness rather than detecting it
export FORGE_HARNESS=claude-code

# Session retention in days (0 / off / never disables pruning)
export FORGE_SESSION_RETENTION_DAYS=30
```

### Low-context and local models

If you are running a small local model, the default context injection will crowd out the
task. Install without hooks and with a reduced surface:

```bash
forge install --profile core --target claude --no-hooks
export FORGE_SESSION_START_CONTEXT=off
```

## Running agents in parallel

Parallelism helps when the units of work are genuinely independent and each one is
expensive. It hurts when the units share files, when one depends on another's output, or
when the coordination costs more than the work.

The patterns FORGE supports:

| Pattern      | Use it when                                                   | Watch out for                          |
| ------------ | ------------------------------------------------------------- | -------------------------------------- |
| **Fan-out**  | N independent units, same shape (review N dimensions)          | File collisions between workers        |
| **Pipeline** | Stage 2 can start on item 1 while stage 1 works on item 2      | Backpressure; a slow stage starves the rest |
| **Wave**     | A batch that must complete before the next batch is planned    | Wall-clock cost of the slowest member  |
| **Review board** | Several reviewers over one diff, then a merge of findings  | Duplicate findings; needs a dedup pass |

A fan-out review, using the built-in orchestration skills:

```text
/multi-plan      decompose the work into independent units
/multi-execute   run the units in parallel
/orch-review     merge and dedupe the findings
```

Two rules that save the most pain: give every worker a disjoint file set, and verify the
wave's output as a whole rather than trusting each worker's self-report. Full treatment in
[guides/the-orchestration-guide.md](guides/the-orchestration-guide.md).

## Context economics

The context window is the scarce resource. Everything else is downstream of it.

What is consuming it, roughly in the order people forget about:

1. **Tool definitions.** Every MCP server you enable adds its full tool schema to every
   request, whether you use it or not. A large MCP surface is the most common silent
   context leak.
2. **Rules.** Always-loaded by definition. Cheap individually, expensive in aggregate.
3. **Files read.** Reading a whole file to use twenty lines of it.
4. **Tool output.** Test runners and build tools are verbose; unfiltered output is the
   fastest way to fill a window.
5. **History.** Everything above, accumulated.

What FORGE does about it: skills load only when their description matches, so the
procedure is not resident; reference material inside a skill is loaded progressively
rather than up front; session-start injection is capped; the context monitor warns before
you hit the wall rather than after; and anything worth keeping is written to disk instead
of carried in the window.

```bash
export FORGE_CONTEXT_WINDOW_TOKENS=200000   # so the monitor's warnings are accurate
```

The measurement approach and a budget worksheet are in
[guides/the-context-guide.md](guides/the-context-guide.md) and
[docs/token-optimization.md](docs/token-optimization.md).

## Security

An agent with tool access is a program that executes text it read somewhere. Treat it
that way.

The exposures that actually matter:

- **Indirect prompt injection.** A file, a web page, an issue comment, or an MCP response
  containing instructions the agent then follows. Everything an agent reads is data, never
  instruction. FORGE's skills that touch external content state this explicitly.
- **Over-broad tool grants.** An agent that can write anywhere and run anything will
  eventually do both. Agent definitions carry narrow `tools` allowlists for this reason.
- **Supply chain.** Skills, plugins, and MCP servers are executable content from other
  people. Forge Shield scans them; read what you install.
- **Secret exposure.** Secrets read into context are in the transcript, the session
  storage, and any summary derived from it.
- **Hooks as a foothold.** A hook runs automatically on every event. That makes hooks the
  highest-value target in the system and the thing to review most carefully.

```bash
npx forge-shield scan          # prompts, hooks, MCP config, permissions, secrets
npx forge-shield scan --fix    # apply the safe fixes only
```

Depth: [guides/the-security-guide.md](guides/the-security-guide.md),
[docs/THREAT-MODEL.md](docs/THREAT-MODEL.md), and the reporting policy in
[SECURITY.md](SECURITY.md).

> **Install from a source you can verify.** This project has no official hosted service,
> no paid tier, and no support channel. Anything claiming otherwise is not this project.

## Harness support

Support is uneven and the differences are load-bearing, not cosmetic. Full matrix with
per-harness notes in [docs/HARNESS-MATRIX.md](docs/HARNESS-MATRIX.md).

| Harness      | Skills | Agents | Commands | Hooks | Rules | Memory |
| ------------ | :----: | :----: | :------: | :---: | :---: | :----: |
| Claude Code  | Full   | Full   | Full     | Full  | Full  | Full   |
| Codex        | Full   | Full   | Partial  | Partial | Full | Partial |
| OpenCode     | Full   | Partial | Partial | Partial | Full | Partial |
| Cursor       | Partial | Partial | None    | None  | Full  | None   |
| Gemini       | Partial | Partial | None    | None  | Full  | None   |
| Zed          | Partial | None   | None     | None  | Full  | None   |
| Copilot      | Partial | None   | None     | None  | Full  | None   |
| Others       | Varies | Varies | Varies   | Varies | Full | Varies |

Claude Code is the reference implementation. Anywhere else, verify a behaviour before you
depend on it.

## Documentation

### Guides — read start to finish

| Guide | For |
| --- | --- |
| [Getting started](guides/getting-started.md) | Your first twenty minutes |
| [The field guide](guides/the-field-guide.md) | Day-to-day practice |
| [The complete guide](guides/the-complete-guide.md) | The whole system and why it is shaped this way |
| [The orchestration guide](guides/the-orchestration-guide.md) | Running more than one agent |
| [The context guide](guides/the-context-guide.md) | Context as the scarce resource |
| [The evaluation guide](guides/the-evaluation-guide.md) | Knowing whether it works |
| [The security guide](guides/the-security-guide.md) | Threats and defenses |
| [The migration guide](guides/the-migration-guide.md) | Adopting it in an existing repo |

### Reference — look things up

| Page | Covers |
| --- | --- |
| [Concepts](docs/CONCEPTS.md) | Skills, agents, commands, hooks, rules, memory, MCP |
| [Installation](docs/INSTALLATION.md) | Every install path and what it writes |
| [Configuration](docs/CONFIGURATION.md) | Every environment variable and setting |
| [CLI reference](docs/CLI-REFERENCE.md) | `forge` and the other binaries |
| [Skill authoring](docs/SKILL-AUTHORING.md) | Writing a skill that fires |
| [Agent authoring](docs/AGENT-AUTHORING.md) | Writing an agent |
| [Hooks](docs/HOOKS-GUIDE.md) · [Rules](docs/RULES-GUIDE.md) · [Memory](docs/MEMORY-GUIDE.md) · [MCP](docs/MCP-GUIDE.md) | The runtime surfaces |
| [Orchestration patterns](docs/ORCHESTRATION-PATTERNS.md) | Parallelism, in reference form |
| [Context engineering](docs/CONTEXT-ENGINEERING.md) | Budgeting the window |
| [Evaluation](docs/EVALUATION-GUIDE.md) · [Cost and model routing](docs/COST-AND-MODEL-ROUTING.md) | Measuring quality and spend |
| [Threat model](docs/THREAT-MODEL.md) | What FORGE defends against |
| [Harness matrix](docs/HARNESS-MATRIX.md) | Per-harness support |
| [Recipes](docs/RECIPES.md) | Task-shaped cookbook |
| [Anti-patterns](docs/ANTI-PATTERNS.md) | Ways teams misuse a harness |
| [Team adoption](docs/TEAM-ADOPTION.md) | Rolling it out |
| [FAQ](docs/FAQ.md) · [Glossary](docs/GLOSSARY.md) | Quick answers |

### Website

A documentation site lives in [`site/`](site/) and renders this repository's markdown
directly.

```bash
cd site
npm install
npm run dev     # http://localhost:3000
```

## Requirements

| Requirement | Version | Needed for |
| --- | --- | --- |
| Node.js | 18 or newer | The installer, hooks, and CLI |
| Git | Any recent | Plugin marketplace installs |
| Claude Code | 2.1 or newer | Plugin path, hooks, and agents |
| Python | 3.10 or newer | The optional dashboard only |

Hooks are loaded by the harness at session start. A hook added mid-session does not take
effect until you start a new one — this catches everyone once.

## Troubleshooting

The four failures that account for most reports:

| Symptom | Cause | Fix |
| --- | --- | --- |
| Skills never fire | Installed under a nested path | Skills must be direct children of the skills directory |
| Hooks do nothing | Added mid-session | Restart the session |
| Duplicate skills | Plugin install stacked on a manual install | Uninstall one; keep a single path per harness |
| Window fills immediately | Large MCP tool surface | Disable unused servers with `FORGE_DISABLED_MCPS` |

Full guide: [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Running tests

```bash
npm test              # validators + the full suite
npm run lint          # eslint + markdownlint
npm run catalog:check # catalog manifest is in sync
npm run harness:audit # harness adapter compliance
```

## Contributing

The repository is the catalog. Adding a skill means adding a directory; adding an agent
means adding a file. Start with [CONTRIBUTING.md](CONTRIBUTING.md), then
[docs/SKILL-AUTHORING.md](docs/SKILL-AUTHORING.md) or
[docs/AGENT-AUTHORING.md](docs/AGENT-AUTHORING.md).

## License

MIT. See [LICENSE](LICENSE).
