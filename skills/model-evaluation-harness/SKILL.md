---
name: model-evaluation-harness
description: Build an evaluation harness for an LLM feature — sampling an eval set from real traffic, choosing graders (exact match, programmatic rubric, model-as-judge) and knowing how each fails, wiring regression gates into CI, and tracking drift across model and prompt releases. Use when the user asks how to test an LLM feature, build an eval set, use an LLM as a judge, stop prompt changes from regressing, or measure quality across model versions.
metadata:
  origin: FORGE
---

# Model Evaluation Harness

Without evals, an LLM feature changes by feel: someone edits a prompt, tries three
examples, ships. A harness replaces that with a fixed set, a grader, and a threshold
that blocks a merge. The hard parts are not the runner — they are building a set that
represents real usage, and knowing which grader lies to you. Done means a versioned set
drawn from production, per-case scores stored over time, and a CI gate that fails on
regression rather than on noise.

## When to activate

- An LLM feature is going to production, or is already there without tests
- Changing a prompt, a model version, a tool definition, or a retrieval strategy
- Quality complaints arrive but no measurement exists, or CI is being set up for a
  repository containing prompts or agent definitions
- User says "eval", "LLM as judge", "how do I test the prompt", "did the new model
  regress", "golden set", "benchmark my agent"

## When NOT to use

- Evaluating a coding-session workflow's task completion — use
  [eval-harness](../eval-harness/SKILL.md); for an agent's trajectory and tool use, use
  [agent-eval](../agent-eval/SKILL.md)
- Measuring a change against live users with randomization — use
  [ab-testing-experimentation](../ab-testing-experimentation/SKILL.md)
- Retrieval recall specifically — see [rag-architecture](../rag-architecture/SKILL.md)
- Schema conformance of one response — use
  [llm-output-validation](../llm-output-validation/SKILL.md)

## Prerequisites

- Production logging of inputs and outputs, with a retention window and consent to use
  them for evaluation
- A budget line: a model-graded suite of 300 cases per pull request is a recurring cost
- Someone who can adjudicate disagreements and act as the ground truth of last resort

## Process

### 1. Build the eval set from traffic, not from imagination

Hand-written cases encode what the author expected. Production traffic contains what
users do, which is where the failures are.

```python
import random
from collections import defaultdict

def sample_eval_set(traces, n=300, seed=17):
    """Stratified sample: keep rare-but-important slices from being averaged away."""
    buckets = defaultdict(list)
    for t in traces:
        buckets[(t.intent, t.length_bucket, t.had_error)].append(t)
    rng = random.Random(seed)
    out, per_bucket = [], max(1, n // max(len(buckets), 1))
    for _, items in sorted(buckets.items()):
        out += rng.sample(items, min(per_bucket, len(items)))
    return out[:n]
```

Composition that produces a useful set: 60% frequency-weighted so the score tracks the
typical experience; 25% known failure modes, where every bug report becomes a case; 10%
edge and adversarial (empty input, very long input, other languages, ambiguous requests,
injection attempts — see
[prompt-injection-defense](../prompt-injection-defense/SKILL.md)); and 5% where the
correct answer is a refusal or "I do not know".

Scrub personal data before committing. Store as versioned JSONL beside the code, with a
stable `case_id` per row so score history can be joined across runs.

```jsonl
{"case_id":"ret-0143","input":{"query":"refund a partially shipped order"},"context_ids":["kb-88","kb-91"],"expect":{"must_mention":["partial refund","original payment method"],"must_not":["store credit"],"reference":"Partially shipped orders are refunded per item to the original payment method."},"tags":["billing","top-intent"],"added":"2026-03-14","source":"ticket-40221"}
```

Start at 50 cases. That catches gross regressions on day one, and a set that exists
beats one still being designed. Grow it every time something breaks in production.

### 2. Pick the cheapest grader that can detect the failure

| Grader | Detects | Fails on | Cost |
| --- | --- | --- | --- |
| Exact / normalized match | Classification, extraction, enum outputs | Any valid paraphrase | Free |
| Programmatic assertion | Schema validity, required substrings, forbidden terms, numeric tolerance, latency, cost | Meaning | Free |
| Model-as-judge, pairwise | "Which of these two is better" | Position and verbosity bias | Per case |
| Model-as-judge, reference-scored | Correctness against a written reference | Judge drift; human agreement must be measured | Per case |
| Human | Everything, definitively | Throughput and consistency | High |

Layer them. A case that fails a programmatic assertion never reaches a judge — it is
already a failure, and paying a model to confirm it wastes budget and adds variance.

```python
def grade(case, output):
    checks = {
        "valid_schema":  schema_ok(output),
        "no_forbidden":  not any(t in output.text.lower() for t in case.expect.must_not),
        "has_required":  all(t in output.text.lower() for t in case.expect.must_mention),
        "cited_sources": set(output.citations) <= set(case.context_ids),
        "under_latency": output.latency_ms < 4000,
    }
    if not all(checks.values()):
        return {"pass": False, "checks": checks, "judge": None}
    verdict = judge_against_reference(case.expect.reference, output.text)
    return {"pass": verdict.score >= 4, "checks": checks, "judge": verdict}
```

### 3. Treat the judge as a model that needs its own evaluation

```python
JUDGE = """Compare the candidate answer to the reference. Score correctness only;
ignore style, length, and tone.

5 fully correct and complete
4 correct, minor omission
3 partially correct, one material gap
2 mostly incorrect
1 contradicts the reference or fabricates a fact

Reference:
{reference}

Candidate:
{candidate}

Respond with JSON: {{"score": <1-5>, "reason": "<one sentence>"}}"""
```

