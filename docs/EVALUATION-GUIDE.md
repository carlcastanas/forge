# Evaluation

This page is the reference for measuring whether an agent setup works: the four kinds of eval
and what each one can and cannot detect, every grader type paired with the direction it lies
in, how to build a set out of sessions that already happened, the statistics that keep a
twelve-task set honest, the shape of a CI gate, and the procedure for a result you do not
believe.

The case for measuring at all, the worked twelve-task example, and the per-object treatment of
skills, agents, and workflows are in
[`../guides/the-evaluation-guide.md`](../guides/the-evaluation-guide.md). This page is the
table you come back to.

Prerequisites: a repository with a test suite and CI, and a few weeks of real sessions to mine.
[CONCEPTS.md](CONCEPTS.md) for what a skill, agent, and workflow are as separate objects.

## Four kinds of eval

These are levels of scope, not alternatives. A mature setup runs all four; a new one starts
with unit and end-to-end and adds the rest when the first surprise arrives.

| Kind | Question | Input | Graded artifact | Cost per run |
| --- | --- | --- | --- | --- |
| Unit | Does one component behave? | One prompt against one skill, agent, or rule | A single assertion | Seconds, cents |
| Trajectory | Did it get there the right way? | One task, full transcript retained | The sequence of tool calls | Minutes |
| End-to-end | Does the repository end up acceptable? | Pinned commit plus a verbatim prompt | Final repository state | Minutes, dollars |
| Regression | Did a change break what worked? | The whole set, re-run | Per-task deltas against a baseline | Set size x runs |

**Unit evals** answer narrow, cheap questions. Does this skill trigger on the prompts it should
and stay silent on the ones it should not? Does this reviewer agent flag this one seeded defect?
Does this rule survive into the model's behavior? A unit eval that fails tells you exactly which
component to fix, which is why they are the ones to write first.

**Trajectory evals** grade the path. They exist because an end-to-end eval cannot distinguish
"followed the mandated process" from "reached an acceptable state by luck". The artifact is the
tool-call timeline: a skill that mandates tests before implementation and shows Write before
Bash has been reordered, not followed, even if tests exist at the end. Scope adherence — files
changed versus files the task should touch — is a trajectory property, and a task that passes
while modifying twelve unrelated files has not passed.

**End-to-end evals** grade only the final state. The workflow is allowed to reach a good result
by an unexpected route. Four checks in order, and the fourth is the one people leave out:

```bash
git diff --name-only main...HEAD          # scope: only the expected paths moved
npm run typecheck && npm run lint          # integrity: the result is coherent
npm test                                   # correctness: the suite is green
git diff main...HEAD -- '**/*.test.*'      # honesty: the tests were not weakened
```

**Regression evals** are the same tasks re-run against a recorded baseline. They are the only
kind that detects the failure nothing else reports: yesterday's prompt quietly stopped working.
Without a committed baseline a regression is indistinguishable from an unlucky day.

## Grader taxonomy

Every grader is wrong in a characteristic direction. Knowing the direction is what makes the
number usable.

| Grader | Good for | Lies by | Pair it with |
| --- | --- | --- | --- |
| Exact match | Structured output, required identifiers | Rejecting cosmetically different correct answers | A semantic check |
| Pattern match | Forbidden constructs, file existence | Accepting wrong answers that contain the right token | A deterministic check |
| Structural validator | Frontmatter, schema, links, manifests | Passing well-formed nonsense | A behavioral check |
| Deterministic code | The majority of coding tasks | Grading tests the agent may have written | A test-diff guard |
| Rubric | Plans, designs, reviews, migration strategies | Drifting between applications, and flattening one critical failure into a good average | Gating criteria, re-scored anchors |
| Model-as-judge | Scaling rubric grading past human patience | Length, self-preference, position, sycophancy, fluency, rubric-ignoring | A deterministic grader, always |
| Human | Ground truth and calibration | Inconsistently, expensively, slowly | Itself, over time |

