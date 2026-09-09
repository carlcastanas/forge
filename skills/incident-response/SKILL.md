---
name: incident-response
description: Drive a live production incident from detection to all-clear — severity classification, incident roles, comms cadence, mitigation before diagnosis, and a rollback decision tree. Use when the user says "we have an outage", "prod is down", "customers are reporting errors", "page fired", or asks how to run or escalate an incident.
metadata:
  origin: FORGE
---

# Incident Response

An incident is any unplanned degradation of a user-visible service. The job during an incident is not to understand it — it is to stop the bleeding, then understand it. This skill covers classifying severity, assigning roles, restoring service by the fastest safe route, and keeping stakeholders informed on a fixed cadence. "Done" means the service is back inside its SLO, the mitigation is documented, and a postmortem is scheduled with an owner.

## When to activate

- An alert pages and the user is deciding what to do first
- Users report errors, timeouts, or wrong data in production
- A deploy correlates with a rise in error rate or latency
- Someone asks "should we roll back?" or "who declares an incident?"
- User says "prod is down", "we're on fire", "sev1", "start an incident", "who's IC?"

## When NOT to use

- Writing the retrospective after service is restored — use `../postmortem-authoring/SKILL.md`
- Deciding whether the degradation even breaches a target — use `../sre-slo-error-budgets/SKILL.md`
- Deliberately injecting failure to learn from it — use `../chaos-engineering/SKILL.md`
- Recovering from data loss or a region-wide failure with an RPO/RTO commitment — use `../disaster-recovery/SKILL.md`
- A single failing test or a red build — that is `../flaky-test-triage/SKILL.md` or `../ci-pipeline-design/SKILL.md`

## Prerequisites

- Working telemetry: error rate, latency percentiles, and saturation per service (`../observability-instrumentation/SKILL.md`)
- A known-good previous release artifact that can still be deployed
- Deploy and rollback commands that a responder can run without waiting for CI
- A declared communication channel (chat room, status page) and a stakeholder list
- Feature flag kill switches that do not depend on the failing subsystem (`../feature-flags-rollout/SKILL.md`)

## Process

### 1. Declare, and pick a severity

Declaring early is cheap; declaring late costs the whole detection window. If two engineers are debugging the same production symptom, it is an incident.

| Sev | Shape | Response |
| --- | --- | --- |
| SEV1 | Total outage, data loss, or security breach for most users | Page immediately, wake people, exec comms, status page within minutes |
| SEV2 | Major feature broken or severe degradation for a large subset | Page on-call, incident channel, status page, business-hours escalation |
| SEV3 | Degraded or partial failure with a viable workaround | Ticket plus channel, handled during the working day |
| SEV4 | Cosmetic or internal-only; no user impact | Normal backlog |

Classify by user impact, not by cause. A single crashed pod is not a SEV; a single crashed pod that carries all checkout traffic is. Severity can be raised at any time and should be raised the moment the current level stops matching reality.

### 2. Assign roles before debugging

One person debugging alone is fine at SEV3. At SEV1/SEV2 separate the roles, because the person reading dashboards cannot also write updates.

- **Incident commander (IC)** — owns the incident, not the fix. Decides, delegates, keeps the timeline. Does not touch a terminal.
- **Operations lead** — the one pair of hands making changes. All production changes go through this person so the timeline stays accurate.
- **Communications lead** — writes stakeholder and status-page updates on the cadence.
- **Scribe** — timestamps every observation, hypothesis, and action in the channel.

State the assignment explicitly in the channel: "IC: <role holder>. Ops: <role holder>. Comms: <role holder>." Roles hand over verbally and are re-announced in the channel.

### 3. Establish the impact statement

Before any hypothesis, answer four questions and pin the answer in the channel:

1. What is broken, in user-facing terms
2. How many users or what percentage of traffic
3. Since when (first bad data point, not first alert)
4. Is it getting worse, stable, or recovering

```promql
# Error ratio for the affected service, to size the impact
sum(rate(http_server_request_duration_seconds_count{service="checkout",http_response_status_code=~"5.."}[5m]))
/
sum(rate(http_server_request_duration_seconds_count{service="checkout"}[5m]))
```

Compare against the same window last week before calling something anomalous.

### 4. Mitigate before you diagnose

This is the rule most teams violate. Root cause is a postmortem deliverable, not an incident deliverable. Reach for the fastest reversible action that restores service, even if the cause is unknown.

Mitigations ranked by speed and reversibility:

1. **Roll back the last deploy** — if the timeline correlates, revert first and ask why later
2. **Disable the feature flag** guarding the new path
3. **Shed load** — rate-limit, disable an expensive endpoint, turn off a background job
4. **Fail over** — shift traffic to a healthy region, replica, or previous cluster
5. **Scale out** — only if the signal is genuine saturation, not a fatal bug being multiplied
6. **Restart** — cheapest, buys time against leaks and stuck state, tells you almost nothing
7. **Roll forward with a fix** — slowest and highest-risk; only when rollback is impossible

Take the highest-ranked action that is applicable. Do not batch mitigations — apply one, wait for the metric window to refresh, then decide again. Batched changes destroy your ability to attribute recovery.

### 5. Work the rollback decision tree

