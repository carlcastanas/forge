---
name: load-testing
description: Build a load model from real production traffic and run it as an open-model test that exposes the saturation point, not a synthetic script that flatters the system. Covers workload modelling, open vs closed models and coordinated omission, test types and ramp profiles, tool selection, and how to read the results. Use when sizing capacity, validating a launch, verifying an SLO under load, or proving a performance fix holds at scale.
metadata:
  origin: FORGE
---

# Load Testing

A load test is only worth running if its traffic resembles the traffic that will actually arrive and its measurements survive saturation. Most load tests fail on one of those two counts: they hammer one endpoint with uniform payloads, or they use a closed-loop tool that stops sending requests exactly when the system starts falling behind. Done means a documented load model traceable to production telemetry, a test that finds the latency knee, and a report a capacity decision can be made from.

## When to activate

- Capacity planning before a launch, migration, or seasonal peak
- Validating that an SLO holds at target throughput and beyond
- Proving a performance fix survives concurrency, not just a single-request profile
- Sizing autoscaling thresholds, connection pools, or instance counts
- User says "load test this", "can we handle the launch", "what is our breaking point", "how many requests per second can we take"

## When NOT to use

- Locating the slow function once the bottleneck is known to be in one process — see `../performance-profiling/SKILL.md`
- Testing behaviour when dependencies fail rather than when they are busy — see `../chaos-engineering/SKILL.md`
- Comparing two implementations in a controlled microbenchmark — see `../benchmark-methodology/SKILL.md`
- Correctness or functional regression testing; load tests assert on latency and error rate, not on business output

## Prerequisites

- Production telemetry covering request rate, endpoint mix, payload sizes, and latency percentiles — see `../observability-instrumentation/SKILL.md`
- A target environment with the same topology as production, or a documented list of every way it differs
- A dataset with production-comparable cardinality and row counts
- Written authorization to generate the load, and a stated abort condition

## Process

### 1. Derive the load model from telemetry, not from a guess

The model is a document, not a script. Produce it before writing any test code.

| Model input | Where it comes from | Why it matters |
| --- | --- | --- |
| Endpoint mix | Request count per `http.route` over a representative week | A uniform mix exercises the wrong code paths and the wrong cache |
| Arrival rate | Requests per second at median, p95, and observed peak | Sizing to the mean guarantees failure at peak |
| Burstiness | Ratio of one-minute peak to hourly mean | Smooth traffic hides queueing behaviour |
| Payload distribution | Request and response body size percentiles | Serialization and bandwidth costs scale with size, not count |
| Cache hit ratio | Cache hit and miss counters | A test with a hot cache measures the cache, not the system |
| Key distribution | Distinct tenants, users, or object ids touched | Reusing one id turns every query into a cache hit |
| Think time | Gap between requests in a real session | Determines concurrency for scenario-shaped tests |
| Auth cost | Token issuance and validation rate | Frequently the first thing to saturate |

```promql
# Endpoint mix over 7 days, as a share of total requests
sort_desc(
  sum by (http_route) (increase(http_server_request_duration_count{service_name="checkout-api"}[7d]))
  / scalar(sum(increase(http_server_request_duration_count{service_name="checkout-api"}[7d]))))

# Peak one-minute arrival rate over the same window
max_over_time(sum(rate(http_server_request_duration_count{service_name="checkout-api"}[1m]))[7d:1m])
```

Write the model down: target rate, mix percentages, payload sizes, data cardinality, and the pass criteria. Every later argument about whether the test was valid is settled by this document.

### 2. Choose an open model and understand coordinated omission

- **Closed model**: a fixed number of virtual users, each waiting for a response before sending again. Concurrency is capped; when the system slows, the client slows with it and offered load drops.
- **Open model**: requests are issued at a specified arrival rate regardless of whether earlier ones have completed. Concurrency grows as the system slows, which is what real traffic does.

Closed-loop tools systematically understate latency under saturation. When a response is delayed, the request that would have been sent during the delay is never sent, so the long wait it would have experienced is never recorded. This measurement artifact is known as coordinated omission, and it makes an overloaded system look healthy in the client's percentile report. The corrections are to drive load by arrival rate rather than by virtual-user count, and to use a tool that records latency against intended send time.

### 3. Pick the test type for the question being asked

| Type | Shape | Question answered |
| --- | --- | --- |
| Smoke | Minimal rate, short | Does the script and environment work at all |
| Load | Expected peak, held steady | Does the SLO hold at the rate that is actually expected |
| Stress | Ramp past peak until failure | Where does it break, and how |
| Soak | Moderate rate, hours | Are there leaks, pool exhaustion, log-disk fill, or drifting latency |
| Spike | Instant jump and drop | Does autoscaling, queueing, and shedding survive a step change |
| Breakpoint | Slow continuous ramp | Where exactly is the latency knee and throughput plateau |

Run smoke before every other type. Run soak before every launch that has a maintenance window; leaks are the failures that only appear on the fourth hour.

