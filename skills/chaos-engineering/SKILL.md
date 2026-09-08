---
name: chaos-engineering
description: Designing and running controlled fault-injection experiments against a production or production-like system to find failure modes before they find you. Covers steady-state hypotheses, blast radius control, the fault catalogue, tooling (Chaos Mesh, AWS FIS, Toxiproxy, netem), and game day facilitation. Use when the user asks to run a chaos experiment, plan a game day, inject faults, test resilience, or verify that failover and retries actually work.
metadata:
  origin: FORGE
---

# Chaos Engineering

Chaos engineering is the practice of injecting a specific, bounded fault into a system in order to falsify a stated belief about how that system behaves under failure. It is not random breakage. Every experiment starts from a measurable steady state, states a hypothesis, limits the damage it can do, and ends with either a confirmed belief or a defect. Done is: the hypothesis was tested, the blast radius held, the experiment was stopped cleanly, and every surprise became an owned action item.

## When to activate

- A resilience mechanism exists but has never been exercised: retries, circuit breakers, multi-AZ failover, read-replica promotion, cache fallback.
- A postmortem produced the action item "verify the system degrades gracefully when X fails".
- Before a traffic peak, a region expansion, or a dependency migration.
- A new dependency was added and its timeout and fallback behavior are assumed rather than observed.
- Scheduling or facilitating a game day.
- User says "chaos experiment", "game day", "fault injection", "kill a pod and see what happens", "test our failover", "resilience testing".

## When NOT to use

- The system has no usable telemetry. Injecting faults into an unobservable system does not produce an experiment, it produces an outage with no data. Instrument first: `../observability-instrumentation/SKILL.md`.
- An incident is already open. Stop injecting and drive the incident: `../incident-response/SKILL.md`.
- The question is "can we recover from total loss of a data store or region". That is a restore drill, not a chaos experiment: `../disaster-recovery/SKILL.md`.
- The question is "how much load can this take". That is capacity work: `../load-testing/SKILL.md`.
- The service has known unaddressed reliability defects. Fix the known failures before hunting for new ones.

## Prerequisites

- **Observability that answers the question.** Dashboards or queries for the steady-state metric, plus traces and logs correlated by request id.
- **Alerting that pages.** Breakage outside the blast radius must be reported by the alerting system, not noticed by the operator.
- **A tested rollback path.** Fault removal in a single command, plus a way to roll back the deployed version if the fault exposes a bug.
- **An SLO baseline** and an error budget to spend. See `../sre-slo-error-budgets/SKILL.md`.
- **On-call awareness.** The on-call engineer knows the window, the expected symptoms, and the abort signal. Never surprise the pager.
- **Change freeze during the run.** An unrelated deploy makes the results uninterpretable.

## Process

### 1. Write the steady-state hypothesis

Pick a metric that reflects user experience, not machine health. CPU utilization is not steady state; successful checkout rate is.

```text
Steady state: p99 of POST /checkout under 800 ms and 5-minute success rate above 99.5%.
Hypothesis:   With the recommendations service returning HTTP 500 for 100% of calls,
              checkout steady state is unchanged, because that call is non-critical
              and wrapped in a 1-second timeout with an empty-list fallback.
Falsified if: success rate < 99.5% or p99 > 800 ms for two consecutive minutes.
```

Write the hypothesis before the experiment. A hypothesis written afterward is a description.

### 2. Bound the blast radius

Two independent dials: **scope** (how many things are affected) and **magnitude** (how hard each is hit). Increase one at a time.

| Stage | Scope | Magnitude | Gate before advancing |
| --- | --- | --- | --- |
| 0 | Local or ephemeral environment | Full | Fault mechanism works, teardown works |
| 1 | Staging, all instances | Full | Hypothesis holds; alerts fire as designed |
| 2 | Production, one pod / one instance | Full | No customer-visible deviation |
| 3 | Production, one AZ or one shard | Partial | Failover observed within its target |
| 4 | Production, 1% of traffic | Partial | Steady state holds for the bake window |
| 5 | Production, 5-25% of traffic | Full | Steady state holds; error budget spend acceptable |

Define abort conditions numerically before the run, and wire an automated halt where the tool supports one. A human watching a graph is a backup, not the primary control.

```text
Abort immediately if: checkout success rate < 99.0% over 1 minute, any SLO
burn-rate alert fires, an unrelated service pages, or the operator loses
access to the teardown path.
```

### 3. Choose the fault

