# Commands quick reference

This page lists every slash command FORGE ships and what each one fronts. Use it to find the
right entry point quickly, and to see which durable skill or agent actually does the work.

Prerequisites: you know what a skill and an agent are — see
[docs/CONCEPTS.md](docs/CONCEPTS.md). To add a command, read the authoring rules in
[CONTRIBUTING.md](CONTRIBUTING.md) first.

## Commands are shims

A command is a Markdown file in `commands/` with a `description` in its frontmatter. Typing
`/plan` loads that file's content into the session. That is the entire mechanism.

The important consequence: **a command is not where behavior lives.** It is a keystroke that
loads something else. The durable units are:

| Unit | Lives in | Reusable by |
| --- | --- | --- |
| Skill | `skills/<name>/SKILL.md` | Any session, any agent, any harness, and by other skills |
| Agent | `agents/<name>.md` | Any session, invoked as an isolated subagent |
| Command | `commands/<name>.md` | A human typing a slash, in harnesses that support slash commands |

Skills survive harness changes. Commands do not — a harness with no slash-command surface
still runs skills, and adapters project the skill catalog into every supported target. This is
why the guidance for authors is blunt: put the procedure in a skill, and let the command be
three lines that invoke it. When a command file grows past a screen of orchestration, extract
the body into a skill and shrink the command back down.

Commands do earn their keep for two things: discoverability, and pinning a set of arguments to
a workflow. `/rust-test` is faster to reach for than remembering that `rust-testing` and
`tdd-workflow` should be loaded together.

Frontmatter keys in use across the 94 commands: `description` (required, all 94),
`argument-hint` (12), `name` (9), `command` (8), `allowed-tools` (2),
`disable-model-invocation` (2), `subtask` (1), `agent` (1).

## Reading the tables

The **Backs** column names the durable unit the command loads or delegates to, when the
command file names one. `skill:` and `agent:` entries are taken from the command file itself;
`script:` entries name the executable it drives. A dash means the command carries its own
inline procedure and has no separate backing unit.

94 commands, grouped by domain. Every file in `commands/` appears exactly once.

## Planning and specification

| Command | Does | Backs |
| --- | --- | --- |
| `/plan` | Restates requirements, assesses risk, produces an ordered plan, and waits for confirmation before touching code | skill: `tdd-workflow`, `plan-canvas` |
| `/plan-prd` | Generates a lean, problem-first PRD and hands off to `/plan` | skill: `tdd-workflow` |
| `/plan-canvas` | Opens a plan or HTML artifact in the browser Plan Canvas for annotate-and-approve review | script: `scripts/plan-canvas.js` |
| `/prp-plan` | Builds a comprehensive implementation plan with codebase analysis and pattern extraction | — |
| `/prp-prd` | Interactive, hypothesis-driven product spec built through back-and-forth questioning | — |
| `/prp-implement` | Executes an implementation plan with validation loops at each step | — |
| `/feature-dev` | Guided feature development with codebase understanding and architecture focus | agent: `code-architect` |

## Orchestration and multi-model workflows

The `orch-*` family runs the full plan → test → implement → review → verify loop for one shape
of task. Pick by the shape of the change, not by the size.

| Command | Does | Backs |
| --- | --- | --- |
| `/orch-add-feature` | New feature end to end: research, plan, TDD, review, gated commit | skill: `orch-add-feature`, `orch-pipeline` |
| `/orch-change-feature` | Alters existing working behavior: update tests to the new spec, change implementation, review, gated commit | skill: `orch-change-feature` |
| `/orch-fix-defect` | Reproduces the bug as a failing regression test, fixes to green, reviews, gated commit | skill: `orch-fix-defect` |
| `/orch-refine-code` | Behavior-preserving refactor: confirm green, restructure, stay green, review, gated commit | skill: `orch-refine-code` |
| `/orch-build-mvp` | Bootstraps a working MVP from a design or spec doc; reuses the GAN harness | skill: `orch-build-mvp` |
| `/orch-review` | Runs the `orch-review` workflow over local changes or a GitHub PR, splitting blocking from advisory findings | workflow: `orch-review` |
| `/multi-plan` | Multi-model implementation plan with no production code changes | — |
| `/multi-execute` | Executes a multi-model plan while keeping Claude the only filesystem writer | — |
| `/multi-frontend` | Multi-model workflow for components, layout, animation, UI polish | — |
| `/multi-backend` | Multi-model workflow for APIs, algorithms, data, business logic | — |
| `/multi-workflow` | Full multi-model cycle: research, plan, execute, optimize, review | — |
| `/santa-loop` | Adversarial dual review: two independent model reviewers must both approve before ship | skill: `santa-method` |

