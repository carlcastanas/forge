# Agents

This page is the catalog of every FORGE subagent and the contract that governs how they are
defined, selected, and composed. Use it to decide which specialist should handle a piece of
work, and to check what a given agent is permitted to touch before you delegate to it.

Prerequisites: you understand the difference between an agent, a skill, and a command — see
[docs/CONCEPTS.md](docs/CONCEPTS.md). To write a new agent, read
[docs/AGENT-AUTHORING.md](docs/AGENT-AUTHORING.md) after this page.

## What an agent is

An agent is a subordinate session with its own context window, its own tool allowlist, and its
own model tier. It receives a prompt, works in isolation, and returns a result. It does not
inherit the parent session's transcript.

That isolation is the whole point. A reviewer that reads forty files and returns eight
findings costs the parent session eight findings' worth of context instead of forty files'
worth. Delegation is how a long session stays coherent.

The trade is that an isolated agent knows nothing you do not tell it. Every delegation must
carry the file paths, the conventions, and the acceptance criteria in the prompt itself.

## The frontmatter contract

Every file in `agents/` opens with YAML frontmatter. Four keys are required; one is optional.

```yaml
---
name: rust-reviewer
description: Expert Rust code reviewer specializing in ownership, lifetimes, error handling, unsafe usage, and idiomatic patterns. Use for all Rust code changes. MUST BE USED for Rust projects.
tools: Read, Grep, Glob, Bash
model: sonnet
---
```

| Key | Required | Rule |
| --- | --- | --- |
| `name` | yes | Lowercase with hyphens; must equal the filename without `.md` |
| `description` | yes | Third person, states *when* to invoke, not what the agent believes |
| `tools` | yes | Comma-separated allowlist; minimum viable set |
| `model` | yes | `haiku`, `sonnet`, or `opus` |
| `color` | no | Display hint only; five agents set it |

`npm test` runs `scripts/ci/validate-agents.js` over every file. A missing key, a name that
disagrees with the filename, or an unknown model tier fails the build.

### Description phrasing carries routing weight

The harness selects agents by matching a task against descriptions. Two conventions are load
bearing:

- **`Use PROACTIVELY`** tells the harness to reach for the agent without being asked. Used by
  planners, architects, reviewers, and security scanning.
- **`MUST BE USED`** marks a hard routing rule for a stack. Every language reviewer with a
  dedicated build resolver carries it.

Write descriptions that name concrete triggers — file extensions, failure modes, artifacts —
because that is what the matcher has to work with.

## Model tiers

FORGE ships 68 agents: 4 on `opus`, 58 on `sonnet`, 6 on `haiku`.

| Tier | Count | Use it for | Agents |
| --- | --- | --- | --- |
| `opus` | 4 | Open-ended design where a wrong decomposition costs hours | `architect`, `planner`, `spec-miner`, `healthcare-reviewer` |
| `sonnet` | 58 | Reviews, resolvers, orchestration, and everything with a rubric | The bulk of the catalog |
| `haiku` | 6 | Mechanical extraction and lookup against a fixed schema | `comment-analyzer`, `conversation-analyzer`, `doc-updater`, `docs-lookup`, `opensource-forker`, `opensource-packager` |

The default is `sonnet`. Moving up a tier needs a reason stated in the pull request; moving
down needs evidence that quality held. `healthcare-reviewer` sits on `opus` because a missed
clinical-safety finding is not recoverable by a later pass.

Cost routing for the work itself, as opposed to the agent definition, is handled by the
`/model-route` command and [docs/COST-AND-MODEL-ROUTING.md](docs/COST-AND-MODEL-ROUTING.md).

## Tool allowlists

The allowlist is a capability boundary, not a convenience list. Five shapes cover the catalog.

| Shape | Tools | Count | Meaning |
| --- | --- | --- | --- |
| Read-only inspector | `Read, Grep, Glob` | 6 | Cannot execute, cannot write |
| Narrow inspector | `Read, Grep` | 4 | Single-file or transcript analysis |
| Reviewer | `Read, Grep, Glob, Bash` | 26 | May run tests and linters, may not edit |
| Editor | `Read, Write, Edit, Bash, Grep, Glob` | 20 | Full write access; resolvers and generators |
| Other variants | Mixed read/write/web/MCP sets | 12 | Web research, browser driving, documentation lookup, narrow write grants |

Rules that hold across all of them:

- A reviewer never gets `Write` or `Edit`. Findings go back to the caller, who decides.
- An agent that only reads gets no `Bash`. Shell access is execution, and execution is a
  different trust level from reading.