| Fault | Injects | Typical tool | Reveals |
| --- | --- | --- | --- |
| Process kill | Sudden instance loss | Chaos Mesh `PodChaos`, Pumba | Restart handling, in-flight request loss, leader election |
| CPU pressure | Contention | `stress-ng`, Chaos Mesh `StressChaos` | Timeout tuning, autoscaler behavior, noisy-neighbor effects |
| Memory pressure | OOM risk | `stress-ng --vm`, `StressChaos` | Limits, OOMKill loops, heap sizing |
| Disk fill | Full volume | `fallocate`, Chaos Mesh `IOChaos` | Log rotation, write-path error handling |
| Network latency | Slow dependency | `tc netem`, Toxiproxy, `NetworkChaos` | Timeouts, retry storms, connection pool exhaustion |
| Packet loss | Lossy link | `tc netem loss`, `NetworkChaos` | TCP retransmit behavior, health-check flapping |
| DNS failure | Name resolution loss | Chaos Mesh `DNSChaos` | Resolver caching, startup ordering, hardcoded IPs |
| Dependency 5xx | Downstream errors | Istio fault injection, Toxiproxy | Circuit breakers, fallbacks, error propagation |
| Clock skew | Time drift | Chaos Mesh `TimeChaos` | Token expiry, cache TTLs, distributed locks |
| Certificate expiry | TLS failure | Short-lived test cert | Renewal automation, alert lead time |
| AZ or zone loss | Correlated instance loss | AWS FIS, `NetworkChaos` partition | Zonal capacity headroom, quorum survival |
| Database failover | Primary promotion | Managed-DB failover API | Connection draining, write-error handling, replica lag |
| Cache flush | Cold cache | `FLUSHALL` on a test cache | Thundering herd, origin capacity |
| Queue backlog | Consumer stall | Pause consumers | Backpressure, DLQ policy, retention limits |

### 4. Inject with the smallest tool that fits

Kubernetes, declarative and namespaced with a built-in duration:

```yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: NetworkChaos
metadata:
  name: recommendations-latency
  namespace: checkout-prod
spec:
  action: delay
  mode: fixed
  value: "1"                      # exactly one matching pod
  selector:
    namespaces: [checkout-prod]
    labelSelectors:
      app: recommendations
  direction: to
  delay:
    latency: "200ms"
    jitter: "50ms"
    correlation: "50"
  duration: "5m"                  # auto-teardown even if the operator disconnects
```

```bash
kubectl apply -f recommendations-latency.yaml
kubectl describe networkchaos recommendations-latency -n checkout-prod
kubectl delete -f recommendations-latency.yaml   # teardown, run this to abort
```

Single host, no orchestrator. Always pair the add with the delete, and set a timer so the host recovers if the session dies:

```bash
# Add 200ms +/- 50ms of normally distributed delay on egress
sudo tc qdisc add dev eth0 root netem delay 200ms 50ms distribution normal

# Safety net: remove it in 5 minutes no matter what happens to this shell
echo "sudo tc qdisc del dev eth0 root" | sudo at now + 5 minutes

sudo tc qdisc show dev eth0
sudo tc qdisc del dev eth0 root                  # teardown
```

```bash
# CPU and memory pressure, self-limiting
stress-ng --cpu 4 --cpu-load 90 --timeout 120s --metrics-brief
stress-ng --vm 2 --vm-bytes 75% --timeout 120s
```

Proxy-level faults, no privileges required, scoped to a single dependency:

```bash
toxiproxy-cli create postgres --listen 0.0.0.0:5433 --upstream db.internal:5432
toxiproxy-cli toxic add postgres -t latency -a latency=500 -a jitter=100
toxiproxy-cli toxic add postgres -t timeout -a timeout=0 --toxicity 0.1
toxiproxy-cli inspect postgres
toxiproxy-cli toxic remove postgres -n latency_downstream   # teardown
```

Service mesh, percentage-scoped without touching application code:

```yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: recommendations
spec:
  hosts: [recommendations]
  http:
    - fault:
        abort:
          percentage:
            value: 100.0
          httpStatus: 500
      route:
        - destination:
            host: recommendations
```

For cloud-managed faults such as AZ loss, instance termination, or API throttling, prefer the provider's own service (AWS Fault Injection Service, or the equivalent) so the fault is real rather than simulated. LitmusChaos, Gremlin, and Pumba cover the same catalogue with different operating models; pick one and standardize.

### 5. Run the game day

| Role | Responsibility |
| --- | --- |
| Facilitator | Owns the agenda and the clock, calls start and abort, keeps discussion out of the injection window |
| Operator | The only person who touches the fault tooling; reads each command aloud before running it |
| Scribe | Timestamps every action and observation; the record feeds the debrief |
| Observers | Service owners watching dashboards and alerts; call out anything unexpected |

