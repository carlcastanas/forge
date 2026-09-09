# Orchestration patterns

This page is the catalogue. Each pattern gets the same five fields — shape, when it applies,
when it does not, failure modes, and the FORGE surfaces that implement it — so two patterns can
be compared without reading either in full. It ends with a selection table and the checks that
verify a multi-lane result as a single artifact. The reasoning behind these shapes and three
worked examples are in
[`../guides/the-orchestration-guide.md`](../guides/the-orchestration-guide.md); this page
assumes you have accepted that argument and now need to pick a shape.

Prerequisites: [CONCEPTS.md](CONCEPTS.md) for agent versus subagent, working knowledge of
`git worktree`, and [CONTEXT-ENGINEERING.md](CONTEXT-ENGINEERING.md), because every concurrent
lane is another context window being paid for. Four terms recur: a **lane** is one unit of
concurrent work with one owner and one declared **write surface** (the path globs it may
modify), a **barrier** is a point where every lane must finish before the next stage starts, and
a **gate** is a step that runs alone behind a human or a check. See [GLOSSARY.md](GLOSSARY.md).

## Pattern: fan-out and fan-in

```text
          orchestrator
     ┌─────────┼─────────┐
     ▼         ▼         ▼
   lane A    lane B    lane C     disjoint write surfaces
     └─────────┼─────────┘
               ▼   fan-in: merge, then verify the union
```

**Applies when** the work splits into three or more lanes with non-overlapping write surfaces,
wall-clock time is the binding constraint, and one merge-and-verify step at the end is enough
coordination.

**Does not apply when** lanes share a file, a schema, a datastore, or an unresolved design
decision; when fewer than three independent lanes fall out; or when each lane is short enough
that per-lane fixed overhead exceeds the work.

**Failure modes**

| Failure | Signature | Prevention |
| --- | --- | --- |
| Silent overwrite | A change visible in one transcript is absent from the diff | One writer per path, enforced by worktree isolation |
| Green lanes, red merge | Every branch passes, the integration branch fails to typecheck | Promote the shared contract to a sequential stage that runs first |
| Duplicated work | Two lanes independently add the same helper | Declare shared utility paths as a stage of their own |
| Double side effects | Two pull requests, two comments, two webhook calls | Side effects belong to the orchestrator, never to a lane |

**FORGE surfaces** — [`scripts/orchestrate-worktrees.js`](../scripts/orchestrate-worktrees.js)
materializes one `git worktree` and one branch per worker from a plan file; run it with no
flags first, which prints the plan without touching the filesystem.
[`scripts/orchestration-status.js`](../scripts/orchestration-status.js) polls the fleet, and
[`skills/parallel-execution-optimizer/`](../skills/parallel-execution-optimizer/) produces the
lane matrix — lane, parallel, write surface, risk, verification — before anything runs. All of
it lives in the `orchestration` install module, which is `beta` with `defaultInstall: false` in
[`../manifests/install-modules.json`](../manifests/install-modules.json) and must be requested
explicitly; the module also carries [`skills/dmux-workflows/`](../skills/dmux-workflows/).

## Pattern: pipeline

```text
  time ────────────────────────────────────────────►
  item 1  [ stage 1 ][ stage 2 ][ stage 3 ]
  item 2       [ stage 1 ][ stage 2 ][ stage 3 ]
  item 3            [ stage 1 ][ stage 2 ][ stage 3 ]
  item 4                 [ stage 1 ][ stage 2 ]
          ▲ stage 1 never idles; stage 3 starts on item 1
            while item 3 is still in stage 1
```

**Applies when** there are many similar items and several strictly ordered stages, item
durations vary enough that a barrier would idle most of the fleet, and each stage emits a
machine-readable done signal.

**Does not apply when** items depend on each other, stage order is negotiable (a fan-out is
simpler), or no backpressure policy is defined — an unbounded queue awaiting the slow stage is
one large unverified diff wearing a pipeline costume.

**Failure modes**

