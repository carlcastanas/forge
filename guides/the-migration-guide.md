# The migration guide

This guide covers adopting FORGE in a repository that already has history: an existing `CLAUDE.md`, a folder of ad-hoc prompts, shell aliases nobody documented, and a team with habits. It walks through auditing what you have, installing only the surface you need, converting existing assets into FORGE surfaces, sequencing a team rollout, deleting what became redundant, and rolling back cleanly if it does not work out.

**Prerequisites:** an existing repository where a coding agent is already in use, shell access, and the authority to change shared configuration. Concepts from [getting started](getting-started.md) are assumed; [the context guide](the-context-guide.md) explains why the install-size decisions in Phase 2 matter.

---

## Contents

- [What adoption actually costs](#what-adoption-actually-costs)
- [Phase 0: Audit what you have](#phase-0-audit-what-you-have)
- [Phase 1: Choose the surface](#phase-1-choose-the-surface)
- [Phase 2: Install selectively](#phase-2-install-selectively)
- [Phase 3: Choose a rule set for your stack](#phase-3-choose-a-rule-set-for-your-stack)
- [Phase 4: Reconcile your existing CLAUDE.md](#phase-4-reconcile-your-existing-claudemd)
- [Phase 5: Convert recurring prompts into skills](#phase-5-convert-recurring-prompts-into-skills)
- [Phase 6: Convert aliases and scripts into commands](#phase-6-convert-aliases-and-scripts-into-commands)
- [Phase 7: Team rollout sequencing](#phase-7-team-rollout-sequencing)
- [What to delete afterwards](#what-to-delete-afterwards)
- [Rollback](#rollback)
- [Migration checklist](#migration-checklist)

---

## What adoption actually costs

Three costs, all real, none of them the install.

**Context.** Every rule file and every MCP tool is resident in every turn. A full install is 121 rule files and 300+ skills; installed indiscriminately, that is a permanent tax on every session. The selective install exists for this reason.

**Habit.** A team that types `/plan` before implementing gets value. A team that installs FORGE and keeps prompting the way it always did gets a slower agent. The behavior change is the adoption; the files are the mechanism.

**Maintenance.** Skills go stale, rules accumulate, instincts pile up. Budget a recurring hour, not a one-time afternoon.

Do not adopt FORGE if none of these describe you:

- The same corrections keep getting typed into the agent
- Agent output quality varies unacceptably between team members
- Work is lost between sessions and has to be re-derived
- Reviews keep catching the same categories of defect
- Nobody can say whether a prompt or configuration change helped

If your current setup works and you cannot name a failure it causes, a partial adoption — rules plus two or three skills — will serve you better than a full one.

---

## Phase 0: Audit what you have

Adoption starts with an inventory. Skipping this is how teams end up with FORGE's `tdd-workflow` skill and their own `run-tests.md` prompt disagreeing about the same thing.

### Inventory the agent surface

```bash
find . -name 'CLAUDE.md' -not -path './node_modules/*' | xargs wc -l
ls .claude/skills .claude/commands .claude/agents .claude/rules 2>/dev/null
ls ~/.claude/skills ~/.claude/commands ~/.claude/agents 2>/dev/null
cat .claude/settings.json ~/.claude/settings.json 2>/dev/null | head -60
cat .mcp.json ~/.claude/mcp.json 2>/dev/null   # MCP is the quiet context consumer
```

The user-level chain loads too, so an audit that only looks at the repository misses half of it.

### Inventory the informal surface

The valuable material is usually not in `.claude/`.

| Where to look | What you are hunting |
|---|---|
| Team chat, pinned messages | Prompts people copy-paste |
| `docs/`, `CONTRIBUTING.md` | Conventions the agent should know |
| `scripts/`, `Makefile`, `justfile` | Repeated operations |
| Shell config (`alias \| grep -iE 'git\|test\|build'`) | Aliases wrapping repeated work |
| Merged PR review comments | Recurring correction categories |
| `git log --oneline -50` | Conventions the code already follows |
| `.github/workflows/` | Quality gates that already exist |

Write each finding into one table. This is the migration plan.

| Asset | Kind | Destination | Action |
|---|---|---|---|
| "Review this PR for N+1 queries" | Pasted prompt, weekly | Skill or `database-reviewer` | Convert |
| `alias tt='npm test -- --watch'` | Alias, daily | Leave as an alias | Keep |
| "Always use our error wrapper" | Convention in `CLAUDE.md` | Rule | Move |
| `scripts/release.sh` | Script, monthly | Command wrapping the script | Wrap |
| "Explain this module" | Pasted prompt, rare | Nothing | Drop |
| 400-line `CLAUDE.md` | Instructions, always | Rules + skills + short file | Split |

### Score the current setup

FORGE ships a deterministic audit so you have a before number:

```bash
node scripts/harness-audit.js repo --format text
node scripts/harness-audit.js repo --format json > /tmp/harness-before.json
```

Or `/harness-audit` from inside a session. It scores up to twelve fixed categories, each normalized 0–10: tool coverage, context efficiency, quality gates, memory persistence, eval coverage, security guardrails, cost efficiency, GitHub integration, and deploy-target categories that apply only when a matching marker is present. Keep the JSON. Re-run it after adoption and you have a before-and-after rather than an impression.

If the repository is unfamiliar to you as well as to the agent, the `codebase-onboarding` skill analyzes it and produces an architecture map, key entry points, conventions, and a starter `CLAUDE.md` — useful raw material for Phase 4 even if you rewrite all of it.

Record a quality baseline in the same pass: ten tasks mined from real sessions, three runs each. [The evaluation guide](the-evaluation-guide.md) covers the mechanics. The important part is the timing — a baseline can only be captured before the install, and without one every later claim about improvement is an impression.

---

## Phase 1: Choose the surface

FORGE ships far more than any one project needs. Two tools narrow it.

### Ask the advisor

```bash
node scripts/forge.js consult "python service with heavy database work" --target claude
node scripts/forge.js catalog
```

`consult` maps a natural-language description to matching components and profiles and returns preview and install commands. `catalog` enumerates profiles and component ids.

### Detect the stack

```text
/project-init --dry-run
```

`/project-init` reads the project root, detects stack signals from `package.json`, `tsconfig.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`, Gradle files, `next.config.*`, `vite.config.*`, `Dockerfile`, and similar markers, then resolves the smallest useful install plan using `config/project-stack-mappings.json`. It defaults to dry-run and will not modify `CLAUDE.md`, settings, rules, skills, or install state without explicit approval. Where existing configuration is found, it proposes a merge or append plan rather than an overwrite.

The stack map is worth reading directly — it is the repository's own opinion about what a given stack needs:

| Detected stack | Rules | Skills |
|---|---|---|
| `typescript` | `common`, `typescript` | `coding-standards`, `tdd-workflow`, `verification-loop` |
| `react` | `common`, `typescript`, `web`, `react` | `frontend-patterns`, `react-patterns`, `react-performance`, `react-testing`, `accessibility`, plus the TS set |
| `python` | `common`, `python` | `python-patterns`, `python-testing`, `tdd-workflow`, `verification-loop` |
| `django` | `common`, `python` | `django-patterns`, `django-tdd`, `django-verification`, `django-security`, plus the Python set |
| `golang` | `common`, `golang` | `golang-patterns`, `golang-testing`, `tdd-workflow`, `verification-loop` |
| `springboot` | `common`, `java` | `springboot-patterns`, `springboot-tdd`, `springboot-verification`, `springboot-security`, plus the Java set |
| `docker` | none | `docker-patterns`, `deployment-patterns` |

Packs also exist for `rust`, `swift`, `kotlin`, `android`, `csharp-dotnet`, `cpp`, `perl`, `php-laravel`, `dart-flutter`, `nextjs`, `javascript`, and `ruby`.

Notice the pattern: two or three rule packs and a handful of skills. Not 122 and 300.

### Pick a profile

| Profile | Modules | Fits |
|---|---|---|
| `minimal` | rules, agents, commands, platform configs, workflow quality — **no hook runtime** | First adoption; low-context setups; evaluation |
| `core` | `minimal` plus `hooks-runtime` | The baseline once you want enforcement |
| `developer` | `core` plus framework/language, database, orchestration | Most engineering teams |
| `security` | `core` plus the security module | Security-sensitive repositories |
| `research` | `core` plus research APIs, business content, social distribution | Investigation and publishing work |
| `opencode` | commands, platform configs, workflow quality | OpenCode default; hooks are opt-in |
| `full` | Everything | Rarely correct; read the module list before choosing it |

Start at `minimal` or `core`. Add modules when their absence is a problem you can name. Going up is a one-line change; going down means removing habits the team has already formed.

---

## Phase 2: Install selectively

### Always plan before applying

```bash
node scripts/forge.js plan --profile core --target claude
```

This resolves modules, expands dependencies, filters by target, and prints every file that would be written — without touching anything. Read it. The plan is the last cheap moment to notice that a profile pulls in a module you did not want.

### Apply

```bash
node scripts/forge.js install --profile core --target claude
node scripts/forge.js install --profile minimal --target claude --with capability:machine-learning
./install.sh --target claude --skills tdd-workflow,security-review
./install.sh --target claude --modules orchestration --enable-hooks
```

### The hook decision is explicit by design

Any install whose profile or modules would materialize the hook runtime requires a deliberate answer. Without `--enable-hooks` or `--no-hooks`, the installer prints what the hooks would do and stops before writing.

```bash
./install.sh --profile core --no-hooks --target claude
./install.sh --profile core --without baseline:hooks --target claude
./install.sh --target claude --modules hooks-runtime --enable-hooks
```

For a first adoption, install without hooks. Add them once the team is comfortable with the skills and commands, starting on the `minimal` hook profile with anything noisy disabled by id (`FORGE_HOOK_PROFILE=minimal`, `FORGE_DISABLED_HOOKS=stop:desktop-notify`). Hooks are the layer most likely to make someone uninstall FORGE on day one, because they change behavior the user did not ask to change. Introduce them second.

### One install path per harness

Stacking installs into the same harness duplicates skills, commands, hooks, and configuration. Installing once into several different harnesses is fine.

| Combination | Verdict |
|---|---|
| Claude Code plugin + Codex native plugin | Works |
| Claude Code plugin + legacy Codex sync | Works |
| Claude Code plugin + full Claude manual install | Do not |
| Codex sync + Codex marketplace plugin | Do not |

If you already stacked, uninstall and reinstall one path rather than reconciling by hand — see [rollback](#rollback). For a second harness on the same machine, keep its data separate with `FORGE_AGENT_DATA_HOME="$HOME/.cursor/forge"`.

### Verify

`node scripts/forge.js list-installed` reports install-state records — target, profile, file count. `node scripts/forge.js doctor` reports every managed file as `ok`, `missing`, or `drifted`; `repair` restores the last two. Anything not in install-state is not FORGE-managed and will not be touched by uninstall. Per-target details and the platform support matrix: [`../docs/INSTALLATION.md`](../docs/INSTALLATION.md), [`../docs/HARNESS-MATRIX.md`](../docs/HARNESS-MATRIX.md).

---

## Phase 3: Choose a rule set for your stack

Rules are always-loaded, so this is the highest-leverage sizing decision in the whole migration.

Claude Code plugins cannot distribute rule files. Whichever install path you took, rule packs are copied explicitly:

```bash
mkdir -p ~/.claude/rules/forge
cp -R rules/common     ~/.claude/rules/forge/
cp -R rules/typescript ~/.claude/rules/forge/
```

Or project-scoped, when the standards apply to one repository rather than every session:

```bash
cd your-project
mkdir -p .claude/rules/forge
cp -R /path/to/forge/rules/common     .claude/rules/forge/
cp -R /path/to/forge/rules/typescript .claude/rules/forge/
```

Copy whole directories, never individual files. Relative references inside the rule files depend on the directory structure, and loose files collide by name.

`rules/common` is the baseline: ten files covering agents, code review, coding style, development workflow, git workflow, hooks, patterns, performance, security, and testing. Add one language pack. Twenty-one language and framework packs ship; installing more than two is a context decision, not a completeness decision.

### Reconciling with your existing standards

Where a FORGE rule and your team's convention disagree, your convention wins — but say so in one place rather than arguing with the rule in every prompt.

Write one `~/.claude/rules/project/overrides.md` (or `.claude/rules/project/overrides.md` for a repo-scoped set) with a short section per deviation — "coverage floor is 60%, not 80%; `src/legacy/` is exempt", "squash merges only, no merge commits on `main`".

Keep the override file short. A long override file means you picked the wrong rule pack.

If the same principle keeps recurring across several of your skills, the `rules-distill` skill scans installed skills, extracts the cross-cutting principle, and appends, revises, or creates the rule file — turning five copies into one. Rule design in depth: [`../docs/RULES-GUIDE.md`](../docs/RULES-GUIDE.md) and [`../RULES.md`](../RULES.md).

---

## Phase 4: Reconcile your existing CLAUDE.md

An existing `CLAUDE.md` is usually three different documents that grew together. Split it.

```text
  your CLAUDE.md
  ├── "always use the error wrapper"            → rule (always-on invariant)
  ├── "run make itest for integration tests"    → stays (short, always relevant)
  ├── "here is how to debug the flaky auth test" → skill (long, sometimes needed)
  ├── "we chose Postgres over DynamoDB because"  → ADR in docs/ (durable decision)
  └── "the API is at api.internal.example"       → stays (short fact)
```

The test for each line: **is this needed on every turn?** If not, it belongs somewhere the agent can retrieve it, not somewhere it must carry it. Target a combined chain under 300 lines — the threshold `context-budget` flags at. Chains routinely reach a thousand because every addition looks small.

A workable shape after the split:

```markdown
# CLAUDE.md

## Project
One paragraph: what this service does, what it talks to.

## Commands
build `make build` · test `make test` · integration `make itest` (needs Postgres) · lint `make lint`

## Conventions
FORGE rules apply. Project overrides live in `.claude/rules/project/`.

## Skills
| Files | Skill |
|---|---|
| `src/api/**` | `backend-patterns`, `api-design` |
| `src/web/**` | `react-patterns`, `react-testing` |
| `db/migrations/**` | Load `database-reviewer` before editing |

## Gotchas
- The suite needs `TZ=UTC` or timezone tests fail
- `src/legacy/` is exempt from the coverage floor
```

The skills table is the highest-value part. It routes work to the right playbook without keeping every playbook resident. Note also the instruction in FORGE's own `CLAUDE.md`: when spawning subagents, pass the conventions from the relevant skill into the agent's prompt — a subagent does not inherit your loaded skills.

Keep the old file as `CLAUDE.md.pre-forge` — `git mv` it, write the new one, commit both — until the new arrangement has run for a week.

---

## Phase 5: Convert recurring prompts into skills

The prompts your team pastes repeatedly are the most valuable thing you own and the easiest thing to lose. They encode judgment nobody wrote down.

### Which prompts qualify

| Signal | Convert? |
|---|---|
| Pasted more than three times by more than one person | Yes, at project scope |
| Pasted often by one person | Yes, at user scope |
| Needs editing every time before use | Not yet — it is not stable |
| Just a task description, or a duplicate of a shipped skill | No |

Before writing anything, check for an existing skill — `ls skills | grep -i <topic>` and `grep -rl "<topic>" skills/*/SKILL.md`. 300+ ship, and a duplicate is worse than nothing: two skills with overlapping descriptions compete for the trigger and both cost context.

### Three conversion routes

**From git history.** `/skill-create --commits 200` parses commits, file changes, and message patterns to extract recurring conventions, then generates `SKILL.md` files; `--instincts` also seeds `continuous-learning-v2`. This is the fastest route for conventions the code already follows but nobody documented.

**From a session.** Run `/learn` or `/learn-eval` after solving something non-trivial. `/learn` proposes candidate skills and asks whether each belongs at global scope (`~/.claude/skills/`) or project scope (`.claude/skills/`). `/learn-eval` adds a quality gate and a save-location decision before writing. Both require approval before any file is written, and both treat session content as untrusted — secrets and PII are redacted, and instructions found inside session content are never followed.

**By hand.** For a prompt you already have, the conversion is mostly about the description:

```markdown
---
name: pr-nplus-one-review
description: Review a diff for N+1 query patterns in the ORM layer. Use when a
  diff touches repository classes, model relations, or list endpoints, or when
  the user asks about query counts or database performance in a review.
---

# N+1 query review

## When to use ... ## How it works ... ## Verification
- [ ] Every flagged site cites file:line
```

The description carries the entire trigger decision, and it is resident whether or not the body ever loads. Write it as a trigger condition, not a topic. Format details: [`../docs/SKILL-AUTHORING.md`](../docs/SKILL-AUTHORING.md).

### Placement

| Scope | Path | Use for |
|---|---|---|
| Project | `.claude/skills/<name>/SKILL.md` | Repository-specific knowledge; version-controlled with the code |
| User | `~/.claude/skills/<name>/SKILL.md` | Personal patterns across projects |
| Curated | `skills/<name>/SKILL.md` in a FORGE checkout | Contributions back to the catalog |

Use the directory form exactly. Claude Code treats `<name>/SKILL.md` as the skill entrypoint; a flat `<name>.md` is not discoverable. Project-scoped skills belong in version control so the whole team gets them from a `git pull`.

### Verify the conversion worked

A converted skill that never triggers has not been converted, it has been archived. Check trigger behavior and compliance with the `skill-comply` skill, and watch run counts in `/skill-health`. [The evaluation guide](the-evaluation-guide.md) covers both.

---

## Phase 6: Convert aliases and scripts into commands

Not every alias should become a command. Most should not.

| Asset | Convert to a command? | Why |
|---|---|---|
| `alias tt='npm test -- --watch'` | No | You type it in a shell, not at an agent |
| `scripts/release.sh` | No | Deterministic script; the agent can already run it |
| "Run the release script, then check the deploy logs, then post to the channel" | Yes | Multi-step with judgment between steps |
| "Generate a changelog from commits since the last tag" | Yes | Repeated, needs interpretation |
| `make build` | No | Put it in `CLAUDE.md` under Commands |

The routing question from `docs/capability-surface-selection.md`: a deterministic local action that does not need a live server should be a CLI entrypoint or repo script, optionally wrapped by a skill. It should not be re-implemented as prose in a command file.

A command that wraps a script rather than replacing it:

```markdown
---
description: Cut a release — run the release script, verify the deploy, and draft release notes.
argument-hint: [version]
---

# /release

1. Confirm the working tree is clean and `main` is up to date.
2. Run the existing script — do not reimplement it: `./scripts/release.sh "$1"`
3. Poll the deploy until it reports healthy or fails.
4. Draft release notes from `git log --oneline <previous-tag>..HEAD`, present for approval.

Stop conditions: working tree dirty, or the script exits non-zero — print the output and halt.
```

Place project commands in `.claude/commands/<name>.md` so they ship with the repository.

### A note on the command surface

FORGE is moving to a skills-first posture: `skills/` holds the maintained bodies and `commands/` are increasingly thin slash-entry shims. Retired shims live in `legacy-command-shims/` and are not loaded by the default plugin command surface — `/tdd`, `/eval`, `/verify`, `/orchestrate`, `/context-budget`, `/docs`, `/e2e`, `/rules-distill`, `/prompt-optimize`, `/agent-sort`, `/devfleet`, and `/claw` among them. Copy an individual file from that directory into your commands directory only if a team's muscle memory genuinely needs the old name; prefer invoking the canonical skill.

### Converting corrections into hooks

Some recurring corrections are not prompts at all — they are behaviors that should be mechanically prevented. The `hookify-rules` skill and the `/hookify` command family turn those into hooks:

```text
/hookify never commit with --no-verify
/hookify              # no argument: analyze the conversation for corrections worth preventing
/hookify-list
/hookify-configure
```

With no argument, `/hookify` uses the `conversation-analyzer` agent to find explicit corrections, reverted changes, and repeated mistakes, then proposes an event type and matcher. A correction typed more than twice is a hook waiting to be written. See [`../docs/HOOKS-GUIDE.md`](../docs/HOOKS-GUIDE.md).

---

## Phase 7: Team rollout sequencing

Rolling out to everyone at once produces a support burden and a rollback. Sequence it.

```text
  Week 1         Week 2-3        Week 4-5        Week 6+
  1 person       2-3 people      whole team      steady state
  minimal        core + hooks    team skills     maintenance
  no hooks       on minimal      config commit   cadence
  measure        compare         document        re-audit
```

**Week 1 — one person, minimal, no hooks.** One engineer installs `minimal` without hooks and works normally. Goal: confirm nothing breaks and collect the first complaints. Record the harness audit score and the eval baseline.

**Weeks 2–3 — small group, hooks on minimal.** Two or three people, `core` profile, `FORGE_HOOK_PROFILE=minimal`. Goal: find the hooks that annoy people and disable those by id (`FORGE_DISABLED_HOOKS=stop:desktop-notify,post:quality-gate`) rather than abandoning the layer.

**Weeks 4–5 — whole team.** Commit the shared configuration so nobody configures anything by hand.

```text
your-repo/
├── CLAUDE.md                    # short, split per Phase 4
├── .claude/
│   ├── rules/forge/{common,typescript}/   # copied rule packs
│   ├── rules/project/overrides.md         # your deviations
│   ├── skills/                  # team skills from Phase 5
│   ├── commands/                # team commands from Phase 6
│   └── settings.json            # hook profile, permissions, env
└── docs/adr/                    # decisions extracted from CLAUDE.md
```

One documented install command in `CONTRIBUTING.md`. Everything else arrives with a `git pull`.

**Week 6 onward — maintenance.** A recurring cadence, or the setup decays:

| Cadence | Action | Surface |
|---|---|---|
| Weekly | Delete stale low-confidence instincts | `/prune` |
| Monthly | Audit context consumption | `context-budget` skill |
| Monthly | Sweep `~/.claude` for stale items | `config-gc` skill |
| Monthly | Re-run the eval set; compare to baseline | [Evaluation guide](the-evaluation-guide.md) |
| Quarterly | Audit skill quality and overlap | `skill-stocktake` skill |
| Quarterly | Fold recurring principles into rules | `rules-distill` skill |
| Quarterly | Re-run the harness audit; compare | `/harness-audit` |
| On stack change | Re-detect and re-plan | `/project-init --dry-run` |

### Rollout failure modes

| Symptom | Cause | Fix |
|---|---|---|
| "It got slower" | Hook profile too strict, or too many MCP servers | Drop to `minimal`; audit MCP surface |
| "It ignores our conventions" | Conventions never left the old `CLAUDE.md` | Finish Phase 4 |
| "Nobody uses the skills" | Descriptions do not match how people actually ask | Rewrite descriptions; check `/skill-health` run counts |
| "Everyone configured it differently" | Configuration not committed | Commit `.claude/`; one documented install command |
| "Two skills fight over the same task" | Overlapping descriptions | `skill-stocktake`; delete one |
| "Context fills immediately" | Too many rule packs | One `common` plus one language pack |
| "Duplicate commands appear" | Two install paths stacked | Uninstall, reinstall one |

More on the organizational side: [`../docs/TEAM-ADOPTION.md`](../docs/TEAM-ADOPTION.md).

---

## What to delete afterwards

Adoption is not finished until the old surface is gone. Two copies of a convention will disagree, and the agent will follow whichever it read last.

Wait two weeks after the team rollout, then work through this list.

| Delete | Once | Verify first |
|---|---|---|
| `CLAUDE.md.pre-forge` | The new split has run two weeks | Every line landed in a rule, skill, ADR, or the new file |
| Pasted prompts in team chat | The equivalent skills trigger reliably | `/skill-health` shows non-zero runs |
| Ad-hoc prompt files in `docs/prompts/` | Converted to skills or discarded | `grep -r` for references |
| Duplicate skills you wrote that FORGE ships | The shipped one covers your case | Diff them; port anything unique first |
| Rule packs for stacks you do not use | Confirmed unused | `context-budget` classified them "rarely needed" |
| Legacy command shims you copied | Team uses the canonical skills | `grep -r` for the old names in docs |
| MCP servers that only wrap a CLI | Bash covers the same job | Nobody notices they are gone for a week |
| Disabled hooks, stale instincts, solved eval tasks | They stayed unused for a month | `/prune --dry-run` first |

Run `/prune --dry-run` before `/prune`, and sweep `~/.claude` interactively — one confirmation per item — with the `config-gc` skill.

What **not** to delete: `.github/workflows/` quality gates, your test suite, `CONTRIBUTING.md`, and any script a command wraps. FORGE augments those; it does not replace them.

---

## Rollback

Rollback should be boring. Make sure it is, before you need it.

### Reversibility by layer

| Layer | Reverse with | Clean? |
|---|---|---|
| Installed files | `node scripts/forge.js uninstall` | Yes — install-state tracked |
| Rule packs | `rm -rf ~/.claude/rules/forge` | Yes |
| Hooks | `FORGE_HOOK_PROFILE` / `FORGE_DISABLED_HOOKS`, or uninstall | Yes |
| `CLAUDE.md` changes | `git revert` | Yes, if committed |
| Learned skills and instincts | Remove from `~/.claude/skills/`; `/prune` | Mostly |
| Team habits | Nothing | No |

### Preview, then remove

```bash
node scripts/forge.js uninstall --dry-run
node scripts/forge.js uninstall --target claude
node scripts/forge.js uninstall --legacy-codex-sync --dry-run   # legacy Codex sync path
rm -rf ~/.claude/rules/forge                                     # rule packs are copied, not tracked
```

Uninstall removes only files recorded in install-state. Files it cannot prove it owns are preserved and reported for manual review — a deliberate choice that leaves residue rather than deleting something of yours. Skills and commands you copied by hand into `~/.claude/` are in that category; check both directories afterwards.

### Partial rollback

Full removal is rarely the right response. Usually one layer is the problem.

```bash
# Hooks are the problem
export FORGE_HOOK_PROFILE=minimal
export FORGE_DISABLED_HOOKS=post:quality-gate,stop:format-typecheck

# Context is the problem
rm -rf ~/.claude/rules/forge/<pack-you-do-not-need>
export FORGE_DISABLED_MCPS=some-server

# Session-start preamble is the problem
export FORGE_SESSION_START_MAX_CHARS=2000
export FORGE_SESSION_START_CONTEXT=off

# One skill is the problem
rm -rf ~/.claude/skills/<skill-name>
```

Diagnose before removing. `node scripts/forge.js doctor` and the `context-budget` skill will usually name the layer, and reverting one layer preserves the value of the other four.

If install state is tangled rather than unwanted, `list-installed`, `doctor`, `repair`, and `status` will usually sort it out without removing anything.

For teams moving from an older FORGE major version rather than from no FORGE at all, [`../docs/MIGRATION-1X-TO-2.0.md`](../docs/MIGRATION-1X-TO-2.0.md) covers that path specifically.

---

## Migration checklist

```text
Phase 0 — Audit
[ ] Inventoried CLAUDE.md chain, .claude/, settings, MCP config
[ ] Inventoried informal assets: pasted prompts, aliases, scripts, review patterns
[ ] Wrote the asset table: kind, frequency, destination, action
[ ] Recorded a harness audit score (JSON, committed)
[ ] Recorded a quality baseline: 10 tasks, 3 runs each

Phase 1 — Choose
[ ] Ran `consult` and `/project-init --dry-run`
[ ] Picked a profile (minimal or core for a first adoption)
[ ] Listed which modules are deliberately excluded

Phase 2 — Install
[ ] Reviewed `forge plan` output before applying; one path per harness, no stacking
[ ] Made the hook decision explicitly (started without, or on minimal)
[ ] Verified with `list-installed` and `doctor`

Phase 3 — Rules
[ ] Copied rules/common plus at most two language packs, whole directories
[ ] Wrote a short project override file for genuine deviations

Phase 4 — CLAUDE.md
[ ] Split into rules, skills, ADRs, and a short project file, under 300 combined lines
[ ] Added the file-pattern to skill routing table
[ ] Kept the old file as CLAUDE.md.pre-forge for two weeks

Phase 5-6 — Skills and commands
[ ] Checked for an existing FORGE skill before writing each new one
[ ] Converted recurring prompts (git history, /learn, or by hand)
[ ] Descriptions written as trigger conditions, not topics
[ ] Project skills committed under .claude/skills/; trigger and compliance verified
[ ] Converted only multi-step judgment workflows; commands wrap scripts, not reimplement them
[ ] Recurring corrections converted to hooks via /hookify

Phase 7 — Rollout
[ ] Week 1 one person minimal no hooks; weeks 2-3 small group hooks on minimal
[ ] Weeks 4-5 whole team with configuration committed; week 6+ maintenance cadence

Cleanup and rollback
[ ] Old surface deleted after two weeks
[ ] Rollback path tested with `uninstall --dry-run`
[ ] Re-ran the harness audit and eval set; compared to baseline
```

---

## Related reading

| Topic | Where |
|---|---|
| First twenty minutes | [Getting started](getting-started.md) |
| Why install size matters | [The context guide](the-context-guide.md) |
| Measuring before and after | [The evaluation guide](the-evaluation-guide.md) |
| Security posture before rollout | [The security guide](the-security-guide.md) |
| Install mechanics, targets, platform support | [`../docs/INSTALLATION.md`](../docs/INSTALLATION.md), [`../docs/HARNESS-MATRIX.md`](../docs/HARNESS-MATRIX.md) |
| Settings, environment, CLI | [`../docs/CONFIGURATION.md`](../docs/CONFIGURATION.md), [`../docs/CLI-REFERENCE.md`](../docs/CLI-REFERENCE.md) |
| Surface routing | [`../docs/CONCEPTS.md`](../docs/CONCEPTS.md), [`../docs/capability-surface-selection.md`](../docs/capability-surface-selection.md) |
| Organizational rollout | [`../docs/TEAM-ADOPTION.md`](../docs/TEAM-ADOPTION.md) |
| Version migration | [`../docs/MIGRATION-1X-TO-2.0.md`](../docs/MIGRATION-1X-TO-2.0.md), [`../docs/SELECTIVE-INSTALL-ARCHITECTURE.md`](../docs/SELECTIVE-INSTALL-ARCHITECTURE.md) |