Ramp profiles matter: instantaneous starts measure cold caches and connection storms rather than steady state. A typical shape is a short ramp to target, a hold at least ten times longer than the p99 latency, and a ramp down that lets queues drain so recovery time can be measured.

### 4. Match the environment and the data

Every difference between the test environment and production is a caveat on the result. Record them explicitly.

- Instance count, size, and CPU limits identical or scaled by a stated factor
- Same load balancer, TLS termination, and proxy hops; skipping the CDN or ingress changes results
- Database with production-comparable row counts and index bloat, not a fresh seed
- Realistic cache pre-warming, matched to the measured production hit ratio
- Third-party dependencies either real, or replaced with a stub that reproduces their latency distribution rather than returning instantly
- Rate limits and WAF rules enabled; bypassing them tests a system that does not exist

Test data must have the cardinality of the real thing. One user id reused across a million requests turns every lookup into a cache hit and every partition into a hotspot.

### 5. Select the tool

| Tool | Model | Strengths | Watch out for |
| --- | --- | --- | --- |
| k6 | Open or closed | Scriptable in JavaScript, first-class thresholds, `ramping-arrival-rate` executor, good CI integration | Scripts run in a Go-hosted JS runtime, not Node; no npm ecosystem by default |
| Locust | Closed by default | Python scenarios, distributed workers, live web UI | Closed model needs care; `FastHttpUser` required for high per-worker throughput |
| Vegeta | Open | Constant arrival rate, HDR-quality latency reporting, trivial to pipe in shell and CI | Flat request lists; complex multi-step scenarios are awkward |
| wrk2 | Open | Constant throughput with coordinated-omission correction, very low client overhead | Lua scripting only, minimal reporting |
| Gatling | Open or closed | Strong scenario DSL, detailed HTML reports | Scala/Java toolchain and its build time |
| JMeter | Closed by default | Mature protocol coverage beyond HTTP, GUI test authoring | Heavyweight, high client resource use, closed-model defaults |

Whichever is chosen, verify the load generator is not the bottleneck: watch its CPU, its socket count, and its own latency floor against a trivial endpoint before trusting a run.

### 6. Write the test as an arrival-rate scenario

```javascript
// checkout-load.js — run: k6 run --out json=results.json checkout-load.js
import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';

const browseLatency = new Trend('browse_latency', true);

export const options = {
  discardResponseBodies: true,
  scenarios: {
    // Open model: arrival rate is held regardless of how slow responses get.
    steady_peak: {
      executor: 'ramping-arrival-rate',
      startRate: 50,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 4000,           // headroom so the client never throttles the model
      stages: [
        { target: 400, duration: '3m' },   // ramp to measured peak
        { target: 400, duration: '20m' },  // hold well past p99
        { target: 900, duration: '5m' },   // push toward the knee
        { target: 0,   duration: '2m' },   // drain, measure recovery
      ],
    },
  },
  thresholds: {
    'http_req_failed': ['rate<0.01'],
    'http_req_duration{endpoint:browse}': ['p(95)<300', 'p(99)<800'],
    'http_req_duration{endpoint:checkout}': ['p(95)<1200'],
    // Fail the run if k6 itself could not keep up with the arrival rate.
    'dropped_iterations': ['count<1'],
  },
};

const TENANTS = JSON.parse(open('./tenants.json')); // realistic key cardinality

export default function () {
  const tenant = TENANTS[Math.floor(Math.random() * TENANTS.length)];
  const roll = Math.random();

  // Mix taken from the 7-day production endpoint distribution.
  if (roll < 0.82) {
    const res = http.get(`${__ENV.BASE_URL}/api/products?tenant=${tenant}`, {
      tags: { endpoint: 'browse' },
      headers: { Authorization: `Bearer ${__ENV.TOKEN}` },
    });
    browseLatency.add(res.timings.duration);
    check(res, { 'browse 200': (r) => r.status === 200 });
  } else {
    const res = http.post(`${__ENV.BASE_URL}/api/checkout`, JSON.stringify({ tenant, items: 3 }), {
      tags: { endpoint: 'checkout' }, headers: { 'Content-Type': 'application/json' },
    });
    check(res, { 'checkout 2xx': (r) => r.status >= 200 && r.status < 300 });
  }
}
```

A constant-rate probe for a single endpoint, useful as a CI gate:

```bash
echo "GET https://staging.internal/api/products?tenant=42" \
  | vegeta attack -rate=200/1s -duration=5m -timeout=10s | tee results.bin | vegeta report

vegeta report -type='hist[0,50ms,100ms,250ms,500ms,1s,2s,5s]' < results.bin
vegeta plot < results.bin > latency.html
```

Locust with the high-throughput client:

