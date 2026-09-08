---
name: postmortem-authoring
description: Write a blameless postmortem that produces change — timeline reconstruction from evidence, contributing factors instead of a single root cause, and action items with owners and due dates. Use when the user says "write the postmortem", "incident review", "RCA", "retro for the outage", or asks why an incident keeps recurring.
metadata:
  origin: FORGE
---

# Postmortem Authoring

A postmortem exists to change the system, not to explain the past. Most postmortems fail because they name a single root cause (usually a person or a commit), list action items nobody owns, and get filed where nobody reads them. This skill produces a document with an evidence-backed timeline, a set of contributing factors across code, process, and tooling, and a short list of owned, dated, tracked actions. "Done" means the actions are in the backlog and a reader who was not there can understand what happened and why it was possible.

## When to activate

- An incident has reached all-clear and needs a written review
- A near miss occurred: the failure was caught before users saw it
- The same class of failure has happened more than once
- A postmortem draft exists and needs review for blamelessness or usefulness
- User says "postmortem", "incident review", "root cause analysis", "5 whys", "retro the outage"

## When NOT to use

- The incident is still active — use `../incident-response/SKILL.md` and do not start writing yet
- A sprint or team retrospective about process and morale, unrelated to an outage
- A design review before building — use `../architecture-decision-records/SKILL.md`
- Investigating a single flaky test — use `../flaky-test-triage/SKILL.md`

## Prerequisites

- The incident channel transcript, with timestamps, exported before it scrolls away
- Deploy, config-change, and feature-flag audit logs covering the impact window
- Dashboards and alert history for the affected services (`../observability-instrumentation/SKILL.md`)
- Access to the people who responded, within a few days while memory is fresh
- A tracker where action items become real work items

## Process

### 1. Set the blameless frame explicitly

Blameless does not mean consequence-free or vague. It means the analysis assumes every participant acted reasonably given the information, incentives, and tools available at the time. If a person could take an action that caused an outage, the system permitted it — that is the finding.

Rewrite person-shaped statements as system-shaped ones:

| Blaming | Blameless, and more useful |
| --- | --- |
| An engineer deployed without testing | The deploy pipeline had no gate requiring integration tests to pass before promotion |
| On-call missed the alert | The alert routed to a channel with no paging escalation after 10 minutes |
| Someone ran the wrong command | The production and staging CLI contexts were visually indistinguishable |
| The reviewer should have caught it | The change touched a migration path with no reviewer checklist and no automated schema check |

Never name individuals in the document. Use roles: "the deploying engineer", "the on-call responder". Write it before the review, not as a cleanup pass afterwards.

### 2. Reconstruct the timeline from artifacts, not memory

Build the timeline from machine evidence first, then annotate with human observations. Memory reorders events; logs do not.

```bash
# Deploys and config pushes overlapping the impact window
git log --since="2026-03-11T12:00Z" --until="2026-03-11T18:00Z" \
        --pretty=format:'%h %ad %s' --date=iso-strict

# Kubernetes revision history for the affected workload
kubectl rollout history deployment/checkout -n prod

# Chat transcript, timestamped, exported to the working doc
# (export from the incident channel before retention trims it)
```

Every row needs a UTC timestamp, the source of the evidence, and a strict separation between what was observed and what was believed at the time.

```markdown
| Time (UTC) | Event | Source | Known at the time |
| --- | --- | --- | --- |
| 13:41 | Release 2f9a1c promoted to prod | deploy log | Yes |
| 13:52 | Connection pool saturation begins on checkout-db | metrics | No |
| 14:06 | First user report in support queue | support ticket 8812 | No |
| 14:11 | Latency alert fires, pages on-call | alertmanager | Yes |
| 14:14 | Responder acknowledges, opens incident channel | channel | Yes |
| 14:22 | Hypothesis: cache eviction storm (later disproved) | channel | Yes |
| 14:28 | Rollback to 41c0d8 initiated | deploy log | Yes |
| 14:36 | Error rate returns to baseline | metrics | Yes |
```

Record the disproved hypotheses. They show why the response took as long as it did, which is usually the more actionable finding.

### 3. Derive the four durations

These four numbers are the only metrics a postmortem needs, and they point at different fixes.

| Duration | Definition | What a bad value means |
| --- | --- | --- |
| Time to detect | First bad data point → alert fires | Monitoring gap; alerting on causes rather than user symptoms |
| Time to acknowledge | Alert fires → a human engages | Paging, routing, or escalation problem |
| Time to mitigate | Engagement → user impact stops | Missing runbook, slow rollback, no kill switch |
| Time to resolve | Mitigation → underlying issue closed | Usually the least urgent to improve |

Detection time is measured from the first bad data point in the metrics, not from the first alert. The gap between those two is the monitoring finding.

### 4. Find contributing factors, not a root cause

"Root cause" is singular and comforting and almost always wrong. Production failures are conjunctions: a latent defect, a trigger, an ineffective safeguard, and a slow detection path all had to line up. Removing any one of them prevents the incident, which is why enumerating them gives you several cheap fixes instead of one expensive one.

Sort factors into four buckets:

- **Trigger** — what changed immediately before (deploy, traffic shift, dependency failure, expiry)
- **Latent condition** — the defect or design weakness that had been present, unnoticed
- **Safeguard that did not fire** — the test, review, limit, alert, or circuit breaker that should have caught it
- **Amplifier** — retries without backoff, missing timeout, unbounded queue, cascading fallback