Sequence: **pre-brief** (read the hypothesis table aloud, confirm abort criteria, confirm teardown is one command, confirm on-call is aware and no deploys are in flight), **baseline** (record steady-state with no fault applied, or the results are unanchored), **injection** (timeboxed 5-15 minutes per experiment; no debugging during the window, log surprises and continue), **teardown and recovery** (remove the fault, then confirm the metric returns to baseline — a system that does not self-recover is a finding), **debrief** (walk the scribe's timeline and classify each observation as confirmed, falsified, or unrelated defect).

Hypothesis table for the day:

```text
| # | Fault                          | Steady-state metric      | Predicted | Observed | Result   |
|---|--------------------------------|--------------------------|-----------|----------|----------|
| 1 | recs returns 500, 100%         | checkout success rate    | unchanged | 99.7%    | held     |
| 2 | primary DB failover            | write error rate < 0.5%  | brief dip | 4.1%/38s | falsified|
| 3 | one AZ network partition       | p99 latency < 800ms      | unchanged | 2.3s     | falsified|
```

### 6. Convert findings into owned work

A falsified hypothesis is the product. Write it up in the same format as a postmortem finding, with a named owning team, a priority, and a ticket. See `../postmortem-authoring/SKILL.md`. Findings without owners are how the same fault gets discovered twice.

### 7. Decide between game days and continuous chaos

| | Scheduled game day | Continuous automated chaos |
| --- | --- | --- |
| Best for | Novel faults, cross-team scenarios, human process (paging, comms, decision-making) | Regression protection for faults already survived once |
| Cadence | Monthly or quarterly, per critical journey | On every deploy, or on a schedule in a canary environment |
| Cost | High coordination, low automation | Low ongoing cost, high setup cost |
| Requirement | Facilitator and observers | Automated abort tied to SLO burn rate |

Promote an experiment to continuous only after it has passed as a game day at least twice, and only with automated abort. Continuous chaos without an automated halt is an unattended outage generator.

## Checklist

- [ ] Steady-state metric is user-facing and has a recorded baseline from today
- [ ] Hypothesis is written down before injection, with a numeric falsification threshold
- [ ] Abort conditions are numeric and at least one is automated
- [ ] Teardown is a single command, tested before injection, with a time-based safety net
- [ ] Blast radius is the smallest that can answer the question
- [ ] On-call is aware of the window and the expected symptoms
- [ ] No unrelated deploy or migration is in flight
- [ ] Error budget has room for the worst-case spend
- [ ] Scribe timeline captured with timestamps
- [ ] System returned to baseline after teardown, verified not assumed
- [ ] Every falsified hypothesis has a ticket with an owning team

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Experiment caused a real incident | Blast radius set at production scale on the first run | Restart the ladder at stage 0; never skip staging for a novel fault |
| Fault applied but no metric moved | Fault did not reach the target (wrong selector, wrong interface, proxy bypassed) | Verify from inside the target: `kubectl exec` and curl the dependency, confirm added latency is visible |
| Cannot tell whether the fault caused the deviation | Deploy or another experiment overlapped the window | Enforce a change freeze during runs; record deploy markers on the dashboard |
| Fault persisted after the session ended | Teardown depended on an interactive shell that closed | Always set `duration` in the CRD or schedule a timed teardown alongside the injection |
| Retry storm took down a healthy dependency | Retries lack jitter, budget, or a circuit breaker | Add exponential backoff with jitter and a retry budget; re-run the experiment to confirm |
| Alerts never fired during a real degradation | Alerting keys off machine metrics, not user-facing SLIs | Rewrite alerts against SLI burn rate (`../sre-slo-error-budgets/SKILL.md`) |
| Same finding surfaces in consecutive game days | Findings recorded but never assigned | Require an owner and ticket id in the debrief before the day is closed |
| Team refuses to run in production | No trust in observability or abort tooling | Run stages 0-1 until alerting and teardown are demonstrably reliable, then advance |

## References

- `../observability-instrumentation/SKILL.md` — telemetry that makes an experiment readable
- `../sre-slo-error-budgets/SKILL.md` — steady-state definitions, burn-rate alerts, budget spend
- `../incident-response/SKILL.md` — what to do when an experiment stops being an experiment
- `../disaster-recovery/SKILL.md` — restore drills and region-loss scenarios
- `../postmortem-authoring/SKILL.md` — writing up findings without blame
- `../load-testing/SKILL.md` — combining fault injection with load to find the real knee
- `../kubernetes-patterns/SKILL.md` — workload, probe, and PodDisruptionBudget configuration
- Chaos Mesh CRD reference (`PodChaos`, `NetworkChaos`, `StressChaos`, `IOChaos`, `DNSChaos`, `TimeChaos`); LitmusChaos ChaosHub
- AWS Fault Injection Service action reference; Istio HTTP fault injection
- Toxiproxy toxic reference; Linux `tc-netem(8)` and `stress-ng(1)` manual pages
- Principles of Chaos Engineering (steady-state / hypothesis / production / blast-radius formulation)