### Failure detail worth memorizing

**Pattern match.** `grep -q "retry"` passes on a comment reading `// TODO: add retry`. Once an
agent's instructions mention the grader's pattern, the pattern appears everywhere and measures
nothing. Use it as a fast negative filter, never as the only positive signal.

**Deterministic code graders.** The characteristic cheat is not writing wrong code, it is
weakening the check. An agent that adds a vacuous assertion passes; one that loosens an
assertion passes; one that deletes the failing test passes loudest of all. Guard the guards:

```bash
git diff --stat HEAD~1 -- '**/*.test.*' '**/*_test.*' 'tests/**'   # did the tests shrink?
git diff HEAD~1 | grep -E '^\-.*\b(expect|assert)\b'                # were assertions removed?
git diff HEAD~1 | grep -E '^\+.*\b(skip|xit|todo|@Ignore)\b'        # were tests skipped?
```

Better: the eval owns the test file, the agent may not modify it, and any diff to it is an
automatic fail.

**Rubric graders.** Two defenses hold. Anchor each score level with a concrete example so
"complete" means the same thing in March and in June, and mark critical criteria as gating
rather than averaging. When the rubric changes, re-score five old outputs so drift can be told
apart from improvement. [`skills/benchmark-methodology/`](../skills/benchmark-methodology/) is
worth reading for the rubric discipline even though its subject is competitive scoring rather
than agent output: it insists that the same evidence must earn the same number every time, and
that paired dimensions are reported separately rather than averaged. Both rules transfer.

**Model-as-judge.** More failure directions than any other grader.

| Bias | Effect | Mitigation |
| --- | --- | --- |
| Length preference | Longer answers score higher | Cap output length; score conciseness explicitly |
| Self-preference | A model rates its own family higher | Judge with a different model family |
| Position effect | One slot wins A/B comparisons | Randomize order, or run both orders and average |
| Sycophancy | "This is the improved version" raises the score | Blind the judge to which variant it sees |
| Fluency over correctness | Confident wrong code beats hedged right code | Never run it alone |
| Rubric ignoring | The judge scores its own preferences | Require a per-criterion quote from the output |

Two rules make it usable at all: never run it as the only grader, and calibrate it against
human grades on twenty outputs. Below roughly 80% agreement it is measuring something else.

**Self-assessment is not a grader.** [`skills/agent-self-evaluation/`](../skills/agent-self-evaluation/)
scores an output on accuracy, completeness, clarity, actionability, and conciseness with
evidence required per criterion. It is systematically generous. Treat it as triage — which
outputs deserve a human look — not as measurement. The external counterpart is the
[`agent-evaluator`](../agents/agent-evaluator.md) agent.

### Choosing a grader by task shape

| Task shape | Primary | Secondary |
| --- | --- | --- |
| Add a feature with tests | Deterministic: tests, build, typecheck | Test-diff guard |
| Fix a known bug | Deterministic: regression test | Pattern check at the fix site |
| Refactor | Deterministic: tests unchanged and green | Rubric on structure |
| Write a plan or design | Rubric | Model judge, blinded |
| Code review quality | Seeded-defect recall | Precision on a clean diff |
| Documentation | Rubric | Link and code-block validity |
| Refuse or escalate | Deterministic: did it stop? | Human spot check |

## Building a set from real sessions

Invented tasks measure your prompting, because they are the tasks you already know how to
prompt for. Mine work that actually happened.

| Source | Where | Yields |
| --- | --- | --- |
| Saved session records | `~/.claude/session-data/` | What was built, what failed, what remained |
| Session store | `node scripts/forge.js sessions` | The session index with metadata |
| Session snapshots | `node scripts/forge.js session-inspect` | Canonical snapshots per target |
| Skill run telemetry | `~/.claude/state/skill-runs.jsonl` | Which skills ran, versions, outcomes |
| Cost rows | `~/.claude/metrics/costs.jsonl` | Per-session model, tokens, estimated cost |
| Repository history | `git log --oneline --since='3 months ago'` | Real changes with the answer attached |
| Issue tracker | Closed bugs with a fixing commit | Defects with a known fix |