- MCP tools are named individually. No agent receives a whole MCP server.
- Widening an allowlist is a reviewable change on its own, separate from behavior changes.

Two agents hold MCP grants: `e2e-runner` (six `mcp__playwright__*` tools for browser driving)
and `docs-lookup` (two `mcp__context7__*` tools for library documentation).

## Catalog

68 agents, grouped by domain. Every entry in `agents/` appears exactly once.

### Planning and architecture

| Agent | Model | Purpose |
| --- | --- | --- |
| `architect` | opus | System design, scalability, and technical decision-making for new features or large refactors |
| `planner` | opus | Turns a feature or refactor request into an ordered implementation plan with risks |
| `code-architect` | sonnet | Derives a feature blueprint from existing codebase patterns: files, interfaces, data flow, build order |
| `code-explorer` | sonnet | Traces execution paths and maps architecture layers in unfamiliar code |
| `spec-miner` | opus | Extracts behavioral specs and invariants from a brownfield codebase into `openspec/specs/` |

### General code review

| Agent | Model | Purpose |
| --- | --- | --- |
| `code-reviewer` | sonnet | Language-agnostic review for quality, security, and maintainability; the default reviewer |
| `code-simplifier` | sonnet | Reduces complexity in recently modified code without changing behavior |
| `comment-analyzer` | haiku | Flags inaccurate, stale, and rot-prone comments |
| `silent-failure-hunter` | sonnet | Finds swallowed errors, bad fallbacks, and missing error propagation |
| `type-design-analyzer` | sonnet | Assesses whether types encapsulate state and express invariants |
| `refactor-cleaner` | sonnet | Removes dead code and duplicates using knip, depcheck, and ts-prune |
| `performance-optimizer` | sonnet | Profiles bottlenecks, memory leaks, bundle size, and render cost |

### Language and framework reviewers

| Agent | Model | Purpose |
| --- | --- | --- |
| `typescript-reviewer` | sonnet | Type safety, async correctness, Node and web security, idiomatic patterns |
| `react-reviewer` | sonnet | Hook correctness, render cost, server/client boundaries, accessibility |
| `vue-reviewer` | sonnet | Composition API correctness, reactivity pitfalls, template security, Pinia and Nuxt usage |
| `python-reviewer` | sonnet | PEP 8, Pythonic idioms, type hints, security, performance |
| `django-reviewer` | sonnet | ORM correctness, DRF patterns, migration safety, production configuration |
| `fastapi-reviewer` | sonnet | Async correctness, dependency injection, Pydantic schemas, OpenAPI quality |
| `go-reviewer` | sonnet | Idiomatic Go, concurrency, error handling, performance |
| `rust-reviewer` | sonnet | Ownership, lifetimes, error handling, `unsafe` usage |
| `java-reviewer` | sonnet | Detects Spring Boot or Quarkus, then reviews layering, JPA/Panache, security, concurrency |
| `kotlin-reviewer` | sonnet | Coroutine safety, Compose practice, clean-architecture violations, Android pitfalls |
| `swift-reviewer` | sonnet | Protocol-oriented design, value semantics, ARC, Swift Concurrency |
| `cpp-reviewer` | sonnet | Memory safety, modern C++ idioms, concurrency, performance |
| `csharp-reviewer` | sonnet | .NET conventions, async patterns, nullable reference types, security |
| `fsharp-reviewer` | sonnet | Functional idioms, type safety, pattern matching, computation expressions |
| `php-reviewer` | sonnet | PSR-12, PHP type system, Eloquent patterns, security |
| `flutter-reviewer` | sonnet | Widget practice, state management, Dart idioms, accessibility; library-agnostic |
| `harmonyos-app-resolver` | sonnet | ArkTS and ArkUI review: V2 state management, Navigation routing, API usage |

### Build and error resolution

Resolvers hold write access and are scoped to making a build green with minimal diffs. None of
them make architectural changes.

