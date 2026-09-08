---
name: webhook-design
description: Designing and operating outbound webhooks — delivery semantics, event payload shape, HMAC signing with timestamps, retry backoff, ordering, replay protection, consumer idempotency, subscription lifecycle, and delivery debugging. Use when building a webhook producer, integrating a third-party webhook consumer, or diagnosing duplicate, missing, or out-of-order deliveries.
metadata:
  origin: FORGE
---

# Webhook Design

A webhook is an outbound HTTP call to infrastructure the producer does not control, over a network that drops and duplicates, to an endpoint that will be down at some point. Every guarantee has to be built explicitly. Done means each event is signed and timestamped, delivered at least once with bounded exponential backoff, safely reprocessable by a consumer that deduplicates, individually inspectable in a delivery log, and manually replayable when a consumer recovers from an outage.

## When to activate

- Building an outbound webhook system: event catalogue, signatures, retries, delivery log
- Writing a receiver for a third-party provider's webhooks
- Duplicate side effects, missing events, or events applied out of order
- Choosing between full state in the payload and a reference the consumer fetches
- Designing subscription registration, endpoint verification, or secret rotation
- User says "webhook signature verification", "webhook retries", "replay a delivery", "duplicate webhooks"

## When NOT to use

- Internal service-to-service messaging inside one trust boundary — `../event-driven-architecture/SKILL.md`
- Queue topology, worker concurrency, dead-letter handling for internal jobs — `../background-jobs-queues/SKILL.md`
- Deduplication keyed by a client-supplied header on a synchronous API — `../idempotency-patterns/SKILL.md`
- Throttling inbound traffic, or synchronous contract shape — `../rate-limiting/SKILL.md`, `../api-design/SKILL.md`

## Prerequisites

- Durable storage for events and per-attempt delivery records
- A background worker or queue that survives process restarts
- Per-endpoint secrets stored encrypted, supporting two active secrets during rotation
- A monotonic event identifier and a reliable event timestamp

## Process

### 1. Commit to at-least-once, and say so

Exactly-once delivery over HTTP does not exist. A consumer can process a request and have the 200 lost on the way back; the producer retries, the consumer sees it twice. Publish the guarantee in the integration documentation: at-least-once, unordered, with a stated retry schedule and retention window. Anything stronger breaks during the first partial outage. Persist the event before attempting delivery, in the same transaction as the state change it describes — an outbox. Otherwise a crash between commit and enqueue silently drops it.

```sql
CREATE TABLE webhook_event (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  type         text NOT NULL,               -- 'invoice.paid'
  payload      jsonb NOT NULL,
  aggregate_id text NOT NULL,               -- ordering scope: the invoice id
  sequence     bigint NOT NULL,             -- per-aggregate, monotonic
  occurred_at  timestamptz NOT NULL
);

CREATE TABLE webhook_delivery (
  id              uuid PRIMARY KEY,
  event_id        uuid NOT NULL REFERENCES webhook_event(id),
  endpoint_id     uuid NOT NULL,
  attempt         int  NOT NULL,
  status          text NOT NULL,            -- pending | delivered | failed | exhausted
  response_status int,
  response_body   text,                     -- truncated, for the delivery log UI
  error           text,
  next_attempt_at timestamptz
);

CREATE INDEX ON webhook_delivery (status, next_attempt_at) WHERE status = 'pending';
```

### 2. Design the payload: thin by default, fat by exception

A thin event carries identity and type; the consumer calls back for current state. A fat event carries state inline. Thin wins when the resource is large, contains access-controlled fields, or when acting on a stale snapshot is dangerous. Fat wins when the consumer needs a few fields, cannot authenticate a callback cheaply, or must absorb bursts without hammering the API. The practical middle ground is a stable envelope, a small denormalised `data` block, and enough identity to fetch more.

```json
{
  "id": "evt_01J8ZK3QX9",
  "type": "invoice.paid",
  "api_version": "2026-02-01",
  "created_at": "2026-09-08T04:12:07.412Z",
  "sequence": 41,
  "data": {
    "object": "invoice",
    "id": "inv_01H9",
    "status": "paid",
    "amount_cents": 45900,
    "currency": "PHP",
    "customer_id": "cus_01G4"
  },
  "previous_attributes": { "status": "open" }
}
```

Rules: event types are `noun.past_tense_verb`, namespaced and never renamed; the envelope is versioned separately from the resource body; adding a field to `data` is non-breaking, removing or retyping one is not (`../api-versioning-deprecation/SKILL.md`). Never put secrets, full card numbers, or credentials in a payload — the consumer will log it.

### 3. Sign with an HMAC over timestamp plus body

The signature proves the request came from the producer and that the body was not modified. Signing the timestamp too is what stops an attacker replaying a captured request forever.

