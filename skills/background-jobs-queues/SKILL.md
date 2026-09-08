---
name: background-jobs-queues
description: Designing, running, and operating asynchronous background jobs on a queue. Covers job shape, visibility timeouts and leases, retry and backoff policy, dead-letter queues and redrive, scheduling, tenant fairness, checkpointed long jobs, graceful shutdown, concurrency control, and worker observability. Use when adding a worker, a job is stuck or duplicated, retries are storming a dependency, or queue depth is climbing.
metadata:
  origin: FORGE
---

# Background Jobs and Queues

Moving work off the request path is easy; keeping it correct under retries, redeploys, and one noisy tenant is the hard part. This skill covers the job contract (small, idempotent, arguments by reference), the runtime mechanics (lease, heartbeat, backoff, DLQ, drain), and the operational surface (depth, oldest-message age, latency percentiles, failure rate). Done looks like: every job is safe to run twice, every job has a bounded attempt count and a DLQ, deploys drain rather than kill, and a dashboard answers "is the queue healthy" without reading logs.

## When to activate

- Moving slow work (email, PDF render, export, third-party sync, webhook delivery) out of a request handler.
- A job runs twice, or runs while a previous attempt is still running.
- Retries are hammering a dependency, or a permanent failure is retrying forever.
- Queue depth or oldest-message age is climbing, or one tenant's bulk import is starving the rest.
- User says "background job", "worker", "queue is backed up", "job stuck", "dead letter queue", "cron job".

## When NOT to use

- Cross-service domain facts published for unknown consumers — see [event-driven-architecture](../event-driven-architecture/SKILL.md).
- Deduplicating inbound API requests — see [idempotency-patterns](../idempotency-patterns/SKILL.md).
- One-shot bulk rewrites of existing rows — see [data-backfill-migration](../data-backfill-migration/SKILL.md).
- Django/Celery-specific configuration — see [django-celery](../django-celery/SKILL.md).

## Prerequisites

- A broker with per-message visibility timeout or lease semantics (SQS, Redis Streams, PGMQ, RabbitMQ, Sidekiq, Celery).
- A durable store for job state and checkpoints, and metrics that read broker-side gauges rather than only in-process counters.

## Process

### 1. Shape the job

Four rules. **Small.** One job, one unit of work, bounded by a predictable runtime. "Send one email", not "send the campaign". A fan-out job that enqueues N children beats one job that loops N times: children retry independently, parallelize, and never lose 40 minutes of progress to one timeout. **Idempotent.** Every job runs at least twice eventually — lease expiry, redeploy mid-flight, manual redrive — so make the second run a no-op. **Arguments by reference.** Pass IDs, not objects: a serialized snapshot is stale by execution time, bloats the broker, and turns every model change into a poison-message incident on jobs already in flight.

```python
# Wrong: state by value, unbounded runtime, no dedup key.
enqueue("send_invoices", {"invoices": [inv.to_dict() for inv in batch]})

# Right: reference, one unit, versioned payload, deterministic dedup key.
for invoice_id in invoice_ids:
    enqueue("send_invoice_email", {
        "v": 2, "invoice_id": invoice_id,
        "dedup_key": f"invoice_email:{invoice_id}:v2",
    })
```

Version the payload so a worker seeing an old shape handles it rather than crashing. Jobs enqueued before a deploy execute after it, so the payload contract spans versions exactly like an API — see [api-versioning-deprecation](../api-versioning-deprecation/SKILL.md).

### 2. Set the visibility timeout and heartbeat

A dequeued message is invisible to other workers for the visibility timeout (lease); if the worker has not deleted it by then, the broker redelivers. Too short and a slow job runs concurrently with itself; too long and a crashed worker's job sits dead for the whole window. Set the base near p99 duration plus headroom, then extend from inside the job.