| Agent | Model | Purpose |
| --- | --- | --- |
| `build-error-resolver` | sonnet | Generic build and TypeScript error resolution; detects the build system |
| `react-build-resolver` | sonnet | Vite, webpack, Next.js, CRA, Parcel, esbuild, Bun; hydration and boundary failures |
| `go-build-resolver` | sonnet | Build errors, `go vet` findings, linter warnings |
| `rust-build-resolver` | sonnet | `cargo build` failures, borrow-checker errors, `Cargo.toml` problems |
| `java-build-resolver` | sonnet | Maven and Gradle failures; detects Spring Boot or Quarkus |
| `kotlin-build-resolver` | sonnet | Kotlin compiler and Gradle failures |
| `swift-build-resolver` | sonnet | `swift build`, Xcode, SPM dependency, and code-signing failures |
| `cpp-build-resolver` | sonnet | Compilation, CMake, linker, and template errors |
| `dart-build-resolver` | sonnet | `dart analyze`, Flutter compilation, pub conflicts, `build_runner` |
| `django-build-resolver` | sonnet | pip and Poetry errors, migration conflicts, imports, `collectstatic` |
| `pytorch-build-resolver` | sonnet | Tensor shape mismatches, device errors, gradients, DataLoader, mixed precision |

### Testing and verification

| Agent | Model | Purpose |
| --- | --- | --- |
| `tdd-guide` | sonnet | Enforces tests-first and drives toward the coverage target |
| `e2e-runner` | sonnet | Generates and runs E2E journeys, quarantines flaky tests, collects artifacts |
| `pr-test-analyzer` | sonnet | Judges whether a pull request's tests cover behavior or only lines |

### Security, compliance, and release hygiene

| Agent | Model | Purpose |
| --- | --- | --- |
| `security-reviewer` | sonnet | Secrets, SSRF, injection, unsafe crypto, OWASP Top 10 |
| `healthcare-reviewer` | opus | Clinical safety, CDSS accuracy, PHI handling, medical data integrity |
| `opensource-forker` | haiku | Stage one: copy a project, strip secrets, replace internal references, clean history |
| `opensource-sanitizer` | sonnet | Stage two: verify a fork is clean; emits PASS / FAIL / PASS-WITH-WARNINGS |
| `opensource-packager` | haiku | Stage three: generate the packaging set for a sanitized project |

### Data, database, and machine learning

| Agent | Model | Purpose |
| --- | --- | --- |
| `database-reviewer` | sonnet | PostgreSQL query plans, schema design, migration safety, RLS |
| `mle-reviewer` | sonnet | Data contracts, feature pipelines, training reproducibility, serving, rollback |
| `rag-pipeline-reviewer` | sonnet | Retrieval quality, chunking, embedding choice, evaluation coverage |

### Networking and infrastructure

| Agent | Model | Purpose |
| --- | --- | --- |
| `network-architect` | sonnet | Enterprise and multi-site network design from requirements |
| `network-config-reviewer` | sonnet | Router and switch configs: security, stale references, risky change-window commands |
| `network-troubleshooter` | sonnet | Read-only OSI-layer diagnosis with an evidence-backed root cause |
| `homelab-architect` | sonnet | Home and small-lab network plans with staged changes and rollback |

### Orchestration loops

| Agent | Model | Purpose |
| --- | --- | --- |
| `gan-planner` | sonnet | Expands a one-line prompt into a spec with features, sprints, and evaluation criteria |
| `gan-generator` | sonnet | Implements against the spec and iterates on evaluator feedback |
| `gan-evaluator` | sonnet | Drives the running application, scores against the rubric, returns actionable feedback |
| `loop-operator` | sonnet | Runs autonomous loops, watches for stalls, intervenes within safety bounds |

### Harness meta and evaluation

| Agent | Model | Purpose |
| --- | --- | --- |
| `agent-evaluator` | sonnet | Scores agent output on a five-axis rubric and returns a structured scorecard |
| `harness-optimizer` | sonnet | Improves harness reliability and cost using pass@k / pass^k grading |
| `conversation-analyzer` | haiku | Mines a transcript for behaviors worth preventing with a hook |

### Documentation and lookup

| Agent | Model | Purpose |
| --- | --- | --- |
| `doc-updater` | haiku | Generates codemaps and syncs docs from source of truth |
| `docs-lookup` | haiku | Fetches current library and API documentation through Context7 |

### Product, growth, and accessibility

| Agent | Model | Purpose |
| --- | --- | --- |
| `a11y-architect` | sonnet | WCAG 2.2 for web and native; design-system and component audits |
| `marketing-agent` | sonnet | Positioning, campaign planning, copy, and conversion review |
| `seo-specialist` | sonnet | Technical audits, structured data, Core Web Vitals, keyword mapping |
| `chief-of-staff` | sonnet | Multi-channel message triage into four tiers with drafted replies |

## Routing guidance

### By situation

