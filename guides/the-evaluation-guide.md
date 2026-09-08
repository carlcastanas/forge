# The evaluation guide

This guide is for anyone who has installed an agent system and now needs to know whether it helps. It covers why impressions fail as a measurement, how to build an eval set out of sessions you have already run, what each grader type gets wrong, how to evaluate skills, agents, and whole workflows as separate objects, and how to wire a regression gate that blocks a change rather than merely reporting on it.

**Prerequisites:** a working FORGE install, a few weeks of real sessions to mine, and a repository with a test suite and CI. Concepts from [getting started](getting-started.md) are assumed.

---

## Contents

- [Why vibes fail](#why-vibes-fail)
- [Three different objects](#three-different-objects)
- [Building an eval set from real sessions](#building-an-eval-set-from-real-sessions)
- [Graders and how each one lies](#graders-and-how-each-one-lies)
- [Metrics worth tracking](#metrics-worth-tracking)
- [Evaluating a skill](#evaluating-a-skill)
- [Evaluating an agent](#evaluating-an-agent)
- [Evaluating a whole workflow](#evaluating-a-whole-workflow)
- [Regression gates in CI](#regression-gates-in-ci)
- [Cost and latency alongside quality](#cost-and-latency-alongside-quality)
- [Interpreting a result you do not like](#interpreting-a-result-you-do-not-like)
- [Worked example — a twelve-task eval set](#worked-example--a-twelve-task-eval-set)
- [Anti-patterns](#anti-patterns)

---

## Why vibes fail

The standard way people assess an agent setup is to use it for a week and form an impression. That impression is unreliable for reasons that are structural, not personal.

**Nondeterminism hides both wins and losses.** The same prompt against the same repository produces different output. A single good run proves the setup *can* work, not that it *does*. A single bad run proves nothing at all. Any conclusion from n=1 is a conclusion about sampling.

**Salience is not frequency.** One dramatic failure — a deleted file, a confidently wrong refactor — will dominate your assessment of a hundred quiet successes. The reverse also happens: one impressive session sells a configuration that is mediocre on average.

**You changed too many things.** Between the week you disliked and the week you liked, you also updated the model, added four skills, edited `CLAUDE.md`, and started working on a different part of the codebase. Attribution is impossible without holding things fixed.

**Confirmation runs one direction.** After spending an afternoon writing a skill, you will notice the sessions where it helped.

**Improvement is silently traded away.** A change that raises pass rate by 5% while tripling cost and doubling latency feels better and is worse. Quality-only measurement cannot see this.

**Regression is invisible without a baseline.** Nothing in a coding agent tells you that yesterday's prompt stopped working. Without a recorded baseline, a regression looks like an unlucky day.

The fix is not elaborate. Ten fixed tasks, run three times each, graded the same way before and after a change, with cost and time recorded, will settle more arguments than a month of impressions. The `eval-harness` skill states the principle as eval-driven development: define expected behavior *before* implementation, run evals continuously, track regressions per change, and use pass@k for reliability rather than a single run.

---

## Three different objects

"Does FORGE work" is not a question with an answer. Three separate objects need separate evaluation, and conflating them produces results you cannot act on.

```text
  ┌──────────────────────────────────────────────────────────────┐
  │ WORKFLOW    plan -> test -> implement -> review -> verify     │
  │             Question: does the end-to-end outcome improve?    │
  │             Grader: deterministic checks on the final repo    │
  │  ┌────────────────────────────────────────────────────────┐   │
  │  │ AGENT     a delegated specialist with its own window   │   │
  │  │           Question: does it find what it should find?  │   │
  │  │           Grader: seeded-defect recall, precision      │   │
  │  │  ┌──────────────────────────────────────────────────┐  │   │
  │  │  │ SKILL   a playbook the model may or may not load  │  │   │
  │  │  │         Question: does it trigger, and is it      │  │   │
  │  │  │         followed once loaded?                     │  │   │
  │  │  │         Grader: trigger rate, compliance rate     │  │   │
  │  │  └──────────────────────────────────────────────────┘  │   │
  │  └────────────────────────────────────────────────────────┘   │
  └──────────────────────────────────────────────────────────────┘
```

| Object | Failure modes | Primary metric | FORGE surface |
|---|---|---|---|
| Skill | Never triggers; triggers too often; ignored once loaded | Trigger rate, compliance rate | `skill-comply`, `skill-stocktake`, `/skill-health` |
| Agent | Misses real findings; reports false ones; ignores its scope | Recall, precision, scope adherence | `agent-eval`, `agent-evaluator` |
| Workflow | Right steps, wrong result; passes tests that assert nothing | Task pass rate, pass@k | `eval-harness`, `verification-loop` |

A skill that never triggers looks identical, from the workflow level, to a skill that triggers and is ignored. The remedies are opposite: the first needs a better description, the second needs firmer instructions or a hook. Only skill-level evaluation distinguishes them.

---

## Building an eval set from real sessions

Do not invent tasks. Invented tasks are the ones you already know how to prompt for, so they measure your prompting rather than the system. Mine tasks from work that actually happened.

### Where the material is

| Source | Command | Yields |
|---|---|---|
| Saved session records | `ls ~/.claude/session-data/` | What was built, what failed, what remained |
| Session store | `node scripts/forge.js sessions` | Session index with metadata |
| Session snapshots | `node scripts/forge.js session-inspect` | Canonical snapshots for a target |
| Skill run telemetry | `~/.claude/state/skill-runs.jsonl` | Which skills ran, versions, outcomes |
| Cost rows | `~/.claude/metrics/costs.jsonl` | Per-session model, tokens, cost |
| Repository history | `git log --oneline --since='3 months ago'` | Real changes, with the answer attached |
| Issue tracker | Closed bugs with a fixing commit | Defects with a known fix |

The richest source is your own git history. A merged commit is a task with a verified answer: the parent commit is the starting state, the message is roughly the prompt, and the diff plus its tests are the grader.

### Selecting the twelve

Aim for ten to fifteen tasks. Fewer and noise dominates; more and you will stop running the set.

| Bucket | Share | Example |
|---|---:|---|
| Routine work the setup should nail | 40% | Add a field with tests; fix a typed error |
| Work it currently gets wrong | 30% | The refactor it botched last month |
| Work with a sharp correctness edge | 20% | Timezone handling; pagination boundaries |
| Work that should be refused or escalated | 10% | Ambiguous spec; a change requiring a migration |

That last bucket is the one everyone skips and the one that catches the most damage. A setup that confidently implements an underspecified request is worse than one that asks a question, and no positive-only eval set will notice.

### The task record

Every task pins a starting commit so runs are comparable. `agent-eval` uses a YAML shape worth adopting whatever tooling you end up with:

```yaml
name: add-retry-logic
description: Add exponential backoff retry to the HTTP client
repo: ./my-project
commit: abc1234          # pin for reproducibility
files:
  - src/http_client.py
prompt: |
  Add retry logic with exponential backoff to all HTTP requests.
  Max 3 retries. Initial delay 1s, max delay 30s.
judge:
  - type: pytest
    command: pytest tests/test_http_client.py -v
  - type: grep
    pattern: "exponential_backoff|retry"
    files: src/http_client.py
```

Four properties make a task record usable:

- **Pinned start state.** Without a commit, you are grading against a moving repository.
- **Verbatim prompt.** Rewrite the prompt and you have changed the experiment.
- **Executable judge.** A judge that requires a human to read the diff will not run at 3am in CI.
- **Isolation.** `agent-eval` gives each run its own `git worktree` — no Docker needed — so runs cannot contaminate each other or the base repository.

Keep the set in version control next to the code. An eval set nobody can find is an eval set nobody runs.

---

## Graders and how each one lies

Every grader is wrong in a characteristic direction. Knowing the direction is what makes the number usable.

### Exact match and pattern match

Compare output to an expected string, or grep for a required pattern.

**Good for:** structured output, required identifiers, forbidden constructs, file existence.

**How it lies:** it rejects correct answers that differ cosmetically, and accepts wrong answers that contain the right token. `grep -q "retry"` passes on a comment reading `// TODO: add retry`. It also invites gaming — once an agent's instructions mention the grader's pattern, the pattern appears everywhere and measures nothing.

**Use it as a fast negative filter,** never as your only positive signal.

### Deterministic code graders

Run the build, the type checker, the linter, the test suite. From `eval-harness`:

```bash
npm test -- --testPathPattern="auth" && echo "PASS" || echo "FAIL"
npm run build && echo "PASS" || echo "FAIL"
grep -q "export function handleAuth" src/auth.ts && echo "PASS" || echo "FAIL"
```

**Good for:** the majority of coding tasks. Cheap, reproducible, non-negotiable.

**How it lies:** it grades what the tests assert, and the agent may have written the tests. An agent that adds `expect(true).toBe(true)` passes. An agent that weakens an assertion to make a red test green passes. An agent that deletes a failing test passes loudest of all.

**Defenses:**

```bash
git diff --stat HEAD~1 -- '**/*.test.*' '**/*_test.*' 'tests/**'   # did tests shrink?
git diff HEAD~1 | grep -E '^\-.*\b(expect|assert)\b'                # were assertions removed?
git diff HEAD~1 | grep -E '^\+.*\b(skip|xit|todo|@Ignore)\b'        # were tests skipped?
```

Better still, hold the tests fixed: the eval owns the test file, the agent may not modify it, and any diff to it is an automatic fail. `/test-coverage` reports gaps against a target threshold, which catches the "passes but covers nothing" case.

### Rubric graders

A written scorecard applied per output. `agent-self-evaluation` uses five axes — accuracy, completeness, clarity, actionability, conciseness — each scored 1–5 with concrete evidence per criterion.

**Good for:** open-ended output where there is no single correct answer: a plan, a review, a design document, a migration strategy.

**How it lies:** rubrics drift. The same rubric applied by the same grader two weeks apart produces different numbers, because the interpretation of "complete" moved. Rubrics also flatten — a task that fails one critical criterion and excels at four scores well overall, when the correct verdict is fail.

**Defenses:** anchor each score level with a concrete example, keep rubrics under six criteria, and mark critical criteria as gating rather than averaging. Re-score five old outputs whenever you change the rubric, so you can tell drift from improvement.

### Model-as-judge

Ask a model to grade the output. From `eval-harness`:

```markdown
[MODEL GRADER PROMPT]
Evaluate the following code change:
1. Does it solve the stated problem?
2. Is it well-structured?
3. Are edge cases handled?
4. Is error handling appropriate?

Score: 1-5 (1=poor, 5=excellent)
Reasoning: [explanation]
```

**Good for:** scaling rubric grading past what a human will sit through; catching qualitative regressions.

**How it lies:** more ways than any other grader.

| Bias | Effect | Mitigation |
|---|---|---|
| Length preference | Longer answers score higher | Cap output length; score conciseness explicitly |
| Self-preference | A model rates its own family's output higher | Use a different model family as judge |
| Position effects | In A/B comparisons, one slot wins more | Randomize order; run both orders and average |
| Sycophancy | Framing "this is the improved version" raises the score | Blind the judge to which variant it is grading |
| Fluency over correctness | Confident wrong code beats hedged right code | Pair with a deterministic grader; never run alone |
| Rubric ignoring | The judge scores its own preferences | Require a per-criterion quote from the output |

Two rules make model-as-judge usable. **Never run it alone** — pair every model-judged eval with at least one deterministic check. And **calibrate it against humans**: grade twenty outputs by hand, compare, and if agreement is below roughly 80% the judge is measuring something else.

### Human graders

`eval-harness` treats these as a first-class type with an explicit escalation shape:

```markdown
[HUMAN REVIEW REQUIRED]
Change: Description of what changed
Reason: Why human review is needed
Risk Level: LOW/MEDIUM/HIGH
```

**Good for:** the ground truth that calibrates every other grader, and anything security- or judgment-critical.

**How it lies:** inconsistently, expensively, and slowly. Two engineers disagree; one engineer disagrees with themselves after lunch.

**Use it deliberately:** to establish the baseline, to calibrate the model judge, and to adjudicate disagreements between graders. Never as your routine per-run grader.

### Choosing

| Task shape | Primary | Secondary |
|---|---|---|
| Add a feature with tests | Deterministic (tests, build, typecheck) | Test-diff guard |
| Fix a known bug | Deterministic (regression test) | Pattern check on the fix site |
| Refactor | Deterministic (tests unchanged and green) | Rubric on structure |
| Write a plan or design | Rubric | Model judge, blinded |
| Code review quality | Seeded-defect recall | Precision on a clean diff |
| Documentation | Rubric | Link and code-block validity checks |
| Refuse or escalate | Deterministic (did it stop?) | Human spot check |

---

## Metrics worth tracking

**pass@k.** "At least one success in k attempts." `pass@1` is single-shot reliability; `pass@3` is what you experience when you are willing to retry. `eval-harness` suggests targeting `pass@3 > 90%`. A large gap between `pass@1` and `pass@3` means the setup is capable but inconsistent, which is a prompt or context problem, not a capability problem.

**Consistency.** Pass rate across repeated identical runs — 3/3 is 100%. This is the single most informative number for an agent setup, and it is invisible to any single-run evaluation.

**Cost per task.** From `~/.claude/metrics/costs.jsonl` via `/cost-report`.

**Wall-clock per task.** What the human actually waits.

**Scope adherence.** Files changed versus files the task should touch. A task that passes while modifying twelve unrelated files has not passed.

**Human intervention count.** How many times a person had to correct course. Often the number that best predicts whether anyone keeps using the setup.

The composite that matters:

```text
                    pass@1 x consistency
  value  =  ────────────────────────────────────
             cost per task  x  (1 + interventions)
```

Do not compute this literally. Do refuse to report pass rate without cost and latency beside it — a change that improves quality by 5% and triples cost is a decision, not an improvement, and it should be presented as one.

---

## Evaluating a skill

A skill has two independent failure points, and they need separate measurements.

### Does it trigger?

The description is the trigger. Test it with prompts that should and should not activate the skill.

```text
Should trigger:      "add a retry with backoff to the HTTP client"
Should trigger:      "this API call fails intermittently, make it resilient"
Should NOT trigger:  "retry the deploy"
Should NOT trigger:  "explain how exponential backoff works"
```

Run each, record whether the skill loaded. Under 70% on the should-trigger set means the description is too narrow. Any hits on the should-not set mean it is too broad, and a skill that loads when it is not needed is pure context cost.

Telemetry backs this up. The `post:skill:track` PostToolUse hook records every Skill invocation to `~/.claude/state/skill-runs.jsonl` — skill id, version, and outcome only, never prompt text. The dashboard reads it:

```bash
node scripts/skills-health.js --dashboard
node scripts/skills-health.js --dashboard --panel failures
node scripts/skills-health.js --json
```

Or `/skill-health` from inside a session. Panels cover success-rate sparklines, failure-pattern clustering, pending amendments, and version history. A skill with zero runs after a month either has a bad description or should not exist.

### Is it followed once loaded?

This is the question most people never ask, and the answer is frequently no. The `skill-comply` skill measures it directly: it auto-generates scenarios at three prompt strictness levels, runs agents against them, classifies the resulting behavioral sequences, and reports compliance rates with full tool-call timelines.

The three strictness levels are the useful part. A skill followed only when the user's prompt already restates its rules is not doing any work.

| Strictness | Prompt shape | What compliance means |
|---|---|---|
| Loose | Task only, no mention of process | The skill is genuinely load-bearing |
| Medium | Task plus a nudge toward the process | Normal operating conditions |
| Strict | Task plus explicit instructions | Ceiling — non-compliance here is a broken skill |

Read the tool-call timeline, not just the percentage. A skill that mandates tests-first and shows Write before Bash in the timeline has been reordered, not followed, even if the tests exist at the end.

### Is it worth keeping?

The `skill-stocktake` skill audits skills and commands for quality, in Quick Scan mode (changed skills only) or Full Stocktake mode, using sequential subagent batch evaluation. Run Quick Scan after edits and Full Stocktake quarterly.

Kill criteria, applied honestly:

- Zero invocations in the last month
- Compliance below 50% at medium strictness
- Content substantially duplicated by another skill
- Over 400 lines with no clear on-demand trigger
- Its guidance is an invariant, in which case `rules-distill` should fold it into a rule

---

## Evaluating an agent

An agent is a specialist. Grade it on the specialty, not on general helpfulness.

### Seeded defects

For a reviewer agent, the only honest test is defects you planted.

1. Take a clean commit.
2. Introduce N known defects across categories — an off-by-one, a swallowed exception, a missing null check, an injectable query, a race, a resource leak.
3. Run the agent against the diff.
4. Score recall (found ÷ planted) and precision (true findings ÷ total findings).

Recall alone is gameable: an agent that reports forty findings on a ten-defect diff will find most of them and be useless. Precision alone is gameable in the opposite direction. Track both, and run the agent against an unmodified diff to measure the false-positive floor — the number of findings it produces on code with nothing wrong with it.

| Agent | Seeded defect class | Also measure |
|---|---|---|
| `code-reviewer` | Mixed correctness defects | Precision on a clean diff |
| `security-reviewer` | Injection, authz gaps, secret exposure | Recall on the `rules/common/security.md` trigger list |
| `silent-failure-hunter` | Swallowed exceptions, ignored returns | False positives on intentional catches |
| `type-design-analyzer` | Loose unions, over-wide types | Findings that are actually actionable |
| `pr-test-analyzer` | Tests asserting nothing | Detection of deleted or skipped tests |
| `database-reviewer` | N+1, missing index, unsafe migration | Precision on a clean schema change |
| `build-error-resolver` | Real build breakages | Fix rate without weakening config |

### Head-to-head comparison

The `agent-eval` skill compares coding agents on your own tasks and reports pass rate, cost, time, and consistency:

```bash
agent-eval run --task tasks/add-retry-logic.yaml --agent claude-code --agent aider --runs 3
agent-eval report --format table
```

Each run gets a fresh worktree from the pinned commit, the prompt is handed to the agent, judges run, and pass/fail, cost, and time are recorded. Note the install caveat in the skill: `agent-eval` is an external tool to be installed from its repository after reviewing the source, not something FORGE ships as a binary.

### Structured self-assessment

`agent-self-evaluation` has the agent rate its own output on the five axes with evidence per criterion, producing a 1–5 scorecard and specific improvement suggestions. Self-assessment is systematically generous — it is a triage signal for which outputs deserve human attention, not a quality measurement. The `agent-evaluator` agent provides the external counterpart.

---

## Evaluating a whole workflow

Workflow evaluation asks a blunter question: starting from commit X, with prompt P, does the repository end up in an acceptable state?

`eval-harness` distinguishes two kinds.

**Capability evals** — can it do something it could not before?

```markdown
[CAPABILITY EVAL: tenant-rate-limiting]
Task: Add per-tenant rate limiting to the orders API
Success Criteria:
  - [ ] Limits are configurable per tenant
  - [ ] Exceeding the limit returns 429 with a Retry-After header
  - [ ] Tests cover both under-limit and over-limit paths
  - [ ] No changes outside src/middleware/ and its tests
Expected Output: Middleware plus tests; existing suite still green
```

**Regression evals** — did a change break what worked?

```markdown
[REGRESSION EVAL: core-tasks]
Baseline: v1.10.0
Tests:
  - add-field-with-tests: PASS/FAIL
  - fix-typed-error: PASS/FAIL
  - refuse-ambiguous-spec: PASS/FAIL
Result: X/Y passed (previously Y/Y)
```

Grade the *end state*, not the transcript. The workflow is allowed to reach a good result by an unexpected route. Four checks, in order:

```bash
git diff --name-only main...HEAD          # scope: only expected paths
npm run typecheck && npm run lint          # integrity: still coherent
npm test                                   # correctness: suite green
git diff main...HEAD -- '**/*.test.*'      # honesty: tests not weakened
```

Then apply the acceptance criteria. The `verification-loop` skill formalizes this as a session-level check before claiming completion, and `delivery-gate` enforces it mechanically as a Stop hook that blocks completion when it detects rationalization patterns in the surface text or a stale learning log.

For workflows with a rubric rather than a test suite, `/gan-build` runs the generator/evaluator loop: `gan-generator` produces, `gan-evaluator` scores against `gan-harness/eval-rubric.md`, feedback lands in `gan-harness/feedback/feedback-NNN.md`, and it repeats until the score passes or plateaus. Defaults are `--max-iterations 15` and `--pass-threshold 7.0`, with `--eval-mode playwright` for UI work and `code-only` otherwise. `/gan-design` sets up the rubric. The plateau condition matters as much as the threshold: a loop that stops improving should stop running.

For review workflows, `/orch-review` runs the multi-dimension review wave and returns findings split into blocking and advisory. Evaluate it the same way as a single reviewer — seeded defects, recall and precision — but on the merged, deduplicated finding set, since deduplication is where a review wave usually loses recall.

---

## Regression gates in CI

An eval that reports is a dashboard. An eval that blocks is a gate. Only the second one prevents anything.

### What to gate

| Change | Gate on |
|---|---|
| Edit to a skill body | `skill-comply` compliance rate for that skill |
| Edit to an agent definition | Seeded-defect recall and precision for that agent |
| Edit to a rule file | Full workflow eval set — rules affect everything |
| Edit to `CLAUDE.md` | Full workflow eval set |
| Model or setup change | Full workflow eval set, plus cost and latency |
| New skill added | Context budget did not regress; no trigger overlap with an existing skill |

### Structural validation first

Model-based evals are slow and cost money. Run the deterministic structural checks first and fail fast. FORGE ships these under `scripts/ci/` and they run in `.github/workflows/ci.yml`:

```bash
node scripts/ci/validate-skills.js
node scripts/ci/validate-agents.js
node scripts/ci/validate-commands.js
node scripts/ci/validate-hooks.js hooks/hooks.json
node scripts/ci/validate-rules.js
node scripts/ci/validate-links.js
node scripts/ci/validate-install-manifests.js
node scripts/ci/validate-workflow-security.js
node scripts/ci/check-unicode-safety.js
node tests/run-all.js
```

These catch malformed frontmatter, broken relative links, manifest entries pointing at files that do not exist, unsafe workflow constructs, and hook configuration errors. They are cheap, deterministic, and catch a large share of real breakage before any model runs.

### Gate shape

```text
  pull request
      │
      ▼
  ┌─────────────────────────┐
  │ structural validation   │  seconds, free
  └───────────┬─────────────┘
              │ pass
              ▼
  ┌─────────────────────────┐
  │ eval subset (3 tasks)    │  minutes, cheap
  │ every PR                 │
  └───────────┬─────────────┘
              │ pass
              ▼
  ┌─────────────────────────┐
  │ full set (12 tasks x3)   │  nightly / release
  │ cost + latency recorded  │
  └───────────┬─────────────┘
              │
              ▼
     compare to baseline, block on regression
```

### Thresholds that survive contact

Set them from measured variance, not from ambition.

| Gate | Suggested threshold |
|---|---|
| Structural validation | Any failure blocks |
| Task pass rate | More than one task below baseline blocks |
| Any previously-passing task now failing | Blocks, regardless of aggregate |
| Cost per task | More than 25% above baseline blocks |
| Wall-clock per task | More than 50% above baseline blocks |
| Model-judge score | Advisory only — never a hard gate |

The second row is the important one. Aggregate pass rate hides a swap: two tasks start passing, two stop, the number is flat, and you have shipped a regression. Track per-task deltas, not just the total.

Run three attempts per task in the nightly job and gate on pass@3 rather than pass@1. A single-run gate on a nondeterministic system produces flaky CI, and a flaky gate is disabled within two weeks.

Record the baseline as a committed artifact — a JSON file with per-task results, cost, and duration, dated and tied to a commit. A baseline living only in a CI log is not a baseline.

---

## Cost and latency alongside quality

Report the three together, always. A quality number alone is not a result.

```text
  Eval set: core-12                Baseline: v1.10.0
  ────────────────────────────────────────────────────────────
                     baseline      candidate      delta
  pass@1              8/12          10/12         +2
  pass@3             11/12          12/12         +1
  consistency          72%            83%        +11pp
  cost / task         $0.41          $1.18       +188%
  wall-clock / task    3m10s          9m40s      +205%
  interventions          4              2          -2
```

That candidate is better and may still be the wrong choice. Whether a 188% cost increase buys enough is a decision the numbers inform and do not make — but nobody can make it without the bottom two rows.

Where the numbers come from:

```text
/cost-report          # per day, model, and session from ~/.claude/metrics/costs.jsonl
/cost-report csv      # export recent rows
```

The tracker writes one cumulative snapshot per session-stop via the `stop:cost-tracker` hook. The report takes the latest row per `session_id` and sums across sessions; summing every row multiply-counts, which is why the command exists rather than a shell one-liner.

Wall-clock is measured by the eval runner. `agent-eval` records it per run alongside cost and pass rate.

Common cost regressions and their causes:

| Symptom | Likely cause |
|---|---|
| Cost up, quality flat | Model tier raised, or `MAX_THINKING_TOKENS` raised |
| Cost up, latency up, quality up slightly | Extra review or verification passes added |
| Cost up sharply on a subset | A skill triggering when it should not, loading a large body |
| Latency up, cost flat | More sequential steps, or a slow MCP server in the path |
| Cost up across the board after adding components | Context overhead — audit with `context-budget` |

---

## Interpreting a result you do not like

The eval says the change made things worse. Work through this in order rather than reaching for the last step first.

**1. Is the difference real?** With 12 tasks, a one-task change is noise. Run three attempts per task and compare pass@3. If the delta lives inside run-to-run variance, you have measured nothing.

**2. Did only one thing change?** Model version, skill edits, rule edits, `CLAUDE.md`, MCP servers, and the harness itself all move. Re-run the baseline *today* against the same setup before concluding anything about yesterday's number.

**3. Which tasks moved, and do they share a shape?** Per-task deltas are the diagnostic. Four tasks regressing, all touching the same subsystem, points at a rule or a skill. Four regressing at random points at nondeterminism or a model change.

**4. Read one failing transcript end to end.** Not a summary — the transcript. The usual discoveries: the skill never loaded, the agent ran out of context and compacted mid-task, a tool call failed silently and the agent proceeded on a false premise, or the grader is wrong.

**5. Check whether the grader is at fault.** A "regression" is frequently a grader that got stricter, a test the eval owns that drifted, or a model judge whose preferences shifted. Re-grade three old passing outputs with the current grader. If they now fail, the grader moved, not the system.

**6. Check whether the eval set is stale.** A task pinned to a commit from six months ago may no longer represent your codebase. Stale tasks decay into measuring history.

**7. Accept the result.** If the difference is real, attributable, and reproducible, the change made things worse. Revert it. This is the point of the whole apparatus, and the temptation to relitigate the measurement instead is exactly what evals exist to resist.

A result you dislike and cannot explain is more valuable than one you like. It is the only kind that tells you something you did not already believe.

---

## Worked example — a twelve-task eval set

Building one for a TypeScript service, end to end.

**Step 1 — Mine the material.**

```bash
git log --oneline --since='6 months ago' --no-merges | head -60
ls ~/.claude/session-data/ | tail -30
node scripts/skills-health.js --json > /tmp/skill-health.json
```

Look for commits that were self-contained, had tests, and would make a reasonable request.

**Step 2 — Pick twelve across the buckets.**

```text
Routine (5)
  T01  add an optional field to an API response, with tests
  T02  fix a type error introduced by a dependency bump
  T03  add a unit test for an uncovered branch
  T04  rename a function and update all call sites
  T05  add structured logging to one handler

Known-hard (4)
  T06  extract a service from a 600-line controller
  T07  fix a pagination off-by-one at the last page
  T08  make a flaky timezone test deterministic
  T09  add a DB index and the migration for it

Sharp edges (2)
  T10  handle empty and null input in a parser
  T11  fix an N+1 in the orders list endpoint

Should refuse or ask (1)
  T12  "make the checkout faster" with no metric or target
```

**Step 3 — Write the task records.** One YAML per task, each pinning a commit, quoting the prompt verbatim, and naming an executable judge. T12's judge is inverted: it passes when the agent asks a clarifying question or produces a measurement plan, and fails when it edits code.

**Step 4 — Establish the baseline.**

```bash
agent-eval run --task tasks/ --agent claude-code --runs 3
agent-eval report --format table > evals/baseline-$(date +%F).txt
git add evals/ && git commit -m "test: record eval baseline"
```

**Step 5 — Add cost and latency.** Pull cost from `/cost-report` for the window the run covered; the runner supplies wall-clock. Record both in the baseline file.

**Step 6 — Wire the gate.** Structural validation on every PR. Three tasks — one routine, one known-hard, T12 — on every PR touching `skills/`, `agents/`, `rules/`, or `CLAUDE.md`. All twelve nightly. Block on any previously-passing task failing.

**Step 7 — Maintain it.** Retire a task when it has passed 3/3 for three consecutive months; it has stopped carrying information. Add a task every time a real session fails in a way the set would not have caught. The set should track your actual failure modes, which move.

---

## Anti-patterns

| Anti-pattern | Why it fails | Instead |
|---|---|---|
| Evaluating by impression | n=1 on a nondeterministic system | Ten tasks, three runs each |
| One run per task | Cannot distinguish capability from luck | pass@3 and consistency |
| Only positive tasks | Never catches confident wrong answers | 10% should-refuse tasks |
| Letting the agent write the grading tests | Grades itself | Eval owns the tests; diffs to them fail |
| Model judge with no deterministic check | Rewards fluent wrongness | Always pair |
| The judge is the same model family | Self-preference bias | Different family, blinded |
| Quality without cost and latency | Hides expensive regressions | Report all three |
| Aggregate pass rate only | Hides equal-and-opposite swaps | Per-task deltas |
| Eval set never changes | Decays into measuring history | Retire solved tasks, add new failures |
| Eval set changes every run | Nothing is comparable | Version it; date the baseline |
| Gate on a model-judge score | Flaky CI, then a disabled gate | Judge advisory; deterministic gates |
| Baseline lives in a CI log | Cannot be compared or reproduced | Commit it as a dated artifact |
| Rewriting the eval when it disagrees | Removes the only corrective signal | Investigate first, revert if real |

---

## Related reading

| Topic | Where |
|---|---|
| Reference form of this material | [`../docs/EVALUATION-GUIDE.md`](../docs/EVALUATION-GUIDE.md) |
| Verifying multi-agent output | [the orchestration guide](the-orchestration-guide.md) |
| Context regressions behind cost changes | [the context guide](the-context-guide.md) |
| Cost and model routing | [`../docs/COST-AND-MODEL-ROUTING.md`](../docs/COST-AND-MODEL-ROUTING.md) |
| Writing skills that trigger correctly | [`../docs/SKILL-AUTHORING.md`](../docs/SKILL-AUTHORING.md) |
| Writing agents worth measuring | [`../docs/AGENT-AUTHORING.md`](../docs/AGENT-AUTHORING.md) |
| Failure modes evals will not catch | [`../docs/ANTI-PATTERNS.md`](../docs/ANTI-PATTERNS.md) |
| Security review as a graded activity | [the security guide](the-security-guide.md) |
| Rolling evals out across a team | [`../docs/TEAM-ADOPTION.md`](../docs/TEAM-ADOPTION.md) |