```python
@contextmanager
def lease(queue_url, receipt_handle, seconds=60, interval=20, max_total=1800):
    """Extend the message lease while work runs; give up past max_total."""
    stop, lost = threading.Event(), threading.Event()

    def beat():
        elapsed = 0
        while not stop.wait(interval):
            elapsed += interval
            if elapsed > max_total:
                lost.set(); return  # wedged: surrender rather than hold forever
            try:
                sqs.change_message_visibility(
                    QueueUrl=queue_url, ReceiptHandle=receipt_handle,
                    VisibilityTimeout=seconds)
            except ClientError:
                lost.set(); return  # another worker owns it now

    t = threading.Thread(target=beat, daemon=True); t.start()
    try:
        yield lost  # handler must abort writes once lost.is_set()
    finally:
        stop.set(); t.join(timeout=5)
```

Heartbeat any job whose duration varies by more than about 2x. On a lost lease, abort: another worker owns the job, and continuing means two writers.

### 3. Define the retry policy

Bounded attempts, exponential backoff, full jitter, and a hard split between retriable and terminal.

```typescript
const BASE_MS = 1_000, CAP_MS = 15 * 60 * 1_000, MAX_ATTEMPTS = 8;

// Full jitter: spreads a synchronized retry wave instead of re-forming it.
function delayFor(attempt: number): number {
  return Math.floor(Math.random() * Math.min(CAP_MS, BASE_MS * 2 ** attempt));
}

const TERMINAL = [ValidationError, NotFoundError, AuthError, SchemaError];

function classify(err: unknown): 'retry' | 'terminal' {
  if (TERMINAL.some((t) => err instanceof t)) return 'terminal';
  return 'retry'; // timeouts, 5xx, rate limits, and unknowns: retry, bounded
}
```

Backoff without jitter re-synchronizes every client that failed in the same outage window and produces a second outage on recovery. Honor an upstream `Retry-After` over the computed delay, and put a circuit breaker in front of the retry loop so a broadly failing downstream does not burn the whole attempt budget in seconds — see [error-handling](../error-handling/SKILL.md). Terminal errors must not consume retries: a job referencing a deleted row fails identically eight times and delays the DLQ signal by hours.

### 4. Wire the DLQ and a redrive path

Attempts exhausted, or a terminal classification, sends the job to a dead-letter queue carrying enough context to diagnose it without the original logs: job type, payload, attempt count, last error class and message, first-seen and last-seen timestamps, worker version, trace ID. A DLQ with no owner is a silent data-loss channel — alert on depth greater than zero, review on a fixed cadence, and ship a redrive command that re-enqueues by filter.

```bash
# Redrive one job class back to the main queue after shipping a fix.
# Always rate-limit: dumping the whole backlog back at once reproduces the outage.
forge jobs redrive --dlq invoices-dlq --to invoices --rate 50/s --dry-run \
  --filter 'job_type == "send_invoice_email" and error_class == "TimeoutError"'
```

### 5. Separate scheduling from queueing

A scheduler decides when; the queue decides who and in what order. The scheduler enqueues and returns immediately — it never executes work inline.

- **Cron** must be singleton across replicas. Three pods with a cron block means three runs. Use a leader lock (Postgres advisory lock, Redis `SET NX` with TTL) or broker-side single dispatch, and keep the job idempotent anyway — a daily job can fire twice across a DST boundary.
- **Delayed jobs** (run once at T) belong in the broker's delay feature or a `run_after` column polled by a dispatcher, never `sleep()` in a worker holding a lease.
- **Missed windows.** Decide in the job definition whether a cron that did not fire during an outage catches up or skips. Catch up for billing, skip for cache warming.

### 6. Give priority and fairness explicit structure

Two distinct problems: priority is "urgent before bulk", fairness is "no tenant monopolizes the workers". Priority: separate queues per class (`critical`, `default`, `bulk`) with dedicated pools, or weighted polling. A single queue with a priority column degrades to a sort over a growing table and starves the low tier; reserve capacity for it explicitly. Fairness: round-robin across active tenants rather than FIFO across the whole queue.

