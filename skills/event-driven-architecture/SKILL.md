---
name: event-driven-architecture
description: Designing events, topics, schemas, and consumers for asynchronous systems built on a log or broker. Covers message taxonomy, payload shape, schema evolution, partitioning, the transactional outbox, idempotent consumption, DLQs, and replay. Use when introducing a message broker, naming a new event, changing an event payload, or debugging duplicate, out-of-order, or stuck messages.
metadata:
  origin: FORGE
---

# Event-Driven Architecture

Asynchronous messaging trades synchronous coupling for a new set of failure modes: duplicates, reordering, schema drift, and silent consumer lag. This skill fixes the decisions that are expensive to reverse — message taxonomy, event names, payload shape, partition key, and schema compatibility mode — and specifies the mechanics that make the rest survivable. Done looks like: every topic has a registered schema with a declared compatibility mode, every producer writes through an outbox in the same transaction as its state change, every consumer is idempotent and has a DLQ, and lag and DLQ depth are alerted on.

## When to activate

- Adding a broker (Kafka, Pulsar, Redpanda, SNS/SQS, NATS, Rabbit) to a service that currently calls peers synchronously.
- Naming a new event or topic, changing an event payload, or debugging duplicates, reordering, or lag.
- Designing a replay or reprocessing run against historical events.
- User says "publish an event", "add a message broker", "consumer lag", "outbox pattern", "schema registry".

## When NOT to use

- Unit-of-work background processing owned by one service (email send, thumbnail render, report build) — that is a job queue, see [background-jobs-queues](../background-jobs-queues/SKILL.md).
- Request/response contracts between services — see [api-design](../api-design/SKILL.md) and [contract-first](../contract-first/SKILL.md).
- Deduplicating inbound HTTP requests — see [idempotency-patterns](../idempotency-patterns/SKILL.md).
- Outbound HTTP callbacks to third parties — see [webhook-design](../webhook-design/SKILL.md).

## Prerequisites

- A broker with durable, replayable storage and consumer offset tracking.
- A transactional database in the producing service (the outbox lives there) and a schema registry or versioned schema directory.
- Knowledge of the delivery guarantee your broker actually provides (almost always at-least-once).

## Process

### 1. Classify the message before naming it

Three kinds, and mixing them is the root of most event-system rot.

| Kind | Intent | Name | Receivers | Coupling |
| --- | --- | --- | --- | --- |
| Event | A fact that already happened | Past tense: `OrderPlaced` | 0..n, unknown to producer | Producer owns the schema; consumers adapt |
| Command | A request for someone to act | Imperative: `CapturePayment` | Exactly 1, known | Receiver owns the schema |
| Document | A snapshot of state, no intent | Noun: `CustomerSnapshot` | 0..n | Shared, versioned |

Rule: a producer must never know who consumes its events. If the payload contains a field that exists only because one downstream needs it, that is a command wearing an event's name. Put commands on their own topics with a single owning consumer.

### 2. Name events and topics

`<domain>.<aggregate>.<verb-past-tense>.v<major>` — `billing.invoice.finalized.v1`. Constraints: no service names in topic names (services get renamed and merged); no `updated` as a verb (it carries no business meaning — prefer `address_changed`, `plan_upgraded`); one aggregate per topic so the partition key is unambiguous.

### 3. Design the payload

Every event carries the same envelope; domain data sits under `data`. `event_id` is a ULID, generated once by the producer and never regenerated on retry — it is the consumer's dedup key. `sequence` is a monotonic per-aggregate counter used to discard stale updates when the broker only guarantees per-partition order.

```json
{
  "event_id": "01JCE8S6QF3T9M0V2B7R5K4XQ7",
  "event_type": "billing.invoice.finalized",
  "event_version": 3,
  "occurred_at": "2026-03-11T09:14:02.118Z",
  "producer": "billing-api",
  "partition_key": "inv_9f2c",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "sequence": 41,
  "data": {
    "invoice_id": "inv_9f2c",
    "account_id": "acct_31a",
    "currency": "PHP",
    "total_minor": 1849900,
    "finalized_by": "usr_88b"
  }
}
```

