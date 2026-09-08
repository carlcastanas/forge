---
name: sre-slo-error-budgets
description: Define SLIs from user journeys, set defensible SLOs, derive an error budget, and alert on multi-window burn rate instead of raw thresholds. Use when the user asks about SLOs, SLIs, error budgets, uptime targets, burn-rate alerts, alert fatigue, or whether to freeze releases.
metadata:
  origin: FORGE
---

# SRE SLOs and Error Budgets

An SLO turns "the service should be reliable" into a number the team can trade against. The error budget is the inverse of that number: the amount of unreliability you have deliberately agreed to spend. This skill covers picking SLIs that track what users actually experience, setting targets from journeys rather than from round numbers, computing the budget, alerting on burn rate over multiple windows so pages are both fast and rare, and writing the policy that says what happens when the budget runs out. "Done" means each critical journey has a measured SLI, a documented SLO with a rationale, burn-rate alerts wired up, and a written budget policy the team has agreed to.

## When to activate

- Defining reliability targets for a new or existing service
- Alerts are too noisy, or real degradations are missed entirely
- A team is arguing about whether to ship features or fix reliability
- Someone proposes "99.99% uptime" without a definition of uptime
- User says "SLO", "SLI", "error budget", "burn rate", "availability target", "alert fatigue"

## When NOT to use

- Responding to a live outage — use `../incident-response/SKILL.md`
- Adding the telemetry the SLI needs in the first place — use `../observability-instrumentation/SKILL.md`
- Contractual SLAs with financial penalties: an SLA is a legal document; keep the SLO strictly tighter and treat the SLA as a separate artifact
- Load or capacity testing — use `../load-testing/SKILL.md`

## Prerequisites

- Request-level telemetry with status and latency, labelled by route template and service
- A metrics backend supporting rate windows and recording rules (Prometheus-compatible or equivalent)
- Agreement on which user journeys are critical, from someone who owns the product
- A deploy process that can actually be slowed or frozen, or the policy is decorative

## Process

### 1. Start from user journeys, not from services

Reliability is a property of a journey, not of a microservice. A 99.9% healthy pod fleet means nothing if the one path through it that matters is broken. List the two to five journeys whose failure a user would notice and report, then set an SLI for each.

```text
Journey                     Failure the user notices
--------------------------- ----------------------------------------
Sign in                     Cannot get into the account
Search for an item          Empty or stale results, spinner forever
Complete checkout           Payment fails or double-charges
Receive order confirmation  Email or push never arrives
```

Resist per-service SLOs at the start. They multiply into a number nobody can act on and they page on internal detail rather than user harm.

### 2. Choose an SLI type per journey

Four SLI shapes cover nearly everything. Each is a ratio of good events to valid events.

| Type | Good events | Use for |
| --- | --- | --- |
| Availability | Requests not returning a server error | Request/response APIs |
| Latency | Requests served faster than a threshold | Anything interactive |
| Quality | Responses served without degraded fallback | Systems with graceful degradation |
| Freshness | Records processed within a staleness bound | Pipelines, replicas, caches, batch jobs |
| Correctness | Records that match a verification check | Billing, ledgers, sync jobs |

Two rules make SLIs defensible. First, exclude invalid events from the denominator — client 4xx errors, health checks, and synthetic probes are not user traffic; a bot flood of 404s should not consume your budget. Second, a latency SLI is a ratio of fast requests, not a percentile of a distribution: "99% of requests complete under 400ms" composes across windows; "p99 is 400ms" does not.

```promql
# Availability SLI: fraction of valid requests that did not fail
sum(rate(http_server_request_duration_seconds_count{job="checkout",http_response_status_code!~"5.."}[30d]))
/
sum(rate(http_server_request_duration_seconds_count{job="checkout"}[30d]))

# Latency SLI: fraction of requests served under 400ms, using a histogram bucket
sum(rate(http_server_request_duration_seconds_bucket{job="checkout",le="0.4"}[30d]))
/
sum(rate(http_server_request_duration_seconds_count{job="checkout"}[30d]))
```

Measure as close to the user as the data allows. A load-balancer or client-side measurement catches failures that never reach your application; an in-process metric does not.

