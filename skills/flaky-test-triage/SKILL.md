---
name: flaky-test-triage
description: Detect, classify, quarantine, and repair non-deterministic tests. Covers flake-rate measurement, the standard causes catalogue (clocks, order, shared state, async, network, seeds, resources), and a time-boxed quarantine policy. Use when CI fails intermittently, when a rerun turns a red build green, or when the team asks to make the test suite trustworthy again.
metadata:
  origin: FORGE
---

# Flaky Test Triage

A flaky test is one whose result changes without a corresponding change in code. Its damage is not the wasted rerun, it is the loss of signal: once engineers learn that red sometimes means nothing, they stop reading red. This skill turns "the suite is flaky" into a ranked list of named tests with a cause, an owner, and an expiry date. Done looks like: every known flake is either fixed, quarantined with an owner and a deadline, or deleted, and the merge gate is deterministic again.

## When to activate

- A build fails, is re-run unchanged, and passes.
- CI failure rate on the default branch is nonzero while the branch is believed green.
- A test fails only in CI, only under parallelism, or only after a certain other test.
- Someone proposes raising the retry count to reduce noise.
- Before a merge queue or required-checks policy is introduced (see `../ci-pipeline-design/SKILL.md`).
- User says "flaky test", "intermittent failure", "passes locally, fails in CI", "just re-run it".

## When NOT to use

- The test fails deterministically every run. That is a bug or a broken test; take it to `../tdd-workflow/SKILL.md`.
- The suite is slow but reliable. Timing work belongs in `../performance-profiling/SKILL.md`.
- The instability is in the product under load rather than in the test harness. Reach for load and resilience work instead.
- The whole pipeline design is the problem (ordering, caching, required checks). Start at `../ci-pipeline-design/SKILL.md`, then come back for the individual tests.

## Prerequisites

- CI stores machine-readable results per run: JUnit XML, or the runner's JSON reporter, retained long enough to compute history.
- Every test has a stable identifier (file path plus fully qualified test name) that survives reordering.
- The ability to run the suite repeatedly on an unchanged commit, locally or via a CI workflow dispatch.
- Write access to the test configuration (retry counts, ordering plugins, parallelism settings).

## Process

### 1. Confirm the failure is non-deterministic

Reproduce instability before theorizing. Pin the commit, change nothing, and run repeatedly.

```bash
# Python: repeat one test 50 times, stop at first failure
pytest tests/test_orders.py::test_settlement --count=50 -x   # pytest-repeat

# Go: repeat with the race detector on
go test -count=20 -race ./internal/orders/...

# JavaScript: repeat a Playwright spec with retries disabled
npx playwright test tests/checkout.spec.ts --repeat-each=10 --retries=0
```

If 50 runs are green locally but CI is red, the variable is the environment, not the test body. Skip to step 4.

### 2. Separate order dependence from self-flakiness

A test that only fails after a sibling ran is an order-dependence bug, and the fix is different from a race fix. Toggle ordering and isolation deliberately.

```bash
# Randomize order, then reproduce with the exact seed printed in the header
pytest -p randomly            # pytest-randomly, prints "Using --randomly-seed=..."
pytest -p randomly --randomly-seed=12345
pytest -p no:randomly         # disable to compare against declaration order

# Vitest: shuffle files and cases
npx vitest run --sequence.shuffle

# Jest: serialize to see whether parallelism is the variable
npx jest --runInBand
npx jest --shard=2/4
```

Rule of thumb: fails under `--runInBand` but passes sharded means shared external state; passes serially but fails in parallel means resource contention or a shared fixture.

### 3. Measure flake rate, then rank

Compute per-test flake rate from stored results rather than from memory. A useful definition: for a given test id, the fraction of runs on unchanged code where the outcome differs from the majority outcome.

```bash
# Aggregate JUnit XML from the last N CI runs into a failure count per test id
python - <<'PY'
import glob, collections, xml.etree.ElementTree as ET
runs = collections.Counter(); fails = collections.Counter()
for path in glob.glob("ci-artifacts/**/junit*.xml", recursive=True):
    for case in ET.parse(path).getroot().iter("testcase"):
        tid = f'{case.get("classname")}::{case.get("name")}'
        runs[tid] += 1
        if case.find("failure") is not None or case.find("error") is not None:
            fails[tid] += 1
for tid, f in fails.most_common(25):
    print(f"{f/runs[tid]:.3f}  {f}/{runs[tid]}  {tid}")
PY
```