| Failure | Signature | Prevention |
| --- | --- | --- |
| Queue blowout | Dozens of items stacked before the slowest stage | Cap in-flight items; pause upstream when the cap is hit |
| Stalled fleet | Status files stop advancing, no error appears | `/loop-status` and the status poller; treat staleness as failure |
| Prose done signals | A stage reports completion in narrative, not state | Require a status file transition or an exit code |
| Runaway cost | Spend climbs with no item advancing | Declare max items, max wall-clock, and a failure threshold up front |

**FORGE surfaces** — [`skills/orch-pipeline/`](../skills/orch-pipeline/) is the shared gated
engine (research, plan, TDD, review, commit) with a size classifier, an agent map, and two human
gates. The `orch-*` operation skills are thin wrappers that select which phases run:
[`orch-add-feature`](../skills/orch-add-feature/), [`orch-fix-defect`](../skills/orch-fix-defect/),
[`orch-change-feature`](../skills/orch-change-feature/),
[`orch-refine-code`](../skills/orch-refine-code/), and
[`orch-build-mvp`](../skills/orch-build-mvp/). Per-item state comes from the `{status_file}`
placeholder the worktree orchestrator fills in per worker.
[`/loop-start`](../commands/loop-start.md) runs managed loops and requires explicit stop
conditions; [`/loop-status`](../commands/loop-status.md) inspects transcripts for stale wakeups
and pending tool results, and the [`loop-operator`](../agents/loop-operator.md) agent monitors
them.

## Pattern: wave

A wave is a fan-out with a barrier, repeated: stage N+1 does not begin until every lane in
stage N has merged and the union has been verified. It is the correct shape whenever a later
stage depends on the merged output of an earlier one.

```text
  stage 1        stage 2                  stage 3
  ─────────      ─────────────────────    ──────────
  contract   ►   ┌ lane A ┐               migration
  (alone)        │ lane B │  ► barrier ►  (gate,
                 └ lane C ┘   merge +      alone)
                              verify
```

**Applies when** the work has a genuine dependency structure — a shared type, an interface, a
generated client — and only one stage is wide. Most requests phrased as "three features, three
agents" are actually a wave whose first stage is sequential.

**Does not apply when** every stage is one lane wide (that is a sequence) or when the barrier is
skipped. A wave without a barrier is a fan-out with extra steps and the same merge hazards.

**Failure modes**

| Failure | Signature | Prevention |
| --- | --- | --- |
| Contract invented three times | Three lanes each define their own version of a shared type | Stage the contract first, alone, and commit it before fanning out |
| Barrier skipped under time pressure | Stage 3 starts before stage 2 merged cleanly | Make the barrier a checked step, not a habit |
| Speedup overstated | One stage of four is parallel; the report claims 3x | Measure the wide stage, not the whole run |
| Gate parallelized by accident | A migration runs as a lane | List gates explicitly in the lane matrix |

**FORGE surfaces** — the same worktree runtime as fan-out, plus
[`skills/team-agent-orchestration/`](../skills/team-agent-orchestration/) when a wave outlives a
single session, which carries each work item as a card with an owner, a scope, an agent Kanban
state, evidence, and an explicit merge gate.
[`skills/plan-orchestrate/`](../skills/plan-orchestrate/) reads a plan document and emits one
ready-to-paste orchestration invocation per step; it is generative only and never executes
anything itself.

## Pattern: review board

N readers over one read-only input, findings merged by deduplication and then re-verified
against the source.

```text
        diff (one input, nobody writes)
      ┌───────┬─────┴─────┬────────┬────────┐
      ▼       ▼           ▼        ▼        ▼
   general security  swallowed  tests   data layer
                      errors
      └───────┴─────┬─────┴────────┴────────┘
                    ▼   dedup findings
                    ▼   adversarial verify pass
        blocking  ──┴──  advisory
```

**Applies when** the input is fixed and read-only, several independent dimensions matter, and
findings merge by concatenation. No write surface means no collision class at all, which makes
this the best-behaved concurrent workload available.

**Does not apply when** reviewers would need to change the code, when the diff is small enough
for one reviewer, or when the dimensions are not independent — nine reviewers on a three-line
change produce nine plausible opinions and no signal.

