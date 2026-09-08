<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/logo-lockup-dark.svg" />
    <img src="assets/brand/logo-lockup-light.svg" alt="FORGE" width="320" />
  </picture>
</p>

<p align="center">
  The engineering system your coding agent is missing.
</p>

<p align="center">
  <strong>Language:</strong>
  <a href="README.md">English</a> |
  <a href="docs/pt-BR/README.md">Português (Brasil)</a> |
  <a href="README.zh-CN.md">简体中文</a> |
  <a href="docs/zh-TW/README.md">繁體中文</a> |
  <a href="docs/ja-JP/README.md">日本語</a> |
  <a href="docs/ko-KR/README.md">한국어</a> |
  <a href="docs/tr/README.md">Türkçe</a> |
  <a href="docs/ru/README.md">Русский</a> |
  <a href="docs/vi-VN/README.md">Tiếng Việt</a> |
  <a href="docs/th/README.md">ไทย</a> |
  <a href="docs/de-DE/README.md">Deutsch</a> |
  <a href="docs/es/README.md">Español</a> |
  <a href="docs/uk-UA/README.md">Українська</a> |
  <a href="docs/ur/README.md">اردو</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-000000.svg" alt="MIT license" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-000000.svg" alt="Node 18 or newer" />
  <img src="https://img.shields.io/badge/install%20targets-15-000000.svg" alt="15 install targets" />
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
ships capability-limited adapters for Cursor, OpenCode, Zed, Qwen Code, CodeBuddy, JoyCode,
Antigravity, Kimi Code, Hermes, OpenClaw, AdaL, Gemini CLI, and Copilot. Read the
[harness matrix](docs/HARNESS-MATRIX.md) before assuming parity — Cursor is close to Claude
Code, Gemini CLI and Copilot are close to nothing.

Installing it gives you access to 68 agents, 318 skills, and 94 legacy command shims, plus hooks,
rules, memory, continuous learning, and Forge Shield security scanning.

| Surface     | Count | What it gives you                                                              |
| ----------- | ----: | ------------------------------------------------------------------------------ |
| Agents      | 68 agents | Specialists for planning, review, build repair, security, architecture, domains |
| Skills      | 318 skills | Reusable workflow bundles: TDD, research, security, frontend, data, ops         |
| Commands    | 94 commands | Slash-entry shims over the skills, for muscle memory                            |
| Rules       | 122 files | Always-loaded standards you select by language and project                      |
| Hooks       | Runtime | Lifecycle enforcement, session summaries, context and cost monitoring         |
| Memory      | Runtime | Session storage, learned instincts, continuous improvement                    |
| Forge Shield | Included | Scanning for prompts, hooks, MCP config, permissions, secrets, agent files  |

## Contents

