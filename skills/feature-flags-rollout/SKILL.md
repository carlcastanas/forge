---
name: feature-flags-rollout
description: Shipping changes behind runtime flags and rolling them out progressively without breaking users or accumulating flag debt. Covers flag taxonomy and lifetimes, deterministic bucketing, the rollout ladder with guard metrics, kill switches, flag cleanup enforcement, and testing strategy under combinatorial explosion. Use when the user asks about feature flags, gradual or percentage rollout, canary release by cohort, kill switches, A/B exposure, or removing stale flags.
metadata:
  origin: FORGE
---

# Feature Flags And Rollout

A feature flag separates deploy from release: the code ships dark, then a runtime decision decides who sees it. That separation is only worth its cost if flags have owners and end dates, evaluation is deterministic, rollout advances on evidence rather than optimism, and the flag is removed once the decision is permanent. Done is: the feature is at 100% (or removed), the flag and both code paths are deleted, and the rollout is documented by the guard metrics observed at each step.

## When to activate

- A change is risky, hard to reverse quickly, or touches a hot path, and a deploy-time-only rollback is too slow.
- Rolling out to a subset of users, tenants, or regions before general availability.
- Adding an operational switch to shed load or disable a dependency during an incident.
- Coordinating a code change with a schema change that cannot land atomically.
- The flag count is growing and nobody knows which flags are live.
- User says "feature flag", "gradual rollout", "percentage rollout", "canary this to 5%", "kill switch", "dark launch", "clean up our flags".

## When NOT to use

- The change is small, reversible by redeploy within the incident response window, and has no cohort dimension. A flag adds a permanent branch for a temporary concern.
- The goal is versioned API behavior for external consumers. Use API versioning: `../api-design/SKILL.md`.
- The goal is release sequencing, changelog, and version numbering: `../release-management/SKILL.md`.
- The change is purely a schema migration with no behavioral branch: `../database-migrations/SKILL.md`.
- Long-lived per-customer capability differences belong in entitlements or plan configuration, not in the release flag system.

## Prerequisites

- A flag evaluation SDK or service with a documented offline/default behavior.
- Metrics and traces that can be sliced by flag variant: `../observability-instrumentation/SKILL.md`.
- SLOs or at least agreed guard metrics for the affected journey: `../sre-slo-error-budgets/SKILL.md`.
- A stable subject identifier (user id, tenant id, device id) available at evaluation time.
- A place to record flag ownership that is checked by CI, not by goodwill.

## Process

### 1. Classify the flag before creating it

| Type | Purpose | Expected lifetime | Removal trigger |
| --- | --- | --- | --- |
| Release toggle | Hide incomplete or risky work until it is ready | Days to a few weeks | Reaches 100% and bakes |
| Experiment flag | Split traffic to measure an outcome | Duration of the experiment | Result is called |
| Operational switch / kill switch | Disable a dependency or shed load at runtime | Indefinite, by design | Only when the subsystem is removed |
| Permission / entitlement | Gate capability by plan, role, or contract | Indefinite, by design | Product decision |

Most flag debt comes from treating all four as one thing. A release toggle left in place becomes an untested permanent branch; an entitlement modelled as a release toggle gets "cleaned up" and silently grants everyone a paid feature. Store the type as a required field and let it drive the expiry policy.

### 2. Create the flag with its removal already scheduled

Register the flag in a manifest that lives in the repository next to the code, so review and CI can see it:

```yaml
# flags/checkout-v2.yaml
key: checkout_v2_pricing
type: release            # release | experiment | operational | entitlement
owner: team-payments     # a team, never a person
created: 2026-03-02
expires: 2026-04-13      # release toggles get a hard date at creation
removal_ticket: PAY-4821
default: false           # value when the flag service is unreachable
description: >
  Routes checkout pricing through the v2 tax engine. OFF serves the v1 engine.
  Both paths write to the same order records.
guard_metrics:
  - checkout_success_rate
  - checkout_p99_latency_ms
  - payment_decline_rate
```

Open the removal ticket at creation, not at 100%. A ticket created "later" is created never.