```http
POST /hooks/billing HTTP/1.1
Content-Type: application/json
Webhook-Id: evt_01J8ZK3QX9
Webhook-Timestamp: 1757304727
Webhook-Signature: v1,k3F9xVQe7t0oQ1r2Ub8mZC5sJhL0nD4pW6aY8eR2tK0= v1,QmFja3VwU2VjcmV0U2lnbmF0dXJl
```

Sign `id.timestamp.rawBody`, emit a space-separated list so two secrets can be valid during rotation, and prefix each with a scheme version so the algorithm can change later.

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";
const TOLERANCE_SECONDS = 300;

export function verify(req: { headers: Record<string, string>; rawBody: Buffer }, secrets: string[]) {
  const id = req.headers["webhook-id"];
  const ts = Number(req.headers["webhook-timestamp"]);
  if (!id || !Number.isFinite(ts)) throw new Error("missing signature headers");
  if (Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) throw new Error("timestamp outside tolerance");

  // sign the RAW bytes: re-serialising JSON changes key order and whitespace
  const signed = `${id}.${ts}.${req.rawBody.toString("utf8")}`;
  const candidates = (req.headers["webhook-signature"] ?? "")
    .split(" ").filter((s) => s.startsWith("v1,")).map((s) => Buffer.from(s.slice(3), "base64"));

  const ok = secrets.some((secret) => {
    const expected = createHmac("sha256", Buffer.from(secret, "base64")).update(signed).digest();
    return candidates.some((c) => c.length === expected.length && timingSafeEqual(c, expected));
  });
  if (!ok) throw new Error("signature mismatch");
  return { id, ts };
}
```

Three details that break implementations: verify against the raw request bytes captured before any JSON body parser runs; compare in constant time; treat a missing or malformed header as failure rather than skipping verification. Rotation is a window during which the producer sends two signatures and the consumer accepts either — see `../security-review/SKILL.md`.

### 4. Retry with exponential backoff and full jitter

An endpoint that goes down takes every one of its pending deliveries with it. Undelayed or unjittered retries turn recovery into a thundering herd against a service that just came back.

```python
import random

BASE, CAP, MAX_ATTEMPTS = 5.0, 3600.0, 12   # seconds; roughly a day of coverage

def next_delay(attempt: int) -> float:  # full jitter: uniform [0, min(cap, base * 2**attempt))
    return random.uniform(0, min(CAP, BASE * (2 ** attempt)))

def classify(status: int | None, exc: Exception | None) -> str:
    if exc is not None or status is None:     # DNS, TLS, connect, read timeout
        return "retry"
    if status == 410:                         # Gone: consumer asked to be removed
        return "disable"
    if status == 429 or 500 <= status < 600:
        return "retry"
    if 200 <= status < 300:
        return "ok"
    return "fail"                             # other 4xx: consumer bug, retrying will not help
```

Honour `Retry-After` on 429 and 503 when present and sane. Cap the attempt window and the per-request timeout (10 seconds is generous; consumers must acknowledge fast and process asynchronously). After the final attempt mark the delivery `exhausted` and surface it in the log — never delete it. Auto-disable an endpoint after a sustained failure streak and notify the owner, or a dead integration consumes retry capacity indefinitely.

### 5. Be explicit that ordering is not guaranteed

Concurrent workers, retries, and per-endpoint backoff all reorder events. `invoice.paid` can arrive before `invoice.created`. Three options, in increasing cost:

- Include enough state that order does not matter: a `sequence` per aggregate plus the current status. The consumer discards any event whose sequence does not advance what it has stored. Almost always the right answer.
- Serialise per aggregate: one in-flight delivery per `aggregate_id`, successors blocked while one retries. Head-of-line blocking is the price.
- Let the consumer reconstruct order by fetching current state on every event (a thin payload).

```sql
-- consumer side: apply only if this event advances the aggregate
UPDATE local_invoice
SET status = $3, amount_cents = $4, last_sequence = $2
WHERE id = $1 AND last_sequence < $2;
```

### 6. Make the consumer idempotent and replay-proof

The consumer, not the producer, is where duplicates must die. Key on the producer's event id, which is stable across retries of the same event.

```typescript
export async function handle(req: Request, res: Response) {
  const { id, ts } = verify(req, await secretsFor(req.params.endpointId)); // §3, includes timestamp window

  // replay protection: unique constraint does the work, no read-then-write race
  const inserted = await db.query(
    `INSERT INTO processed_webhook (event_id, received_at)
     VALUES ($1, to_timestamp($2)) ON CONFLICT (event_id) DO NOTHING`,
    [id, ts],
  );
  if (inserted.rowCount === 0) return res.status(200).send("duplicate");

  await enqueue({ eventId: id, body: req.rawBody }); // acknowledge fast, process off-thread
  return res.status(202).send();
}
```

The timestamp tolerance bounds how long a captured request stays useful; `processed_webhook` makes it useless immediately. Retain those rows at least as long as the producer's maximum retry window plus a margin, then prune. Respond before doing the work: a consumer that runs a slow job inline hits the producer's timeout, gets retried, and runs the job twice.

### 7. Verify endpoints and manage the subscription lifecycle

Registering an arbitrary URL and immediately POSTing to it makes the webhook system a request-forgery amplifier. Prove ownership first.

1. On registration, generate a secret and a one-time challenge; return the secret exactly once.
2. Send a signed `endpoint.verification` event carrying the challenge; require the endpoint to echo it.
3. Reject URLs resolving to private, loopback, or link-local addresses, and re-resolve at delivery time — DNS can be rebound after registration. Require HTTPS with certificate validation, no opt-out.
4. Keep an event-type subscription list per endpoint so consumers receive only what they asked for.
5. Support two live secrets so rotation needs no downtime; expire the old one on a schedule.

### 8. Give operators a delivery log, redrive, and manual replay

Every integration debugging session asks the same three questions: was it sent, what was sent, what came back.

```bash
# what happened to one event across all endpoints
curl -s "$API/v1/events/evt_01J8ZK3QX9/deliveries" \
  | jq '.[] | {endpoint: .endpoint_url, attempt, status, response_status, next_attempt_at, error}'