A model-as-judge is an unvalidated classifier until measured against human labels.
Controls that make one usable:

- Human-label 50 cases and compute agreement (Cohen's kappa) with the judge. Below
  roughly 0.7, fix the rubric before trusting the number; re-validate whenever the
  rubric or judge model changes.
- Anchor the scale with a written definition per level. An unanchored 1-10 scale
  produces 7 for almost everything.
- Ask for the score, not a paragraph ending in a score, unless the reasoning is itself
  consumed. Force JSON and validate it.
- For pairwise comparisons, run both orderings and discard cases where the verdict
  flips. Position bias is real and asymmetric.
- Judge with a different model family than you generate with where feasible;
  self-preference is documented. Pin the judge version — a silent upgrade makes every
  historical score incomparable.

Expect these biases: longer answers score higher, confident phrasing scores higher, and
answers matching the judge's own style score higher. None correlate with correctness.

### 4. Run the suite as a gate in CI

```yaml
# .github/workflows/eval.yml
name: eval
on:
  pull_request:
    paths: ["prompts/**", "src/llm/**", "evals/**"]

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pip install -e ".[eval]"
      - name: Run eval suite
        env:
          MODEL_ID: ${{ vars.MODEL_ID }}          # pinned, not "latest"
          JUDGE_MODEL_ID: ${{ vars.JUDGE_MODEL_ID }}
        run: |
          python -m evals.run --set evals/core.jsonl --repeats 3 \
            --baseline evals/baselines/main.json --out results.json
      - uses: actions/upload-artifact@v4
        with: { name: eval-results, path: results.json }
```

Gate rules that hold up:

- Compare against a stored baseline from the default branch. Absolute thresholds either
  block everything or nothing.
- Fail on a per-case regression: any case that passed on the baseline and fails now,
  even if the aggregate improved. Aggregates hide the case that mattered.
- Run each case several times at nonzero temperature and report the pass rate; a case
  that passes two runs in three is not passing.
- Separate blocking from reporting: correctness and safety block, helpfulness and cost
  land in the PR comment. Keep the blocking suite under ten minutes — a bypassed gate is
  worse than none, because it looks like coverage.

```python
def decide(current, baseline, tolerance=0.02):
    newly_failing = [c for c in current.cases
                     if baseline.get(c.case_id, {}).get("pass") and not c.pass_]
    if newly_failing:
        return False, f"regression on {len(newly_failing)} case(s): " \
                      + ", ".join(c.case_id for c in newly_failing[:5])
    if current.rate < baseline.rate - tolerance:
        return False, f"aggregate {current.rate:.3f} below baseline {baseline.rate:.3f}"
    return True, "ok"
```

### 5. Store per-case results, not just the headline number

Write one row per case per run: `run_id`, `case_id`, commit SHA, model id, prompt hash,
pass/fail, grader scores, latency, token counts, cost. The aggregate says something
changed; the per-case history says what.

Views worth building on it: pass rate over time by tag; cases that flip between pass and
fail, which need a stricter grader or removal; cost and p95 latency per release; and the
cases that have never passed, which are the real backlog.

### 6. Track drift across releases

Model versions, provider-side updates, and prompt edits all move the numbers. Keep them
distinguishable:

- Pin model identifiers. Never point production or evals at a floating alias.
- Hash the fully rendered prompt and record it on every run, so a template change is
  attributable.
- Re-run the frozen set against a new model version before adopting it, comparing
  per-tag rather than overall. Upgrades commonly improve the average while regressing
  one intent.
- Re-run the previous model periodically. If a pinned version's score moves, the change
  is provider-side or in your harness, and you want to know that before a release is
  blamed for it.
- Rotate in fresh production cases quarterly, keeping a frozen core set for comparison.

Overfitting is the failure mode of a good harness: after enough iterations the prompt is
tuned to the set. Hold out 20% of cases, never read their contents during tuning, and
report the held-out score beside the tuned one. A widening gap means memorization.

## Checklist

- [ ] Eval set sampled from production traffic, stratified, with stable case ids;
      every past production failure and refusal case represented
- [ ] Programmatic checks run first; judge rubric anchored per level and validated
      against human labels
- [ ] Judge model version pinned; agreement re-measured when the rubric changes
- [ ] CI compares against a branch baseline, not an absolute threshold
- [ ] Per-case regressions block the merge even when the aggregate improves; cases run
      multiple times and flaky ones are handled
- [ ] Per-case results persisted with commit, model id, prompt hash, latency, and cost;
      a held-out slice is reported separately to detect overfitting

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Evals green, users complain | Set written by hand, not sampled from traffic | Rebuild from production traces, stratified |
| Judge disagrees with humans | Unanchored rubric, or a self-preferring judge | Anchor score levels; use a different model family |
| Aggregate improved, a key intent broke | Only the headline number gated | Gate on per-case regression and per-tag rates |
| Cost of the suite exceeds the feature's | Judge invoked on every case | Filter with programmatic checks first; sample the judge |

## References

- pass@k and pass^k reliability metrics, as used in [eval-harness](../eval-harness/SKILL.md)
- [agent-eval](../agent-eval/SKILL.md),
  [llm-output-validation](../llm-output-validation/SKILL.md),
  [rag-architecture](../rag-architecture/SKILL.md),
  [ab-testing-experimentation](../ab-testing-experimentation/SKILL.md)