### 3. Evaluate deterministically and server-side

Evaluate on the server wherever the decision affects data, pricing, or security. Client-side evaluation is observable and editable by the user, and it makes the exposed cohort a function of cache state. Bucketing must be a pure function of flag key and subject key, so a user stays in the same bucket across requests, processes, and restarts, and so different flags do not correlate their cohorts:

```typescript
import { createHash } from "node:crypto";

const BUCKETS = 10_000;

/** Stable bucket in [0, 10000). Same subject + flag always lands identically. */
export function bucketOf(flagKey: string, subjectKey: string): number {
  const digest = createHash("sha256").update(`${flagKey}:${subjectKey}`).digest();
  return digest.readUInt32BE(0) % BUCKETS;   // top 32 bits, no BigInt needed
}

/** rolloutPercent is 0..100. */
export function isEnabled(flagKey: string, subjectKey: string, rolloutPercent: number) {
  if (rolloutPercent <= 0) return false;
  if (rolloutPercent >= 100) return true;
  return bucketOf(flagKey, subjectKey) < rolloutPercent * (BUCKETS / 100);
}
```

Two properties this buys: raising the percentage only ever *adds* users to the treatment (nobody flips back out), and two flags at 10% do not hit the same 10% of users.

Always pass an explicit default, and make the default the safe path:

```typescript
import { OpenFeature } from "@openfeature/server-sdk";

const useV2 = await OpenFeature.getClient("checkout").getBooleanValue(
  "checkout_v2_pricing",
  false,                                  // default when the provider errors or is offline
  { targetingKey: userId, tenantId, region },
);
```

Cache evaluations locally with streaming updates, so a flag-service outage degrades to the last known good configuration rather than to defaults mid-rollout, and so evaluation never adds a network hop to the request path.

### 4. Order targeting rules explicitly

Rules are evaluated top to bottom, first match wins. Put overrides above cohorts and cohorts above the percentage:

```yaml
targeting:
  - name: kill-switch-off        # explicit disable beats everything
    if: { flag_disabled: true }
    serve: false
  - name: internal-users
    if: { email_domain: "acme.internal" }
    serve: true
  - name: excluded-tenants       # contractual opt-outs before any rollout
    if: { tenant_id: ["t_1042", "t_2891"] }
    serve: false
  - name: percentage
    rollout: { percent: 5, bucket_by: user_id }
fallthrough: false
```

Bucket by the identifier that matches the blast radius. Bucketing a tenant-visible feature by user id shows one seat the new behavior and another seat the old one inside the same account.

### 5. Advance the rollout ladder on evidence

| Step | Audience | Bake time | Advance when |
| --- | --- | --- | --- |
| 0 | Off in production, on in CI and staging | Until tests pass | Both paths tested, defaults verified |
| 1 | Internal users and dogfood accounts | 1-2 days | No functional reports; guard metrics flat |
| 2 | Allowlist of consenting design partners | 1-3 days | No support escalations |
| 3 | 1% | At least one full traffic cycle | Guard metrics within noise; no new error signatures |
| 4 | 5% | One full traffic cycle | Same, plus error-budget burn acceptable |
| 5 | 25% | One full traffic cycle | Same, plus resource usage scales as predicted |
| 6 | 50% | One full traffic cycle | Same |
| 7 | 100% | 1-2 weeks | Ready to delete the flag and the old path |

"One full traffic cycle" means at least one weekday peak and one off-peak trough. A rollout advanced through four steps in an afternoon has observed nothing.

At each step, compare treatment against control on the same dashboard rather than watching a global aggregate. At 1%, a total outage of the new path moves a global error rate by roughly 1% and hides inside normal variance.

```promql
# Error rate split by variant, comparable at any rollout percentage
sum by (flag_variant) (
  rate(http_requests_total{route="/checkout", status=~"5.."}[5m])
)
/
sum by (flag_variant) (
  rate(http_requests_total{route="/checkout"}[5m])
)
```

Write down the rollback trigger before each step, in the same numeric form used for SLO burn-rate alerts. If the trigger fires, set the flag to 0% first and diagnose afterward — mitigation precedes diagnosis (`../incident-response/SKILL.md`).