### 3. Set the target from evidence, then negotiate it

Do not open with a round number. Measure current performance over at least four weeks, look at where users actually complained, and set the SLO just above what the business needs and at or slightly below what you reliably achieve today. An SLO you already violate every week is ignored; an SLO you never come close to violating is not constraining anything and gives you no budget to spend.

Three anchors:

- **Ceiling** — you cannot be more available than your hardest dependency, so sum the dependency budgets before promising anything
- **Floor** — the level at which users churn or escalate, which is a product question
- **Cost** — each additional nine typically requires a structural change (another replica, another region, another failover path), so state the cost before agreeing to it

Error budget for a 30-day window:

| SLO | Budget (fraction) | Downtime equivalent over 30 days |
| --- | --- | --- |
| 99% | 1% | about 7.2 hours |
| 99.5% | 0.5% | about 3.6 hours |
| 99.9% | 0.1% | about 43 minutes |
| 99.95% | 0.05% | about 22 minutes |
| 99.99% | 0.01% | about 4.3 minutes |

Downtime equivalents are arithmetic on the window, not a measurement. For request-based SLIs the budget is a count of allowed bad requests, which is the more useful framing: at 99.9% and ten million requests in the window, the budget is ten thousand failed requests.

Use a rolling window (typically 28 or 30 days) rather than a calendar month. Calendar windows create a reset that hides a bad end-of-month and produces an artificial cliff on the first.

### 4. Alert on burn rate over multiple windows

A threshold alert on "error rate above 1%" pages for harmless blips and stays quiet during a slow bleed that will exhaust the budget by Friday. Burn-rate alerting fixes both.

Burn rate is how fast the budget is being consumed relative to even consumption. A burn rate of 1 exhausts the budget exactly at the end of the window. A burn rate of 14.4 exhausts it in 1/14.4 of the window — about two days out of thirty.

Pair a long window (confirms the problem is real) with a short window (confirms it is still happening now), so the alert fires quickly and resolves quickly.

| Severity | Long window | Short window | Burn rate | Budget consumed before firing |
| --- | --- | --- | --- | --- |
| Page | 1 hour | 5 minutes | 14.4 | 2% |
| Page | 6 hours | 30 minutes | 6 | 5% |
| Ticket | 24 hours | 2 hours | 3 | 10% |
| Ticket | 72 hours | 6 hours | 1 | 10% |

```yaml
# prometheus/rules/slo-checkout.yaml
groups:
  - name: checkout-slo
    rules:
      - record: slo:checkout_errors:ratio_rate5m
        expr: |
          sum(rate(http_server_request_duration_seconds_count{job="checkout",http_response_status_code=~"5.."}[5m]))
          /
          sum(rate(http_server_request_duration_seconds_count{job="checkout"}[5m]))

      - record: slo:checkout_errors:ratio_rate1h
        expr: |
          sum(rate(http_server_request_duration_seconds_count{job="checkout",http_response_status_code=~"5.."}[1h]))
          /
          sum(rate(http_server_request_duration_seconds_count{job="checkout"}[1h]))

      - alert: CheckoutErrorBudgetBurnFast
        # 0.001 is the error budget for a 99.9% SLO
        expr: |
          slo:checkout_errors:ratio_rate1h  > (14.4 * 0.001)
          and
          slo:checkout_errors:ratio_rate5m  > (14.4 * 0.001)
        for: 2m
        labels:
          severity: page
        annotations:
          summary: "Checkout burning error budget at 14.4x — 2% consumed in one hour"
          runbook: "docs/runbooks/checkout-availability.md"
```

Alert on symptoms at the journey level and page only on burn rate. Cause-based alerts (pod restarts, CPU, queue depth) belong on dashboards and tickets, not on the pager — they fire when nothing is wrong and stay silent when something is.

### 5. Write the error budget policy before you need it

The policy is the point of the whole exercise. Without an agreed consequence, an SLO is a dashboard. Write it as a ladder, get explicit sign-off from both engineering and product, and apply it mechanically so it does not require a negotiation during a bad week.

