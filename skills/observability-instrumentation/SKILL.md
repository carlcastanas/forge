---
name: observability-instrumentation
description: Instrument a service with OpenTelemetry traces, metrics, and logs so production questions can be answered after the fact. Covers signal selection, span naming, semantic conventions, metric cardinality control, log-to-trace correlation, sampling, and collector pipelines. Use when adding telemetry to a service, debugging why an existing dashboard cannot explain an incident, or cutting observability spend without losing signal.
metadata:
  origin: FORGE
---

# Observability Instrumentation

Instrumentation is finished when an engineer who was not present during an incident can reconstruct what happened from telemetry alone: which requests failed, where the latency went, and what the failing requests had in common. This skill covers what to emit, how to name it, how to keep cardinality and cost bounded, and how to wire the collector so signals stay correlated.

## When to activate

- An incident ended with "we could not tell which dependency was slow"
- Metrics exist but cannot be sliced by the dimension the question needs
- Traces exist but logs cannot be tied to a specific trace
- User says "add OpenTelemetry", "instrument this service", "we have no visibility", "reduce our metrics cardinality"

## When NOT to use

- Defining what "good" means numerically and alerting on it — see `../sre-slo-error-budgets/SKILL.md`
- Running a live incident with telemetry already in place — see `../incident-response/SKILL.md`
- Finding which function burns CPU inside one process — a profiler, not a tracer: `../performance-profiling/SKILL.md`
- Microsecond-budget paths where instrumentation overhead itself matters — see `../latency-critical-systems/SKILL.md`

## Prerequisites

- A backend that speaks OTLP (Tempo/Mimir/Loki, Jaeger, Prometheus with OTLP ingest, or a vendor)
- Ability to run the OpenTelemetry Collector as a sidecar, DaemonSet, or gateway
- Agreement on `service.name` values across the fleet before the first exporter ships

## Process

### 1. Pick the signal that answers the question

| Signal | Answers | Cost driver | Do not use it for |
| --- | --- | --- | --- |
| Metrics | "Is it broken, and how badly, right now?" | Unique label combinations | Per-request detail, user-level debugging |
| Traces | "Where did this request spend its time, and what did it call?" | Spans per second times retention | Aggregate rates, alert thresholds |
| Logs | "What exactly happened inside this one operation?" | Bytes ingested and indexed | Counting things, computing rates |

Aggregate with metrics, narrow with traces, confirm with logs. Alerting reads metrics only; a trace or log query is a debugging step, not an alert condition.

### 2. Instrument in dependency order, not code order

Instrument the boundaries where blame changes hands. Interior functions come last.

1. **Ingress edge** — HTTP/gRPC server handlers. Yields rate, errors, duration (RED) immediately.
2. **Outbound calls** — HTTP clients, database drivers, cache clients. Most latency lives here.
3. **Queue boundaries** — linked producer and consumer spans, plus queue depth and consumer lag as metrics.
4. **Business-critical transactions** — checkout, signup, payment capture: a named span and an outcome counter.
5. **Interior hot paths** — only once a trace shows a self-time gap worth explaining.

Auto-instrumentation covers steps 1 through 3 in most runtimes. Write manual spans for steps 4 and 5 only.

### 3. Bootstrap the SDK

```javascript
// tracing.js — run with: node --require ./tracing.js server.js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');
const { resourceFromAttributes } = require('@opentelemetry/resources');

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    'service.name': process.env.OTEL_SERVICE_NAME ?? 'checkout-api',
    'service.version': process.env.GIT_SHA ?? 'dev',
    'deployment.environment.name': process.env.APP_ENV ?? 'local',
  }),
  traceExporter: new OTLPTraceExporter(),   // reads OTEL_EXPORTER_OTLP_ENDPOINT
  instrumentations: [getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-fs': { enabled: false },  // fs spans drown out the rest
  })],
});

sdk.start();
process.on('SIGTERM', () => sdk.shutdown().finally(() => process.exit(0)));
```

Python needs no code change; the agent wraps the process:

```bash
pip install opentelemetry-distro opentelemetry-exporter-otlp
opentelemetry-bootstrap --action=install

OTEL_SERVICE_NAME=checkout-worker \
OTEL_RESOURCE_ATTRIBUTES="service.version=${GIT_SHA},deployment.environment.name=prod" \
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317 \
OTEL_TRACES_SAMPLER=parentbased_traceidratio OTEL_TRACES_SAMPLER_ARG=0.1 \
  opentelemetry-instrument gunicorn -w 4 app:wsgi
```

Set `service.name`, `service.version`, and `deployment.environment.name` everywhere. A trace missing `service.version` cannot answer "did the deploy cause this".

### 4. Name spans low-cardinality, attach detail as attributes

The span name is a grouping key. Anything unique per request belongs in an attribute.

```javascript
tracer.startSpan(`GET /orders/${orderId}`);   // wrong: one span-name group per order

const span = tracer.startSpan('GET /orders/:id', {   // right: template as the name
  attributes: {
    'http.request.method': 'GET',
    'http.route': '/orders/:id',
    'url.path': req.path,
    'server.address': 'orders.internal',
    'app.order.id': orderId,     // high cardinality is fine on a span
    'app.tenant.id': tenantId,
  },
});
```

Follow the OpenTelemetry semantic conventions instead of inventing keys: `http.request.method`, `http.response.status_code`, `http.route`, `url.path`, `url.full`, `server.address`, `server.port`, `db.system.name`, `db.query.text`, `db.collection.name`, `messaging.system`, `messaging.destination.name`, `messaging.operation.name`. Backends build their default views on these keys; custom keys silently opt out of every prebuilt dashboard. Namespace genuinely application-specific attributes (`app.`, `payments.`) so they never collide with a future convention.

Record failures on the span, not only in a log line: `span.recordException(err)` plus `span.setStatus({ code: SpanStatusCode.ERROR, message: err.code })`, with `span.end()` in a `finally` block so an early return never leaks an open span.

### 5. Control metric cardinality deliberately

A metric's cost is the product of its label values, and most backends keep a series long after it goes idle. Never label a metric with: user id, request id, trace id, session id, email, raw `url.path`, full SQL text, or an unbounded error string. Safe labels: route template, HTTP method, status class, dependency name, region, tenant tier (not tenant id), environment.

```javascript
const requestDuration = meter.createHistogram('http.server.request.duration', { unit: 's' });

requestDuration.record(elapsedSeconds, {
  'http.request.method': 'GET',
  'http.route': '/orders/:id',            // template, never the concrete path
  'http.response.status_code': 200,
});
```

When per-request identity is needed from a metric, use an exemplar: the histogram bucket carries a sampled trace id, linking a dashboard spike to an example trace without adding a label. A RED trio per route plus a USE trio (utilization, saturation, errors) per resource covers most dashboards and alerts. Query them as rates:

```promql
# Error ratio per route over 5m, from OTLP-ingested counters
sum by (http_route) (rate(http_server_request_duration_count{
  service_name="checkout-api", http_response_status_code=~"5.."}[5m]))
/
sum by (http_route) (rate(http_server_request_duration_count{
  service_name="checkout-api"}[5m]))
```

### 6. Correlate logs to traces

A log line without `trace_id` cannot be joined to anything. Inject the active span context into every structured record.

```javascript
const { context, trace } = require('@opentelemetry/api');
const log = require('pino')({
  mixin() {
    const span = trace.getSpan(context.active());
    if (!span) return {};
    const { traceId, spanId } = span.spanContext();
    return { trace_id: traceId, span_id: spanId };
  },
});
```

Python does the same via `OTEL_PYTHON_LOG_CORRELATION=true`. Log events, not narration: one structured line per meaningful state change, reusing the span attribute names.

### 7. Sample where the decision has all the information

Head sampling decides at the root span, before the outcome is known, so it discards errors at the same rate as successes. Tail sampling decides after the trace completes and can keep every error and every slow trace. Use `parentbased_traceidratio` at the SDK only when collector capacity forces it; prefer tail sampling in a gateway.

