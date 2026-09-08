---
name: idempotency-patterns
description: Design and implement idempotent HTTP endpoints, payment flows, and queue consumers using client-supplied idempotency keys, a dedupe store, and replayed responses. Use when a retried request could double-charge, double-create, or double-send, or when a client asks how to make POST safe to retry.
metadata:
  origin: FORGE
---

# Idempotency Patterns

Networks drop responses, clients retry, queues redeliver. Any write path reachable more than once with the same intent must produce one effect. This skill covers the mechanics: a client-supplied key, a dedupe record with a fingerprint and a lifetime, a stored response to replay, and a concurrency rule for the second request that arrives while the first is still running. Done means a retried request returns the original response, the side effect happened exactly once, and a *different* payload reusing the same key is rejected rather than silently misapplied.

## When to activate

- Adding or reviewing a `POST` endpoint that creates money movement, orders, invitations, or outbound messages
- A bug report describes duplicate charges, duplicate rows, or duplicate emails after a timeout or retry
- Wiring a queue consumer or webhook receiver where at-least-once delivery is the transport guarantee
- Designing a client SDK retry policy and deciding which requests may be replayed
- User says "idempotency key", "duplicate charge", "safe to retry", "exactly once", "deduplicate this job"

## When NOT to use

- Pure rate control or abuse prevention: see `../rate-limiting/SKILL.md`
- Inbound webhook signature verification, replay windows, and endpoint lifecycle: see `../webhook-design/SKILL.md`
- Queue topology, retry/backoff policy, and dead-letter handling: see `../background-jobs-queues/SKILL.md`
- General resource naming, status codes, and payload shape: see `../api-design/SKILL.md`
- One-off data repair scripts that run under human supervision: see `../data-backfill-migration/SKILL.md`

## Prerequisites

- A transactional store (Postgres assumed here) and optionally Redis
- Ability to add a table plus a migration; see `../database-migrations/SKILL.md`
- Knowledge of the request's *authorization scope* — idempotency keys must never cross tenants
- An error contract that distinguishes retryable from terminal failures; see `../error-handling/SKILL.md`

## Process

### 1. Reject the "exactly-once delivery" framing

Exactly-once *delivery* over an unreliable network is not achievable: the sender cannot distinguish a lost request from a lost response, so it must retry, so the receiver must see duplicates. What is achievable is **effectively-once processing** — at-least-once delivery plus receiver-side deduplication and idempotent effects. Design for that. Any vendor or design doc promising exactly-once delivery is describing dedupe under a different name, and the dedupe window is always finite.

Practical consequence: the dedupe record and the side effect must commit atomically, or the system has a window where one exists without the other.

### 2. Decide which methods need a key

`GET`, `HEAD`, `OPTIONS`, `TRACE` are safe. `PUT` and `DELETE` are idempotent by definition in RFC 9110 — repeating them yields the same resource state (note that a repeated `DELETE` returning `404` is still idempotent in effect, only the status differs). `POST` and `PATCH` are neither, and are the reason this skill exists.

Two ways to make a create idempotent:

- **Natural key.** A unique constraint on business data (`UNIQUE (tenant_id, external_order_ref)`) is the strongest form — no extra infrastructure, and it holds even against clients that forgot to send a key. Prefer it whenever a natural key exists.
- **Client-supplied idempotency key.** A UUIDv4 in an `Idempotency-Key` header, generated once per logical operation by the caller and reused across every retry of that operation. Required when no natural key exists.

Use both when possible. Also consider `PUT` with a client-generated resource id instead of `POST` — that removes the problem rather than managing it.

### 3. Scope and fingerprint the key

A key is only meaningful inside a scope. Store and match on the tuple, not the key alone:

`(tenant_id, api_key_id or user_id, route, idempotency_key)`

Cross-tenant collision on a bare key is a data-leak class bug, because a replay returns the *stored response body* to whoever presents the key. Scope by authenticated principal, always. See `../multi-tenancy-patterns/SKILL.md`.

Fingerprint the request so key reuse with different content is caught:

```python
import hashlib, json

def request_fingerprint(method: str, path: str, body: dict) -> str:
    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(f"{method}\n{path}\n{canonical}".encode()).hexdigest()
```

If a stored record exists with the same key but a different fingerprint, return `422` (or `409`) with a machine-readable code such as `idempotency_key_reuse`. Never process it.

### 4. Create the dedupe table