**Failure modes**

| Failure | Signature | Prevention |
| --- | --- | --- |
| Noise dilution | Twenty undifferentiated findings, all ignored | Separate blocking from advisory in the output |
| Unverifiable findings | A finding no second reader can reproduce | Adversarial verify pass; drop or downgrade |
| Recall lost in dedup | Two reviewers found related issues, dedup kept one | Dedup on anchor, not on wording |
| Unanchored opinions | Findings with no file and line | Require `path:line` on every finding |

**FORGE surfaces** — [`/orch-review`](../commands/orch-review.md) is the entry point, accepting
a pull request number, a pull request URL, or nothing for local uncommitted changes.
[`workflows/orch-review.workflow.js`](../workflows/orch-review.workflow.js) owns the fan-out,
the deduplication, and the adversarial verification; the command owns only input and output
formatting. Reviewer agents to assign by dimension: [`code-reviewer`](../agents/code-reviewer.md),
  [`security-reviewer`](../agents/security-reviewer.md),
  [`silent-failure-hunter`](../agents/silent-failure-hunter.md),
  [`type-design-analyzer`](../agents/type-design-analyzer.md),
  [`pr-test-analyzer`](../agents/pr-test-analyzer.md),
  [`database-reviewer`](../agents/database-reviewer.md),
  [`performance-optimizer`](../agents/performance-optimizer.md),
  [`comment-analyzer`](../agents/comment-analyzer.md), plus the language reviewers listed in
  [`../AGENTS.md`](../AGENTS.md).

## Pattern: map-reduce

One operation applied independently over many inputs, then reduced into a single artifact.
The distinguishing feature versus fan-out is that the outputs are *data* to be combined, not
*code* to be merged.

```text
   inputs      map (identical operation, N times)      reduce
   ──────      ──────────────────────────────────      ──────
   file 1  ──►  summarize / classify / measure  ──┐
   file 2  ──►  summarize / classify / measure  ──┼──►  one report
   file N  ──►  summarize / classify / measure  ──┘
```

**Applies when** the same question is asked of many inputs — inventorying a dependency tree,
classifying a catalog, triaging a log directory, measuring per-module coverage. The reduce step
is cheap because the map outputs share a schema.

**Does not apply when** the map operation writes to the repository (that is a fan-out and needs
worktrees), when inputs are few enough to batch into one agent, or when the map output has no
fixed schema — a reduce over free-form prose degenerates into a summary of summaries.

**Failure modes**

| Failure | Signature | Prevention |
| --- | --- | --- |
| Schema drift | Each mapper invents its own output shape | Specify the output record in the dispatch prompt, verbatim |
| Reduce hides disagreement | Two mappers contradict; the reduce averages them | Carry contradictions into the report as findings |
| Cost dominated by preamble | N tiny maps, each paying full fixed overhead | Batch several inputs per mapper |
| Fabricated coverage | The reduce reports on inputs no mapper actually read | Require each record to cite its input path |

**FORGE surfaces** — [`skills/skill-stocktake/`](../skills/skill-stocktake/) is the clearest
in-repo instance: it audits skills and commands through sequential subagent batch evaluation, in
Quick Scan mode over changed skills or Full Stocktake over everything.
[`skills/iterative-retrieval/`](../skills/iterative-retrieval/) handles the case where a mapper
does not know up front which context it needs, replacing a guessed initial load with a dispatch,
evaluate, refine, loop cycle.

## Pattern: supervisor-worker

A long-lived supervisor owns a queue and the stop conditions; short-lived workers pull items,
do one unit, and exit. Unlike fan-out, the worker set is not fixed at launch and the
supervisor outlives any individual worker.

```text
   supervisor: queue · stop conditions · budget
       ┌───────────┼───────────┐
       ▼           ▼           ▼
    worker      worker      worker    each: one item, then exit
       └───────────┼───────────┘
                   ▼   status files + evidence
                   ▼   supervisor re-dispatches or halts
```