Two payload strategies. **Event-carried state transfer** includes the fields consumers need so they never call back; it removes read-time coupling and lets consumers build local read models, at the cost of larger payloads and a wider set of fields that are now breaking to remove. **Thin notification** carries identifiers and a version only; consumers fetch current state over the API, which keeps the contract small but creates a synchronous dependency at consume time and returns state newer than the event.

Default to event-carried state transfer for facts other domains project into read models. Use thin notification when the entity is large, contains data most consumers must not see, or changes far faster than it is consumed — see [security-review](../security-review/SKILL.md).

### 4. Register the schema and pick a compatibility mode

| Mode | Allows | Upgrade order |
| --- | --- | --- |
| `BACKWARD` | Delete a field; add an optional field | Consumers first |
| `FORWARD` | Add a field; delete an optional field | Producers first |
| `FULL` | Add/delete optional fields only | Either order |
| `NONE` | Anything | Coordinated stop |

Default to `BACKWARD` for events consumed by teams you do not control: it lets you deploy consumers ahead of producers. Safe under `BACKWARD` — adding a field with a default, widening an enum the consumer treats as opaque, relaxing a constraint. Always breaking — renaming a field, changing a type, tightening a constraint, changing units or currency scale, changing the meaning of a field without renaming it.

```bash
# Fail CI when a proposed schema breaks the registered contract.
curl -sS -X POST \
  "$REGISTRY/compatibility/subjects/billing.invoice.finalized-value/versions/latest" \
  -H 'Content-Type: application/vnd.schemaregistry.v1+json' \
  --data-binary @schemas/billing/invoice_finalized.v3.json \
  | jq -e '.is_compatible == true'
```

When a change is genuinely breaking, publish a new major topic (`...v2`), dual-publish both for a deprecation window, and retire `v1` on a published date — see [api-versioning-deprecation](../api-versioning-deprecation/SKILL.md).

### 5. Choose the partition key

Order is guaranteed per partition, never across a topic. The partition key therefore defines your ordering unit and your unit of parallelism at once.

Key by the aggregate ID whose invariants require ordering — `invoice_id`, not `account_id`, unless account-level ordering is genuinely required. Never key by a low-cardinality value (region, plan tier, status): it caps concurrency at the number of distinct values and produces hot partitions. Never key by something mutable; if the key changes, the entity's history splits across partitions and order is lost. Increasing partition count later rehashes keys and breaks ordering for in-flight keys, so size for peak throughput at creation time. A bare tenant ID is a hot-partition generator when one tenant dominates — prefer `tenant_id:entity_id` and handle tenant-level ordering in the consumer, see [multi-tenancy-patterns](../multi-tenancy-patterns/SKILL.md).

### 6. Publish through a transactional outbox

A database commit and a broker publish cannot be made atomic by trying harder. Write the event in the same transaction as the state change; let a relay move it.

```sql
CREATE TABLE outbox (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id       uuid        NOT NULL UNIQUE,
  aggregate_type text        NOT NULL,
  aggregate_id   text        NOT NULL,
  event_type     text        NOT NULL,
  partition_key  text        NOT NULL,
  payload        jsonb       NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  published_at   timestamptz
);

-- Only unpublished rows are ever scanned.
CREATE INDEX outbox_unpublished_idx ON outbox (id) WHERE published_at IS NULL;

-- Relay claims a batch without blocking sibling relay instances.
SELECT id, event_id, event_type, partition_key, payload
FROM outbox
WHERE published_at IS NULL
ORDER BY id
FOR UPDATE SKIP LOCKED
LIMIT 500;
```