Git history is the richest source: a merged commit is a task with a verified answer. The parent
commit is the start state, the message is roughly the prompt, and the diff plus its tests are
the grader.

**Composition.** Ten to fifteen tasks. Fewer and noise dominates; more and the set stops being
run.

| Bucket | Share | Why it is there |
| --- | ---: | --- |
| Routine work the setup should nail | 40% | Detects broad regressions |
| Work it currently gets wrong | 30% | Detects the improvement you are trying to make |
| Sharp correctness edges | 20% | Timezones, pagination boundaries, empty input |
| Work that should be refused or escalated | 10% | Detects confident wrong answers |

That last bucket is the one everyone skips. A setup that confidently implements an
underspecified request is worse than one that asks a question, and no positive-only set will
notice.

**Task record.** [`skills/agent-eval/`](../skills/agent-eval/) uses a YAML shape worth adopting
regardless of runner. Four properties make a record usable: a pinned start commit, a verbatim
prompt, an executable judge, and per-run isolation. `agent-eval` gives each run its own
`git worktree` from the pinned commit, so runs cannot contaminate each other or the base
repository. Note its install caveat: it is an external tool to review and install from its own
repository, not a binary this project ships.

Keep the set in version control next to the code.

## Statistical care

A twelve-task set is small. Treating it as though it were large is how an eval program produces
confident nonsense.

**Non-determinism is the baseline condition.** The same prompt against the same commit produces
different output. Any conclusion from a single run is a conclusion about sampling. Run three
attempts per task; more if you can afford it, never fewer.

**Choose pass@k or pass^k deliberately.** They diverge fast.

```text
pass@k = 1 - (1 - p)^k          at least one of k attempts succeeds
pass^k = p^k                    all k attempts succeed

p = 0.70    k=1: 0.70    k=3: 0.97    k=5: 1.00     (pass@k)
p = 0.70    k=1: 0.70    k=3: 0.34    k=5: 0.17     (pass^k)
```

Use pass@k when a human will review the output and can retry: interactive coding, exploration,
drafting. Use pass^k when the workflow runs unattended and one failure is a real failure: CI
gates, automated reviews, scheduled agents. A setup that looks reliable under the first metric
can be close to useless under the second.

**Resolution.** With twelve tasks, one task's worth of movement is roughly eight percentage
points, and it is well inside run-to-run variance. A one-task change is noise. Two tasks moving
in the same direction across three runs each is a signal worth investigating. Nothing below
that is worth a decision.

**Measure the variance before setting a threshold.** Run the unchanged baseline three times on
three different days. The spread you observe is your noise floor, and a gate set tighter than
that noise floor produces flaky CI, which produces a disabled gate within two weeks.

**Per-task deltas, not aggregate.** Aggregate pass rate hides a swap: two tasks start passing,
two stop, the number is flat, and a regression shipped. Store per-task results and diff them.

**Hold one thing fixed.** Model version, skill edits, rule edits, `CLAUDE.md`, MCP servers, and
the harness itself all move independently. Re-run the baseline today, against the same setup,
before concluding anything about a number from last week.

**Report cost and latency alongside quality, always.** A change that raises pass rate by five
points while tripling cost is a decision, not an improvement, and it must be presented as one.

```text
  Eval set: core-12                Baseline: v1.10.0
  ────────────────────────────────────────────────────────────
                     baseline      candidate      delta
  pass@1              8/12          10/12         +2
  pass@3             11/12          12/12         +1
  consistency          72%            83%        +11pp
  cost / task          ...            ...       +188%
  wall-clock / task    ...            ...       +205%
  interventions          4              2          -2
```

**Metrics worth storing per run:** pass@1, pass@3, consistency (identical repeated runs that
succeed), cost per task, wall-clock per task, scope adherence, and human intervention count.
The last one often predicts whether anyone keeps using the setup better than any of the others.