```yaml
# otelcol-gateway.yaml
receivers:
  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }

processors:
  memory_limiter:
    check_interval: 1s
    limit_percentage: 80
    spike_limit_percentage: 20
  attributes/scrub:
    actions:
      - { key: user.email, action: delete }
      - { key: http.request.header.authorization, action: delete }
      - { key: db.query.text, action: hash }
  tail_sampling:
    decision_wait: 15s
    num_traces: 100000
    policies:
      - name: keep-errors
        type: status_code
        status_code: { status_codes: [ERROR] }
      - name: keep-slow
        type: latency
        latency: { threshold_ms: 1500 }
      - name: baseline-sample
        type: probabilistic
        probabilistic: { sampling_percentage: 5 }
  batch: { send_batch_size: 8192, timeout: 5s }

exporters:
  otlp/traces: { endpoint: tempo:4317 }

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, attributes/scrub, tail_sampling, batch]
      exporters: [otlp/traces]
```

Processor order matters: `memory_limiter` first so the collector sheds load instead of dying, scrubbing before anything leaves the process, `batch` last. Tail sampling needs every span of a trace on the same instance, so put a `loadbalancing` exporter keyed on trace id in front of a gateway pool. Never sample metrics; cap log volume by dropping debug levels in production.

### 8. Verify before calling it done

```bash
# Collector self-telemetry: accepted spans should climb, failed exports should not
curl -s localhost:8888/metrics | grep -E 'otelcol_(receiver_accepted|exporter_send_failed)_spans'
```

Then run the real test: from a dashboard spike, click through to a trace, and from that trace to its logs. If any hop breaks, the instrumentation is not finished.

## Checklist

- [ ] `service.name`, `service.version`, `deployment.environment.name` set on every exporter
- [ ] Ingress, outbound clients, and queue boundaries covered by auto-instrumentation
- [ ] Span names are route templates or operation names, never containing ids
- [ ] Attribute keys follow the semantic conventions; custom keys namespaced
- [ ] No unbounded label on any metric; concrete paths replaced by `http.route`
- [ ] Errors set span status ERROR and call `recordException`
- [ ] Every log record carries `trace_id` and `span_id`
- [ ] Tail sampling keeps all error and slow traces
- [ ] Collector pipeline: `memory_limiter` first, scrubbing before export, `batch` last
- [ ] Dashboard to trace to log navigation verified end to end

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Traces stop at the service boundary | Uninstrumented outbound client, or a proxy stripping `traceparent` | Use the instrumented client; allow `traceparent`/`tracestate` through proxies and CDNs |
| Metrics writes rejected or queries time out | Cardinality explosion from an id or raw path in a label | Find the offending series; use a template or move the value to a span attribute |
| Dashboards show errors but no error traces exist | Head sampling dropped them before the outcome was known | Move to tail sampling with a `status_code` policy |
| Tail sampling keeps only fragments of traces | Spans for one trace landed on different collector instances | Add a `loadbalancing` exporter keyed on trace id in front of the pool |
| Collector OOMs under load spikes | No `memory_limiter`, or batches larger than available headroom | Put `memory_limiter` first; lower `send_batch_size` |
| Logs cannot be joined to traces | Span context not injected into the logger | Add a log mixin or enable the runtime's log correlation flag |
| Bill grows with no traffic growth | Debug logs and full-fidelity traces retained in production | Drop debug logs at the collector, apply tail sampling, shorten retention |

## References

- `../sre-slo-error-budgets/SKILL.md` — turning these signals into SLIs, SLOs, and burn-rate alerts
- `../incident-response/SKILL.md` — using the telemetry during a live incident
- `../performance-profiling/SKILL.md` — in-process analysis when a span shows unexplained self-time
- `../latency-critical-systems/SKILL.md` — instrumentation overhead inside tight latency budgets
- `../load-testing/SKILL.md` — generating the traffic that validates the instrumentation
- OpenTelemetry semantic conventions for HTTP, database, messaging, and resource attributes
- OpenTelemetry Collector docs: `tail_sampling`, `memory_limiter`, `attributes`, `loadbalancing`
- W3C Trace Context recommendation (`traceparent`, `tracestate`)