Publish, then mark `published_at = now()` for the succeeded IDs. A crash between publish and mark republishes the event — that is why consumers must be idempotent. Delete published rows on a retention window (`published_at < now() - interval '7 days'`) so the table does not grow without bound.

The alternative relay is CDC: tail the WAL with a log-based connector and emit outbox inserts to the broker. CDC removes the polling loop and the write amplification, at the cost of running replication infrastructure. Do not CDC business tables directly — the table schema then becomes the public event contract, and every column rename becomes a breaking change for every consumer.

### 7. Consume idempotently

At-least-once is the delivery model. Design every handler so that processing the same `event_id` twice has the same effect as once.

```typescript
// Dedup and side effect commit in one transaction; the unique violation is the dedup.
async function handle(event: DomainEvent): Promise<void> {
  await db.transaction(async (tx) => {
    const claimed = await tx.query(
      `INSERT INTO processed_events (event_id, consumer_group, processed_at)
       VALUES ($1, $2, now())
       ON CONFLICT (event_id, consumer_group) DO NOTHING
       RETURNING event_id`,
      [event.event_id, CONSUMER_GROUP],
    );
    if (claimed.rowCount === 0) return; // already applied

    // last_sequence guard drops stale reordered updates; 0 rows means newer state won.
    await tx.query(
      `UPDATE invoice_projection
          SET total_minor = $2, state = 'finalized', last_sequence = $3
        WHERE invoice_id = $1 AND last_sequence < $3`,
      [event.data.invoice_id, event.data.total_minor, event.sequence],
    );
  });
}
```

Prefer natural idempotency: upserts keyed by aggregate ID, `SET x = $1` instead of `SET x = x + $1`, conditional updates gated on `last_sequence`. The dedup table is the fallback when the effect is not naturally idempotent (charging a card, sending mail) — pair it with a provider-side idempotency key, see [idempotency-patterns](../idempotency-patterns/SKILL.md). Purge dedup rows on a window longer than the maximum replay horizon.

### 8. Size consumer groups and survive rebalancing

One consumer group per logical consumer, not per service instance. Concurrency is capped at the partition count; extra instances idle. Rebalance rules that matter in practice:

- Commit offsets only after the handler's transaction commits. Auto-commit loses messages on crash.
- Keep the handler faster than `max.poll.interval.ms`. A slow handler is evicted mid-batch, its partition reassigned, and the batch redelivered. Move slow work to a job queue.
- Use cooperative/incremental rebalancing, static group membership, and a session timeout longer than a rolling restart, so routine deploys do not stop-the-world every partition.

### 9. Handle poison messages and the DLQ

A message that fails deterministically will block its partition forever if retried in place. Bound the retries.

```typescript
const MAX_ATTEMPTS = 5;

async function process(msg: Message): Promise<void> {
  const attempt = Number(msg.headers['x-attempt'] ?? 0) + 1;
  try {
    await handle(decode(msg));
  } catch (err) {
    if (isRetriable(err) && attempt < MAX_ATTEMPTS) {
      // Delay tier topics avoid head-of-line blocking on the main partition.
      await producer.send(retryTopicFor(attempt), {
        ...msg,
        headers: { ...msg.headers, 'x-attempt': String(attempt) },
      });
      return;
    }
    await producer.send(DLQ_TOPIC, {
      ...msg,
      headers: {
        ...msg.headers,
        'x-attempt': String(attempt),
        'x-error-class': err.constructor.name,
        'x-error-message': String(err.message).slice(0, 1024),
        'x-source': `${msg.topic}/${msg.partition}/${msg.offset}`,
        'x-failed-at': new Date().toISOString(),
      },
    });
  }
}
```

Distinguish retriable (timeout, 503, deadlock, lock wait) from terminal (schema violation, unknown enum, referential integrity, authorization); terminal errors go straight to the DLQ. Routing a failure to a retry topic while later messages for the same key proceed breaks per-key order — when order is an invariant, pause the partition and page a human instead. A DLQ is not an archive: alert on any non-zero depth, keep source topic, partition, and offset in headers, and build a redrive tool that replays selected messages back to the source topic after a fix.

