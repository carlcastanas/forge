---
name: data-backfill-migration
description: Running online data backfills and schema changes against a live production database without downtime or lock storms. Covers expand-migrate-contract, keyset batching with adaptive throttling, dual-write plus shadow-read verification, checkpointed resumable jobs, diff sampling, kill switches, cutover, and cleanup. Use when adding or changing a column on a large table, populating derived data, or moving data between stores.
metadata:
  origin: FORGE
---

# Data Backfill and Migration

A backfill touches every row of a table that is simultaneously serving production traffic. The failure modes are lock contention, replication lag, connection-pool exhaustion, and a half-finished run nobody can resume. This skill covers the sequence (expand, migrate, contract), the batching mechanics that keep the write rate under an error budget, the verification that proves old and new agree before cutover, and the kill switch that stops everything in one flag flip. Done looks like: the new column is populated and verified, reads are served from it, the old column is dropped, and no request ever saw an error attributable to the migration.

## When to activate

- Adding a NOT NULL column, changing a type, or renaming a column on a table too large to rewrite in one statement.
- Populating a derived or denormalized field across existing rows, or re-encrypting and re-keying them.
- Moving data between tables, schemas, or datastores while both are live, or resuming a prior migration that stalled midway.
- User says "backfill", "migrate the data", "add a column to a big table", "zero-downtime migration".

## When NOT to use

- Ordinary forward-only DDL on small tables — see [database-migrations](../database-migrations/SKILL.md).
- Index and query tuning with no data change — see [postgres-patterns](../postgres-patterns/SKILL.md) or [mysql-patterns](../mysql-patterns/SKILL.md).
- Rebuilding a projection by replaying an event log — see [event-driven-architecture](../event-driven-architecture/SKILL.md).
- ORM-level migration file authoring — see [prisma-patterns](../prisma-patterns/SKILL.md).

## Prerequisites

- Read access to replication lag, lock waits, and error-rate metrics for the target database, and a feature-flag mechanism that propagates within seconds for the kill switch and read cutover.
- A job runner that survives restarts ([background-jobs-queues](../background-jobs-queues/SKILL.md)), and a staging environment with a production-shaped row count.

## Process

### 1. Write the plan before the code

Record, in the migration ticket or an ADR: the exact expand and contract DDL, the batch size and rate ceiling, the throttle signal and its threshold, the verification query, the kill-switch flag name, the rollback action at each stage, and the expected wall-clock duration from a staging run. A backfill without a written contract phase is how a temporary nullable column becomes permanent. See [architecture-decision-records](../architecture-decision-records/SKILL.md). Estimate before coding: `rows / (batch_size * batches_per_second)`. If that exceeds a few days, widen batches, add parallel key ranges, or cut per-row work.

### 2. Expand

Add the new structure; never modify the old one in this step. Every DDL statement takes a short lock or none at all.

```sql
-- Nullable, no default: metadata-only, no table scan.
ALTER TABLE orders ADD COLUMN total_minor bigint;

-- Partial index over unfilled rows. Run outside a transaction block;
-- check pg_index.indisvalid afterwards.
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_total_minor_null_idx
  ON orders (id) WHERE total_minor IS NULL;

-- NOT VALID keeps the ADD to a brief lock; VALIDATE happens at contract time.
ALTER TABLE orders
  ADD CONSTRAINT orders_total_minor_nonneg CHECK (total_minor >= 0) NOT VALID;
```

Adding a nullable column with no default is metadata-only; a volatile default rewrites the table. `CREATE INDEX CONCURRENTLY` cannot run inside a transaction and leaves an invalid index if it fails — drop and retry. `SET NOT NULL` scans the whole table, so add a `NOT VALID` check, `VALIDATE` it under a `SHARE UPDATE EXCLUSIVE` lock, then flip the column. Set `lock_timeout = '3s'` and `statement_timeout` on every DDL session, so a blocked `ALTER TABLE` fails fast instead of queueing behind a long read and blocking everything behind itself.

### 3. Dual-write

