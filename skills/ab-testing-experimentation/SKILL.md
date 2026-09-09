---
name: ab-testing-experimentation
description: Run online experiments that support a decision — hypothesis and metric design, sample size and power, guardrail metrics, sequential testing instead of peeking, segmentation traps, and reading a result into a ship/no-ship call. Use when the user asks to set up an A/B test, size an experiment, interpret a result, add a feature flag rollout, or asks whether a lift is real.
metadata:
  origin: FORGE
---

# A/B Testing and Experimentation

An experiment is an expensive way to answer one question, so the question has to be
worth the traffic and the answer has to be usable. Most failures are procedural rather
than statistical: the metric was chosen after seeing the data, the test was stopped the
first day it looked good, or the winning variant broke something nobody was measuring.
This skill sets the design up front and constrains the reading afterwards. Done means:
a pre-registered hypothesis, a sample size computed before launch, guardrails that can
halt a rollout, and a decision that follows from the stated rule.

## When to activate

- Deciding whether a change improves a metric that matters
- Sizing an experiment, or being asked how long one must run
- Interpreting a result, especially a mixed or borderline one
- Setting up feature-flag assignment, holdouts, or a staged rollout
- Reviewing an analysis that slices by segment after the fact
- User says "A/B test", "statistically significant", "sample size", "does this lift
  hold", "we saw a 12% improvement", "split test", "experiment design"

## When NOT to use

- Traffic is too low to detect the smallest effect worth acting on. Prefer qualitative
  research, a reversible launch, or a much bigger change.
- The change is a bug fix, a legal requirement, or a strategic bet you will ship
  regardless. Do not run an experiment whose result cannot change the decision.
- Monitoring a rollout for breakage rather than measuring a lift — that is
  [canary-watch](../canary-watch/SKILL.md)
- Measuring model or prompt quality on a fixed dataset — use
  [model-evaluation-harness](../model-evaluation-harness/SKILL.md)
- Data pipeline correctness questions — use
  [data-quality-validation](../data-quality-validation/SKILL.md)

## Prerequisites

- Event instrumentation that already produces the metric, verified against a known
  segment before the experiment starts
- A deterministic assignment mechanism keyed on a stable unit identifier
- Baseline rate and variance for the primary metric from recent history
- Agreement, in advance, on who decides and on what rule

## Process

### 1. Pre-register the design before any traffic

Write it down and store it with the code. The purpose is to prevent the analysis from
being shaped by the result.

```markdown
## EXP-141 Inline plan comparison on the pricing page

Hypothesis: Showing a side-by-side plan table above the fold reduces the number of
  users who leave the pricing page without starting checkout, because the current
  layout requires scrolling to compare.

Unit of randomization: account_id (not session — users compare across devices)
Assignment: deterministic hash, 50/50, sticky for the experiment duration
Exclusions: existing paying accounts, internal domains, known bot user agents

Primary metric: checkout_started / pricing_page_viewed, per account
Secondary:      paid_conversion within 14 days; time to first checkout
Guardrails:     p95 page load, error rate, support contacts per 1k accounts,
                refund rate within 30 days

Baseline: 0.184 primary. MDE: +2.0 percentage points, absolute.
alpha 0.05 two-sided, power 0.80 -> 6,136 accounts per arm (see calculation below).
Planned duration: 14 days minimum, covering two full weekly cycles.
Analysis: fixed-horizon test at day 14; no interim decisions except guardrail halts.
Decision rule: ship if primary CI excludes 0 and no guardrail regressed beyond its
  threshold; otherwise iterate. Anything else is a no-ship.
```

The decision rule is the part teams skip and the part that prevents a week of argument.

### 2. Choose metrics that are sensitive, attributable, and hard to game

- **Primary**: exactly one. It must move within the experiment window and be plausibly
  caused by the change. Revenue per user is meaningful but high-variance; a proximate
  rate is often the better primary with revenue as a secondary.