## Wiring evals into CI

Run cheap deterministic checks first and fail fast. Model-based evals are slow and cost money;
most real breakage is caught before they start.

### Structural validation, seconds and free

These ship under [`../scripts/ci/`](../scripts/ci/) and run in
[`../.github/workflows/ci.yml`](../.github/workflows/ci.yml):

```bash
node scripts/ci/check-unicode-safety.js
node scripts/ci/validate-agents.js
node scripts/ci/validate-commands.js
node scripts/ci/validate-rules.js
node scripts/ci/validate-skills.js
node scripts/ci/validate-hooks.js hooks/hooks.json
node scripts/ci/validate-install-manifests.js
node scripts/ci/validate-no-personal-paths.js
node scripts/ci/validate-links.js
node scripts/ci/validate-workflow-security.js
node tests/run-all.js
```

`npm test` chains them in order and stops at the first failure. They catch malformed
frontmatter, broken relative links, manifest entries pointing at missing files, unsafe workflow
constructs, homoglyph and zero-width payloads, and hook registration errors.

### Gate shape

```text
  pull request
      │
      ▼
  ┌──────────────────────────┐
  │ structural validation    │   seconds, free, every PR
  └──────────┬───────────────┘
             │ pass
             ▼
  ┌──────────────────────────┐
  │ eval subset (3 tasks)    │   minutes, cheap, PRs touching
  │                          │   skills/ agents/ rules/ CLAUDE.md
  └──────────┬───────────────┘
             │ pass
             ▼
  ┌──────────────────────────┐
  │ full set (12 tasks x 3)  │   nightly or per release
  │ cost + latency recorded  │
  └──────────┬───────────────┘
             ▼
     compare to committed baseline, block on regression
```

### What to gate on which change

| Change | Gate |
| --- | --- |
| Skill body edited | Compliance rate for that skill |
| Agent definition edited | Seeded-defect recall and precision for that agent |
| Rule file edited | Full set — rules affect every turn |
| `CLAUDE.md` edited | Full set |
| Model or harness setting changed | Full set, plus cost and latency |
| New skill added | Context budget did not regress; no trigger overlap with an existing skill |

### Thresholds

| Gate | Suggested | Why |
| --- | --- | --- |
| Structural validation | Any failure blocks | Deterministic and free |
| Any previously-passing task now failing | Blocks regardless of aggregate | The swap-hiding case |
| Task pass rate | More than one task below baseline blocks | One task is inside noise |
| Cost per task | More than 25% above baseline blocks | Silent expense regressions |
| Wall-clock per task | More than 50% above baseline blocks | Silent latency regressions |
| Model-judge score | Advisory only, never a hard gate | Too noisy to gate on |

Commit the baseline as a dated JSON artifact tied to a commit, with per-task results, cost, and
duration. A baseline that lives only in a CI log cannot be compared or reproduced.

## What to do with a result you distrust

Work through this in order. The temptation is to jump to the last step.

1. **Is the difference real?** One task on a twelve-task set is noise. Compare pass@3 across
   three runs. If the delta sits inside run-to-run variance, nothing was measured.
2. **Did only one thing change?** Re-run the baseline today against the current setup before
   attributing anything to the change under test.
3. **Which tasks moved, and do they share a shape?** Four regressions all touching one subsystem
   points at a rule or a skill. Four scattered at random points at nondeterminism or a model
   change.
4. **Read one failing transcript end to end.** Not a summary. The usual discoveries: the skill
   never loaded, the session compacted mid-task, a tool call failed silently and the agent
   continued on a false premise, or the grader is wrong.
5. **Suspect the grader.** Re-grade three previously-passing outputs with the current grader. If
   they now fail, the grader moved, not the system. This is the single most common cause of a
   surprising regression.
6. **Suspect the set.** A task pinned to a six-month-old commit may no longer represent the
   codebase. Stale tasks decay into measuring history.