From the moment the new column exists, every write path must populate it, or the backfill races new inserts forever. Prefer application dual-write when the transformation needs application logic or external data; prefer a trigger when write paths are numerous, undiscoverable, or include manual operator SQL. Either way the two must not disagree, and disagreement is what step 6 measures.

```sql
CREATE OR REPLACE FUNCTION orders_sync_total_minor() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.total_minor := round(NEW.total * 100)::bigint;
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_sync_total_minor_trg
  BEFORE INSERT OR UPDATE OF total ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_sync_total_minor();
```

### 4. Batch with a keyset cursor

`OFFSET` is wrong here: it re-scans every skipped row, so cost grows quadratically, and concurrent inserts or deletes shift the window and silently skip rows. Page on the primary key.

```sql
-- One batch. $1 is the exclusive cursor from the previous batch, $2 the size.
-- FOR NO KEY UPDATE, not SKIP LOCKED: a skipped row would be stepped over by
-- the advancing cursor and never revisited.
WITH batch AS (
  SELECT id, total
  FROM orders
  WHERE id > $1
    AND total_minor IS NULL
  ORDER BY id
  LIMIT $2
  FOR NO KEY UPDATE
)
UPDATE orders o
   SET total_minor = round(b.total * 100)::bigint
  FROM batch b
 WHERE o.id = b.id
RETURNING o.id;
```

The next cursor is `max(id)` of the returned rows. Requirements: the cursor column is the primary key or another unique, immutable, monotonic column; the `ORDER BY` matches the cursor comparison exactly; and the cursor advances even when a batch updates zero rows, or a range of already-populated rows loops forever. For a composite cursor, compare as a row value: `WHERE (tenant_id, id) > ($1, $2) ORDER BY tenant_id, id`.

Each batch runs in its own short transaction — one transaction over a million rows holds locks, bloats the WAL, and blocks vacuum for its whole duration. To parallelize, split the key space into disjoint ranges, one cursor per worker; never two workers over one range.

### 5. Throttle against a live signal

A fixed sleep is a guess. Read a live signal each iteration and adapt.

```python
LAG_TARGET_S, LAG_CEILING_S, ERROR_BUDGET = 2.0, 10.0, 0.001

def next_batch_size(current: int, lag_s: float, error_rate: float) -> int:
    if lag_s > LAG_CEILING_S or error_rate > ERROR_BUDGET:
        return max(50, current // 4)        # back off hard
    if lag_s > LAG_TARGET_S:
        return max(50, int(current * 0.8))
    return min(10_000, int(current * 1.2))  # ramp gently

def replica_lag_seconds(conn) -> float:
    row = conn.execute("""
        SELECT COALESCE(MAX(EXTRACT(EPOCH FROM (now() - reply_time))), 0)
        FROM pg_stat_replication
    """).fetchone()
    return float(row[0])
```

Throttle on replication lag, the service's own error rate and p99 latency, lock waits, and pool saturation. Replication lag is the usual casualty: a backfill that outruns the replicas breaks every read-replica consumer, analytics and read-your-writes flows included. Give the backfill its own capped pool so it cannot starve request traffic, and pause it outright during peak hours if the numbers require it.

### 6. Verify with counts, samples, and a diff job

Three layers, cheapest first.

```sql
-- 1. Coverage. Must reach zero and stay there.
SELECT count(*) AS remaining FROM orders WHERE total_minor IS NULL;

-- 2. Agreement over a random sample, cheap enough to run every few batches.
SELECT count(*) AS mismatches
FROM orders TABLESAMPLE BERNOULLI (0.5)
WHERE total_minor IS NOT NULL
  AND total_minor IS DISTINCT FROM round(total * 100)::bigint;

-- 3. Full diff, keyset-paged like the backfill, run once before cutover.
SELECT id, total, total_minor
FROM orders
WHERE id > $1
  AND total_minor IS DISTINCT FROM round(total * 100)::bigint
ORDER BY id
LIMIT 1000;
```