- **Secondary**: what you expect to move alongside, used for interpretation. Not for
  declaring victory when the primary is flat.
- **Guardrails**: what must not degrade. Latency, error rate, unsubscribes, support
  volume, refunds. Give each an explicit non-inferiority threshold and check them
  continuously rather than at the horizon.

Ratio metrics need care about the denominator's unit. If the analysis unit is the
account but events are per session, the variance calculation must account for
clustering; ignoring it produces confidence intervals that are too narrow and results
that will not replicate.

### 3. Compute sample size, then convert it to a duration

```python
from math import ceil
from statistics import NormalDist

def sample_size_per_arm(p_baseline: float, abs_lift: float,
                        alpha: float = 0.05, power: float = 0.80) -> int:
    """Two-proportion test, equal arms, two-sided."""
    z_a = NormalDist().inv_cdf(1 - alpha / 2)
    z_b = NormalDist().inv_cdf(power)
    p1, p2 = p_baseline, p_baseline + abs_lift
    p_bar = (p1 + p2) / 2
    num = (z_a * (2 * p_bar * (1 - p_bar)) ** 0.5
           + z_b * (p1 * (1 - p1) + p2 * (1 - p2)) ** 0.5) ** 2
    return ceil(num / abs_lift ** 2)

n = sample_size_per_arm(0.184, 0.02)      # 6136 accounts per arm
days = ceil(n * 2 / 1500)                 # at 1,500 eligible accounts per day
print(n, max(days, 14))                   # never shorter than two weekly cycles
```

Set the minimum detectable effect from what would change the decision, not from what
you hope to see. If the required sample exceeds available traffic in a reasonable
window, the honest options are: test a bigger change, pick a more sensitive upstream
metric, use variance reduction (CUPED using pre-period data on the same unit), or do
not run the experiment.

Always run whole weeks. Weekday and weekend populations differ, and a Tuesday-to-Friday
test measures a different population than the one you will ship to.

### 4. Verify assignment before trusting anything

Two checks, both before reading the primary metric.

**Sample ratio mismatch.** Expected 50/50, observed materially off. This invalidates the
experiment; it almost always means a bug in assignment, exposure logging, or a filter
applied to one arm.

```python
from scipy.stats import chisquare
observed = [6088, 5902]
p = chisquare(observed, f_exp=[sum(observed)/2]*2).pvalue
if p < 0.001:
    raise RuntimeError(f"sample ratio mismatch, p={p:.2e} — do not analyze")
```

**A/A validation.** Run the harness with two identical arms before you rely on it the
first time. It should produce a significant result at roughly the alpha rate and no
more. A harness that finds effects between identical arms will find them anywhere.

Also confirm: assignment is sticky per unit, exposure is logged at the moment the user
could see the difference (not at page load for a below-fold change), and no user appears
in both arms.

### 5. Do not peek; use a design that permits looking

Repeatedly testing a fixed-horizon experiment inflates the false-positive rate far above
the nominal alpha. If people will look daily — and they will — adopt a method that
accounts for it.