Rank by rate multiplied by how often the test runs, not by rate alone: a rarely executed test with a high rate costs less than a common one with a low rate.

The arithmetic is why small per-test rates matter. If a suite has N independent tests each failing spuriously with probability p, the probability that a run is green is `(1-p)^N`, so the suite fails with probability `1 - (1-p)^N`. Because N is typically in the thousands, per-test rates that look negligible in isolation compound into a suite that rarely passes on the first attempt. Measure the actual p for your suite; do not assume it.

### 4. Classify the cause

Match the symptom to the catalogue before editing anything. The detection signal column tells you which experiment confirms the hypothesis.

| Cause | Detection signal | Fix |
| --- | --- | --- |
| Wall-clock and dates | Fails near midnight, month boundaries, or only on some days | Inject a clock; freeze time (`freezegun`, `vi.setSystemTime`, `clockwork`); never assert on `now()` |
| `sleep`-based waiting | Fails on slower runners, passes locally | Poll for the condition with a deadline; use the framework's built-in waiting (`expect(...).toPass()`, `WaitUntil`) |
| Test order and leaked state | Passes alone, fails after a specific sibling; seed-dependent under random order | Roll back the DB per test, reset singletons and module caches, restore env vars in teardown |
| Shared fixtures across workers | Fails only under parallelism | Namespace per-worker resources (schema per worker, temp dir per worker, `PYTEST_XDIST_WORKER`) |
| Async races | Flakes cluster around callbacks, event handlers, and background jobs | Await the observable condition, not a duration; drain queues explicitly; assert on the final state |
| Live network or third-party calls | Failures correlate with an external outage or with DNS | Hermetic fakes for unit tests; record/replay (`vcrpy`, `nock`, `polly`) for integration; contract tests instead of live calls |
| Unseeded randomness or fuzzing | Failure body differs each run | Seed the generator, log the seed on failure, add the failing seed as a regression case |
| Port collisions | `EADDRINUSE`, connection refused, only in CI | Bind port 0 and read the assigned port; never hardcode |
| Timezone, locale, DST | Reproducible with `TZ=` set | Pin `TZ=UTC` and `LC_ALL=C` in CI; store and compare instants, not local strings |
| Floating point | Off-by-epsilon assertions | Compare with a tolerance (`pytest.approx`, `toBeCloseTo`) |
| Leaked processes and files | Second run in the same workspace fails | Kill child processes in teardown; use unique temp dirs; treat leaked resources as test failures |
| Variable CI CPU | Only autoscaled runners fail; timing-sensitive assertions | Remove timing assertions; if throughput must be tested, do it in a dedicated job, not the merge gate |

### 5. Quarantine with an owner and an expiry

Quarantine buys time; it is not a resolution. Encode the deadline in the code so it cannot be forgotten.

```python
# tests/test_settlement.py
import pytest

@pytest.mark.flaky_quarantine(owner="payments", expires="2026-11-01", issue="ENG-4412")
def test_settlement_retries_on_timeout():
    ...
```

```javascript
// vitest.config.ts — quarantined specs still run, but in a non-gating job
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/*.quarantine.test.ts'],
  },
})
```

Policy that holds up in practice:

- Auto-quarantine when a test's flake rate crosses the threshold the team agreed on, and open a ticket automatically.
- Quarantined tests keep running in a separate, advisory CI job. A quarantined test that stops running stops telling you anything.
- Every quarantine record carries an owning team, an issue link, and an expiry date.
- At expiry the test is fixed or deleted. There is no third option, and no silent extension.
- Cap the quarantine list. When the cap is hit, the team fixes before it quarantines more.

An unowned, unexpiring quarantine directory is a graveyard: the tests rot, the coverage claim becomes false, and nobody notices.

### 6. Fix, or delete

Not every flake deserves repair. Decide explicitly:

- **Fix** when the test guards behavior that would cause a real incident and the cause is in the catalogue above. Most flakes are test bugs, not product bugs, and the fix is cheap once classified.
- **Fix urgently** when the flake is the product being non-deterministic. The test found a real race. Treat it as a defect, not a test problem.
- **Delete** when the test asserts nothing a consumer depends on, duplicates coverage that a faster test already provides, or has been quarantined past expiry with no owner. Deleting a test that never produced signal is a net gain; record the deletion and the reasoning in the commit message.

### 7. Constrain retries

Retries are a painkiller with a side effect: they convert an observable failure into an invisible one.

- At most one automatic retry, and only where the runner records that a retry occurred.
- A test that passed only on retry counts as a flake occurrence and feeds the flake-rate table.
- Never retry the whole job as the default remedy; job-level retries hide which test was unstable.

```yaml
# .github/workflows/flake-hunt.yml — nightly repeat run on unchanged HEAD
name: flake-hunt
on:
  schedule: [{ cron: '0 3 * * *' }]
  workflow_dispatch:
jobs:
  repeat:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        attempt: [1, 2, 3, 4, 5]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: pip install -r requirements-dev.txt
      - run: pytest -p randomly --junitxml=junit-${{ matrix.attempt }}.xml
        env:
          TZ: UTC
          LC_ALL: C
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: junit-${{ matrix.attempt }}
          path: junit-${{ matrix.attempt }}.xml
```

### 8. Close the loop

Publish the flake table where the team already looks: the CI summary, or a weekly report. Track two numbers over time, the count of quarantined tests and the first-attempt green rate of the default branch. If quarantines grow while the green rate stays flat, the policy is being used to hide work rather than to schedule it.

## Checklist

- [ ] The failure reproduces as non-deterministic on an unchanged commit.
- [ ] Order dependence has been ruled in or out with a randomized-order run and a recorded seed.
- [ ] Per-test flake rate is computed from stored CI results, not estimated.
- [ ] Each active flake has a cause from the catalogue, not a guess.
- [ ] Every quarantined test has an owner, an issue, and an expiry date.
- [ ] Quarantined tests still execute in an advisory job.
- [ ] Automatic retries are capped at one and are recorded as flake occurrences.
- [ ] `TZ` and locale are pinned in CI.
- [ ] Tests deleted rather than fixed have the rationale in the commit message.
- [ ] The merge gate contains only deterministic checks.

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Re-running the job turns red to green | Non-determinism is being masked by manual retries | Capture the failing run's artifacts before re-running; add the test to the flake table |
| Test passes locally, fails in CI | Environment difference: timezone, locale, CPU count, network egress | Pin `TZ=UTC`, `LC_ALL=C`; run locally with the CI container image |
| Fails only when the full suite runs | Shared state leaking across tests | Isolate fixtures per test; reproduce with the failing random-order seed |
| Fails only under parallelism | Port collisions or a shared database/schema | Bind port 0; give each worker its own schema and temp directory |
| Flake rate drops after adding retries but incidents rise | Retries hid a genuine product race | Disable retries for that test; treat the race as a defect |
| Quarantine list grows every sprint | No expiry enforcement or no owner | Enforce expiry in CI; cap the list; block new quarantines at the cap |
| Different failure message on every run | Unseeded randomness or fuzzing | Seed the generator, log the seed, add failing seeds as fixed cases |
| Suite rarely green despite low per-test rates | Compounding across many tests | Compute `1-(1-p)^N` for your suite; fix the highest rate-times-frequency tests first |
| Fixed flake returns months later | Root cause was papered over with a longer timeout | Replace duration waits with condition polling; add a regression test for the race |

## References

- `../tdd-workflow/SKILL.md` — writing deterministic tests in the first place
- `../ci-pipeline-design/SKILL.md` — required versus advisory checks, sharding, merge queues
- `../e2e-testing/SKILL.md` — browser-level waiting and isolation patterns
- `../performance-profiling/SKILL.md` — when slowness, not non-determinism, is the real problem
- JUnit XML report schema, as consumed by most CI providers
- pytest documentation: `pytest-randomly`, `pytest-repeat`, `pytest-xdist`
- Go testing package documentation: `-count`, `-race`, `-shuffle`
- Playwright and Vitest documentation: `--repeat-each`, `--retries`, `sequence.shuffle`