Use `IS DISTINCT FROM`, not `<>`: `NULL <> NULL` is NULL, so `<>` reports zero mismatches on exactly the rows that are broken. Then shadow-read — behind a flag, read both, serve the old value, record disagreement. Shadow reads catch what static diffs miss: transformation bugs on the live write path, and rows that drift after the backfill passed them.

```typescript
async function getOrderTotalMinor(id: string): Promise<number> {
  const row = await db.order.findUniqueOrThrow({ where: { id } });
  const legacy = toMinorUnits(row.total, row.currency);
  if (flags.shadowReadTotalMinor && row.total_minor !== legacy) {
    metrics.increment('backfill.shadow_mismatch', { field: 'total_minor' });
    log.warn('shadow mismatch', { id, legacy, next: row.total_minor });
  }
  return flags.readTotalMinor ? row.total_minor! : legacy;
}
```

Hold at a zero mismatch rate across a full traffic cycle, weekly peak and batch processes included, before cutting reads over.

### 7. Make the job resumable

Progress lives in the database, not in a worker's memory or a log line. The cursor update must commit in the same transaction as the batch it describes; split them and a crash between the two repeats or skips a batch. The batch UPDATE is idempotent because it only touches `total_minor IS NULL`, so repeating is harmless — skipping is not.

```sql
CREATE TABLE backfill_progress (
  job_name    text PRIMARY KEY,
  range_start bigint  NOT NULL,
  range_end   bigint  NOT NULL,   -- disjoint per parallel worker
  cursor      bigint  NOT NULL,
  processed   bigint  NOT NULL DEFAULT 0,
  batch_size  integer NOT NULL DEFAULT 500,
  state       text    NOT NULL DEFAULT 'running'
                CHECK (state IN ('running', 'paused', 'done', 'failed')),
  last_error  text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
```

```python
def run(job: str, conn) -> None:
    while True:
        st = load_state(conn, job)
        if st.state != 'running' or flags.get("backfill_kill_switch"):
            return
        with conn.transaction():
            ids = conn.execute(BATCH_SQL, (st.cursor, st.batch_size)).fetchall()
            new_cursor = max(r[0] for r in ids) if ids else st.cursor + st.batch_size
            if new_cursor >= st.range_end:
                finish(conn, job); return
            save_cursor(conn, job, new_cursor, len(ids))
        size = next_batch_size(st.batch_size, replica_lag_seconds(conn), error_rate())
        save_batch_size(conn, job, size)
        time.sleep(inter_batch_delay(size))
```

Note the empty-batch case: the cursor advances by `batch_size` so a sparse range does not spin. Emit `processed`, `remaining`, rows per second, and ETA as metrics — a backfill whose progress is invisible gets killed by an impatient operator.

### 8. Keep a kill switch

One flag, checked between batches, halts all workers within seconds without a deploy. Keep three separate flags for the three reversible decisions: `backfill_kill_switch` (stop writing), `readTotalMinor` (which column serves reads), `shadowReadTotalMinor` (comparison overhead). Reverting the read flag is the cutover rollback and must not require a code change. Rollback by stage: during expand, drop the new column; during backfill, flip the kill switch, since an unread column makes a partial fill inert; during shadow read, disable the flag; after read cutover, point reads back at the legacy column, still correct because dual-write is on. After contract, rollback means restore from backup — which is why contract comes last, and only after a soak.

### 9. Cut over, then contract

Cutover: enable `readTotalMinor` for an internal cohort, then a percentage, then all, watching error rate and the mismatch metric at each step. Keep dual-write on throughout, so reverting stays a flag flip. Contract only after a soak long enough to cover every code path that touches the table — a full billing cycle, a month-end close, every scheduled report. Then, in order:

```sql
-- 1. Enforce the invariant now that every row is populated.
ALTER TABLE orders VALIDATE CONSTRAINT orders_total_minor_nonneg;
ALTER TABLE orders ALTER COLUMN total_minor SET NOT NULL;

-- 2. Remove the sync trigger and the temporary index.
DROP TRIGGER IF EXISTS orders_sync_total_minor_trg ON orders;
DROP FUNCTION IF EXISTS orders_sync_total_minor();
DROP INDEX CONCURRENTLY IF EXISTS orders_total_minor_null_idx;

-- 3. Legacy column last, in its own migration, once no running deployment
--    references it.
ALTER TABLE orders DROP COLUMN total;
```