```python
# locustfile.py — locust -f locustfile.py --headless -u 500 -r 50 -t 20m --host https://staging.internal
from locust import FastHttpUser, task, between, constant_throughput

class Shopper(FastHttpUser):
    # constant_throughput approximates an open model per user; think time for scenarios
    wait_time = constant_throughput(2)   # 2 iterations per second per user
    connection_timeout = 5.0
    network_timeout = 10.0

    @task(82)
    def browse(self):
        self.client.get("/api/products?tenant=42", name="/api/products")

    @task(18)
    def checkout(self):
        self.client.post("/api/checkout", json={"tenant": 42, "items": 3}, name="/api/checkout")
```

### 7. Read the results

- **Percentiles, never averages.** An average latency is dominated by the fast majority and hides the tail that users actually notice. Report p50, p95, p99, and max, per endpoint.
- **Do not average percentiles across intervals or workers.** Percentiles are not additive. Merge HDR histograms, or have the tool compute the percentile over the full result set.
- **Find the knee.** Plot throughput and p99 against offered load. Throughput rises linearly, then plateaus; p99 rises gently, then turns sharply upward. The knee is the last offered rate where latency is still acceptable, and it is the number capacity planning needs — not the maximum requests per second the system can technically emit.
- **Watch the error onset.** Errors usually begin slightly after the knee. Note the type: timeouts mean queueing, connection refusals mean pool or backlog exhaustion, 503s mean load shedding is working.
- **Apply Little's Law.** Concurrency equals arrival rate times average latency. If observed in-flight requests exceed that, requests are queueing somewhere the client cannot see. It also gives the pool sizing floor: 400 requests per second at 200 ms average needs at least 80 concurrent slots end to end.
- **Correlate with server-side telemetry.** Client latency alone cannot distinguish a saturated CPU from a saturated connection pool. Overlay CPU, memory, GC pauses, connection pool usage, database `await`, and queue depth on the same timeline. Then hand the hot component to `../performance-profiling/SKILL.md`.
- **Check the load generator.** Dropped iterations, client CPU saturation, or ephemeral port exhaustion invalidate the run.

### 8. Write the report

Record, at minimum: the load model and its telemetry source, the environment and every documented difference from production, tool and version, the exact command, the ramp profile, per-endpoint percentiles and error rates, the identified knee, the server-side resource that saturated first, and the capacity conclusion in the form "this configuration sustains N requests per second within the SLO, with M percent headroom to the knee". Store it beside the code and re-run it when the topology changes.

## Checklist

- [ ] Load model written down and traceable to production telemetry
- [ ] Endpoint mix, payload sizes, and key cardinality match measured reality
- [ ] Open model (arrival rate) used for user-facing traffic
- [ ] Environment differences from production enumerated in the report
- [ ] Dataset sized comparably to production, caches warmed to the measured hit ratio
- [ ] Load generator verified not to be the bottleneck (no dropped iterations, client CPU headroom)
- [ ] Server-side telemetry captured for the full run window
- [ ] Percentiles reported per endpoint; no averaged percentiles
- [ ] Latency knee and throughput plateau identified, not just peak throughput
- [ ] Error onset rate and error type recorded
- [ ] Concurrency cross-checked against Little's Law
- [ ] Capacity conclusion and headroom stated in the report

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Latency looks excellent right up to total failure | Closed-model tool suppressing offered load; coordinated omission | Switch to an arrival-rate executor or a tool that corrects for send-time delay |
| Throughput plateaus far below expectation | Load generator saturated, not the target | Check client CPU, socket limits, and dropped iterations; shard across multiple generators |
| Results far better than production behaviour | Single key reused, so everything is a cache hit | Use a realistic key distribution and match the production cache hit ratio |
| Errors are all connection refused | Listen backlog, connection pool, or ephemeral ports exhausted | Raise pool and backlog limits, enable keep-alive, verify with `ss -s` on both ends |
| p99 spikes on a regular interval | GC pauses, checkpointing, or a cron job on the host | Overlay runtime GC and host metrics; separate the periodic effect from the load effect |
| Test passes in staging, launch fails | Undocumented environment or data-volume difference | Enumerate every difference; re-run against production-shaped data and full ingress path |
| Numbers differ between runs with no change | Noisy neighbours, autoscaling mid-run, or too short a hold | Fix instance count during the run, lengthen the hold, repeat and report spread |
| No leak visible in a 10-minute run, OOM in production | Test too short to reveal slow growth | Run a soak of several hours and watch RSS, pool counts, and disk |
| Aggregated p99 lower than any single worker's p99 | Percentiles averaged across workers | Merge histograms rather than averaging percentiles |

## References

- `../performance-profiling/SKILL.md` — profiling the component that saturated first
- `../sre-slo-error-budgets/SKILL.md` — turning the knee into an SLO and an alerting threshold
- `../chaos-engineering/SKILL.md` — testing dependency failure rather than dependency load
- `../observability-instrumentation/SKILL.md` — the telemetry the load model is derived from
- `../benchmark-methodology/SKILL.md` — statistical rigour for comparative measurements
- k6 documentation: executors, scenarios, thresholds, and output formats
- Vegeta, wrk2, Locust, Gatling, JMeter, and HdrHistogram documentation
- Literature on coordinated omission, open versus closed workload models, and Little's Law