Use "5 whys" as a probe but do not stop at one chain — run a separate chain per bucket, and stop asking why when the next answer would be about a person's intent rather than a system property.

```markdown
## Contributing factors

1. **Trigger** — Release 2f9a1c raised the per-request DB query count on the
   checkout path from 2 to 7 through an unbatched association load.
2. **Latent** — The connection pool was sized for the old query rate with no
   headroom, and pool saturation had no dedicated alert.
3. **Safeguard gap** — Query-count assertions exist in the test suite but the
   checkout path was excluded from them.
4. **Amplifier** — The client retried 503s three times with no backoff and no
   jitter, tripling load on an already-saturated pool.
5. **Detection gap** — Alerting watched request error rate only; latency
   degradation ran for 19 minutes before errors crossed the threshold.
```

### 5. Write action items that are real work

An action item is only real if it has an owner (one person, not a team), a due date, a tracker link, and a stated priority. Anything without those is a wish.

Classify each action and be honest about the ratio:

| Class | Effect | Example |
| --- | --- | --- |
| Prevent | Makes this failure impossible | Enforce query-count budget in CI for checkout |
| Detect | Shortens time to detect | Alert on pool utilization above threshold with burn-rate windows |
| Mitigate | Shortens time to mitigate | Add a documented kill switch for the new association loader |
| Process | Changes how humans work | Add a rollback-compatibility item to the release checklist |

A postmortem consisting entirely of "be more careful" and "add documentation" has produced nothing. Aim for at least one action in the prevent or detect class per incident, and cap the total at what the team will actually complete — five owned actions that land beat fifteen that rot.

```markdown
| # | Action | Class | Owner | Due | Tracker |
| --- | --- | --- | --- | --- | --- |
| 1 | Add pool-utilization burn-rate alert | Detect | Payments on-call rotation lead | 2026-03-18 | OPS-2210 |
| 2 | Extend query-count assertions to checkout | Prevent | Checkout service owner | 2026-03-25 | CHK-1183 |
| 3 | Add jittered exponential backoff to the retry client | Prevent | Platform libraries owner | 2026-04-01 | PLT-0442 |
```

### 6. Run the review meeting as a fact check

The document is written before the meeting, not during it. Circulate the draft at least a day ahead. The meeting's job is to correct the timeline, surface factors the author missed, and confirm every action item has a consenting owner. It is not a presentation, and it is not where the analysis starts.

Ask two questions that reliably produce findings:

- What information did the responders wish they had at each timeline step?
- What would have made this incident boring — detected in one minute and mitigated in two?

### 7. Publish and close the loop

Store the document where it is searchable next to other postmortems, indexed by service and failure class. Then set a follow-up date to verify the actions actually shipped. An action-item completion review one month later is what separates a postmortem practice from a postmortem archive. If the same contributing factor appears in a third postmortem, escalate it as a systemic issue rather than filing a fourth action item against it.

## Checklist

- [ ] No individual named anywhere in the document
- [ ] Timeline built from logs, deploy records, and metrics with UTC timestamps and sources
- [ ] Disproved hypotheses recorded alongside correct ones
- [ ] Time to detect, acknowledge, mitigate, and resolve all computed
- [ ] Contributing factors listed across trigger, latent, safeguard, and amplifier
- [ ] Impact quantified in user terms, not just in error counts
- [ ] Every action item has one named owner, a due date, and a tracker link
- [ ] At least one prevent-class or detect-class action, not only documentation
- [ ] Temporary mitigations from the incident have a removal action
- [ ] Draft circulated before the review meeting
- [ ] Document published in the shared index and a completion review scheduled

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Postmortem names a single root cause and stops | Linear 5-whys applied once | Run a chain per contributing-factor bucket; look for the safeguard that failed |
| Action items never completed | No owner, no due date, not in the tracker | Refuse to publish until every item has all three; review completion in a month |
| Attendees defensive, details withheld | Document or meeting reads as blame-seeking | Rewrite every statement in system terms; no names anywhere; state the blameless frame first |
| Timeline disputed during the review | Reconstructed from memory | Rebuild from deploy logs, metrics, and the channel export before the meeting |
| Same failure class recurs a third time | Actions treated as one-offs rather than a systemic signal | Tag postmortems by failure class; escalate a repeated factor to a funded project |
| Document is long and nobody reads it | Narrative prose with no summary | Lead with impact, duration, and the action table; keep detail in appendices |
| Only the responders learn anything | Never distributed beyond the incident channel | Publish to a shared index; circulate a short summary to adjacent teams |
| Actions all say "add monitoring" | Detection gap is the only factor examined | Force at least one prevent-class action and check the amplifier bucket |
| Near misses never reviewed | Postmortems triggered only by user-visible impact | Trigger on severity or on a caught-in-time failure of a safeguard |

## References

- `../incident-response/SKILL.md` — the live response that supplies the timeline
- `../sre-slo-error-budgets/SKILL.md` — quantifying impact against the error budget
- `../observability-instrumentation/SKILL.md` — closing detection gaps found in review
- `../chaos-engineering/SKILL.md` — testing whether the action items actually work
- `../architecture-decision-records/SKILL.md` — recording design changes the review forces
- Google SRE Book, chapter on postmortem culture
- Swiss cheese model of accident causation, for the conjunction-of-factors framing
- Safety-II and "new view" human factors literature, for the blameless frame
