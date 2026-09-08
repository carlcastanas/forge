# Getting started with FORGE

This guide walks through the first twenty minutes with FORGE: installing it, confirming the install is real, driving one small feature from plan to committed tests, and reading what the agent left behind. By the end you will be able to run a gated FORGE workflow on your own repository and explain which part of the output came from the model and which part came from the system around it.

**Prerequisites:** Node.js 18 or newer, Git, a working Claude Code 2.1+ install on `PATH`, and a terminal you are comfortable in. No prior FORGE knowledge is assumed.

---

## Contents

- [What FORGE actually adds](#what-forge-actually-adds)
- [Step 1: Install](#step-1-install)
- [Step 2: Verify the install](#step-2-verify-the-install)
- [Step 3: See what landed](#step-3-see-what-landed)
- [Step 4: Prepare a scratch repository](#step-4-prepare-a-scratch-repository)
- [Step 5: Plan the work before writing code](#step-5-plan-the-work-before-writing-code)
- [Step 6: Implement under test](#step-6-implement-under-test)
- [Step 7: Review from a clean vantage point](#step-7-review-from-a-clean-vantage-point)
- [Step 8: Read the session residue](#step-8-read-the-session-residue)
- [What just happened](#what-just-happened)
- [Where everything lives](#where-everything-lives)
- [Turning the volume down](#turning-the-volume-down)
- [If something went wrong](#if-something-went-wrong)
- [Three next steps](#three-next-steps)

---

## What FORGE actually adds

A coding agent can already write code. What it does not bring on its own is a process that survives a long session, a second engineer's scrutiny, or next week. FORGE installs that process as files the agent loads:

```text
plan -> test -> implement -> review -> verify -> remember -> improve
```

The catalog behind that loop, as it exists in this repository:

| Surface | Count | Loaded when |
|---|---:|---|
| Agents (`agents/`) | 68 | A task is delegated to a subagent |
| Skills (`skills/`) | 300+ | The model matches a skill description to the request |
| Command shims (`commands/`) | 94 | You type the slash command |
| Rule files (`rules/`) | 122 | Always, for the packs you installed |
| Hooks (`hooks/hooks.json`) | Runtime | On session start, tool use, compaction, stop |

Read [`../docs/CONCEPTS.md`](../docs/CONCEPTS.md) for the distinctions between those five surfaces. The short version: rules are always-on constraints, skills are on-demand playbooks, agents are delegated workers with their own context window, commands are typed entry points, hooks are deterministic code the harness runs for you.

---

## Step 1: Install

Pick exactly one path per harness. Stacking two installs into the same harness duplicates skills, commands, and hooks.

### Path A: guided package setup (recommended)

```bash
npx forge-universal setup
```

**Expected observation:** an interactive prompt asking for install scope and a hook profile (`minimal`, `standard`, or `strict`), followed by a written summary of the files it will create. Nothing is written until you confirm.

### Path B: native Claude Code plugin commands

Inside a Claude Code session:

```text
/plugin marketplace add https://github.com/carlcastanas/forge
/plugin install forge@forge
```

**Expected observation:** Claude Code reports the marketplace was added, then that `forge@forge` is installed. Restart the session so the plugin surface loads.

> Claude Code plugins cannot distribute rule files. If you took Path B and want the rule layer, copy the packs you need explicitly — see [Step 3](#step-3-see-what-landed).

### Path C: repository clone with selective install

Use this when you want to read the source before it touches your machine.

```bash
git clone https://github.com/carlcastanas/forge.git
cd forge
npm install
node scripts/forge.js plan --profile minimal --target claude
```

**Expected observation:** a dry-run install plan listing every file that would be written, with no mutation. Apply it only once the plan looks right:

```bash
node scripts/forge.js install --profile minimal --target claude
```

Full install mechanics, profiles, and per-harness targets live in [`../docs/INSTALLATION.md`](../docs/INSTALLATION.md).

---

## Step 2: Verify the install

Do not trust a success message. Ask the installer what it believes it owns.

```bash
node scripts/forge.js list-installed
```

**Expected observation:** one or more install-state records naming a target (`claude`, `codex`, …), a profile, and a file count. An empty result means nothing was installed for this context.

```bash
node scripts/forge.js doctor
```

**Expected observation:** a health report. Every managed file is either `ok`, `missing`, or `drifted`. Missing and drifted files are repairable:

```bash
node scripts/forge.js repair
```

Then confirm the harness itself sees FORGE. In a Claude Code session:

```text
/forge-guide
```

**Expected observation:** the guide reads the live installed surface and reports which agents, skills, commands, hooks, and rules are actually present — not a static list. If this command is unrecognized, the plugin is not loaded; restart the session before debugging anything else.

---

## Step 3: See what landed

```bash
ls ~/.claude/skills | head -20
ls ~/.claude/agents | head -20
ls ~/.claude/rules/forge 2>/dev/null
```

**Expected observation:** skill directories as direct children of `~/.claude/skills/`, agent Markdown files in `~/.claude/agents/`, and — if you installed rules — one directory per rule pack.

Rules are the one layer that is always in your context window, so install only what applies to your stack:

```bash
mkdir -p ~/.claude/rules/forge
cp -R rules/common ~/.claude/rules/forge/
cp -R rules/typescript ~/.claude/rules/forge/   # replace with your stack
```

**Expected observation:** `rules/common` contains ten files covering agents, code review, coding style, development workflow, git workflow, hooks, patterns, performance, security, and testing. Those ten are the baseline; the language pack layers on top.

Copy whole directories, never individual files — relative references inside the rule files depend on the directory structure.

---

## Step 4: Prepare a scratch repository

Run the first real task somewhere disposable. A fresh Node project takes thirty seconds and removes the fear of a bad diff.

```bash
mkdir -p ~/forge-firstrun && cd ~/forge-firstrun
git init
npm init -y
npm install --save-dev vitest
```

Wire the test script:

```bash
node -e "const p=require('./package.json'); p.scripts={test:'vitest run'}; require('fs').writeFileSync('package.json', JSON.stringify(p,null,2))"
git add -A && git commit -m "chore: scaffold scratch project"
```

**Expected observation:** `npm test` exits non-zero with "No test files found". That is the correct starting state — an empty suite, not a broken one.

Now start Claude Code in that directory:

```bash
claude
```

**Expected observation:** the session opens and FORGE's `SessionStart` hook injects its bootstrap context. On a `standard` hook profile you will see a short session banner rather than a wall of text.

---

## Step 5: Plan the work before writing code

The first move in FORGE is never implementation. Type:

```text
/plan Add a slugify(input) utility to src/slug.js. It lowercases, trims,
replaces runs of non-alphanumeric characters with a single hyphen, and strips
leading and trailing hyphens. Empty or whitespace-only input returns an empty
string.
```

**Expected observation:** the agent restates the requirement, lists risks and ambiguities (Unicode handling, maximum length, collision behavior), and produces a numbered implementation plan. It then stops and waits. `/plan` will not touch code until you confirm — that is the gate, not a suggestion.

Read the plan properly. This is the cheapest place in the whole loop to catch a misunderstanding. If the plan says it will add a dependency you do not want, say so now.

Reply:

```text
Confirm. Proceed with the plan.
```

For work large enough to need a document rather than a chat message, `/plan-prd` produces a problem-first PRD and hands off to `/plan`. For a whole feature end to end — research, plan, TDD, review, gated commit — use the orchestrator wrapper instead:

```text
/orch-add-feature add a slugify utility with full test coverage
```

That wrapper runs the shared pipeline documented in `skills/orch-pipeline/SKILL.md` and is covered in [the orchestration guide](the-orchestration-guide.md).

---

## Step 6: Implement under test

Ask for the TDD workflow explicitly:

```text
Implement the approved plan using the tdd-workflow skill. Write the failing
tests first and show me the red run before implementing.
```

**Expected observation:** three distinct phases, in this order.

1. **Red.** The agent writes `src/slug.test.js` and runs `npm test`. The run fails because `src/slug.js` does not exist. The failure output is shown to you, not summarized away.
2. **Green.** The agent writes `src/slug.js` with the minimum needed and re-runs the suite. Tests pass.
3. **Refactor.** The agent tidies the implementation and re-runs to confirm the suite is still green.

Verify the claim yourself rather than accepting it:

```bash
npm test
git status --short
```

**Expected observation:** a passing suite, and exactly two new untracked files — `src/slug.js` and `src/slug.test.js`. If more files changed than the plan called for, that is a scope problem worth raising before you commit.

If the build or test command breaks in a way the agent cannot resolve, `/build-fix` routes to the `build-error-resolver` agent. Do not let a broken toolchain get papered over with a skipped test.

---

## Step 7: Review from a clean vantage point

The model that wrote the code is the worst reviewer of it — it already believes the code is correct. FORGE's review step delegates to a separate agent with its own context.

```text
/code-review
```

**Expected observation:** findings grouped by severity. A well-formed review of this diff typically flags things the plan did not mention: unhandled `null` input, no length cap, regex behavior on non-ASCII characters. Findings at CRITICAL or HIGH are meant to block; LOW and advisory findings are yours to triage.

Fix what matters, then re-run the suite. When the diff touches authentication, authorization, user input, database queries, filesystem paths, external API calls, cryptography, or secrets, add the security pass:

```text
/security-scan
```

**Expected observation:** Forge Shield reports on agent files, hook configuration, MCP configuration, permissions, and secret surfaces. For the slugify example it should be clean; run it once anyway so you know what clean looks like. The reasoning behind those checks is in [the security guide](the-security-guide.md).

Commit only after review:

```bash
git add src/slug.js src/slug.test.js
git commit -m "feat: add slugify utility with test coverage"
```

---

## Step 8: Read the session residue

The value of FORGE is not the one feature. It is what the session leaves behind for the next one.

```text
/save-session
```

**Expected observation:** a file at `~/.claude/session-data/YYYY-MM-DD-<short-id>-session.tmp` describing what was built, what was decided, what failed, and what remains. Read it:

```bash
ls -lt ~/.claude/session-data/ | head -5
cat "$(ls -t ~/.claude/session-data/*-session.tmp | head -1)"
```

A future session picks it back up with `/resume-session`, and `/sessions list` enumerates what is stored.

Extract anything reusable before the context is gone:

```text
/learn
```

**Expected observation:** the agent proposes one or more candidate skills drawn from this session, and asks whether each belongs at global scope (`~/.claude/skills/`) or project scope (`.claude/skills/`). It will not write a skill file without your approval. `/learn-eval` is the stricter variant: it self-grades the candidate before offering to save it.

Finally, look at what the run cost:

```text
/cost-report
```

**Expected observation:** a per-day, per-model, per-session breakdown read from `~/.claude/metrics/costs.jsonl`, which the `stop:cost-tracker` hook appends to at the end of each session. If the file does not exist yet, the tracker has not run — finish one full session with hooks enabled first.

---

## What just happened

Four things ran that you did not have to prompt for:

```text
  you type                FORGE surface           harness does
  ────────────────────────────────────────────────────────────────
  claude                  SessionStart hook   ->  injects bootstrap context
                          rules/*              ->  loaded into every turn
  /plan                   commands/plan.md     ->  planner agent, gate before code
  "use tdd-workflow"      skills/tdd-workflow  ->  red -> green -> refactor
  (each Edit/Write)       PreToolUse hooks     ->  compaction hints, config guards
  (after each edit)       PostToolUse hooks    ->  format, typecheck, console.log check
  /code-review            agents/code-reviewer ->  fresh context, severity-ranked
  (session ends)          Stop hooks           ->  cost tracking, session summary
```

The distinction worth internalizing: the *model* produced the code, and the *system* decided when to plan, when to test, when to review, and what to keep. Swapping models changes the first half. It does not change the second.

---

## Where everything lives

| Path | Contents | Edit it when |
|---|---|---|
| `~/.claude/skills/<name>/SKILL.md` | On-demand playbooks | Adding a workflow you repeat |
| `~/.claude/agents/<name>.md` | Delegatable specialists | Adding a reviewer or resolver role |
| `~/.claude/commands/<name>.md` | Slash entry points | Turning a habit into a typed shortcut |
| `~/.claude/rules/forge/<pack>/` | Always-loaded constraints | Changing a non-negotiable standard |
| `~/.claude/settings.json` | Harness config, env, hooks | Tuning model, thinking budget, hooks |
| `~/.claude/session-data/` | Saved session state | Never by hand — use `/save-session` |
| `~/.claude/metrics/costs.jsonl` | Per-session cost rows | Never by hand — read with `/cost-report` |
| `<repo>/CLAUDE.md` | Project instructions | Recording project-specific conventions |

Authoring formats for the first three are in [`../docs/SKILL-AUTHORING.md`](../docs/SKILL-AUTHORING.md) and [`../docs/AGENT-AUTHORING.md`](../docs/AGENT-AUTHORING.md).

---

## Turning the volume down

A full FORGE install is more system than most first projects need. Two dials matter early.

**Hook profile.** Hooks are the deterministic layer, and each one costs a little latency and a little context.

```bash
export FORGE_HOOK_PROFILE=minimal    # minimal | standard | strict
export FORGE_DISABLED_HOOKS=stop:desktop-notify
```

`minimal` keeps the safety-relevant hooks and drops the conveniences. `strict` adds gates that can block a stop. Individual hook ids — for example `pre:edit-write:suggest-compact`, `post:quality-gate`, `stop:cost-tracker` — can be disabled by name without editing any hook file.

**Installed surface.** If context feels tight, audit before adding anything:

```text
Use the context-budget skill to audit what is consuming the context window.
```

**Expected observation:** a per-component token estimate across agents, skills, rules, MCP servers, and the `CLAUDE.md` chain, with each component bucketed as always needed, sometimes needed, or rarely needed. Details in [the context guide](the-context-guide.md) and [`../docs/token-optimization.md`](../docs/token-optimization.md).

---

## If something went wrong

| Symptom | Likely cause | First action |
|---|---|---|
| Slash commands not recognized | Plugin not loaded | Restart the session, then `node scripts/forge.js list-installed` |
| Duplicated skills or commands | Two install paths stacked | `node scripts/forge.js uninstall`, then reinstall one path |
| Hooks never fire | Hook runtime not installed | Reinstall with a profile that includes `hooks-runtime` |
| Context fills within a few turns | Too many rules or MCP servers | Run the `context-budget` skill; drop unused rule packs |
| Files reported missing by `doctor` | Drift or partial install | `node scripts/forge.js repair` |
| Rules ignored on a plugin install | Plugins cannot ship rules | Copy rule packs manually (Step 3) |

Longer diagnostics are in [`../TROUBLESHOOTING.md`](../TROUBLESHOOTING.md) and [`../docs/FAQ.md`](../docs/FAQ.md).

---

## Three next steps

### If you are a solo developer

1. Install `rules/common` plus exactly one language pack, and nothing else. Add surface only when you notice its absence.
2. Run one real task per day through `/plan` → `tdd-workflow` → `/code-review` until the sequence stops feeling like ceremony. Then read [the field guide](the-field-guide.md) for the day-to-day shortcuts.
3. After two weeks, run `/learn-eval` on your best session and turn it into a skill. That one skill will teach you more about skill authoring than any document.

### If you are a team lead

1. Read [the migration guide](the-migration-guide.md) before installing anything into a shared repository. The audit step matters more than the install step.
2. Standardize on one hook profile and one rule set across the team, checked into the repository, so reviews argue about code rather than configuration. See [`../docs/TEAM-ADOPTION.md`](../docs/TEAM-ADOPTION.md).
3. Convert your team's three most-repeated prompts into skills before rolling out anything else. Recurring prompts are the highest-value thing you own and the easiest thing to lose.

### If you are evaluating FORGE

1. Skip the tutorial repository and run the same task twice on a real codebase — once with FORGE installed, once with `FORGE_HOOK_PROFILE=minimal` and no rules — then diff the outputs and the transcripts.
2. Build a five-task eval set from sessions you have already run, and grade both configurations against it. [The evaluation guide](the-evaluation-guide.md) covers grader design and how each grader type misleads you.
3. Read [the complete guide](the-complete-guide.md) for the architecture, and [`../docs/ANTI-PATTERNS.md`](../docs/ANTI-PATTERNS.md) for the failure modes the system does not prevent.

---

**Related:** [Guide index](README.md) · [Concepts](../docs/CONCEPTS.md) · [Installation reference](../docs/INSTALLATION.md) · [CLI reference](../docs/CLI-REFERENCE.md) · [Glossary](../docs/GLOSSARY.md)