```sql
-- Fair dequeue: at most 2 jobs claimed per tenant per poll, oldest-first
-- within each tenant. SKIP LOCKED lets workers claim concurrently.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY tenant_id
                                ORDER BY available_at, id) AS rn
  FROM jobs
  WHERE state = 'queued' AND available_at <= now()
)
SELECT j.id, j.tenant_id, j.job_type, j.payload
FROM jobs j JOIN ranked r ON r.id = j.id
WHERE r.rn <= 2
ORDER BY j.available_at, j.id
FOR UPDATE OF j SKIP LOCKED
LIMIT 20;
```

Cap concurrency per tenant at the worker too, so one tenant cannot occupy every slot when it holds the whole backlog — see [multi-tenancy-patterns](../multi-tenancy-patterns/SKILL.md).

### 7. Checkpoint long-running jobs

Any job that can exceed a few minutes needs a resume point: progress stored in the database under a stable job identity, and a re-enqueue rather than a loop past the lease.

```go
type Checkpoint struct {
    JobID     string
    Cursor    string // last processed key, exclusive
    Processed int64
}

func RunExport(ctx context.Context, jobID string) error {
    cp, err := loadCheckpoint(ctx, jobID)
    if err != nil {
        return err
    }
    deadline := time.Now().Add(4 * time.Minute) // stay inside the lease budget

    for {
        batch, err := fetchAfter(ctx, cp.Cursor, 500)
        if err != nil || len(batch) == 0 {
            return err
        }
        // writeBatch and saveCheckpoint share one transaction: no gap to crash into.
        cp.Cursor = batch[len(batch)-1].Key
        cp.Processed += int64(len(batch))
        if err := writeBatchAndCheckpoint(ctx, batch, cp); err != nil {
            return err // checkpoint unchanged; the retry redoes only this batch
        }
        if ctx.Err() != nil || time.Now().After(deadline) {
            return reenqueue(ctx, jobID) // continue in a fresh lease
        }
    }
}
```

If the effect cannot share a transaction with the checkpoint, it must be idempotent; otherwise a crash between the two loses or repeats a batch.

### 8. Drain on shutdown

`SIGTERM` starts the clock: the orchestrator sends `SIGKILL` after the termination grace period. A worker that ignores `SIGTERM` loses every in-flight job to a lease timeout on every deploy.

```go
func (w *Worker) Run(ctx context.Context) error {
    sigCtx, stop := signal.NotifyContext(ctx, syscall.SIGTERM, syscall.SIGINT)
    defer stop()
    for {
        if sigCtx.Err() != nil {
            w.log.Info("draining", "inflight", w.inflight.Load())
            w.wg.Wait() // stop polling; finish only jobs already claimed
            return nil
        }
        msgs, err := w.broker.Poll(sigCtx, w.batchSize)
        if err != nil {
            continue
        }
        for _, m := range msgs {
            w.wg.Add(1)
            // handle() uses ctx, not sigCtx: in-flight work is not cancelled by the signal.
            go func(m Message) { defer w.wg.Done(); w.handle(ctx, m) }(m)
        }
    }
}
```

Set `terminationGracePeriodSeconds` above p99 job duration and drop the pod from readiness before draining. If a job cannot finish in the grace period, release the lease explicitly (set visibility to 0) so another worker takes it immediately instead of after the full timeout. See [deployment-patterns](../deployment-patterns/SKILL.md).

### 9. Bound concurrency and rate

Worker concurrency is not the real limit — the database connection pool, the downstream quota, and memory are. Compute `workers x concurrency <= pool_size - headroom`; exceeding it converts a queue backlog into a database outage. For a downstream with a published quota, put a shared token bucket in Redis in front of the call so all workers share one budget — see [rate-limiting](../rate-limiting/SKILL.md) and [redis-patterns](../redis-patterns/SKILL.md). Separate pools by workload profile: CPU-bound rendering and IO-bound sync in one pool means the slow one absorbs every slot.

### 10. Instrument the worker fleet

Emit these from the broker where possible: in-process counters go to zero exactly when the workers are dead.