| Approach | Use when | Cost |
| --- | --- | --- |
| Fixed horizon, no interim looks | Traffic is predictable, discipline is enforceable | Cannot stop early |
| Group sequential (O'Brien-Fleming or Pocock boundaries) | A few pre-planned interim analyses | Boundaries must be set in advance |
| Always-valid inference (mixture sequential probability ratio test, confidence sequences) | Dashboards read continuously | Wider intervals, needs more samples for the same power |
| Bayesian with a pre-stated decision threshold | Decision framed as expected loss | Prior must be defended; still needs a stopping rule |

Guardrails are the exception: monitor them continuously and halt on breach. Stopping
early for harm is always allowed. Stopping early for success is not, unless the design
provides for it.

### 6. Treat segments as hypotheses, not as findings

Slicing a flat result until one segment reaches significance is how a null result gets
reported as a win. With twenty segments, one crossing p < 0.05 is the expected outcome
under no effect.

Discipline that keeps segmentation useful:

- Pre-register at most two or three segments that carry a real prior.
- Apply a multiplicity correction (Holm or Benjamini-Hochberg) across everything tested.
- Test the interaction between variant and segment, not each segment in isolation.
- Treat any post-hoc segment finding as a hypothesis for a new experiment, and say so in
  the writeup.

Novelty and primacy effects distort the first days: existing users react to change
itself. Compare the first week against the second, and check new-user cohorts separately
when the effect looks like it is decaying.

### 7. Write the decision, including the negative ones

```markdown
## EXP-141 result, 2026-06-02

Exposed: 6,240 / 6,198 accounts. SRM check p=0.68. Duration 14 days (2 full weeks).

Primary  checkout_started rate: 0.184 -> 0.201 (+1.7pp, 95% CI [+0.4pp, +3.0pp])
Secondary paid_conversion_14d: +0.3pp, CI [-0.5pp, +1.1pp] — not distinguishable from 0
Guardrails p95 load +18ms (threshold +100ms), error rate flat, support contacts flat

Decision: SHIP. Primary hit the pre-registered rule; no guardrail breached.
Caveat: the secondary suggests the lift may sit at the top of the funnel and not
  reach paid conversion. Holdout of 5% retained for 60 days to check for decay.
Follow-up: EXP-152 will test whether the same layout helps on mobile, where the
  fold sits differently. Pre-registered as a new experiment, not a segment claim.
```

Publish flat and negative results with equal prominence. A team that only writes up
winners builds an inflated internal record of what works and repeats the same tests.
Keep a searchable log of every experiment with its hypothesis, result, and decision.

## Checklist

- [ ] Hypothesis, metrics, MDE, duration, and decision rule pre-registered before launch
- [ ] Exactly one primary metric; guardrails have explicit thresholds
- [ ] Randomization unit matches the analysis unit; clustering accounted for
- [ ] Sample size computed; duration covers whole weekly cycles
- [ ] A/A validation passed on the harness at least once
- [ ] Sample ratio mismatch checked before any metric is read
- [ ] Exposure logged at the point of difference, not at page load
- [ ] Analysis method matches the looking behavior (sequential if peeking)
- [ ] Guardrails monitored continuously with an automatic halt path
- [ ] Segments pre-registered; multiplicity corrected; post-hoc slices labeled as hypotheses
- [ ] Result written up with confidence intervals, not point estimates alone
- [ ] Decision recorded against the pre-registered rule, including no-ship outcomes

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Significant on day 3, gone by day 10 | Peeking at a fixed-horizon test | Use sequential methods or hold to the horizon |
| Arms are 52/48 instead of 50/50 | Assignment or exposure-logging bug | Investigate; do not analyze until resolved |
| Lift does not reproduce after launch | Novelty effect, or a post-hoc segment claim | Compare week 1 to week 2; retest the segment properly |
| Conversion up, revenue down | No revenue guardrail | Add guardrails on downstream and financial metrics |
| Confidence interval implausibly narrow | Session-level variance on an account-level unit | Cluster-adjust or switch the analysis unit |
| Every experiment "wins" | Analysis after seeing data; no negative results published | Pre-register; publish all outcomes |
| Test needs 9 months of traffic | MDE set below what matters | Raise the MDE, apply CUPED, or skip the experiment |
| Guardrail regression found after full rollout | Guardrails checked only at the horizon | Monitor guardrails continuously with an auto-halt |

## References

- Two-proportion power calculation and the normal approximation
- Group sequential boundaries: O'Brien-Fleming and Pocock spending functions
- Always-valid p-values and confidence sequences for continuous monitoring
- CUPED variance reduction using pre-experiment covariates
- Sample ratio mismatch as a trustworthiness diagnostic
- [canary-watch](../canary-watch/SKILL.md),
  [data-quality-validation](../data-quality-validation/SKILL.md),
  [model-evaluation-harness](../model-evaluation-harness/SKILL.md)