```markdown
## Error budget policy — checkout (SLO 99.9%, rolling 30 days)

| Budget remaining | Action |
| --- | --- |
| > 50%            | Normal delivery. Risky changes allowed behind flags. |
| 25-50%           | Deploys continue. New work must not increase risk;
|                  | reliability items get priority in planning. |
| 10-25%           | Feature freeze on this service. Only reliability fixes,
|                  | security patches, and rollbacks ship. Written exception
|                  | requires the service owner and the product owner. |
| < 10%            | Full freeze. All engineering capacity on reliability
|                  | until the budget recovers above 25%. |
| Exhausted        | Freeze plus a written review of the SLO itself: either the
|                  | target is wrong or the architecture cannot support it. |
```

A freeze must never block a rollback or a security fix — those reduce risk. Silver-bullet exceptions should exist, be limited in number per quarter, and be recorded, so that using one is visible rather than routine.

Budget burned by a planned, announced maintenance window can be excluded only if the exclusion was defined in the SLO up front. Retroactive exclusions turn the budget into fiction.

### 6. Review on a cadence

Review each SLO quarterly against three questions:

- Did the SLI track what users complained about, or did complaints arrive with the budget healthy? (SLI is measuring the wrong thing.)
- Was the budget never meaningfully consumed? (Target is too loose; tighten it or stop paying for the reliability.)
- Was it exhausted every window? (Target is unreachable with the current architecture; either invest or lower it honestly.)

Prune SLOs that never drive a decision. Ten SLOs nobody acts on are worse than two that trigger real prioritisation.

## Checklist

- [ ] Critical user journeys enumerated with a product owner
- [ ] One SLI per journey, expressed as good events over valid events
- [ ] Invalid traffic (client errors, health checks, synthetics) excluded from the denominator
- [ ] Latency SLI expressed as a fast-request ratio against a threshold, not a raw percentile
- [ ] Measurement point chosen as close to the user as data allows
- [ ] Target set from four or more weeks of measurement plus dependency ceiling and cost
- [ ] Rolling window defined, not a calendar month
- [ ] Error budget stated in both percentage and absolute bad-event count
- [ ] Multi-window burn-rate alerts configured for page and ticket severities
- [ ] Cause-based alerts demoted off the pager
- [ ] Every paging alert links to a runbook
- [ ] Error budget policy written, signed off, and mechanically applied
- [ ] Freeze policy explicitly exempts rollbacks and security fixes
- [ ] Quarterly review scheduled

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| SLO is green while users complain | SLI measured inside the service, or invalid events inflating the denominator | Move measurement toward the edge; recheck what counts as a valid event |
| Pager fires constantly, responders mute it | Threshold alerts and cause-based alerts on the pager | Replace with multi-window burn-rate alerts on journey SLIs; demote cause alerts to tickets |
| Real degradation never pages | Only a fast-burn alert configured | Add slow-burn ticket alerts at burn rate 3 and 1 |
| Budget never consumed | Target set far below achieved performance | Tighten the SLO or accept that this service does not need one |
| Budget exhausted every window | Target exceeds what the architecture can deliver | Fund the structural fix or lower the target and say so publicly |
| Policy ignored during a budget breach | No sign-off, or the freeze blocks work nobody can pause | Get written agreement in advance; scope the freeze to the service; exempt risk-reducing changes |
| Dozens of SLOs, no decisions | Per-service SLOs instead of per-journey | Collapse to journey SLOs; delete any SLO that has never changed a decision |
| Budget maths disputed after an incident | Exclusions negotiated retroactively | Define maintenance and dependency exclusions in the SLO document up front |
| Latency SLO passes but the slowest users suffer | Aggregate ratio hides a segment | Split the SLI by region, tier, or client class where segments differ materially |

## References

- `../observability-instrumentation/SKILL.md` — the telemetry SLIs are computed from
- `../incident-response/SKILL.md` — burn-rate pages become incidents
- `../postmortem-authoring/SKILL.md` — quantifying incident impact against the budget
- `../release-management/SKILL.md` — freeze policy at the release gate
- `../load-testing/SKILL.md` — verifying the target holds under projected load
- `../chaos-engineering/SKILL.md` — the steady-state hypothesis is usually an SLI
- Google SRE Book and SRE Workbook, chapters on SLOs and alerting on SLOs
- Prometheus recording and alerting rules documentation