# redrive everything that exhausted for one endpoint in a window
curl -s -X POST "$API/v1/endpoints/ep_01H2/redrive" \
  -d '{"status":"exhausted","since":"2026-09-07T00:00:00Z","until":"2026-09-08T00:00:00Z"}'

# replay a single event, preserving the original id so consumer dedupe still applies
curl -s -X POST "$API/v1/events/evt_01J8ZK3QX9/replay" -d '{"endpoint_id":"ep_01H2"}'
```

Store request headers, request body, response status, a truncated response body, and duration per attempt; redact the signature header before display. Replay must reuse the original event id — a new id defeats the consumer's deduplication and causes exactly the double-processing the replay was meant to avoid.

## Checklist

- [ ] Events written in the same transaction as the state change (outbox), delivered by a worker
- [ ] Delivery guarantee documented as at-least-once and unordered, with the retry schedule published
- [ ] Payload envelope versioned; event types namespaced, past tense, never renamed; no secrets in payloads
- [ ] HMAC over `id.timestamp.rawBody`; consumer verifies raw bytes with a constant-time compare
- [ ] Timestamp tolerance enforced; malformed headers rejected by default; two secrets supported for rotation
- [ ] Exponential backoff with full jitter, a delay cap, an attempt cap, and a request timeout
- [ ] Retryable and non-retryable responses classified; `Retry-After` honoured; 410 disables the endpoint
- [ ] Per-aggregate `sequence` in the payload so consumers can discard stale events
- [ ] Consumer deduplicates on event id via a unique constraint and acknowledges before processing
- [ ] Endpoint ownership verified by challenge; private-address URLs rejected and re-resolved at send time
- [ ] Per-attempt delivery log with redrive and id-preserving replay

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Consumer charges or emails twice | No deduplication on event id | Unique constraint on `event_id`; insert before side effects |
| Signature always mismatches | Verifying re-serialised JSON, not raw bytes | Capture the raw body before the JSON parser runs |
| Verification passes on replayed traffic | Timestamp not signed or not checked | Sign `id.timestamp.body`; enforce a tolerance window |
| Endpoint recovers, then falls over again | Unjittered retries fire in lockstep | Full jitter on backoff; cap concurrency per endpoint |
| Events arrive in the wrong order | Concurrent delivery workers | Publish `sequence`; consumer applies only if it advances |
| Events silently missing | Enqueued after commit; process crashed in between | Write to an outbox in the same transaction |
| Deliveries marked failed though the consumer succeeded | Consumer processing inline, exceeding the timeout | Return 2xx immediately, process from a queue |
| Retry queue saturated by one dead customer | No auto-disable, no per-endpoint concurrency cap | Disable after a failure streak; isolate per endpoint |
| Registration used to probe internal services | No egress validation | Block private/loopback ranges; re-resolve DNS at delivery |
| Replayed events processed twice | Replay minted a new event id | Preserve the original id on replay |

## References

- RFC 9110 HTTP Semantics (status code semantics, `Retry-After`)
- RFC 2104 HMAC: Keyed-Hashing for Message Authentication; RFC 6234 US Secure Hash Algorithms
- Standard Webhooks specification (`Webhook-Id`, `Webhook-Timestamp`, `Webhook-Signature` headers)
- `../idempotency-patterns/SKILL.md`, `../event-driven-architecture/SKILL.md`, `../background-jobs-queues/SKILL.md`
- `../api-versioning-deprecation/SKILL.md`, `../security-review/SKILL.md`, `../postgres-patterns/SKILL.md`