**Applies when** the work list is long or grows during the run, a failed item should be retried
by a fresh worker rather than debugged in place, and a budget or iteration cap must be enforced
centrally.

**Does not apply when** the queue is short and known up front, or when the supervisor has no
reliable way to detect a dead worker. One that cannot tell "still working" from "died mid tool
call" will wait forever.

**Failure modes**

| Failure | Signature | Prevention |
| --- | --- | --- |
| No stop condition | Cost climbs, the queue never empties | Max iterations, max wall-clock, and a failure threshold, written before launch |
| Retry storm | The same item fails repeatedly and is re-dispatched | Cap attempts per item; quarantine rather than retry |
| Dead worker undetected | A status file frozen at `running` | Treat staleness past a bound as failure |
| Supervisor trusts self-reports | Every worker claims success; the merge is broken | Verify at fan-in, not from the worker's narration |

**FORGE surfaces** — [`/loop-start`](../commands/loop-start.md) with explicit stop conditions,
[`/loop-status`](../commands/loop-status.md) and the
[`loop-operator`](../agents/loop-operator.md) agent for monitoring, and
[`scripts/orchestration-status.js`](../scripts/orchestration-status.js) for fleet state. For work
coordinated through an issue tracker rather than local files, the `epic-*` command family carries
the same state in issues: [`/epic-decompose`](../commands/epic-decompose.md),
[`/epic-claim`](../commands/epic-claim.md), [`/epic-sync`](../commands/epic-sync.md),
[`/epic-validate`](../commands/epic-validate.md), [`/epic-review`](../commands/epic-review.md),
[`/epic-unblock`](../commands/epic-unblock.md), and [`/epic-publish`](../commands/epic-publish.md).

## Pattern: speculative execution

Run several approaches to the same problem concurrently, keep the one that verifies, discard
the rest. The discarded work is the price; a shorter path to a working answer is the product.

```text
        one problem, several hypotheses
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   approach A        approach B        approach C
   own worktree      own worktree      own worktree
        └────────► same acceptance check ◄──┘
                          ▼
              keep one · discard the others
```

**Applies when** the approach is genuinely uncertain, an objective acceptance check exists that
all branches must satisfy, and a wrong first choice would cost more than running the
alternatives. Adversarial variants — where the point is producing disagreement rather than
throughput — are the same shape with a scoring step instead of a pass/fail check.

**Does not apply when** the acceptance check is subjective, when the branches would converge
anyway after five minutes of thought, or when the decision is the work. Spawning agents to
resolve an unframed question converts thinking time into token spend.

**Failure modes**

| Failure | Signature | Prevention |
| --- | --- | --- |
| No discard discipline | All three branches get merged | Decide the acceptance check before launching |
| Post-hoc criteria | The check is written after seeing the outputs | Freeze the criteria in writing at dispatch |
| Cross-contamination | Branches read each other's work and converge | One worktree each; no shared coordination file |
| Cost with no decision | Three approaches, no verdict | Cap iterations and require a written choice at the end |

**FORGE surfaces** — [`/santa-loop`](../commands/santa-loop.md) requires two independent
reviewers to both approve before code ships. [`/gan-build`](../commands/gan-build.md) drives
a generator/evaluator loop between the [`gan-generator`](../agents/gan-generator.md) and
[`gan-evaluator`](../agents/gan-evaluator.md) agents against a rubric set up by
[`/gan-design`](../commands/gan-design.md). [`skills/council/`](../skills/council/) convenes
several voices on an ambiguous decision, [`skills/dev-team/`](../skills/dev-team/) is the
fixed-role variant, and [`skills/council-multi-model/`](../skills/council-multi-model/)
extends the pattern across model families.

## Choosing a pattern

| Situation | Pattern | Isolation required |
| --- | --- | --- |
| Several features, disjoint directories, one merge at the end | Fan-out | Worktree per lane |
| Many similar items, ordered stages, variable durations | Pipeline | Worktree per worker, status file per item |
| Later work depends on earlier merged output | Wave | Worktree per lane, barrier between stages |
| One diff, several review dimensions | Review board | None; readers write nothing |
| One question asked of many inputs, combined into a report | Map-reduce | None; subagent context is the only separation |
| Long or growing work list with a central budget | Supervisor-worker | Worktree per worker |
| Approach genuinely uncertain, objective acceptance check exists | Speculative | Worktree per approach |
| Fewer than three independent lanes fall out of decomposition | None — run sequentially | — |
| Anything touching a migration, a schema, or one datastore | None — gate it | — |