### 10. Plan replay and reprocessing

Replay is the payoff for keeping the log. Preconditions: retention long enough to cover the window, consumers that are idempotent, and a consumer group you can reset without disturbing production.

```bash
# Reprocess a window into a fresh group, leaving the live group untouched.
kafka-consumer-groups --bootstrap-server "$BROKERS" \
  --group invoice-projector-rebuild-2026-03-11 \
  --topic billing.invoice.finalized.v1 \
  --reset-offsets --to-datetime 2026-03-01T00:00:00.000 --execute
```

Run the rebuild group against a shadow table and swap on completion. Suppress outbound side effects (mail, webhooks, payments) behind a replay flag in the consumer config, never in the message. Throttle: replay traffic runs far above steady state and will saturate the database otherwise. Reprocessing with a changed projection is a backfill — see [data-backfill-migration](../data-backfill-migration/SKILL.md).

## Checklist

- [ ] Each topic carries one message kind; events are past tense with no consumer-specific fields; the envelope is complete.
- [ ] Schema is registered; CI fails on an incompatible change against the declared mode.
- [ ] Partition key is immutable, high cardinality, and matches the required ordering unit.
- [ ] Producers write to an outbox in the same transaction as the state change; a relay or CDC publishes.
- [ ] Outbox has a partial index on unpublished rows and a retention job for published rows.
- [ ] Consumers dedup on `event_id` per consumer group, or the effect is naturally idempotent.
- [ ] Retries bounded; terminal errors bypass them; DLQ preserves source topic/partition/offset; offsets commit after the handler transaction.
- [ ] Alerts on consumer lag, oldest unpublished outbox row age, and DLQ depth.
- [ ] Replay runbook exists: retention window, side-effect suppression, throttle, shadow-table swap.

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| State committed, event never seen (or the inverse) | Publish sits outside the DB transaction | Move the publish into the outbox row inside the transaction |
| Duplicate side effects downstream | Consumer assumes exactly-once | Dedup on `event_id` in the same transaction as the effect |
| One partition lags, others idle | Low-cardinality or skewed partition key | Repartition on a higher-cardinality key; salt hot tenants |
| Consumers see out-of-order updates | Ordering assumed across partitions, or key changed mid-life | Gate updates on a per-aggregate `sequence`; make the key immutable |
| Continuous rebalancing during deploys | Handler exceeds max poll interval, or session timeout under restart time | Shrink batch, offload slow work, use static membership and cooperative rebalancing |
| Partition stalled at one offset | Poison message retried in place forever | Bound attempts, route to DLQ, alert on DLQ depth |
| Consumer breaks after a producer deploy | Field renamed or type changed under a compatibility mode that allowed it | Set `BACKWARD` or `FULL`, enforce in CI, use a new major topic for real breaks |
| Replay knocks over the database or emails users | No throttle, side effects not suppressed | Rebuild-group replay into a shadow table with a replay flag and rate cap |

## References

- Enterprise Integration Patterns: Event Message, Command Message, Document Message, Dead Letter Channel, Idempotent Receiver.
- Transactional outbox pattern; Change Data Capture; Event-Carried State Transfer.
- Apache Kafka documentation: topics and partitions, consumer groups, incremental cooperative rebalancing, offset management, log retention.
- Confluent Schema Registry documentation: schema compatibility types.
- PostgreSQL documentation: SELECT ... FOR UPDATE SKIP LOCKED, partial indexes, logical replication.
- [../background-jobs-queues/SKILL.md](../background-jobs-queues/SKILL.md), [../idempotency-patterns/SKILL.md](../idempotency-patterns/SKILL.md), [../data-backfill-migration/SKILL.md](../data-backfill-migration/SKILL.md), [../postgres-patterns/SKILL.md](../postgres-patterns/SKILL.md)