```sql
CREATE TYPE idempotency_state AS ENUM ('in_progress', 'completed');

CREATE TABLE idempotency_records (
  tenant_id        uuid              NOT NULL,
  principal_id     uuid              NOT NULL,
  route            text              NOT NULL,
  idempotency_key  text              NOT NULL,
  fingerprint      char(64)          NOT NULL,
  state            idempotency_state NOT NULL DEFAULT 'in_progress',
  response_status  smallint,
  response_headers jsonb,
  response_body    jsonb,
  locked_at        timestamptz       NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  expires_at       timestamptz       NOT NULL,
  PRIMARY KEY (tenant_id, principal_id, route, idempotency_key)
);

CREATE INDEX idempotency_records_expires_at_idx
  ON idempotency_records (expires_at);
```

The primary key *is* the dedupe mechanism. A concurrent second insert fails on the unique violation — that is the lock, no advisory locks needed. Reap with a periodic `DELETE FROM idempotency_records WHERE expires_at < now()` batched by a `LIMIT` to avoid long-running deletes.

### 5. Implement the request lifecycle

```typescript
type Outcome =
  | { kind: "replay"; status: number; body: unknown }
  | { kind: "conflict" }              // same key, different payload
  | { kind: "in_flight" }             // concurrent duplicate
  | { kind: "proceed" };

async function claim(tx: Tx, k: KeyScope, fp: string): Promise<Outcome> {
  const inserted = await tx.query(
    `INSERT INTO idempotency_records
       (tenant_id, principal_id, route, idempotency_key, fingerprint, expires_at)
     VALUES ($1,$2,$3,$4,$5, now() + interval '24 hours')
     ON CONFLICT DO NOTHING
     RETURNING 1`,
    [k.tenantId, k.principalId, k.route, k.key, fp],
  );
  if (inserted.rowCount === 1) return { kind: "proceed" };

  const existing = await tx.one(
    `SELECT fingerprint, state, response_status, response_body, locked_at
       FROM idempotency_records
      WHERE tenant_id=$1 AND principal_id=$2 AND route=$3 AND idempotency_key=$4`,
    [k.tenantId, k.principalId, k.route, k.key],
  );

  if (existing.fingerprint !== fp) return { kind: "conflict" };
  if (existing.state === "completed") {
    return { kind: "replay", status: existing.response_status, body: existing.response_body };
  }
  return { kind: "in_flight" };
}
```

Then, in the same database transaction that performs the side effect, flip the record to `completed` and store the serialized response. One transaction, one commit: the effect and its receipt are never out of sync.

```typescript
await db.transaction(async (tx) => {
  const order = await createOrder(tx, input);           // the side effect
  await tx.query(
    `UPDATE idempotency_records
        SET state='completed', response_status=$5, response_body=$6, completed_at=now()
      WHERE tenant_id=$1 AND principal_id=$2 AND route=$3 AND idempotency_key=$4`,
    [k.tenantId, k.principalId, k.route, k.key, 201, JSON.stringify(order)],
  );
  return order;
});
```

If the transaction rolls back, the `in_progress` row disappears with it and the retry starts clean. That is the reason to keep the claim inside the same transaction rather than in Redis.

### 6. Handle the concurrent duplicate

A second request arriving while the first is still running has two defensible answers:

| Policy | Response | Use when |
| --- | --- | --- |
| Reject fast | `409 Conflict` + `Retry-After: 1`, code `request_in_progress` | Default. Keeps connections free, pushes retry to the client. |
| Short wait | Poll the record for up to ~1s, then replay or `409` | Interactive flows where a second click should not surface an error. |

Never let the second request proceed to the side effect. Also bound the first one: treat a record whose `locked_at` is older than the endpoint's hard timeout as abandoned, and allow one reclaim. Without that, a crashed process wedges the key until expiry.

### 7. Choose a lifetime

The key lifetime must exceed the client's total retry horizon and stay short enough that the table does not become a second copy of the ledger. 24 hours is a common default; 7 days for payments where a support agent may replay a request manually. Publish the number in the API docs — a client that retries after expiry will create a duplicate and must know the boundary. Return the effective window in the response so the behavior is discoverable.

### 8. Apply to payments

Money makes the failure mode expensive, so layer three defenses:

1. **Charge intent.** Create the intent row first, with the idempotency key attached, before calling the PSP. Its id becomes the request id sent downstream, so the PSP's own dedupe aligns with the local one.
2. **Forward the key.** Every major PSP accepts an idempotency key on charge creation. Derive it deterministically from the intent id so a retry at any layer produces the same downstream key.
3. **Append-only ledger.** Ledger entries carry `UNIQUE (account_id, source_type, source_id)`. Even if every other layer fails, the double-write cannot land. Balances are derived, never mutated in place. See `../postgres-patterns/SKILL.md`.

State transitions must be guarded, not assumed: `UPDATE payments SET state='captured' WHERE id=$1 AND state='authorized'` and treat `rowCount = 0` as "already advanced", not as an error.

### 9. Apply to job queues and consumers

At-least-once delivery is the norm, so the consumer owns dedupe.

- **Dedupe key on enqueue.** Derive a deterministic job id from the payload (`sha256(tenant_id + event_type + entity_id + version)`). A duplicate enqueue collides and is dropped.
- **Consumer-side record.** Same table pattern, keyed by message id, committed in the same transaction as the work. Applies to webhook receivers too.
- **Transactional outbox.** Never write to the database and publish to the broker in two separate operations — a crash between them loses or duplicates the event. Insert the event into an `outbox` table inside the business transaction; a relay polls and publishes, marking rows sent. The relay is at-least-once, which is fine because consumers dedupe. See `../event-driven-architecture/SKILL.md`.

```sql
CREATE TABLE outbox (
  id            bigserial PRIMARY KEY,
  aggregate_id  uuid        NOT NULL,
  event_type    text        NOT NULL,
  payload       jsonb       NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz
);

CREATE INDEX outbox_unpublished_idx ON outbox (id) WHERE published_at IS NULL;
```

The partial index keeps the relay's scan proportional to the backlog, not the table.

### 10. Test the property, not the happy path

- Fire N concurrent identical requests; assert exactly one side effect and N identical response bodies.
- Kill the process between side effect and response; retry; assert one effect.
- Same key with a mutated field; assert `422`/`409` and zero effects.
- Replay after `expires_at`; assert a *new* effect and document that as intended.

## Checklist

- [ ] Every unsafe endpoint either has a natural unique constraint or requires `Idempotency-Key`
- [ ] Keys are scoped by tenant and principal, never global
- [ ] Request fingerprint stored and compared; mismatch rejected, never processed
- [ ] Dedupe record and side effect commit in one transaction
- [ ] Original status and body stored and replayed byte-identically
- [ ] Concurrent duplicate returns `409` (or waits) — never reaches the side effect
- [ ] Abandoned `in_progress` records are reclaimable after a bounded timeout
- [ ] Key lifetime documented in the API reference and enforced by a reaper
- [ ] Ledger or equivalent has a terminal unique constraint as last-line defense
- [ ] Concurrency and crash-recovery tests exist and run in CI

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Duplicate charges under load | Dedupe check and insert are separate statements | Rely on `INSERT ... ON CONFLICT DO NOTHING`; the unique index is the lock |
| Duplicate rows despite a key | Side effect committed in a different transaction than the record | Single transaction for both |
| Retry returns `500` after the effect succeeded | Response never persisted before the crash | Store the response inside the same commit |
| Key wedged, all retries `409` | Process crashed while `in_progress` | Reclaim records whose `locked_at` exceeds the endpoint timeout |
| Client sees another tenant's data on replay | Key not scoped to principal | Add tenant and principal to the primary key |
| Table growth outpaces traffic | No reaper, or `expires_at` never set | Index `expires_at`, run batched deletes on a schedule |
| Duplicates reappear after an incident | Retries exceeded the key lifetime | Lengthen the window or shorten the client retry horizon |
| Events lost on deploy | Publish after commit, outside the transaction | Transactional outbox with a relay |
| `PATCH` retried applies twice | Relative mutations such as `balance += 10` | Model as absolute state, or require a key plus version precondition |

## References

- RFC 9110 HTTP Semantics, sections on safe and idempotent methods
- IETF draft: The Idempotency-Key HTTP Header Field
- Postgres documentation: `INSERT ... ON CONFLICT`, unique indexes, transaction isolation
- Redis command documentation for SET (NX, PX) and EVAL
- `../background-jobs-queues/SKILL.md`
- `../event-driven-architecture/SKILL.md`
- `../webhook-design/SKILL.md`
- `../postgres-patterns/SKILL.md`
- `../api-design/SKILL.md`