```text
Did a deploy, config push, flag flip, or migration land within the impact window?
├── Yes → Is the change reversible without data loss?
│         ├── Yes → ROLL BACK NOW. Diagnose from the artifact afterwards.
│         └── No (schema migration already applied, data written in a new format)
│                 → Can the previous release read the new data?
│                   ├── Yes → roll back the application only, leave the schema
│                   └── No  → do NOT roll back. Roll forward or disable the
│                             write path via flag; escalate to a data owner.
└── No  → Is a dependency (database, cache, queue, provider, DNS) degraded?
          ├── Yes → fail over or degrade gracefully; open a vendor ticket in parallel
          └── No  → Is it load or capacity?
                    ├── Yes → shed load, then scale
                    └── No  → bisect: which component's error started first?
```

Rollback needs a time limit as well as a trigger. If the rollback has not restored the metric within one full metric window, it was not the cause — stop waiting and move down the mitigation list.

```bash
# Kubernetes: inspect then revert to the previous known-good revision
kubectl rollout history deployment/checkout -n prod
kubectl rollout undo deployment/checkout -n prod --to-revision=41
kubectl rollout status deployment/checkout -n prod --timeout=120s
```

### 6. Communicate on a cadence, not on progress

Silence is read as "nobody is working on it". Post updates at a fixed interval even when the update is "no change yet".

| Sev | Internal update | External / status page |
| --- | --- | --- |
| SEV1 | Every 15 minutes | Initial within 15 minutes, then every 30 |
| SEV2 | Every 30 minutes | Initial within 30 minutes, then hourly |
| SEV3 | Hourly or at state change | Only if customers are asking |

Every update carries the same four fields, so readers can diff them:

```text
[SEV2 #1487] 14:32 UTC — Checkout errors
Impact:   ~12% of checkout requests failing with 503; card charges are NOT affected.
Status:   Mitigating. Rolled back checkout to build 2f9a1c at 14:28.
Next:     Confirm error rate recovery over the next 10 minutes.
Update:   14:47 UTC or sooner if status changes.
```

Never speculate about cause in external comms, never name an individual, and never promise a fix time you cannot hold.

### 7. Verify recovery, then close deliberately

Recovery is a measurement, not a feeling. Confirm all of:

- Primary impact metric back inside its normal band for at least two full alert windows
- Queue backlogs drained, retries settled, dead-letter queues inspected
- No secondary damage: partial writes, duplicated side effects, stuck jobs, corrupt cache entries
- Synthetic checks and a manual pass of the affected user journey both pass

Then declare all-clear in the channel, post the final external update, and immediately capture: incident start, detection time, mitigation time, resolution time, and the raw channel transcript. Those timestamps are the spine of the postmortem and are much harder to reconstruct a day later.

### 8. Hand off to the postmortem

Before the channel goes quiet, assign a postmortem owner and a date. Note any temporary mitigation still in place (a disabled feature, a scaled-up cluster, a flag flipped off) as an explicit follow-up item — unremoved mitigations become the next incident. Continue in `../postmortem-authoring/SKILL.md`.

## Checklist

- [ ] Incident declared with an explicit severity and an incident id
- [ ] IC, ops, and comms roles named in the channel
- [ ] Impact statement pinned: what, how many, since when, trend
- [ ] Mitigation attempted before root-cause analysis
- [ ] One change at a time, each with a timestamp in the channel
- [ ] Rollback decision made against the tree, including the data-compatibility branch
- [ ] Stakeholder updates posted on cadence, including "no change" updates
- [ ] Recovery verified against metrics and a manual user-journey pass
- [ ] Backlogs, retries, and dead-letter queues checked for secondary damage
- [ ] Temporary mitigations recorded as follow-up items
- [ ] Timeline exported and postmortem owner plus date assigned

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Hour into the incident with no mitigation attempted | Team is debugging root cause instead of restoring service | IC halts investigation and orders the highest-ranked applicable mitigation |
| Metric recovers but nobody can say which change did it | Several mitigations applied simultaneously | Serialize changes; one action per metric window, announced before it is applied |
| Rollback made things worse | Previous release cannot read data written by the new one | Check schema and payload compatibility before reverting; prefer flag-off over rollback after a migration |
| Stakeholders keep interrupting responders | No comms lead, or cadence not being met | Assign comms; post on schedule even with nothing new; keep responders out of the stakeholder channel |
| Incident quietly fizzles out, no postmortem | No explicit close and no owner assigned | Require an all-clear message that names the postmortem owner and date |
| Same incident recurs the next week | Postmortem action items never landed | Track action items as normal backlog work with owners and due dates |
| Nobody knows who is deciding | Multiple senior responders, no IC | Name the IC first, before anything else; the IC is a role, not a rank |
| Alert fired long after users noticed | Alerting on causes rather than symptoms | Add symptom-based, SLO-burn alerting on the user journey |
| Recovery declared, errors return in an hour | Backlog replay or a partially applied mitigation | Hold the incident open for two alert windows and drain queues before all-clear |

## References

- `../postmortem-authoring/SKILL.md` — blameless retrospective after the all-clear
- `../sre-slo-error-budgets/SKILL.md` — severity thresholds and burn-rate alerting
- `../observability-instrumentation/SKILL.md` — the telemetry an incident depends on
- `../feature-flags-rollout/SKILL.md` — kill switches as a first-line mitigation
- `../disaster-recovery/SKILL.md` — RPO/RTO-scale events and recovery ordering
- `../release-management/SKILL.md` — rollback readiness as a release precondition
- `../chaos-engineering/SKILL.md` — rehearsing this process before it is needed
- Google SRE Book, chapters on managing incidents and emergency response
- ICS (Incident Command System) role separation, the origin of the IC/ops/comms split