## Autonomous loops

| Command | Does | Backs |
| --- | --- | --- |
| `/gan-build` | Generator/evaluator build loop with bounded iterations and scoring | agent: `gan-planner`, `gan-generator`, `gan-evaluator` |
| `/gan-design` | Generator/evaluator loop for frontend and visual work | agent: `gan-generator`, `gan-evaluator` |
| `/loop-start` | Starts a managed autonomous loop with safety defaults and explicit stop conditions | agent: `loop-operator` |
| `/loop-status` | Inspects active loop state, progress, failure signals, and recommended intervention | script: `scripts/loop-status.js` |

## Code review

| Command | Does | Backs |
| --- | --- | --- |
| `/code-review` | Reviews local uncommitted changes, or a GitHub PR when given a number or URL | agent: `code-reviewer` |
| `/review-pr` | Full pull-request review fanning out across specialized agents | agent: multiple |

### Language and framework review

| Command | Does | Backs |
| --- | --- | --- |
| `/python-review` | PEP 8, type hints, security, Pythonic idioms | agent: `python-reviewer`; skill: `python-patterns`, `python-testing` |
| `/react-review` | Hooks, render cost, server/client boundaries, accessibility; runs `typescript-reviewer` alongside on TSX/JSX | agent: `react-reviewer`; skill: `react-patterns`, `react-testing` |
| `/vue-review` | Composition API correctness, reactivity, composables, template security; pairs with `typescript-reviewer` | agent: `vue-reviewer`; skill: `vue-patterns` |
| `/go-review` | Idiomatic Go, concurrency safety, error handling, security | agent: `go-reviewer`; skill: `golang-patterns`, `golang-testing` |
| `/rust-review` | Ownership, lifetimes, error handling, `unsafe` usage | agent: `rust-reviewer`; skill: `rust-patterns`, `rust-testing` |
| `/kotlin-review` | Idiomatic Kotlin, null safety, coroutine safety, security | agent: `kotlin-reviewer`; skill: `kotlin-patterns`, `kotlin-testing` |
| `/cpp-review` | Memory safety, modern C++ idioms, concurrency, security | agent: `cpp-reviewer`; skill: `cpp-coding-standards`, `cpp-testing` |
| `/flutter-review` | Widget practice, state management, Dart idioms, performance, accessibility | agent: `flutter-reviewer`; skill: `flutter-dart-code-review` |
| `/fastapi-review` | Async correctness, dependency injection, Pydantic schemas, OpenAPI quality, testability | agent: `fastapi-reviewer`; skill: `fastapi-patterns` |

## Build and error resolution

Each of these detects the toolchain, then fixes incrementally with minimal diffs.

| Command | Does | Backs |
| --- | --- | --- |
| `/build-fix` | Detects the build system and fixes build and type errors with minimal safe changes | agent: `build-error-resolver` |
| `/react-build` | Vite, webpack, Next.js, CRA, Parcel, esbuild, Bun; JSX/TSX errors, hydration mismatches, boundary failures | agent: `react-build-resolver`; skill: `react-patterns` |
| `/go-build` | Build errors, `go vet` warnings, linter issues | agent: `go-build-resolver`; skill: `golang-patterns` |
| `/rust-build` | Cargo build errors, borrow-checker issues, dependency problems | agent: `rust-build-resolver`; skill: `rust-patterns` |
| `/kotlin-build` | Kotlin compiler and Gradle errors, warnings, dependency issues | agent: `kotlin-build-resolver`; skill: `kotlin-patterns` |
| `/gradle-build` | Gradle build failures for Android and Kotlin Multiplatform projects | agent: `kotlin-build-resolver` |
| `/cpp-build` | Compilation, CMake, and linker problems | agent: `cpp-build-resolver`; skill: `cpp-coding-standards` |
| `/flutter-build` | Dart analyzer errors and Flutter build failures | agent: `dart-build-resolver`; skill: `flutter-dart-code-review` |

## Testing

The `*-test` commands enforce tests-first: the test is written and seen to fail before any
implementation.