Two secondary questions decide the rest. **Does any lane write?** If not, subagents suffice and
the whole collision class disappears. **Does the merged result have a check that can fail?** If
not, nothing here is safe to run unattended, because nothing will catch a wrong answer that
every lane agreed on.

## Verifying the combined output

Every worker is an optimistic narrator of its own transcript, and per-lane green says nothing
about the union. Run these four checks at fan-in, in order; the first two are the ones people
skip and the ones that catch the most damage.

**1. Scope.** Did each lane stay inside its declared write surface?

```bash
for wt in ../wt-*; do
  echo "== $wt"
  git -C "$wt" diff --name-only main...HEAD
done
```

A path outside the declaration is a finding regardless of whether the tests pass.

**2. Merge.** Does the union build?

```bash
git checkout -b integration main
git merge --no-ff feature/lane-a feature/lane-b feature/lane-c
npm run typecheck && npm run lint && npm test
```

Two lanes can each pass while their merge fails, because neither saw the other's interface
change. This check is the entire reason fan-in exists as a step.

**3. Contradiction.** Did two lanes solve the same problem twice?

```bash
git diff main...integration --name-only | sort | uniq -d
git diff main...integration | grep -E '^\+.*(function|const|def|func) ' | sort | uniq -c | sort -rn | head
```

Duplicate helpers and competing utilities are the classic artifact of a wide stage, and they
pass every test.

**4. Evidence.** Is there proof, or only prose? Require a command and its exit code per
acceptance criterion. [`skills/verification-loop/`](../skills/verification-loop/) makes this the
default check before completion is claimed, and
[`skills/delivery-gate/`](../skills/delivery-gate/) enforces it as a Stop hook that blocks
completion when rationalization patterns appear in the surface text.

Record the outcome with `/checkpoint` and `/save-session` so the next run starts from a known
point.

Two properties of handoffs are easy to lose here. A handoff is a file with a defined shape, not
a paragraph in a transcript — the minimum contract names the task, the permitted scope, the
changed files, the evidence, and what remains open. And it is **untrusted input**, written by an
agent that may have read a poisoned file: validate its claims against the repository, never
follow it as instruction. See [THREAT-MODEL.md](THREAT-MODEL.md).

## The multi-model commands

[`/multi-plan`](../commands/multi-plan.md), [`/multi-execute`](../commands/multi-execute.md),
[`/multi-backend`](../commands/multi-backend.md),
[`/multi-frontend`](../commands/multi-frontend.md), and
[`/multi-workflow`](../commands/multi-workflow.md) orchestrate external models alongside Claude,
with Claude retained as the only filesystem writer. Two prerequisites, both stated at the top of
each command file: they require the external `ccg-workflow` runtime, which is not part of a base
FORGE install, and they add a second vendor's cost surface that
[`/cost-report`](../commands/cost-report.md) does not see.

## Related pages

| Topic | Where |
| --- | --- |
| Why these shapes, with worked examples | [`../guides/the-orchestration-guide.md`](../guides/the-orchestration-guide.md) |
| Per-lane context cost, and routing lanes to tiers | [CONTEXT-ENGINEERING.md](CONTEXT-ENGINEERING.md), [COST-AND-MODEL-ROUTING.md](COST-AND-MODEL-ROUTING.md) |
| Grading a wave's output | [EVALUATION-GUIDE.md](EVALUATION-GUIDE.md) |
| Handoffs as an attack surface | [THREAT-MODEL.md](THREAT-MODEL.md) |
| Agent catalog, routing contract, over-orchestration | [`../AGENTS.md`](../AGENTS.md), [ANTI-PATTERNS.md](ANTI-PATTERNS.md) |