### 6. Build kill switches that work during a disaster

An operational switch is only useful if it is reachable when everything else is broken:

- **No self-dependency.** A switch that disables the recommendation service must not be fetched through the recommendation service. A switch that sheds database load must not require a database read to evaluate.
- **Cached and default-safe.** Evaluate from a local cache with a compiled-in default; a flag-service outage must not un-shed load.
- **Fast.** Propagation time is part of the mitigation time. Measure it, publish it, and cite it in runbooks.
- **Documented in the runbook.** The switch key, the expected effect, the expected propagation delay, and how to confirm it took effect.
- **Exercised.** Flip every kill switch in a game day or low-traffic window on a schedule (`../chaos-engineering/SKILL.md`). An untested kill switch is a comment.

### 7. Pair flags with schema change carefully

Expand-contract and the flag ladder interlock: the schema must tolerate both code paths for the entire rollout, including any period at partial percentage and any rollback.

```text
1. Expand    Add nullable column / new table. Deploy. Flag still 0%.
2. Backfill  Separate migration. Both paths still work with flag OFF.
3. Dual-write Code writes old and new representations regardless of the flag.
4. Roll out  Advance the flag ladder; reads follow the flag, writes stay dual.
5. Bake      100% for the full bake window with rollback still possible.
6. Contract  Remove the flag and the old read path, then drop the old column.
```

Never drop the old column while the flag can still be turned off. See `../database-migrations/SKILL.md`.

### 8. Make every metric sliceable by variant

Emit the variant as a span attribute and a structured log field at the point of evaluation, so latency, errors, and business metrics can all be split without a new deploy:

```typescript
import { trace } from "@opentelemetry/api";

const span = trace.getActiveSpan();
span?.setAttribute("feature_flag.key", "checkout_v2_pricing");
span?.setAttribute("feature_flag.variant", useV2 ? "v2" : "v1");

logger.info("checkout.pricing.evaluated", {
  flag_key: "checkout_v2_pricing",
  flag_variant: useV2 ? "v2" : "v1",
  order_id: orderId,
});
```

Keep variant cardinality bounded — a handful of named variants, never a user id. See `../observability-instrumentation/SKILL.md`.

### 9. Test both paths, not every combination

N flags produce 2^N configurations. Testing all of them is not possible and not necessary.

- Unit and integration tests cover **ON and OFF for the flags currently in flight**, parameterized rather than duplicated.
- CI's main run uses the **production default configuration**, so the default path is the one under constant test.
- A **nightly all-on run** exercises the state the system converges toward and catches flags that only work in isolation.
- **Contract-test the defaults**: assert that every flag in the manifest has a default, and that the default is the pre-change behavior.
- End-to-end tests pin flag state explicitly rather than inheriting ambient configuration, or they become flaky (`../flaky-test-triage/SKILL.md`).

```typescript
describe.each([true, false])("checkout pricing (v2=%s)", (useV2) => {
  beforeEach(() => setFlag("checkout_v2_pricing", useV2));

  it("charges tax on a taxable order", async () => {
    const order = await checkout(taxableCart());
    expect(order.taxCents).toBeGreaterThan(0);
  });
});
```

### 10. Enforce cleanup in CI

Flag debt is not solved by intention. Make expiry a build failure:

```bash
#!/usr/bin/env bash
# scripts/check-stale-flags.sh — fails CI on expired or orphaned flags
set -euo pipefail
today=$(date -u +%Y-%m-%d); status=0

for manifest in flags/*.yaml; do
  key=$(yq -r '.key' "$manifest")
  type=$(yq -r '.type' "$manifest")
  expires=$(yq -r '.expires // ""' "$manifest")

  # Operational and entitlement flags are permanent by design.
  if [[ "$type" == "release" || "$type" == "experiment" ]]; then
    if [[ -z "$expires" ]]; then
      echo "FAIL $key: $type flags require an 'expires' date"; status=1
    elif [[ "$expires" < "$today" ]]; then
      echo "FAIL $key: expired $expires (owner $(yq -r '.owner' "$manifest"))"; status=1
    fi
  fi

  # Manifest entry with no remaining references means the flag is dead code.
  if ! grep -rqF "$key" src/; then
    echo "FAIL $key: no references in src/ — delete the manifest entry"; status=1
  fi
done
exit "$status"
```