- [Why this exists](#why-this-exists)
- [Install with Claude Code](#install-with-claude-code)
- [Install FORGE on any harness](#install-forge-on-any-harness)
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

## Install with Claude Code

Claude Code is the reference harness, and guided setup is the shortest correct path. From a
terminal:

```bash
npx forge-universal setup
```

The command needs Node.js 18 or newer, Git, and Claude Code 2.1 or newer on `PATH`. It
inventories the marketplace and every native install scope before writing anything, then
installs, updates, or safely moves `forge@forge` into the scope you pick and records the
hook profile next to it. Run it again to change any of those; the run is idempotent.

If npm hands back a stale build, ask the registry what exists:

```bash
npm view forge-universal version
```

Claude Code's own plugin commands are the other supported route. Inside Claude Code:

```text
/plugin marketplace add https://github.com/your-org/forge
/plugin install forge@forge
```

Both routes end at the same `forge@forge` plugin: skills, agents, commands, and
plugin-managed hooks. Take one of them and stop there.

## Install FORGE on any harness

Everything below is the long form: choosing a path, choosing a surface, the per-harness
details, and how to undo any of it.

### Pick one path only

One method per harness. Installing FORGE into Claude Code and Codex at the same time is
fine. Installing it twice into the *same* harness is what produces duplicated skills,
duplicated commands, and hooks that fire twice.

- **Recommended default:** run the guided Claude plugin setup shown above.
- Also supported for Claude Code: the native `/plugin` commands.
- Works: Claude Code plugin alongside the native Codex plugin.
- Works: Claude Code plugin alongside the legacy Codex sync.
- Avoid: Claude Code plugin plus a full manual Claude install.
- Avoid: Codex sync plus the Codex marketplace plugin.

**Do not stack install methods.** If a harness already looks duplicated, go to
[Reset / Uninstall FORGE](#reset--uninstall-forge) before installing anything else.

### Find the right components first

You rarely want all 318 skills. Ask the packaged advisor what matches the work you actually
do, then preview the file plan before writing it:

```bash
npx forge-universal consult "security reviews" --target claude
forge catalog profiles                      # the install profiles
forge catalog components --family language  # components by family
forge plan --profile core --target claude   # dry-run what a profile would write
forge install --profile developer --target claude
```

It returns matching components, related profiles, and preview/install commands. You can
also name surfaces directly:

```bash
./install.sh --target claude --skills tdd-workflow,security-review
node scripts/forge.js install --profile minimal --target claude --with capability:machine-learning
```

`forge` with no subcommand routes its arguments to `install`, so `forge typescript` is
shorthand for installing the TypeScript surface. The installer also accepts `--with`,
`--without`, `--modules`, `--no-hooks`, `--profile`, `--target`, `--locale`, `--json`, and
`--dry-run`. Run `forge help install` for the authoritative list on your version, and read
[docs/INSTALLATION.md](docs/INSTALLATION.md) for the full flag reference.

### Guided setup through any package runner

```bash
npx forge-universal setup             # Claude Code plugin scope and hook profile
npx forge-universal install --guided  # Claude Code, Codex, and Kimi Code in one reviewed flow
```

The first command currently configures the Claude Code plugin; use the second when more
than one harness is involved. It shows each install channel and destination, preflights
every selection before the first write, and asks for one final confirmation.

| Package runner | Guided setup command |
| --- | --- |
| npm | `npx forge-universal setup` |
| pnpm | `pnpm dlx forge-universal setup` |
| Yarn 2 and newer | `yarn dlx forge-universal setup` |
| Bun | `bunx forge-universal setup` |

Yarn Classic 1 does not provide `yarn dlx`. Use `npx`, install `forge-universal` globally,
or move to a newer Yarn.

Verify a harness before it writes:

```bash
npx forge-universal install --guided --harness codex --dry-run
npx forge-universal install --profile core --target kimi --dry-run
```

`forge-install` is a binary name inside `forge-universal`, not a package published under
that name, so there is nothing to fetch by that name from the registry.

### Claude Code details

Claude Code owns these built-in commands, including the errors they raise when a
marketplace, a plugin, or a conflicting scope already exists. FORGE cannot intercept that
parser. If a native command reports a conflict, resolve the scope or fall back to
`npx forge-universal setup`. Do not layer a manual install on top of it.

Once the plugin is installed, `/forge:configure-forge` reconfigures it from inside Claude
Code. It delegates to the same setup flow, it is
available only after the plugin is installed, and it cannot replace `/plugin` during a
first install.

Claude Code plugins cannot carry rule files, so copy the packs you want yourself:

```bash
git clone https://github.com/your-org/forge.git
cd forge
mkdir -p ~/.claude/rules/forge
cp -R rules/common ~/.claude/rules/forge/
cp -R rules/typescript ~/.claude/rules/forge/   # swap in your stack
```

Start with `rules/common` plus one language or framework pack you actually use. Rules hold
context for the whole session, so the set you copy is a running cost. After a
`/plugin install`, do not run `./install.sh --profile full`: that is the stacked install the
section above warns about. The reverse holds too — if you install from a clone with
`./install.sh --profile full`, that is the whole install.
If you choose this path, stop there. Do not also run `/plugin install`.

A manual Claude install places each skill directly under `~/.claude/skills/`, one directory
per skill. Claude Code does not discover skills nested a level deeper than that, which is
the most common reason a hand-built install appears to do nothing.

### Codex details

Current Codex releases install FORGE as a native repo-marketplace plugin. The marketplace
entry points at the repository root, so the Codex cache receives the manifest together with
the skills, MCP configuration, hook runtime, and scripts it references.

```bash
# Recommended current install: add FORGE's native plugin from the repo marketplace
codex plugin marketplace add your-org/FORGE
codex plugin add forge@forge
codex plugin list --json
node scripts/codex/check-plugin-cache.js
```

Both add commands are safe to run again. Codex keeps one enabled plugin state in the active
`CODEX_HOME` and does not use Claude's `user`, `project`, and `local` scopes. Its native
hooks require an explicit trust decision and do not read FORGE's hook profiles.

Legacy copied-configuration compatibility is still available when you deliberately want
merged files in `~/.codex`:

```bash
npm install && bash scripts/sync-forge-to-codex.sh
node scripts/forge.js uninstall --legacy-codex-sync --dry-run
```

Where the two harnesses actually differ:

| Capability | Claude Code | Codex |
| --- | --- | --- |
| Instructions | Native | Native `AGENTS.md` |
| Skills | Native installed set | Native plugin set |
| Delegation | Native agents | Codex multi-agent roles; Claude agent files are not installed as roles |
| FORGE hooks | Native plugin hooks | Native reviewed subset with explicit trust |
| MCP | Available, explicit activation | Native plugin manifest; the legacy sync merges TOML |

Codex's narrower native hook set is supplemented by `AGENTS.md`, optional
`model_instructions_file` overrides, and sandbox permissions. Repository navigation,
surface ownership, and the PR diff packet workflow are in
[docs/CODEX-NAVIGATION-GUIDE.md](docs/CODEX-NAVIGATION-GUIDE.md); the native lifecycle is
documented in [.codex-plugin/README.md](.codex-plugin/README.md).

### Other harnesses

Clone once, then install the adapter that matches your tool:

```bash
git clone https://github.com/your-org/forge.git
cd forge
./install.sh --profile minimal --target cursor
```

Supported targets are `cursor`, `gemini`, `opencode`, `zed`, `antigravity`, `qwen`,
`kimi`, `codebuddy`, `joycode`, `hermes`, `openclaw`, and `adal`, alongside `claude` and
`claude-project` — fifteen in all. OpenCode needs its plugin payload
built first: `npm install && npm run build:opencode`, then
`./install.sh --profile full --target opencode`.

Cursor installs agent definitions under `.cursor/agents/forge-*.md`.
Cursor-native loading behavior can vary by Cursor build.
FORGE does not install root `AGENTS.md` into `.cursor/`. The adapter keeps Cursor's context
inside Cursor's own rules and agent surfaces.

GitHub Copilot needs no install step. `.github/copilot-instructions.md` carries the
instruction layer, `.github/prompts/` holds the reusable prompt files, and the committed
`.vscode/settings.json` turns on `chat.promptFiles` so VS Code loads them.

For a harness with no adapter, [docs/MANUAL-ADAPTATION-GUIDE.md](docs/MANUAL-ADAPTATION-GUIDE.md)
explains how to carry a small set of skills and workflow instructions into a chat-style
tool without pretending hooks or native skill discovery exist there.

### Low-context / no-hooks path

Rules, agents, commands, and the core workflows, without the hook runtime:

```bash
npx forge-universal install --profile minimal --target claude
./install.sh --profile minimal --target claude
```

Windows:

```powershell
.\install.ps1 --profile minimal --target claude
```

This profile intentionally excludes `hooks-runtime`. Pair it with
`FORGE_SESSION_START_CONTEXT=off` when the model has a small window.

To keep the core profile and still leave hooks out:

```bash
./install.sh --profile core --without baseline:hooks --target claude
./install.sh --profile core --no-hooks --target claude
```

Any plan that would materialise the hook runtime stops for an explicit decision. Without
`--enable-hooks` or `--no-hooks` the installer prints what the hooks can do and writes
nothing. The guided installer asks the same question interactively.

### Installing hooks by hand

Do not copy the raw repo `hooks/hooks.json` into `~/.claude/settings.json` or `~/.claude/hooks/hooks.json`.
That file describes the plugin and repository layout, and its command paths do not resolve
once they leave it. Let the installer rewrite them:

```bash
bash ./install.sh --target claude --modules hooks-runtime --enable-hooks
```

That puts the hook scripts under `~/.claude/` and registers the resolved hook entries in
`~/.claude/settings.json`. Settings and hooks you already had are preserved; FORGE-owned
entries carry a stable id so later updates and uninstalls stay idempotent.

On Windows the Claude configuration root is `%USERPROFILE%\.claude`:

```powershell
pwsh -File .\install.ps1 --target claude --modules hooks-runtime --enable-hooks
```

After a plugin install, skip this section entirely. Claude Code 2.1 and newer load plugin
hooks by convention, and a second copy in `settings.json` makes every hook fire twice.

### Reset / Uninstall FORGE

From a published-package install, run these in the directory you installed from:

```bash
npx forge-universal list-installed
npx forge-universal doctor
npx forge-universal repair
npx forge-universal uninstall --dry-run
npx forge-universal uninstall
```

From a source checkout:

```bash
node scripts/forge.js list-installed
node scripts/forge.js doctor
node scripts/forge.js repair
node scripts/uninstall.js --dry-run
node scripts/uninstall.js
```

FORGE only removes files recorded in its install-state. Files it did not write stay where
they are, which is also why a rules directory you copied by hand is yours to delete.

Plugin users: remove the plugin from Claude Code first, then delete the rule folders you
copied manually and no longer want.

If you stacked methods, unwind in this order:

1. Remove the Claude Code plugin.
2. Run the FORGE uninstall from the directory that holds the install-state.
3. Delete the hand-copied rule folders you no longer want.
4. Reinstall once, by a single path.

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

### Skills (318)

The durable unit. A skill is selected by its description, so the description is really a
router: it decides whether the skill fires at all. Browse the catalog in
[docs/RECIPES.md](docs/RECIPES.md) or read
[docs/SKILL-AUTHORING.md](docs/SKILL-AUTHORING.md) to write one.

Coverage spans testing and TDD, code review, security, research, architecture, frontend
and design systems, backend and API design, databases, infrastructure and deployment,
observability and incident response, data and ML, documentation, and operations.

### Commands (94)

Slash entries over the skills, kept for muscle memory during the move to a skills-first
surface. `/plan`, `/test-coverage`, `/review-pr`, `/security-scan`, `/refactor-clean`, and the rest
are listed in [COMMANDS-QUICK-REF.md](COMMANDS-QUICK-REF.md).

A Claude Code plugin install namespaces them, so `/plan` is typed as `/forge:plan` and
`/review-pr` as `/forge:review-pr`. A manual install leaves the bare names in place.

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

The Memory Vault stores portable Markdown under `.forge/memory/` and `~/.forge/memory/`, so
Claude Code, Codex, and the other adapters read one format. Plugin-only, skill-only, and
minimal installs do not put that runtime on `PATH`; install it separately:

```bash
npm install -g forge-universal
forge memory init --scope project
forge memory search "authentication migration" --target-harness codex
command -v forge-memory-mcp
```

The optional `forge-memory-mcp` stdio server exposes the same bounded save, search, read,
and doctor surface to a harness that wants it, and does not enable itself. Memory is
unreviewed context, never executable policy; verify anything load-bearing before acting on
it. The workflow is in [skills/unified-memory/SKILL.md](skills/unified-memory/SKILL.md).

### Forge Shield

A scanner for the agent surface itself: prompt files, hook scripts, MCP server config,
tool permissions, committed secrets, and agent definitions.

```bash
npx forge-shield scan
npx forge-shield scan --fix
```

The threat model it is built against is in [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).

## Repository layout

```text
forge/
| -- agents/       # 68 specialized subagents for delegation
| -- skills/       # 318 workflow bundles, one directory each
| -- commands/     # 94 slash-entry shims over the skills
| -- rules/        # 122 always-loaded standards, selected by stack
| -- hooks/        # the lifecycle hook graph
| -- scripts/      # installer, CLI, hook implementations, CI validators
| -- manifests/    # install profiles, components, and modules
| -- schemas/      # JSON schemas for the config surfaces
| -- docs/         # reference documentation
| -- guides/       # long-form guides
| -- site/         # the documentation website
| -- tests/        # the test suite
```

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

### MCP servers

A plugin install deliberately leaves FORGE's bundled MCP definitions switched off. That
keeps plugin MCP tool names short enough for strict provider validators, and it keeps the
decision with you. FORGE ships one default connector, `chrome-devtools`; the rest are
opt-in entries in [`mcp-configs/mcp-servers.json`](mcp-configs/mcp-servers.json). Copy the
ones you want into a project `.mcp.json`.

Use `/mcp` for Claude Code runtime disables; Claude Code persists those choices in `~/.claude.json`.

If you already run your own copy of a bundled server, tell the installer to leave it alone:

```bash
export FORGE_DISABLED_MCPS="chrome-devtools"
```

`FORGE_DISABLED_MCPS` is a FORGE install/sync filter, not a live Claude Code toggle.
Install and sync flows skip those servers instead of writing a duplicate. The connector policy and
the audit that retired the previous defaults are in
[docs/MCP-CONNECTOR-POLICY.md](docs/MCP-CONNECTOR-POLICY.md).

### Low-context and local models

If you are running a small local model, the default context injection will crowd out the
task. Install without hooks and with a reduced surface:

```bash
forge install --profile core --target claude --no-hooks
export FORGE_SESSION_START_CONTEXT=off
```

The full no-hooks install paths are in
[Low-context / no-hooks path](#low-context--no-hooks-path).

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

| Harness      | Skills  | Agents  | Commands | Hooks   | Rules   | Memory  | MCP     |
| ------------ | :-----: | :-----: | :------: | :-----: | :-----: | :-----: | :-----: |
| Claude Code  | Full    | Full    | Full     | Full    | Full    | Full    | Partial |
| Cursor       | Full    | Full    | Full     | Full    | Full    | Full    | Full    |
| CodeBuddy    | Full    | Full    | Full     | Full    | Full    | Full    | Partial |
| JoyCode      | Full    | Full    | Full     | None    | Full    | Full    | Partial |
| Zed          | Full    | Full    | Full     | None    | Full    | Full    | Partial |
| Qwen Code    | Full    | Full    | Full     | None    | Full    | Full    | Partial |
| Antigravity  | Full    | Full    | Full     | None    | Full    | Full    | Partial |
| Codex        | Full    | Full    | None     | Partial | None    | Full    | Full    |
| OpenCode     | Full    | Full    | Full     | Partial | None    | Full    | Partial |
| Kimi Code    | Partial | Full    | Full     | None    | Full    | Full    | Full    |
| Hermes       | Partial | Full    | Full     | None    | Full    | Full    | Partial |
| OpenClaw     | Partial | Full    | Full     | None    | Full    | Full    | Partial |
| AdaL CLI     | Partial | Full    | Full     | None    | Full    | Full    | Partial |
| Gemini CLI   | Partial | None    | None     | None    | None    | Full    | Partial |
| Kiro         | Partial | Full    | None     | Partial | Full    | None    | Partial |
| Trae         | Full    | Full    | Full     | None    | Full    | unverified | None |
| Pi           | Full    | unverified | Full  | Partial | Partial | unverified | N-A  |
| Copilot      | None    | None    | Partial  | None    | Partial | None    | None    |

Claude Code is the reference implementation. Anywhere else, verify a behaviour before you
depend on it. Kiro, Trae, Pi, and Copilot sit outside the install system: Kiro and Trae ship
their own shell installers, Pi loads this checkout in place, and Copilot is committed files
only. The four session and reference harnesses recorded in the adapter compliance
scorecard — dmux, Orca, Superset, and Ghast — have no content adapter at all; see
[docs/HARNESS-MATRIX.md](docs/HARNESS-MATRIX.md) for those rows and for what each mark means.

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
