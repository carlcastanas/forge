# Recipes

A task-shaped cookbook. Each entry states a goal, gives the sequence to run, and describes what good output looks like so you can tell a real result from a plausible one. Every skill, agent, and command named here was verified to exist in this repository; command availability still varies by harness, so check [HARNESS-MATRIX.md](HARNESS-MATRIX.md) if a slash command does not resolve.

Prerequisites:

- FORGE installed. See [INSTALLATION.md](INSTALLATION.md).
- You can run `forge --help` and your harness resolves at least one FORGE slash command.

Two conventions used throughout:

- `/name` is a command shim run inside the harness.
- `skill: name` means the skill loads on its own when relevant; name it explicitly if it does not.

## Index

| # | Goal |
|---|---|
| 1 | [Onboard to an unfamiliar repository](#1-onboard-to-an-unfamiliar-repository) |
| 2 | [Ship a feature TDD-style](#2-ship-a-feature-tdd-style) |
| 3 | [Fix a failing build](#3-fix-a-failing-build) |
| 4 | [Review a pull request](#4-review-a-pull-request) |
| 5 | [Track down a regression](#5-track-down-a-regression) |
| 6 | [Harden an endpoint](#6-harden-an-endpoint) |
| 7 | [Upgrade a framework](#7-upgrade-a-framework) |
| 8 | [Write a new skill](#8-write-a-new-skill) |
| 9 | [Run a parallel multi-agent wave](#9-run-a-parallel-multi-agent-wave) |
| 10 | [Cut a release](#10-cut-a-release) |
| 11 | [Plan before touching code](#11-plan-before-touching-code) |
| 12 | [Run a database migration safely](#12-run-a-database-migration-safely) |
| 13 | [Add an API endpoint contract-first](#13-add-an-api-endpoint-contract-first) |
| 14 | [Find and fix silent failures](#14-find-and-fix-silent-failures) |
| 15 | [Cut context cost on a long session](#15-cut-context-cost-on-a-long-session) |
| 16 | [Hand work off to another harness](#16-hand-work-off-to-another-harness) |
| 17 | [Audit and prune your FORGE install](#17-audit-and-prune-your-forge-install) |
| 18 | [Turn a repeated correction into a hook](#18-turn-a-repeated-correction-into-a-hook) |
| 19 | [Write an agent for a new review lane](#19-write-an-agent-for-a-new-review-lane) |
| 20 | [Evaluate whether a skill actually works](#20-evaluate-whether-a-skill-actually-works) |
| 21 | [Diagnose a slow or expensive session](#21-diagnose-a-slow-or-expensive-session) |
| 22 | [Recover a stalled autonomous loop](#22-recover-a-stalled-autonomous-loop) |
| 23 | [Bring a brownfield repository under spec](#23-bring-a-brownfield-repository-under-spec) |
| 24 | [Chase down a performance problem](#24-chase-down-a-performance-problem) |
| 25 | [Refresh documentation that has drifted](#25-refresh-documentation-that-has-drifted) |
| 26 | [Set up a fresh project](#26-set-up-a-fresh-project) |

---

## 1. Onboard to an unfamiliar repository

**Goal.** Understand a codebase well enough to make a safe first change, without reading all of it.

**Sequence.**

```text
/project-init                 # detect stack, package manager, conventions
skill: repo-scan              # structural survey
skill: codebase-onboarding    # guided walkthrough
skill: code-tour              # narrated path through the hot paths
agent: code-explorer          # targeted searches, read-only
skill: inherit-legacy-style   # learn the conventions before writing any
/update-codemaps              # persist the map so the next session starts warm
```

Then record what you learned so it survives the session:

```bash
forge memory save --title "Repo map: <name>" --kind context --scope project --stdin
```

**What good output looks like.** A map that names the entry points, the layer boundaries, where tests live, and the three files you would have to change for a typical feature. It should also name what it did *not* cover. A tour that describes every directory equally has not understood the repository — it has listed it. If `inherit-legacy-style` produces conventions that contradict what you see in recent commits, trust the commits and correct the output.

---

## 2. Ship a feature TDD-style

**Goal.** A merged change with tests that can fail.

**Sequence.**

```text
/plan                         # scope, phases, dependencies
/feature-dev                  # discovery -> design -> implement
skill: tdd-workflow           # red before green, enforced
agent: tdd-guide              # when you want the ordering policed
/test-coverage                # coverage delta
/code-review                  # model review pass
skill: verification-loop      # prove it runs, not just compiles
skill: delivery-gate          # final go/no-go
/pr
```

**What good output looks like.** The test was written first and you watched it fail. Coverage moved on the lines you added, not on lines a snapshot happened to touch. `verification-loop` produced evidence the feature ran — a command, its output, and what that output proves. A "done" claim with no execution evidence is not done.

The failure to watch for is in [ANTI-PATTERNS.md](ANTI-PATTERNS.md#unverified-generated-tests): a green suite that was never red.

---

## 3. Fix a failing build

**Goal.** Green build, with the actual cause fixed rather than the symptom suppressed.

**Sequence.**

```text
/build-fix
agent: build-error-resolver           # or the stack-specific resolver:
                                      # go-build-resolver, rust-build-resolver,
                                      # java-build-resolver, kotlin-build-resolver,
                                      # react-build-resolver, django-build-resolver,
                                      # cpp-build-resolver, swift-build-resolver,
                                      # dart-build-resolver, pytorch-build-resolver
/quality-gate                         # format + typecheck sweep
```

For a language-specific build command, the `*-build` shims exist: `/go-build`, `/rust-build`, `/cpp-build`, `/kotlin-build`, `/gradle-build`, `/react-build`, `/flutter-build`.

**What good output looks like.** The first error in the chain is identified and fixed, not the last one printed. The diff does not widen a type to `any`, does not add an ignore comment, and does not touch a linter or formatter config — FORGE's `pre:config-protection` hook blocks that last one deliberately, and steers toward fixing the code instead. If the resolver wants to suppress rather than fix, it has given up; take it over.

---

## 4. Review a pull request

**Goal.** Findings you can act on, ranked, each with a reproduction.

**Sequence.**

```text
/review-pr                    # PR-scoped review
/code-review                  # diff-scoped review
agent: code-reviewer          # general quality lane
agent: security-reviewer      # security lane
agent: pr-test-analyzer       # do the tests actually test the change
agent: <stack>-reviewer       # typescript-reviewer, python-reviewer, go-reviewer,
                              # rust-reviewer, react-reviewer, vue-reviewer,
                              # java-reviewer, kotlin-reviewer, django-reviewer,
                              # fastapi-reviewer, database-reviewer, and others
/security-scan                # Forge Shield over agent/hook/MCP/permission/secret surfaces
```

Assemble the diff packet first when the reviewer needs context:

```bash
git diff origin/main...HEAD --stat
git diff origin/main...HEAD --name-only
git log origin/main..HEAD --oneline --reverse
```

**What good output looks like.** Findings separated into lanes — scope, tests, security, install surface, cross-harness, docs — and ranked, not listed. Each finding names a file and line and describes the input that triggers it. Anything you cannot write a failing test for is a question for the author, not a defect. A clean review is not a merge signal; see [ANTI-PATTERNS.md](ANTI-PATTERNS.md#treating-review-output-as-truth).

---

## 5. Track down a regression

**Goal.** Identify the change that broke it and prove the fix.

**Sequence.**

```text
skill: search-first              # find the existing implementation before theorizing
agent: code-explorer             # read-only search across the suspect area
skill: ai-regression-testing     # build the failing case first
/test-coverage                   # was this path ever covered
agent: silent-failure-hunter     # swallowed errors that hid the breakage
skill: verification-loop         # confirm the fix, and confirm the old behavior fails
```

Bisect with the harness out of the way, then bring it back for the fix:

```bash
git bisect start
git bisect bad HEAD
git bisect good <known-good-tag>
```

**What good output looks like.** A failing test that reproduces the regression before any fix is written, and a named commit or configuration change as the cause. "Probably the refactor" is not a cause. If `silent-failure-hunter` finds a swallowed exception on the path, that is usually the real bug and the regression is a symptom.

---

## 6. Harden an endpoint

**Goal.** An endpoint that survives hostile input, with the checks tested.

**Sequence.**

```text
skill: security-review           # OWASP-shaped review of the handler
agent: security-reviewer         # secrets, SSRF, injection, unsafe crypto
skill: api-design                # boundary and contract review
skill: error-handling            # what happens on the failure paths
skill: backend-patterns          # or the framework-specific security skill:
                                 # django-security, laravel-security,
                                 # springboot-security, quarkus-security, perl-security
skill: security-scan             # scanner pass
/security-scan
skill: tdd-workflow              # a test per rejected input class
```

**What good output looks like.** A list of input classes and what the endpoint does with each: valid, malformed, oversized, wrong content type, missing auth, wrong tenant. Every rejection has a test. Rate limiting and authorization are stated explicitly as present or absent, not left unmentioned. A review that only says "add input validation" has not looked at the handler.

---

## 7. Upgrade a framework

**Goal.** A major-version bump that lands without a week of firefighting.

**Sequence.**

```text
agent: docs-lookup               # read the actual migration guide, not memory
skill: documentation-lookup      # pull current API surface
/plan                            # phase the upgrade; identify blast radius
skill: contract-first            # pin the interfaces that must not change
skill: <stack>-patterns          # react-patterns, vue-patterns, django-patterns,
                                 # springboot-patterns, nextjs-turbopack, nuxt4-patterns,
                                 # kotlin-patterns, rust-patterns, and others
/build-fix                       # iterate on the break
skill: ai-regression-testing     # behavioral parity before and after
/test-coverage
skill: delivery-gate
```

**What good output looks like.** A phased plan where each phase is independently mergeable and independently revertible. A written list of breaking changes taken from the upstream release notes, not inferred. Behavioral parity evidence: the same inputs producing the same outputs before and after. An upgrade PR that changes behavior and dependencies in one commit is not reviewable.

Never let the model recall a migration path from training. Make it read the release notes — that is what `docs-lookup` is for.

---

## 8. Write a new skill

**Goal.** A skill that loads at the right moment and changes what the model does.

**Sequence.**

```text
skill: skill-scout               # does this already exist
/skill-create                    # scaffold
skill: prompt-optimizer          # tighten the description and activation cues
skill: skill-comply              # conform to the authoring contract
/skill-health                    # is it actually firing
```

Check for duplication before anything else:

```bash
rg -n "When to use|Use when|Trigger" skills -g 'SKILL.md'
```

Minimum shape:

```yaml
---
name: my-skill
description: Use when <specific trigger>. Covers <specific mechanics>.
metadata:
  origin: FORGE
---
```

**What good output looks like.** A `description` that a person could use to decide whether the skill applies, without opening it. A body that is a procedure, not an essay. Examples that were actually run, with their real output. Then evidence it fires:

```bash
forge session-inspect skills:health
```

If the skill never activates, the description is the problem. If it activates constantly, the description is too broad. Both are fixable with `skills:amendify`, which proposes a patch from failure evidence.

Contract: [SKILL-AUTHORING.md](SKILL-AUTHORING.md). The failure mode: [ANTI-PATTERNS.md](ANTI-PATTERNS.md#prompts-as-documentation).

---

## 9. Run a parallel multi-agent wave

**Goal.** Genuinely independent work done in parallel, merged without conflict.

**Precondition.** The work splits into units that touch disjoint files. If two workers would touch the same file, this is one worker. See [ANTI-PATTERNS.md](ANTI-PATTERNS.md#over-orchestration).

**Sequence.**

```text
/multi-plan                      # decompose into independent units
skill: plan-orchestrate          # assign, define handoffs and merge order
skill: team-agent-orchestration  # role and ownership assignment
/multi-execute                   # run the wave
/multi-workflow                  # or the full pipeline variant
skill: parallel-execution-optimizer
/orch-review                     # review the combined result
```

Watch it while it runs:

```bash
npm run orchestrate:status
forge loop-status --watch --exit-code
forge sessions --json
```

Task-shaped orchestration entry points also exist as skills: `orch-build-mvp`, `orch-add-feature`, `orch-change-feature`, `orch-fix-defect`, `orch-refine-code`, `orch-pipeline`, each with a matching command.

**What good output looks like.** A plan that names the file ownership of each worker before anyone starts, and a merge order. Every worker prompt carries the conventions it needs — a subagent starts with none of your context and will invent its own conventions if you do not supply them. At the end, one reviewed diff, not five diffs someone has to reconcile.

If the wave produces a merge conflict between two workers, the decomposition was wrong. That is a planning defect, not a merge problem.

---

## 10. Cut a release

**Goal.** A release you can defend, with the evidence attached.

**Sequence.**

```text
/quality-gate
/test-coverage
/security-scan
skill: delivery-gate
skill: production-audit
skill: github-ops                # release mechanics
/update-docs                     # changelog and docs that match the diff
/pr
```

Repository-side gates, from a checkout:

```bash
npm test
npm run coverage
npm run security:ioc-scan
npm run platform:audit -- --exit-code
npm run release:approval-gate
forge status --exit-code
```

**What good output looks like.** Every gate returns zero, and you can name what each one checked. `production-audit` output that lists what is not ready is more valuable than one that says ready — read the negatives first. The changelog describes user-visible impact, not commit subjects. `forge platform-audit --exit-code` returning 2 means the queue, discussions, or dirty-file state need attention before you tag.

---

## 11. Plan before touching code

**Goal.** A plan a second person could execute.

**Sequence.**

```text
/plan                            # general planning
/plan-prd                        # when the change needs a product spec first
/prp-prd -> /prp-plan            # the PRD-to-plan pipeline
agent: planner                   # implementation planning
agent: architect                 # when the decision is structural
skill: blueprint                 # structured design output
skill: intent-driven-development # keep the plan tied to the intent
/plan-canvas                     # review the plan in a browser and respond mid-task
```

**What good output looks like.** Phases with dependencies, each phase independently mergeable. Named files, not named layers. Explicit acceptance criteria. A stated list of what the plan is *not* doing. If the plan has one phase, it did not need planning; if it has fifteen, it has not been decided.

Use `/plan-canvas` when you want a human in the loop mid-run rather than at the end:

```bash
forge-plan-canvas open ./PLAN.md
forge-plan-canvas await ./PLAN.md --reply "Phases drafted, please confirm scope"
```

---

## 12. Run a database migration safely

**Goal.** A schema change that is reversible and does not lock production.

**Sequence.**

```text
skill: database-migrations
agent: database-reviewer
skill: postgres-patterns         # or mysql-patterns, prisma-patterns, jpa-patterns
skill: contract-first            # what the migration promises the application
skill: tdd-workflow              # a test that exercises both schema states
skill: verification-loop         # run it against a copy first
skill: delivery-gate
```

**What good output looks like.** A forward migration and a tested rollback. An explicit statement of whether the migration takes a lock and for how long. A deployment order — schema first or code first — with the reason. If the change is additive-then-backfill-then-drop, that is three deploys, and the plan should say so. A migration with no rollback path needs an explicit written decision, not silence.

---

## 13. Add an API endpoint contract-first

**Goal.** An endpoint whose consumers were considered before its implementation.

**Sequence.**

```text
skill: api-design
skill: contract-first
skill: backend-patterns          # or fastapi-patterns, nestjs-patterns,
                                 # springboot-patterns, laravel-patterns,
                                 # quarkus-patterns, kotlin-ktor-patterns
skill: error-handling
skill: tdd-workflow
agent: security-reviewer
skill: verification-loop
/update-docs
```

**What good output looks like.** The request and response shapes exist before the handler does, including the error shapes. Status codes are chosen deliberately. Pagination, idempotency, and versioning are each either present or explicitly ruled out. Tests cover the error paths, not only the happy path. An endpoint documented after it was written usually documents what it does rather than what it promises.

---

## 14. Find and fix silent failures

**Goal.** Locate the places where the system fails without telling anyone.

**Sequence.**

```text
agent: silent-failure-hunter
skill: error-handling
agent: comment-analyzer          # comments that describe behavior the code lost
agent: type-design-analyzer      # types that permit impossible states
skill: plankton-code-quality
skill: ai-regression-testing     # a test per swallowed failure
```

**What good output looks like.** A list of specific catch blocks, ignored return values, and default fallbacks, each with what the caller believes happens versus what happens. Every one gets either a test proving the new behavior or a written decision to keep swallowing it. A generic "improve error handling" recommendation has found nothing.

---

## 15. Cut context cost on a long session

**Goal.** Get a long-running task to finish without compaction destroying the working state.

**Sequence.**

```text
skill: context-budget            # measure before changing anything
skill: token-budget-advisor
skill: strategic-compact         # compact deliberately, at a chosen point
/checkpoint                      # persist state at a known-good point
/save-session
/aside                           # branch a side question out of the main thread
/cost-report
```

Reduce the injected baseline for the next session:

```bash
FORGE_SESSION_START_MAX_CHARS=4000 \
FORGE_MAX_INJECTED_INSTINCTS=3 \
FORGE_HOOK_PROFILE=minimal \
  claude
```

**What good output looks like.** A measured breakdown of where context is going — injected rules, loaded skills, tool output, working state — before any change. Compaction that happens where you chose it, preserving the decisions and dropping the tool transcript. If the biggest line item is rules, the fix is in the rule set, not in the session. See [ANTI-PATTERNS.md](ANTI-PATTERNS.md#rules-as-a-dumping-ground).

---

## 16. Hand work off to another harness

**Goal.** Stop in one agent, resume in another without re-explaining.

**Sequence.**

```bash
forge memory init --scope project --scope team

# In the harness you are leaving
forge memory handoff \
  --from codex --target claude \
  --title "Auth migration: session-token rename" \
  --kind handoff --tag auth --stdin

# In the harness you are arriving at
forge memory search "auth migration" --target-harness claude --json
forge memory read <memory-id>
```

Inside the harness, `/save-session`, `/resume-session`, and `/sessions` cover the same-harness case, and `skill: unified-memory` gives the model the vault conventions.

**What good output looks like.** A handoff that states where the work stopped, what was decided and why, what was tried and rejected, and the exact next step. Not a summary of what happened — a briefing for someone who was not there. Both harnesses must resolve the same vault root: the same working directory, or matching `FORGE_MEMORY_PROJECT_ROOT`. Give each harness a distinct `FORGE_MEMORY_HARNESS` identity and one memory-MCP process each.

Depth: [MEMORY-GUIDE.md](MEMORY-GUIDE.md), [HERMES-SETUP.md](HERMES-SETUP.md).

---

## 17. Audit and prune your FORGE install

**Goal.** Remove what you are not using before it degrades what you are.

**Sequence.**

```bash
forge list-installed --json
forge doctor --json
forge status --json
npm run harness:audit
/harness-audit
/skill-health
forge session-inspect skills:health
```

Then prune:

```text
skill: skill-stocktake           # what is installed versus what runs
skill: config-gc                 # configuration that no longer earns its place
skill: rules-distill             # compress an overgrown rule set
skill: workspace-surface-audit
skill: agent-architecture-audit  # agent tool allowlists and model tiers
/prune
```

Reinstall narrower rather than deleting by hand, so install-state stays accurate:

```bash
forge plan --profile developer --target claude --json
forge install --target claude --profile developer
```

**What good output looks like.** A list of skills with zero activations, rules nobody has read, and agents with broader tool grants than their job needs. Then a smaller install. If the audit produces no candidates for removal, it was not an audit.

---

## 18. Turn a repeated correction into a hook

**Goal.** Stop saying the same thing every session.

**Decision first.** If it must happen every time with no judgment, it is a hook. If it is guidance the model should weigh, it is a rule or a skill. See [capability-surface-selection.md](capability-surface-selection.md).

**Sequence.**

```text
/hookify                         # convert the correction into a hook
/hookify-configure
/hookify-list
skill: hookify-rules
```

Constraints, from the repository's own hook conventions:

- Blocking hooks (`PreToolUse`, `Stop`) stay under roughly 200 ms and make no network calls.
- Anything that can exceed a second declares a `timeout` or runs async, with async timeouts at or under 30 seconds.
- Exit `1` only to block deliberately. Warnings exit `0` with an actionable message.
- Register with a specific matcher and a stable ID in `hooks/hooks.json`.
- Every blocking hook needs an integration test.

**What good output looks like.** A hook with a narrow matcher, a stable ID you can put in `FORGE_DISABLED_HOOKS`, a one-line description of what it blocks and why, and a test. Verify it is gated correctly:

```bash
FORGE_HOOK_PROFILE=standard FORGE_DRY_RUN=1 <trigger the tool call>
```

The failure to avoid: [ANTI-PATTERNS.md](ANTI-PATTERNS.md#hooks-that-block-on-slow-work).

---

## 19. Write an agent for a new review lane

**Goal.** A bounded reviewer that cannot do anything but review.

**Sequence.**

```text
agent: agent-evaluator           # evaluate the agent you write
skill: agent-architecture-audit
skill: agent-eval
skill: agent-self-evaluation
```

Shape:

```yaml
---
name: contracts-reviewer
description: Reviews API contract changes for backward compatibility. Use after edits under api/ or proto/.
tools: Read, Grep, Glob
model: sonnet
---
```

Rules that matter: the filename matches `name`, the description says when to invoke in the third person, `tools` is the minimum allowlist, and anything above `model: sonnet` needs a justification.

**What good output looks like.** An agent that produces analysis, not patches — because it cannot write. A description specific enough that the router picks it for the right diffs and skips it for the wrong ones. Run it against a diff you already understand and check whether it finds what you found. An agent that agrees with everything is not reviewing.

Contract: [AGENT-AUTHORING.md](AGENT-AUTHORING.md). The failure mode: [ANTI-PATTERNS.md](ANTI-PATTERNS.md#agents-with-unrestricted-tools).

---

## 20. Evaluate whether a skill actually works

**Goal.** Evidence, not intuition, about whether a skill improves output.

**Sequence.**

```text
skill: eval-harness              # define the cases
skill: agent-eval
skill: benchmark-methodology     # how to compare fairly
skill: benchmark
/learn-eval
forge session-inspect skills:health
forge session-inspect skills:evaluate
```

**What good output looks like.** A baseline run without the skill, an amended run with it, and the same task set across both. `skills:evaluate` compares baseline against amended outcomes directly. A skill that improves nothing measurable is a skill to delete, and finding that out is a successful evaluation.

Watch for the trap: evaluating on the cases you wrote the skill from. Hold out cases you have not seen.

Depth: [EVALUATION-GUIDE.md](EVALUATION-GUIDE.md), [../guides/the-evaluation-guide.md](../guides/the-evaluation-guide.md).

---

## 21. Diagnose a slow or expensive session

**Goal.** Find where the time and the tokens went.

**Sequence.**

```bash
/cost-report
forge status --json
forge sessions --limit 10 --json
forge sessions <session-id> --json
```

```text
skill: cost-tracking
skill: context-budget
/model-route                     # is expensive work on an expensive model
skill: latency-critical-systems  # when the problem is wall clock, not tokens
```

Isolate the hook contribution:

```bash
FORGE_HOOK_PROFILE=minimal claude      # then compare
```

**What good output looks like.** An attribution: tokens split between injected context, loaded skills, tool output, and generation; wall clock split between model latency, tool execution, and hooks. If dropping to the `minimal` hook profile changes the wall clock noticeably, a hook is in your critical path. If injected context dominates the token count, see recipe 15.

Depth: [COST-AND-MODEL-ROUTING.md](COST-AND-MODEL-ROUTING.md).

---

## 22. Recover a stalled autonomous loop

**Goal.** Notice a stuck loop before it burns an afternoon, and restart it cleanly.

**Sequence.**

```bash
forge loop-status --json
forge loop-status --watch --watch-interval-seconds 10
forge loop-status --transcript <path-to-session.jsonl> --json
forge loop-status --exit-code            # 2 on attention signals, 1 on scan errors
```

```text
/loop-status
agent: loop-operator
skill: autonomous-loops
skill: continuous-agent-loop
/loop-start                      # restart with a bounded scope
```

**What good output looks like.** A named stall reason: a pending tool result older than the Bash timeout (1800 seconds by default), a scheduled wakeup past its grace window, or an idle worker. Then a bounded restart — a loop that stalled once with an unbounded scope will stall again. `forge loop-status --exit-code` in a watch loop is the cheap version of monitoring.

---

## 23. Bring a brownfield repository under spec

**Goal.** Extract the implicit specification from code nobody documented.

**Sequence.**

```text
agent: spec-miner                # brownfield spec extraction
skill: repo-scan
skill: codebase-onboarding
skill: architecture-decision-records
skill: living-docs-governance
agent: doc-updater
/update-docs
/update-codemaps
```

**What good output looks like.** A specification that distinguishes intended behavior from accidental behavior, and flags the cases where it cannot tell. Architecture decision records for the choices that are load-bearing, written as decisions with alternatives and consequences — not as descriptions. A spec that documents every current behavior as intentional has learned nothing; the value is in what it marks as questionable.

Depth: [../guides/the-migration-guide.md](../guides/the-migration-guide.md).

---

## 24. Chase down a performance problem

**Goal.** A measured improvement, not a plausible one.

**Sequence.**

```text
skill: benchmark-methodology     # define the measurement before changing anything
skill: benchmark
agent: performance-optimizer
skill: benchmark-optimization-loop
skill: react-performance         # or data-throughput-accelerator,
                                 # latency-critical-systems, postgres-patterns
skill: verification-loop
```

**What good output looks like.** A baseline measurement with a stated methodology — what was measured, on what input, how many runs, what varied. Then a change, then the same measurement. A claimed speedup with no before number is not a result. Watch for optimizations that improve the benchmark and not the workload; the benchmark should resemble production traffic or the report should say it does not.

---

## 25. Refresh documentation that has drifted

**Goal.** Docs that match the code, and a way to notice next time.

**Sequence.**

```text
/update-docs
agent: doc-updater
skill: living-docs-governance
/update-codemaps
agent: comment-analyzer          # comments describing behavior the code lost
skill: code-tour                 # regenerate the narrated path
```

**What good output looks like.** A diff where every changed claim is traceable to a code change, and a list of claims the tool could not verify. Documentation regenerated wholesale is not a refresh — it discards human editorial judgment along with the stale parts. The governance skill should also leave behind a trigger: what change should invalidate this page next time.

---

## 26. Set up a fresh project

**Goal.** A new repository with conventions in place before the first feature.

**Sequence.**

```text
/project-init
/setup-pm                        # detect and pin the package manager
skill: coding-standards
skill: git-workflow
skill: architecture-decision-records
skill: contract-first
/plan
```

Then install FORGE for the project rather than relying on a global install, so collaborators get the same setup:

```bash
forge plan --profile developer --target claude-project --json
forge install --target claude-project --profile developer
```

Commit the intent:

```json
{
  "$schema": "./schemas/forge-install-config.schema.json",
  "version": 1,
  "target": "claude-project",
  "profile": "developer"
}
```

**What good output looks like.** A pinned package manager recorded in `.claude/package-manager.json`, a committed `forge-install.json` so every collaborator resolves the same component set, and a first architecture decision record explaining the stack choice. Conventions written before the first feature are followed; conventions written after it are argued about.

Depth: [TEAM-ADOPTION.md](TEAM-ADOPTION.md).

---

## Related pages

- [CLI-REFERENCE.md](CLI-REFERENCE.md) — flags for every `forge` command used above
- [../COMMANDS-QUICK-REF.md](../COMMANDS-QUICK-REF.md) — the full slash-command list
- [../AGENTS.md](../AGENTS.md) — agent routing by file type
- [ANTI-PATTERNS.md](ANTI-PATTERNS.md) — how each of these goes wrong
- [../guides/the-field-guide.md](../guides/the-field-guide.md) — the narrative version