| Situation | Reach for | Then |
| --- | --- | --- |
| A feature request with unclear scope | `planner` | Confirm the plan before any edit |
| A cross-cutting design decision | `architect` | Record it as an ADR |
| Unfamiliar code you have to change | `code-explorer` | `code-architect` for the blueprint |
| A brownfield repo with no written spec | `spec-miner` | Review the extracted invariants by hand |
| A red build | The stack's `*-build-resolver` | Re-run the suite before reviewing |
| A finished diff | The stack reviewer, plus `code-reviewer` | `security-reviewer` if it touches input or auth |
| A pull request from someone else | `pr-test-analyzer` with the stack reviewer | `review-pr` command runs the set |
| Errors that vanish without a trace | `silent-failure-hunter` | — |
| A slow endpoint or heavy bundle | `performance-optimizer` | Re-measure; do not trust the prediction |
| Code touching credentials, uploads, or auth | `security-reviewer` | `/security-scan` for the config surface |
| Anything touching patient data | `healthcare-reviewer` | Do not substitute a generalist |
| Schema or migration work | `database-reviewer` | Verify the rollback path |
| A retrieval system returning bad answers | `rag-pipeline-reviewer` | Fix evaluation before fixing chunking |
| Preparing a repository for public release | `opensource-forker` → `opensource-sanitizer` → `opensource-packager` | Never skip the sanitizer |
| A greenfield build from a one-line brief | `gan-planner` → `gan-generator` ⇄ `gan-evaluator` | Bound the iteration count |
| A behavior you keep having to correct | `conversation-analyzer` | Turn the finding into a hook |
| Deciding whether an agent is any good | `agent-evaluator` | Then `harness-optimizer` on the config |

### Sequencing rules

1. **Explore before you plan.** A plan written without reading the code is a guess.
2. **Resolve the build before you review.** Reviewers waste findings on code that does not
   compile.
3. **One reviewer per axis, run in parallel.** `react-reviewer` and `typescript-reviewer` on a
   `.tsx` change are two independent passes, not a redundancy — launch them together.
4. **Security last and separately.** A security pass on a diff that is still moving gets
   re-invalidated. Run it when the diff is final.
5. **Never chain a reviewer into a resolver automatically.** Findings are a decision point.
   The caller triages; the resolver executes what was accepted.

### Parallel fan-out

Independent agents launched in one batch run concurrently and each cost the parent session
only their returned summary. Good fan-out shapes:

- Reviewing a multi-language change: one reviewer per language, all at once.
- Auditing a repository: `code-explorer`, `security-reviewer`, and `pr-test-analyzer` over
  disjoint paths.
- Comparing approaches: two `code-architect` runs with different constraints, then pick.

Bad fan-out: several agents editing the same files. Write conflicts are silent and expensive.
Parallelize reads; serialize writes.

## How agents compose with skills

Agents and skills solve different problems and are meant to be used together.

| | Agent | Skill |
| --- | --- | --- |
| Is | An isolated worker with a budget | A body of instructions loaded into a session |
| Owns | Context isolation, tool limits, model tier | Domain knowledge, procedure, examples |
| Costs | A subagent turn | Tokens in whoever loads it |
| Reusable by | The parent session | Any session or agent, including subagents |

The composition rule: **the skill carries the standard, the agent carries the isolation.**

In practice:

- `rust-reviewer` is the isolation boundary; `skills/rust-patterns/SKILL.md` is what it should
  be checking against. Pass the skill's conventions into the agent's prompt — the subagent
  does not inherit what the parent loaded.
- The `orch-*` skills sequence multiple agents through the full loop. The skill is the
  score; the agents are the players.
- A slash command in `commands/` is a shim. It usually loads a skill and may name an agent in
  `agent:` frontmatter. The durable unit is the skill. See
  [COMMANDS-QUICK-REF.md](COMMANDS-QUICK-REF.md).

When you find yourself writing the same guidance into three different agent prompts, that
guidance is a skill. Extract it.

## Adding an agent

Before writing a new file, confirm the work is not already covered. 68 agents is enough that
overlap is the common failure. Then:

1. Create `agents/<name>.md` with complete frontmatter.
2. Give it the narrowest tool allowlist that works, and default the model to `sonnet`.
3. Write a body with a clear scope statement, an explicit out-of-scope list, and the output
   format the caller should expect.
4. Run `npm test` — `validate-agents.js` and the catalog check both have to pass.
5. Run `npm run catalog:sync` so the catalog reflects the addition.
6. Add the routing entry to this page's table.

The full authoring contract, including body structure and output-format conventions, is in
[docs/AGENT-AUTHORING.md](docs/AGENT-AUTHORING.md).