| Command | Does | Backs |
| --- | --- | --- |
| `/react-test` | React Testing Library, behavior-focused and accessibility-first; detects Vitest or Jest | skill: `react-testing`, `tdd-workflow`, `e2e-testing` |
| `/go-test` | Table-driven tests first, then implementation; verifies coverage with `go test -cover` | skill: `golang-testing`, `tdd-workflow` |
| `/rust-test` | Tests first, then implementation; coverage via `cargo-llvm-cov` | skill: `rust-testing`, `verification-loop` |
| `/kotlin-test` | Kotest first, then implementation; coverage via Kover | skill: `kotlin-testing`, `tdd-workflow` |
| `/cpp-test` | GoogleTest first, then implementation; coverage via gcov and lcov | skill: `cpp-testing`, `tdd-workflow` |
| `/flutter-test` | Runs unit, widget, golden, and integration tests, then fixes failures incrementally | skill: `flutter-dart-code-review`, `tdd-workflow` |
| `/test-coverage` | Analyzes coverage, identifies gaps, generates the missing tests toward the target | agent: `tdd-guide` |

## Refactoring and quality gates

| Command | Does | Backs |
| --- | --- | --- |
| `/refactor-clean` | Identifies and removes dead code, verifying after each removal | agent: `refactor-cleaner` |
| `/quality-gate` | Runs the formatter quality gate for a single file and reports remediation steps | skill: `verification-loop` |
| `/harness-audit` | Deterministic repository harness audit returning a prioritized scorecard | script: `scripts/harness-audit.js` |

## Git, pull requests, and epics

| Command | Does | Backs |
| --- | --- | --- |
| `/pr` | Creates a GitHub PR from the current branch: discovers templates, analyzes changes, pushes | — |
| `/prp-pr` | Same flow within the PRP workflow family | — |
| `/prp-commit` | Commits with natural-language file targeting — describe what to commit in plain English | — |
| `/epic-decompose` | Breaks an epic into task children without creating task branches | — |
| `/epic-claim` | Claims an epic issue, stamps coordination state, syncs local ownership | — |
| `/epic-validate` | Validates epic readiness, dependencies, and coordination policy | — |
| `/epic-sync` | Syncs epic issue bodies, labels, and local coordination snapshots from GitHub | — |
| `/epic-publish` | Publishes a validated epic update back to the issue and the local cache | — |
| `/epic-review` | Marks an epic review requested, approved, or changes-requested | — |
| `/epic-unblock` | Sweeps blocked epic issues and reopens anything whose dependencies are closed | — |

## Session, context, and cost

| Command | Does | Backs |
| --- | --- | --- |
| `/aside` | Answers a side question without losing the current task, then resumes automatically | — |
| `/checkpoint` | Creates, verifies, or lists workflow checkpoints after running verification checks | — |
| `/save-session` | Writes current session state to a dated file so work can resume later with full context | — |
| `/resume-session` | Loads the most recent session file and resumes from where the last session ended | — |
| `/sessions` | Manages session history, aliases, and session metadata | script: `scripts/sessions-cli.js` |
| `/cost-report` | Generates a local cost report from the FORGE cost-tracker metrics log | script: `scripts/hooks/cost-tracker.js` |
| `/model-route` | Recommends a model tier for the current task from complexity, risk, and budget | — |

Session mechanics and when to use each of these are covered in
[WORKING-CONTEXT.md](WORKING-CONTEXT.md).

## Learning and memory

FORGE's memory layer turns repeated corrections into durable instincts. These commands manage
that lifecycle: capture, review, promote, prune.

| Command | Does | Backs |
| --- | --- | --- |
| `/learn` | Extracts reusable patterns from the session and saves them as candidate skills or guidance | — |
| `/learn-eval` | Same extraction, but self-evaluates quality first and picks global versus project scope | — |
| `/evolve` | Analyzes accumulated instincts and suggests or generates evolved structures | skill: `continuous-learning-v2` |
| `/instinct-status` | Shows learned instincts, project and global, with confidence scores | skill: `continuous-learning-v2` |
| `/instinct-export` | Exports instincts from project or global scope to a file | skill: `continuous-learning-v2` |
| `/instinct-import` | Imports instincts from a file or URL into project or global scope | skill: `continuous-learning-v2` |
| `/promote` | Promotes project-scoped instincts to global scope | skill: `continuous-learning-v2` |
| `/prune` | Deletes pending instincts older than 30 days that were never promoted | skill: `continuous-learning-v2` |
| `/projects` | Lists known projects and their instinct statistics | skill: `continuous-learning-v2` |

## Hooks