Removing a flag means deleting the flag check, deleting the losing branch and its tests, deleting the manifest entry, and archiving the flag in the provider. A flag removed from code but left enabled in the provider is a trap for the next person who reads the dashboard.

## Checklist

- [ ] Flag has a type, a team owner, a description, and a safe default recorded in the manifest
- [ ] Release and experiment flags have an expiry date and a removal ticket created at the same time as the flag
- [ ] Evaluation is server-side for anything affecting data, pricing, or authorization
- [ ] Bucketing is a deterministic hash of flag key plus subject key, bucketed by the right subject
- [ ] Default value is the pre-change behavior and is exercised by CI's main run
- [ ] Targeting rules are ordered with overrides and exclusions above the percentage rule
- [ ] Guard metrics and a numeric rollback trigger are defined before each ladder step
- [ ] Dashboards compare treatment against control, not a global aggregate
- [ ] Flag variant is emitted as a span attribute and a log field, with bounded cardinality
- [ ] Kill switches do not depend on what they disable and were flipped in the last test window
- [ ] Schema changes follow expand-contract and remain compatible with the flag off
- [ ] CI fails on expired flags and on manifest entries with no code references
- [ ] After 100% and bake, flag check, losing branch, tests, manifest entry, and provider entry are all deleted

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Users flip between old and new behavior across requests | Random or time-seeded bucketing instead of a stable hash | Bucket on `hash(flagKey + subjectKey)`; never seed with a timestamp or request id |
| Raising the percentage moved users out of the treatment | Bucketing recomputed from a changing salt or a rehashed range | Use a fixed bucket space so higher percentages are strict supersets |
| Everything broke when the flag service went down | No local cache, or a default that enabled the new path | Cache with streaming updates; make the default the pre-change behavior |
| The same 10% of users are in every experiment | Hash omits the flag key | Include the flag key in the hash input |
| Rollout looked clean at 1%, broke at 50% | Global aggregates hid a treatment-only failure | Slice all guard metrics by variant from step one |
| Cannot disable the failing feature during an incident | Kill switch evaluated through the failing dependency | Move the switch to a local default-safe path with no dependency on the subsystem it disables |
| Hundreds of live flags, unknown state | No expiry enforcement and no ownership | Add the manifest and the CI stale-flag gate; sweep by owner, oldest first |
| Removing a flag changed behavior unexpectedly | The removed branch was the one actually serving traffic | Confirm the live variant in the provider before deleting; delete the losing branch, not the winning one |
| Tests pass in CI, feature fails in production | CI ran an all-off configuration the production system never uses | Run CI on production defaults plus a nightly all-on job |
| Rollback to flag-off failed | Schema already contracted, or new-path writes are unreadable by the old path | Keep expand state and dual-write until after the bake window completes |

## References

- `../release-management/SKILL.md` — versioning, staged rollout, and rollback readiness around the flag
- `../sre-slo-error-budgets/SKILL.md` — guard metrics, burn-rate triggers, and budget spend during rollout
- `../incident-response/SKILL.md` — flipping the switch first, diagnosing second
- `../database-migrations/SKILL.md` — expand-contract sequencing under a flag
- `../observability-instrumentation/SKILL.md` — variant attributes, cardinality limits, log-trace correlation
- `../chaos-engineering/SKILL.md` — exercising kill switches on a schedule
- `../flaky-test-triage/SKILL.md` — ambient flag state as a source of nondeterministic tests
- `../ci-pipeline-design/SKILL.md` — where the default-config run and the nightly all-on run belong
- `../api-design/SKILL.md` — versioning as the alternative to flags for external contracts
- OpenFeature specification: evaluation API, evaluation context, providers
- OpenTelemetry semantic conventions for feature flags (`feature_flag.*` attributes)