Drop the legacy column in a deploy separate from the code removal: dropping it while an old pod still runs `SELECT total` produces immediate errors, and ORMs that expand `SELECT *` break even where the application never named the column. Then delete the backfill job, its flags, and its `backfill_progress` row — a dormant job holding a stale cursor is a loaded gun.

## Checklist

- [ ] Plan written down: DDL, batch size, throttle signal, verification query, kill switch, rollback per stage, estimated duration.
- [ ] Expand DDL takes no long lock; `lock_timeout` and `statement_timeout` set; indexes built `CONCURRENTLY` outside a transaction and checked for validity.
- [ ] Dual-write is live on every write path (application or trigger) before the backfill starts.
- [ ] Batching uses a keyset cursor on a unique immutable column; no `OFFSET`; each batch is its own transaction and commits the cursor with it.
- [ ] Cursor advances on empty batches; parallel workers own disjoint key ranges; batch size adapts to replication lag, error rate, and pool saturation under a dedicated connection cap.
- [ ] Verification uses `IS DISTINCT FROM`; coverage, sample, and full diff all clean; shadow reads show zero mismatches across a full traffic cycle before cutover.
- [ ] Kill switch halts within seconds without a deploy; read cutover is a separate flag; progress and ETA are visible as metrics.
- [ ] Contract runs only after a soak; the legacy column drops in its own deploy; job, flags, and progress row removed.

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Backfill slows to a crawl as it advances | `OFFSET` pagination re-scanning skipped rows | Switch to a keyset cursor on the primary key |
| Rows silently skipped | Offset window shifted by concurrent writes, cursor not unique, or `SKIP LOCKED` stepped over | Keyset on a unique immutable column; verify coverage counts |
| Replicas fall behind, or request errors spike | Unthrottled write rate; pool saturated; long transactions | Throttle on `pg_stat_replication` lag; cap the job's pool; one short transaction per batch |
| `ALTER TABLE` blocks all queries | DDL queued behind a long read, then blocked everything behind it | Set `lock_timeout`; retry with backoff off-peak |
| Adding a column rewrote the whole table | Volatile default, or `SET NOT NULL` on an unpopulated column | Add nullable, backfill, `NOT VALID` check, validate, then set NOT NULL |
| Backfill never finishes | New rows arrive unpopulated | Enable dual-write before starting |
| Verification reports zero mismatches, production disagrees | `<>` comparison against NULLs | Use `IS DISTINCT FROM` |
| Worker restart repeats or skips a batch | Cursor committed separately from the batch | Same transaction; keep the batch UPDATE idempotent |
| Errors right after dropping the legacy column | Old pods still selecting it, or `SELECT *` expansion | Drop only after the code removal has fully rolled out |
| Invalid index left behind | `CREATE INDEX CONCURRENTLY` failed midway | Check `pg_index.indisvalid`, drop, recreate |
| Temporary column never removed | No contract phase in the plan | Schedule contract with the expand; track it as a ticket |

## References

- Expand-migrate-contract (parallel change) pattern; keyset pagination; dual write with shadow read.
- PostgreSQL documentation: ALTER TABLE, CREATE INDEX CONCURRENTLY, TABLESAMPLE, lock_timeout, statement_timeout, pg_stat_replication, explicit locking and the lock conflict matrix, routine vacuuming.
- [../database-migrations/SKILL.md](../database-migrations/SKILL.md), [../postgres-patterns/SKILL.md](../postgres-patterns/SKILL.md), [../background-jobs-queues/SKILL.md](../background-jobs-queues/SKILL.md), [../deployment-patterns/SKILL.md](../deployment-patterns/SKILL.md), [../architecture-decision-records/SKILL.md](../architecture-decision-records/SKILL.md)
