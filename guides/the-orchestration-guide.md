# The orchestration guide

This guide is for engineers who have run FORGE on single tasks and now want to run several agents against one problem. It covers when parallelism actually pays, how to cut work into units that do not collide, the four wave shapes worth knowing, the contracts agents hand each other, and how to verify a wave as a single artifact instead of trusting each worker's self-report.

**Prerequisites:** a working FORGE install, comfort with [getting started](getting-started.md), and a working knowledge of `git worktree`. Familiarity with [the context guide](the-context-guide.md) helps, because every additional agent is another context window you are paying for.

---

## Contents

- [The only good reason to fan out](#the-only-good-reason-to-fan-out)
- [When parallelism helps and when it hurts](#when-parallelism-helps-and-when-it-hurts)
- [The real cost of a wave](#the-real-cost-of-a-wave)
- [Decomposition: the write-surface test](#decomposition-the-write-surface-test)
- [Pattern 1 — Fan-out and fan-in](#pattern-1--fan-out-and-fan-in)
- [Pattern 2 — The pipeline](#pattern-2--the-pipeline)
- [Pattern 3 — The review wave](#pattern-3--the-review-wave)
- [Pattern 4 — Adversarial convergence](#pattern-4--adversarial-convergence)
- [Handoff contracts](#handoff-contracts)
- [Shared state and collision hazards](#shared-state-and-collision-hazards)
- [Budget control](#budget-control)
- [Verifying the wave, not the workers](#verifying-the-wave-not-the-workers)
- [Worked example A — Feature across three modules](#worked-example-a--feature-across-three-modules)
- [Worked example B — Pipelined migration](#worked-example-b--pipelined-migration)
- [Worked example C — Multi-dimension PR review](#worked-example-c--multi-dimension-pr-review)
- [Failure catalog](#failure-catalog)
- [Pre-flight checklist](#pre-flight-checklist)

---

## The only good reason to fan out

Parallelism buys wall-clock time. That is the entire benefit. It does not buy quality, it does not buy correctness, and it does not buy cheaper tokens — a wave of five agents costs roughly five times a single agent doing the same total work, plus the coordination overhead you pay to split and merge.

So the question before every wave is narrow: **is wall-clock time the binding constraint right now?** If you are blocked on a review that takes forty minutes, fanning it into four ten-minute reviews is a real win. If you are waiting on your own judgment about what to build, spawning agents converts thinking time into token spend and merge conflicts.

FORGE gives you three escalating levels of concurrency. Reach for the lowest one that solves the problem.

| Level | Mechanism | Isolation | Reach for it when |
|---|---|---|---|
| Batched tool calls | Multiple independent reads, greps, or status checks in one turn | None needed — read-only | Almost always; this is free |
| Subagents | Delegated tasks, each with its own context window | Separate context, shared filesystem | Independent analysis, exploration, or review |
| Worktree workers | Separate processes on separate `git worktree` checkouts | Separate context, separate filesystem, separate branch | Independent implementation that writes files |

The `parallel-execution-optimizer` skill encodes this ladder. Its core instruction is worth memorizing: *turn urgency into a dependency graph before acting*.

---

## When parallelism helps and when it hurts

| Situation | Fan out? | Why |
|---|---|---|
| Reviewing one diff along several dimensions (security, types, tests, performance) | Yes | Reviewers read the same input and write nothing |
| Exploring an unfamiliar codebase from several entry points | Yes | Pure reads; findings merge cleanly |
| Implementing three features that touch disjoint directories | Yes, in worktrees | Write surfaces do not overlap |
| Running lint, typecheck, unit tests, and a build | Yes | Independent verification lanes with independent outputs |
| Implementing three features that all touch the router | No | Guaranteed merge conflict; serialize instead |
| A refactor whose shape is still undecided | No | You are parallelizing a decision, not work |
| Anything involving migrations, schema writes, or a shared table | No | Ordering is part of correctness |
| A task that fits in one agent's context and takes four minutes | No | Split-and-merge overhead exceeds the saving |
| Debugging where each step depends on the previous observation | No | The dependency chain is the work |
| Deploys to one environment | No | Serialize behind an explicit gate |

The pattern in the "no" rows: parallelism fails when the units share a write surface, share an ordering requirement, or share an unresolved decision. Two of those three are detectable mechanically. The third is on you.

---

## The real cost of a wave

Each agent in a wave carries its own copy of the fixed overhead:

```text
  single agent                     wave of four
  ───────────────                  ─────────────────────────────────
  system prompt      ~fixed        system prompt      x4
  tool definitions   ~fixed        tool definitions   x4
  rules layer        ~fixed        rules layer        x4
  task context       varies        task context       x4 (plus split cost)
  work tokens        the point     work tokens        the point
                                   merge + verify     new, not free
```

Two consequences follow.

**Small tasks are dominated by overhead.** A four-agent wave over four two-minute tasks spends more on preamble than on work. Batch those into one agent.

**Subagent model choice matters more than main-agent model choice.** A wave multiplies whatever tier the workers run on. Setting `CLAUDE_CODE_SUBAGENT_MODEL` to a cheaper tier for exploration and verification lanes changes a wave's economics far more than switching the orchestrator's model:

```json
{
  "env": {
    "CLAUDE_CODE_SUBAGENT_MODEL": "haiku"
  }
}
```

Use `/model-route` when unsure which tier a given lane deserves; it returns a recommended tier, a confidence level, the reasoning, and a fallback. Model tiers and their tradeoffs are covered in [`../docs/COST-AND-MODEL-ROUTING.md`](../docs/COST-AND-MODEL-ROUTING.md).

---

## Decomposition: the write-surface test

Before splitting anything, write down the lane matrix. The `parallel-execution-optimizer` skill specifies this format and it is the single highest-leverage habit in this guide:

```text
Lane            | Parallel? | Write surface        | Risk   | Verification
----------------|-----------|----------------------|--------|-------------------------
Repo scan       | yes       | none                 | low    | rg/git output
API handler     | yes       | src/api/orders/**    | medium | unit tests for orders
Web form        | yes       | app/checkout/**      | medium | component tests
Shared types    | NO        | packages/types/**    | high   | typecheck across both
Schema migration| NO (gate) | db/migrations/**     | high   | migration dry-run
```

Three rules govern the matrix.

**One writer per path.** If two lanes list overlapping globs in the write-surface column, they are not parallel. Either merge them into one lane or promote the shared path to its own sequential stage that runs first.

**Shared contracts run first, alone.** In the example above, `packages/types` is what both feature lanes depend on. It becomes stage one; the two feature lanes become stage two. This is the most common correct decomposition of a "parallel feature" request, and it is sequential at the top.

**Gates are lanes too.** A migration, a deploy, or an irreversible write is a lane with a human or a check in front of it. Put it in the matrix explicitly so nobody parallelizes it by accident.

A decomposition that yields fewer than three genuinely independent lanes is telling you to run sequentially.

---

## Pattern 1 — Fan-out and fan-in

The simplest wave. One orchestrator splits work, N workers run concurrently, the orchestrator merges results and verifies the whole.

```text
                    ┌──────────────┐
                    │ orchestrator │  decompose + write lane matrix
                    └──────┬───────┘
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌─────────┐  ┌─────────┐  ┌─────────┐
        │worker A │  │worker B │  │worker C │   independent write surfaces
        └────┬────┘  └────┬────┘  └────┬────┘
             │            │            │
             └────────────┼────────────┘
                          ▼
                    ┌──────────────┐
                    │  fan-in      │  merge, resolve, verify AS A WHOLE
                    └──────────────┘
```

Fan-in is the part people skip, and it is where the failures live. The orchestrator's job at fan-in is not to concatenate three reports. It is to:

1. Check that each worker actually wrote where it said it would (`git status` per worktree).
2. Run the full verification suite against the merged result, not against each branch.
3. Look for contradictions between workers — two lanes that both added a `formatDate` helper, or two that disagree about an interface.
4. Report which lanes produced evidence and which produced only prose.

In FORGE, the fan-out step for read-only work is a subagent spread; for write work it is `scripts/orchestrate-worktrees.js`, which materializes one `git worktree` and one branch per worker from a plan file:

```bash
node scripts/orchestrate-worktrees.js plan.json            # dry run, prints the plan
node scripts/orchestrate-worktrees.js plan.json --write-only  # create worktrees, no launch
node scripts/orchestrate-worktrees.js plan.json --execute     # create and launch workers
```

The launcher command in the plan accepts placeholders the orchestrator fills in per worker: `{worker_name}`, `{worker_slug}`, `{session_name}`, `{repo_root}`, `{worktree_path}`, `{branch_name}`, `{task_file}`, `{handoff_file}`, `{status_file}`. Those last three are the handoff contract; see [handoff contracts](#handoff-contracts).

Always run the dry form first. It prints every worktree, branch, and command without touching the filesystem.

> The `orchestration` install module is marked `beta` and does not install by default. Add it explicitly with `--modules orchestration`. It also pulls in `scripts/orchestration-status.js`, `scripts/orchestrate-codex-worker.sh`, and the `dmux-workflows` skill.

---

## Pattern 2 — The pipeline

Fan-out and fan-in waste time whenever stages have different durations: everyone waits for the slowest worker before the next stage begins. The pipeline fixes that. Stage N+1 starts on an item as soon as *that item* clears stage N — not when the whole stage finishes.

```text
  time ──────────────────────────────────────────────────────────►

  item 1   [ convert ][ test ][ review ]
  item 2        [ convert ][ test ][ review ]
  item 3             [ convert ][ test ][ review ]
  item 4                  [ convert ][ test ][ review ]

           ▲          ▲
           │          └─ reviewer starts on item 1 while item 3 is still converting
           └─ converter never idles
```

Compare with the batched form, where every stage boundary is a barrier:

```text
  item 1   [ convert ]            [ test ]            [ review ]
  item 2   [ convert ]            [ test ]            [ review ]
  item 3   [ convert       ]      [ test ]            [ review ]
  item 4   [ convert ]            [ test    ]         [ review ]
                      ▲ everyone waits ▲ everyone waits
```

The pipeline is the right shape when you have many similar items and several stages — a file-by-file migration, a batch of endpoints to document, a set of components to convert. Requirements:

- **Items must be independent of each other.** Item 3 cannot depend on item 1's output.
- **Stages must be strictly ordered.** Test after convert, review after test, always.
- **Each stage needs a done signal a machine can read.** A file written, a test exit code, a status file transitioning to `done`. Prose does not qualify.
- **Backpressure must be defined.** If review is slower than conversion, decide up front whether conversion pauses or the queue grows. An unbounded queue of unreviewed conversions is just a big unverified diff.

FORGE's building blocks for this: a per-item `{status_file}` from the worktree orchestrator, `scripts/orchestration-status.js` to poll the fleet, and `/loop-status` to inspect transcripts for stale wakeups and pending tool results. Managed autonomous loops with explicit stop conditions come from `/loop-start`; check on them with `/loop-status` rather than watching.

Set a hard stop before starting a pipeline: a maximum item count, a maximum wall-clock time, and a failure threshold that halts the whole thing. A pipeline with no stop condition is a budget leak with good throughput.

---

## Pattern 3 — The review wave

Review is the best-behaved parallel workload in existence: every reviewer reads the same input, writes nothing, and produces findings that merge by concatenation and dedup.

FORGE ships this as a native workflow rather than a hand-rolled fan-out. `workflows/orch-review.workflow.js` is the port of `orch-pipeline` Phase 5, and `/orch-review` is its surface:

```text
/orch-review              # review local uncommitted changes
/orch-review 1327         # review a GitHub PR by number
/orch-review <pr-url>     # review a GitHub PR by URL
```

The command computes the diff and hands it to the workflow. The workflow owns the fan-out — one reviewer per dimension, deduplication of overlapping findings, and an adversarial verification pass over the merged set. The command owns only input and output formatting. Findings come back split into blocking and advisory.

Dimensions worth assigning when you build a review wave by hand:

| Dimension | Agent | Trigger |
|---|---|---|
| General correctness | `code-reviewer` | Always |
| Language idiom | `typescript-reviewer`, `python-reviewer`, `go-reviewer`, `rust-reviewer`, … | Match the repo's primary language |
| Security | `security-reviewer` | Auth, input handling, DB queries, filesystem paths, external calls, crypto, secrets |
| Swallowed errors | `silent-failure-hunter` | Any diff with `catch`, `except`, or error returns |
| Type modeling | `type-design-analyzer` | New interfaces, unions, or generics |
| Test adequacy | `pr-test-analyzer` | Any diff claiming test coverage |
| Data layer | `database-reviewer` | Migrations, queries, indexes |
| Performance | `performance-optimizer` | Hot paths, loops over collections, N+1 risk |
| Comment honesty | `comment-analyzer` | Comments that may have drifted from the code |

Do not run all nine on every diff. Each reviewer is a full context window, and irrelevant reviewers produce plausible-sounding noise that dilutes the real findings. The security trigger list above comes from `rules/common/security.md` and is the one dimension worth over-triggering on.

A useful review-wave discipline: require every finding to cite a file and line. Findings without an anchor are opinions, and opinions do not merge.

---

## Pattern 4 — Adversarial convergence

Sometimes the goal is not throughput but disagreement. Three FORGE surfaces produce structured disagreement rather than parallel work.

**`/santa-loop`** runs a dual-review convergence loop: two independent model reviewers must *both* approve before code ships. Neither can wave the other through. Use it on changes where a single reviewer's blind spot is expensive.

**`/gan-build`** drives a generator/evaluator loop — `gan-generator` produces, `gan-evaluator` scores against a rubric, feedback lands in `gan-harness/feedback/feedback-NNN.md`, and the loop repeats until the score passes or plateaus. Set up the rubric with `/gan-design`. Flags that matter: `--max-iterations` (default 15), `--pass-threshold` (default 7.0), `--eval-mode playwright` for UI work or `code-only` for everything else, and `--skip-planner` when you already have a spec.

**The `council` skill** convenes four voices on an ambiguous decision with real tradeoffs, and forces the disagreement into the open before a choice is made. `dev-team` is the fixed-role variant — PM, Architect, Developer, QA respond to the same topic in parallel as independent subagents. `council-multi-model` extends the pattern across model families.

Choosing between them:

| You want | Use |
|---|---|
| A go/no-go decision with genuine tradeoffs | `council` |
| Four standard perspectives on a feature design | `dev-team` |
| Two reviewers who must both approve a diff | `/santa-loop` |
| Iterative improvement against a written rubric | `/gan-build` |
| Structured self-assessment of one output | `agent-self-evaluation` |

These cost more than a single pass by design. That is the trade: you are buying the surfacing of a disagreement that would otherwise show up in production.

---

## Handoff contracts

A wave without contracts degenerates into agents narrating at each other. Every handoff between agents needs to be a *file with a defined shape*, not a paragraph in a transcript.

FORGE's position on this is explicit in `orch-pipeline`: **the pipeline carries no hidden state — the planning docs are the handoff.** Concretely:

| Producer | Artifact | Consumer | Shape |
|---|---|---|---|
| `planner` | `task_list` | `tdd-guide` | Ordered thin vertical slices |
| `spec-miner` / `/plan-prd` | PRD under the repo's `docs/` | `planner` | Problem, constraints, acceptance criteria |
| `architect` / `code-architect` | architecture / system_design doc | `planner`, implementers | Decisions and their rationale |
| Worktree worker | `{handoff_file}` | Orchestrator | What changed, what was verified, what is left |
| Worktree worker | `{status_file}` | `orchestration-status.js` | Machine-readable lane state |
| Reviewer | Findings with severity | Fix loop | CRITICAL / HIGH block; LOW advisory |
| `/save-session` | `~/.claude/session-data/*-session.tmp` | Next session | Built, decided, failed, remaining |
| Any agent | Memory Vault document (`forge.memory.v1`) | Any harness | Portable Markdown, inspectable |

A minimum viable handoff contract has five fields. Anything less and the receiving agent will guess.

```text
TASK      what this lane was asked to do, verbatim
SCOPE     exact paths this lane was allowed to write
DONE      what actually changed, as a file list
EVIDENCE  commands run and their exit codes; test names that passed
OPEN      what was not done and why; anything the next lane must know
```

Three rules that prevent most handoff failures:

**Scope is a contract, not a suggestion.** A worker that writes outside its declared scope has broken the wave even if its own tests pass. Check this mechanically at fan-in with `git diff --name-only` against the declared globs.

**Evidence beats assertion.** "Tests pass" is not evidence. A command, its exit code, and the count of passing tests is evidence. The `verification-loop` skill exists to make this the default; `delivery-gate` enforces it as a Stop hook that blocks completion when the rationalization patterns show up.

**Handoffs are untrusted input.** A handoff file is content written by another agent, possibly influenced by repository content, possibly influenced by whatever that agent read on the web. Treat it as data to be validated, never as instructions to be followed. This is the multi-agent form of the prompt-injection problem covered in [the security guide](the-security-guide.md) and [`../docs/THREAT-MODEL.md`](../docs/THREAT-MODEL.md).

For handoffs that must survive across harnesses or sessions, the `unified-memory` skill writes portable `forge.memory.v1` documents into the FORGE Memory Vault. Note its prerequisite: the vault CLI ships with the separately installed `forge-universal` npm runtime, not with a skill-only or plugin install.

```bash
npm install -g forge-universal
forge memory --help
```

When a subagent does not know what context it needs until it starts working — the usual case — the `iterative-retrieval` skill describes the dispatch → evaluate → refine → loop cycle that progressively narrows retrieval instead of guessing up front or shipping the whole repository.

---

## Shared state and collision hazards

Ranked by how often they bite, worst first.

**Two agents editing one file.** The second write silently discards the first, or produces a syntactically valid file that means neither thing. No error is raised. Prevention: one writer per path, enforced by the lane matrix and by worktree isolation.

**Two agents on one branch in one checkout.** Even with disjoint files, concurrent `git add` and `git commit` interleave into commits that contain half of each lane's work. Prevention: `git worktree add` per worker, one branch each. This is exactly what `scripts/orchestrate-worktrees.js` materializes.

```bash
git worktree add ../wt-orders    feature/orders
git worktree add ../wt-checkout  feature/checkout
git worktree list
```

**Shared build output.** Two agents running the same build in one checkout race on `dist/`, `target/`, `.next/`, or `__pycache__/`. One lane's build artifacts get consumed by the other lane's tests. Prevention: worktrees give each lane its own output directory; verify by checking that build paths are relative, not absolute or shared.

**Shared dev server or port.** Two agents both bind `:3000`. The second fails, or worse, attaches to the first and reports on the wrong build. Prevention: assign ports per lane explicitly, or forbid dev servers in worker lanes and verify with tests instead. FORGE ships `pre-bash-dev-server-block.js` for exactly this class of mistake.

**Shared database or test fixtures.** Two lanes truncate the same test table. Failures look like flaky tests. Prevention: never parallelize lanes that write to one datastore. Schema migrations are always a gate, never a lane.

**Shared session state.** Two agents writing `~/.claude/session-data/` or the same memory namespace overwrite each other's summaries. Prevention: `FORGE_SESSION_ID` distinguishes sessions, and `FORGE_AGENT_DATA_HOME` gives a whole harness its own data root:

```bash
FORGE_AGENT_DATA_HOME="$HOME/.cursor/forge"   # keep a second harness off ~/.claude
```

**Shared external side effects.** Two agents both open a PR, both post a comment, both send a webhook. These are not recoverable by merging. Prevention: side effects belong to the orchestrator at fan-in, never to workers.

The `team-agent-orchestration` skill formalizes the discipline this list implies: each work item carries an **owner**, a **scope** (files, branch, tool surface, forbidden areas), a **state** on an agent Kanban (backlog / ready / running / review / blocked / merged / archived), **evidence**, and an explicit **merge gate**. Its card schema is worth adopting verbatim when a wave outlives a single session:

```json
{
  "id": "agent-card-001",
  "title": "Extract order pricing into a service",
  "owner": "worker-a",
  "state": "running",
  "branch": "feature/order-pricing",
  "worktree": "../wt-orders",
  "acceptance": ["unit tests for pricing pass", "no changes outside src/orders/**"],
  "merge_gate": "lint, focused tests, and typecheck pass on the merged branch",
  "handoff": "coordination/worker-a-handoff.md"
}
```

For work coordinated through GitHub rather than local files, the `epic-*` command family carries the same state in issues: `/epic-decompose` breaks an epic into task children, `/epic-claim` stamps ownership, `/epic-sync` pulls issue bodies and labels into a local coordination snapshot, `/epic-validate` checks readiness and dependencies, `/epic-review` records review state, `/epic-unblock` reopens tasks whose dependencies closed, and `/epic-publish` writes a validated update back.

---

## Budget control

A wave can spend a day's budget in twenty minutes. Four controls, in order of leverage.

**1. Cap the wave before you start it.** Decide the maximum number of concurrent workers and the maximum iterations of any loop, and write both into the plan. `/gan-build` takes `--max-iterations`; `/loop-start` requires explicit stop conditions by design. A loop without a stop condition is not a pattern, it is an incident.

**2. Route lanes to the cheapest sufficient model.** Exploration, file reading, test running, and status polling do not need a frontier model. Implementation and architecture do.

```json
{
  "model": "sonnet",
  "env": {
    "MAX_THINKING_TOKENS": "10000",
    "CLAUDE_CODE_SUBAGENT_MODEL": "haiku"
  }
}
```

`MAX_THINKING_TOKENS` is the quiet one. It defaults high, it applies per request, and in a wave it multiplies by the number of workers.

**3. Watch the run, not the invoice.** FORGE's `stop:cost-tracker` hook appends one cumulative snapshot per session to `~/.claude/metrics/costs.jsonl`. Read it with:

```text
/cost-report
/cost-report csv
```

The report takes the latest row per `session_id` and sums across sessions — summing every row multiplies-counts, which is why the command exists rather than a `wc -l`. During a run, `forge-context-monitor.js` injects agent-facing warnings when context, cost, file-count, or tool-loop thresholds are crossed. Its loop detector fires when the last five tool calls are byte-identical, which is the signature of a worker stuck in a retry cycle burning tokens with no progress.

**4. Prefer more stages over more workers.** A four-stage pipeline with two workers usually costs less and merges more cleanly than a one-stage fan-out with eight. Stages share nothing; workers share everything they were not explicitly denied.

> A caveat on multi-model commands. `/multi-plan`, `/multi-execute`, `/multi-backend`, `/multi-frontend`, and `/multi-workflow` orchestrate external models alongside Claude, with Claude holding sole filesystem write access. They require the external `ccg-workflow` runtime, which is **not** part of a base FORGE install — it must be provisioned separately, and it introduces a second vendor's cost surface that `/cost-report` does not see. Read the prerequisite note at the top of each command file before budgeting for them.

---

## Verifying the wave, not the workers

Every worker will tell you it succeeded. Workers are optimistic narrators of their own transcripts. The orchestrator's job is to disbelieve them productively.

Four checks, in order. Skipping the first two is how a green wave ships a broken merge.

**Scope check — did each lane stay in bounds?**

```bash
for wt in ../wt-*; do
  echo "== $wt"
  git -C "$wt" diff --name-only main...HEAD
done
```

Compare against the declared write surface for each lane. A path outside the declaration is a finding regardless of what the tests say.

**Merge check — does the union build?**

```bash
git checkout -b integration main
git merge --no-ff feature/orders feature/checkout
npm run typecheck && npm run lint && npm test
```

Per-branch green tells you nothing about the union. Two lanes can each pass while their merge fails to typecheck, because neither ever saw the other's interface change. This check is the entire reason fan-in exists.

**Contradiction check — did two lanes solve the same problem twice?**

```bash
git diff main...integration --name-only | sort | uniq -d
git diff main...integration | grep -E '^\+.*(function|const|def|func) ' | sort | uniq -c | sort -rn | head
```

Duplicated helpers, competing utilities, and two different date formatters are the classic wave artifact. They pass every test.

**Evidence check — is there proof, or only prose?**

Run the `verification-loop` skill over the merged result and require, for each acceptance criterion, a command and its exit code. `delivery-gate` can enforce this mechanically as a Stop hook: it blocks completion when it detects rationalization patterns in the surface text or a stale learning log.

Then record the outcome so the next wave starts from a known point:

```text
/checkpoint
/save-session
```

The full verification vocabulary — what counts as evidence, how to design an acceptance check that cannot be satisfied by prose — is in [the evaluation guide](the-evaluation-guide.md).

---

## Worked example A — Feature across three modules

**Task:** add per-tenant rate limiting to an API with a shared middleware layer, a Postgres-backed counter, and an admin toggle in the web app.

**Step 1 — Refuse the obvious decomposition.** "Three modules, three agents" is wrong here, because all three depend on a shared config type and a shared middleware signature that do not exist yet. Parallelizing before that contract exists produces three incompatible interpretations.

**Step 2 — Write the lane matrix.**

```text
Stage | Lane            | Write surface           | Parallel? | Verification
------|-----------------|-------------------------|-----------|----------------------
  1   | shared contract | packages/types/rate/**   | no        | typecheck
  2   | middleware      | src/middleware/rate/**   | yes       | unit tests
  2   | store           | src/store/rate/**        | yes       | unit + integration
  2   | admin toggle    | app/admin/rate/**        | yes       | component tests
  3   | migration       | db/migrations/**         | GATE      | dry-run, then apply
  4   | integration     | (merge)                  | no        | full suite + e2e
```

**Step 3 — Run stage 1 alone.** One agent, no wave:

```text
/plan Define the RateLimitConfig type and the middleware signature in
packages/types/rate. No implementation, no callers. This is the contract the
three implementation lanes will build against.
```

Commit it before anything else starts. Every stage-2 lane branches from that commit.

**Step 4 — Fan out stage 2 into worktrees.**

```bash
git worktree add ../wt-mw    feature/rate-middleware
git worktree add ../wt-store feature/rate-store
git worktree add ../wt-admin feature/rate-admin
```

Give each worker the same five-field brief, differing only in TASK and SCOPE. Each runs its own gated pipeline:

```text
/orch-add-feature implement the rate-limit middleware against the
RateLimitConfig contract in packages/types/rate. Do not modify anything outside
src/middleware/rate/. Tests first.
```

`orch-add-feature` is a thin wrapper over `orch-pipeline`. It classifies size, runs phases 0 → 1 → 2 → 4 → 5 → 6 (research, plan, TDD, review, commit — skipping scaffold), and stops at two gates: after the plan, and before the commit. Both gates fire inside each worker, so review the plan in each lane before letting it write code.

**Step 5 — Gate the migration.** Stage 3 runs after stage 2 merges, alone, with a dry run before the apply. It is never a lane.

**Step 6 — Fan in.** Merge into an integration branch, run the four verification checks from the previous section, then:

```text
/orch-review
```

The review workflow fans out reviewers over the *merged* diff, which is the only diff that matters.

**What this actually saved:** stage 2 is the long stage, and three lanes run it concurrently. Stages 1, 3, and 4 are sequential and unavoidable. The honest speedup is on one stage out of four — which is still worth having, and is a far smaller number than "three agents, three times faster".

---

## Worked example B — Pipelined migration

**Task:** convert 40 React class components to function components with hooks, with tests and review for each.

Batched fan-out is wrong here: conversion times vary by an order of magnitude, so every stage barrier idles most of the fleet.

```text
  stage 1: convert   (2 workers)   ──►  status_file: converted
  stage 2: test      (2 workers)   ──►  status_file: tested
  stage 3: review    (1 worker)    ──►  status_file: approved | changes-requested
```

**Item queue.** Enumerate the work deterministically and freeze the list before starting:

```bash
git grep -l "extends React.Component" -- 'src/**/*.jsx' 'src/**/*.tsx' \
  | sort > coordination/queue.txt
wc -l coordination/queue.txt
```

**Per-item status file.** Each item gets one file whose only job is to be machine-readable:

```json
{ "item": "src/orders/OrderRow.tsx", "stage": "tested", "attempts": 1, "evidence": "vitest run src/orders/OrderRow.test.tsx -> exit 0" }
```

**Backpressure.** Review is the slow stage. Cap the number of items allowed in `converted` or `tested` at, say, six. When the cap is hit, conversion workers stop pulling. Without this, you end up with 40 converted-but-unreviewed files, which is a single enormous unverified diff wearing a pipeline costume.

**Poll, do not watch.**

```bash
node scripts/orchestration-status.js
```

```text
/loop-status
```

`/loop-status` inspects transcripts for stale wakeups and pending tool results — the signature of a worker that died mid-call and will never report.

**Stop conditions, decided in advance.** Halt the whole pipeline if: three consecutive items fail review, any item exceeds two conversion attempts, total wall-clock exceeds the budget, or `/cost-report` crosses the threshold you set. Write these down before starting; they are worthless invented mid-run.

**Fan-in.** Merge in queue order, run the full suite once at the end, and diff the aggregate for the contradiction patterns from the previous section. Forty small correct changes can still add up to one incoherent codebase.

---

## Worked example C — Multi-dimension PR review

**Task:** review a large PR touching authentication and the user table.

```text
/orch-review 1327
```

That single command runs the wave. What it does under the hood, and what you would build by hand if you were not using it:

```text
        PR diff (one input, read-only)
                  │
     ┌────────┬───┴────┬─────────┬──────────┐
     ▼        ▼        ▼         ▼          ▼
 code-      security- silent-   pr-test-  database-
 reviewer   reviewer  failure-  analyzer  reviewer
                      hunter
     └────────┴────────┴─────────┴──────────┘
                  │
              dedup findings
                  │
         adversarial verify pass
                  │
       blocking  ──┴──  advisory
```

Reviewer selection follows the trigger table earlier in this guide. This diff touches auth and a database table, so `security-reviewer` and `database-reviewer` are mandatory rather than optional — `rules/common/security.md` treats authentication, authorization, user input, database queries, filesystem paths, external API calls, cryptography, and secrets as automatic triggers.

The adversarial verify pass is what separates this from a concatenation of five opinions. A finding that no second reader can reproduce against the diff is downgraded or dropped. Without that pass, a five-reviewer wave produces five times the noise and roughly the same signal.

Two habits make review waves worth the tokens:

- **Require anchors.** Every finding cites `path:line`. Unanchored findings do not merge and cannot be verified.
- **Separate blocking from advisory in the output, not in your head.** CRITICAL and HIGH block the merge; everything else is a backlog item. A review that returns twenty undifferentiated findings will be ignored wholesale.

---

## Failure catalog

| Failure | What it looks like | Root cause | Fix |
|---|---|---|---|
| Silent overwrite | A change you saw in a transcript is not in the diff | Two lanes wrote one file | One writer per path; worktrees |
| Green branches, red merge | Each lane passes, integration fails typecheck | Contract changed under a lane | Contract stage first, alone |
| Duplicate helpers | Two `formatDate` implementations land | No shared-utility owner | Declare shared paths as a stage-1 lane |
| Confident nothing | Worker reports success, wrote no files | No evidence requirement | Require command + exit code in the handoff |
| Runaway loop | Cost spikes, no progress | No stop condition | `--max-iterations`; the loop detector in the context monitor |
| Stalled fleet | Status files stop advancing | Worker died mid tool call | `/loop-status`; `scripts/orchestration-status.js` |
| Injected instruction | A worker does something nobody asked for | Handoff or fetched content treated as instructions | Treat all agent output as untrusted data |
| Wave slower than serial | More wall-clock than doing it alone | Units were not independent | Redo the lane matrix; serialize |
| Budget blown on trivia | Large spend, small diff | Four agents on four two-minute tasks | Batch into one agent |
| Double side effects | Two PRs, two comments, two webhooks | Workers allowed external effects | Side effects belong to the orchestrator only |

---

## Pre-flight checklist

Run through this before starting any wave. It takes two minutes and prevents most of the table above.

```text
[ ] Wall-clock time is genuinely the binding constraint
[ ] The lane matrix is written down: lane, parallel?, write surface, risk, verification
[ ] No two parallel lanes share a write surface
[ ] Shared contracts and schema changes are their own sequential stage, first
[ ] Migrations, deploys, and irreversible writes are gates, not lanes
[ ] Each lane has a five-field brief: TASK, SCOPE, DONE, EVIDENCE, OPEN
[ ] Each lane has its own worktree and branch
[ ] Ports, build outputs, and datastores are not shared between lanes
[ ] Side effects (PRs, comments, webhooks) belong to the orchestrator only
[ ] Worker model tier is set deliberately, not inherited
[ ] Maximum workers, maximum iterations, and a failure threshold are written down
[ ] Fan-in plan exists: scope check, merge check, contradiction check, evidence check
[ ] Dry run first: `node scripts/orchestrate-worktrees.js plan.json`
```

---

## Related reading

| Topic | Where |
|---|---|
| Pattern reference, look-up form | [`../docs/ORCHESTRATION-PATTERNS.md`](../docs/ORCHESTRATION-PATTERNS.md) |
| Context economics behind wave cost | [the context guide](the-context-guide.md) |
| Model tiers and routing | [`../docs/COST-AND-MODEL-ROUTING.md`](../docs/COST-AND-MODEL-ROUTING.md) |
| Verifying a wave's output | [the evaluation guide](the-evaluation-guide.md) |
| Untrusted handoffs and injection | [the security guide](the-security-guide.md), [`../docs/THREAT-MODEL.md`](../docs/THREAT-MODEL.md) |
| Agent authoring | [`../docs/AGENT-AUTHORING.md`](../docs/AGENT-AUTHORING.md) |
| Agent catalog and routing contract | [`../AGENTS.md`](../AGENTS.md) |
| Anti-patterns, including over-orchestration | [`../docs/ANTI-PATTERNS.md`](../docs/ANTI-PATTERNS.md) |