| Command | Does | Backs |
| --- | --- | --- |
| `/hookify` | Creates hooks that prevent unwanted behaviors, from transcript analysis or explicit instruction | agent: `conversation-analyzer` |
| `/hookify-list` | Lists all configured hookify rules | — |
| `/hookify-configure` | Enables or disables hookify rules interactively | — |
| `/hookify-help` | Explains the hookify system | — |

## Install, setup, and maintenance

| Command | Does | Backs |
| --- | --- | --- |
| `/project-init` | Detects a project's stack and produces a dry-run onboarding plan from the install manifests | — |
| `/auto-update` | Pulls the latest repository changes and reinstalls the current managed targets | script: `scripts/auto-update.js` |
| `/setup-pm` | Configures the preferred package manager (npm, pnpm, yarn, bun) | script: `scripts/setup-package-manager.js` |
| `/pm2` | Analyzes a project and generates PM2 service commands for detected services | — |
| `/forge-guide` | Navigates the live agent, skill, command, hook, profile, and doc surface | skill: `forge-guide` |
| `/security-scan` | Runs Forge Shield across agent, hook, MCP, permission, and secret surfaces | agent: `security-reviewer`; skill: `security-scan` |

## Skill authoring

| Command | Does | Backs |
| --- | --- | --- |
| `/skill-create` | Mines local git history for coding patterns and generates `SKILL.md` files | — |
| `/skill-health` | Shows the skill portfolio health dashboard with charts and analytics | script: `scripts/skills-health.js` |

## Documentation

| Command | Does | Backs |
| --- | --- | --- |
| `/update-codemaps` | Scans project structure and generates token-lean architecture codemaps | agent: `doc-updater` |
| `/update-docs` | Syncs documentation from source-of-truth files: scripts, schemas, routes, exports | agent: `doc-updater` |

## Integrations

| Command | Does | Backs |
| --- | --- | --- |
| `/jira` | Retrieves a ticket, analyzes requirements, updates status, or adds comments via MCP or REST | skill: `jira-integration` |
| `/marketing-campaign` | Plans and executes a campaign: positioning, landing copy, email, social, ads, scripts, calendar | agent: `marketing-agent`; skill: `brand-voice`, `content-engine`, `market-research` |

## Choosing between overlapping entry points

Several families cover adjacent ground. Pick as follows.

| If you want | Use | Not |
| --- | --- | --- |
| A plan you will execute yourself, step by step | `/plan` | `/orch-add-feature` |
| The whole loop run for you with gates | `/orch-add-feature` | `/plan` |
| A product spec before any planning | `/plan-prd` or `/prp-prd` | `/plan` |
| Review of your own uncommitted work | `/code-review` | `/review-pr` |
| Review of a pull request with agent fan-out | `/review-pr` | `/code-review` |
| Deep review in one language | The `*-review` command for it | `/code-review` |
| Fix a red build fast | The `*-build` command for the stack | `/build-fix` |
| Fix a build in an unknown or mixed stack | `/build-fix` | A stack-specific command |
| Write the failing test first | The `*-test` command for the stack | `/test-coverage` |
| Fill coverage gaps in existing code | `/test-coverage` | A `*-test` command |
| Capture one lesson from this session | `/learn` | `/evolve` |
| Consolidate many accumulated lessons | `/evolve` | `/learn` |
| Stop repeating a correction by hand | `/hookify` | `/learn` |

## Retired shims

Twelve slash entries were retired and are **not** loaded by the default command surface. They
live in `legacy-command-shims/commands/` for muscle-memory compatibility only:

`/tdd` · `/eval` · `/verify` · `/e2e` · `/orchestrate` · `/context-budget` · `/docs` ·
`/rules-distill` · `/prompt-optimize` · `/agent-sort` · `/devfleet` · `/claw`

Each one delegates to a maintained skill, so invoke the skill instead. If a team genuinely
needs an old name back, copy that single file into your project or user commands directory
rather than enabling the whole archive.

## Adding a command

1. Create `commands/<name>.md`. The filename is the slash name; lowercase with hyphens.
2. Give it a `description` in frontmatter — that is the only required key, and it is what the
   harness matches against.
3. Keep the body short. If it exceeds a screen, the procedure belongs in a skill; create the
   skill and have the command load it.
4. Add `argument-hint` if the command takes arguments, and `allowed-tools` if it should be
   restricted.
5. Run `npm run command-registry:write`, then `npm test`. `validate-commands.js` and the
   registry check both have to pass.
6. Add the row to this page in the right group.

Before creating one, check whether an existing command already covers the case. 94 entry
points is enough that a near-duplicate is more likely than a gap.