| Signal | Definition | Alert |
| --- | --- | --- |
| Queue depth | Messages visible and waiting | Depth above a per-queue ceiling, sustained |
| Oldest message age | now minus enqueue time of the head message | Above the queue's latency SLO |
| Processing latency | p50/p95/p99 of handler duration, by job type | p99 crossing the lease budget |
| Failure rate | Terminal plus retried, over total, by job type and error class | Rate change against the trailing baseline |
| DLQ depth | Messages in the dead-letter queue | Greater than zero |

Oldest message age is the primary health signal, not depth: a deep queue draining at full rate is healthy, while twelve messages with a 40-minute-old head is broken. Add in-flight count and worker heartbeat count to separate "backed up" from "no workers running". Tag every metric with `job_type` and propagate the enqueuing request's trace ID into the job.

## Checklist

- [ ] Payloads carry IDs and a version, never serialized entities; each job is one bounded unit of work.
- [ ] Re-running any job with the same arguments produces the same end state.
- [ ] Visibility timeout exceeds p99 duration; longer jobs heartbeat with a total cap; a lost lease aborts writes.
- [ ] Retries bounded with exponential backoff plus full jitter; terminal errors skip retries.
- [ ] Every queue has a DLQ, an owner, an alert on depth greater than zero, and a rate-limited redrive tool.
- [ ] Cron dispatch is singleton across replicas, and catch-up behavior is written into the job definition.
- [ ] Priority classes have separate pools; per-tenant dequeue and concurrency are capped.
- [ ] Long jobs checkpoint and re-enqueue inside the lease budget.
- [ ] `SIGTERM` stops polling and drains; grace period exceeds p99 duration.
- [ ] `workers x concurrency` fits inside the database pool and downstream quotas.
- [ ] Dashboards show depth, oldest message age, latency percentiles, failure rate, and DLQ depth per job type.

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Job runs twice concurrently | Visibility timeout shorter than runtime | Raise the timeout, add heartbeating, abort on lost lease |
| Duplicate side effects after a deploy | Non-idempotent handler plus at-least-once delivery | Dedup key or conditional write inside the effect transaction |
| Retries never stop | No max attempts, or terminal errors classified as retriable | Bound attempts; classify by error type and DLQ terminal failures |
| Recovery causes a second outage | Backoff without jitter, or unthrottled redrive | Full jitter; redrive with a rate limit |
| Backlog takes down the database | Concurrency exceeds the connection pool | Cap `workers x concurrency` below pool size minus headroom |
| One tenant starves the rest | FIFO across a shared queue | Per-tenant fair dequeue and per-tenant concurrency cap |
| Jobs lost on every deploy | No `SIGTERM` handling or grace period too short | Drain on signal; raise `terminationGracePeriodSeconds` |
| Cron fires N times | Scheduler runs on every replica | Leader lock or broker-side single dispatch |
| Depth flat, oldest age climbing | Head-of-line block, or no workers polling | Check worker heartbeats and the head message's error |

## References

- Enterprise Integration Patterns: Competing Consumers, Dead Letter Channel, Idempotent Receiver, Message Expiration. Exponential backoff with full jitter; token bucket rate limiting; leader election via lock.
- Amazon SQS documentation: visibility timeout, dead-letter queues, redrive policy.
- PostgreSQL documentation: SELECT ... FOR UPDATE SKIP LOCKED, window functions, advisory locks.
- Kubernetes documentation: pod termination lifecycle, readiness probes.
- [../event-driven-architecture/SKILL.md](../event-driven-architecture/SKILL.md), [../idempotency-patterns/SKILL.md](../idempotency-patterns/SKILL.md), [../rate-limiting/SKILL.md](../rate-limiting/SKILL.md)
- [../error-handling/SKILL.md](../error-handling/SKILL.md), [../deployment-patterns/SKILL.md](../deployment-patterns/SKILL.md), [../django-celery/SKILL.md](../django-celery/SKILL.md)