7. **Accept the result.** If it is real, attributable, and reproducible, the change made things
   worse. Revert it. Relitigating the measurement instead is exactly what the apparatus exists
   to resist.

A result you dislike and cannot explain is the only kind that tells you something you did not
already believe.

## Eval surfaces in this repository

Each was verified to exist at the path shown.

| Surface | What it is |
| --- | --- |
| [`skills/eval-harness/`](../skills/eval-harness/) | Eval-driven development for coding-session workflows: define expected behavior before implementation, run continuously, track regressions per change, use pass@k rather than a single run |
| [`skills/agent-eval/`](../skills/agent-eval/) | Head-to-head comparison of coding agents on your own tasks, reporting pass rate, cost, time, and consistency, with a fresh worktree per run from a pinned commit |
| [`skills/model-evaluation-harness/`](../skills/model-evaluation-harness/) | Building an eval harness for an LLM feature: stratified sampling from real traffic, grader selection and how each fails, CI regression gates, drift across model and prompt releases |
| [`skills/benchmark-methodology/`](../skills/benchmark-methodology/) | Rubric-scoring discipline for competitive analysis; its anchoring and never-average rules transfer directly to rubric graders |
| [`skills/skill-comply/`](../skills/skill-comply/) | Whether a skill is actually followed once loaded: generated scenarios at three prompt strictness levels, behavioral sequence classification, compliance rates with full tool-call timelines |
| [`skills/skill-stocktake/`](../skills/skill-stocktake/) | Quality and overlap audit across skills and commands, Quick Scan or Full Stocktake |
| [`skills/verification-loop/`](../skills/verification-loop/) | Session-level verification before completion is claimed |
| [`skills/delivery-gate/`](../skills/delivery-gate/) | Stop hook that blocks completion on rationalization patterns and a stale learning log |
| [`skills/agent-self-evaluation/`](../skills/agent-self-evaluation/) | Five-axis self-scorecard with evidence per criterion; triage, not measurement |
| [`commands/learn-eval.md`](../commands/learn-eval.md) | Quality gate and save-location decision before a learned pattern is written to a skill file |
| [`commands/skill-health.md`](../commands/skill-health.md) | Skill run telemetry dashboard: success sparklines, failure clustering, version history |
| [`scripts/hooks/evaluate-session.js`](../scripts/hooks/evaluate-session.js) | Stop hook that runs session evaluation automatically |
| [`scripts/skills-health.js`](../scripts/skills-health.js) | The dashboard behind `/skill-health`; `--dashboard`, `--panel`, and `--json` |

Two adjacent skills are frequently reached for by mistake.
[`skills/ab-testing-experimentation/`](../skills/ab-testing-experimentation/) is for randomized
measurement against live users, not for offline eval sets.
[`skills/llm-output-validation/`](../skills/llm-output-validation/) checks schema conformance of
a single response, which is a structural validator rather than an eval.

## Related pages

| Topic | Where |
| --- | --- |
| Why measurement beats impression, with a worked set | [`../guides/the-evaluation-guide.md`](../guides/the-evaluation-guide.md) |
| Cost and latency figures to report alongside quality | [COST-AND-MODEL-ROUTING.md](COST-AND-MODEL-ROUTING.md) |
| Verifying a multi-lane result | [ORCHESTRATION-PATTERNS.md](ORCHESTRATION-PATTERNS.md) |
| Context regressions behind a cost change | [CONTEXT-ENGINEERING.md](CONTEXT-ENGINEERING.md) |
| Writing a skill that triggers correctly | [SKILL-AUTHORING.md](SKILL-AUTHORING.md) |
| Writing an agent worth measuring | [AGENT-AUTHORING.md](AGENT-AUTHORING.md) |
| Failure modes an eval will not catch | [ANTI-PATTERNS.md](ANTI-PATTERNS.md) |
| Rolling evals out across a team | [TEAM-ADOPTION.md](TEAM-ADOPTION.md) |
