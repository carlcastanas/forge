---
name: multi-tenancy-patterns
description: Isolation models for multi-tenant systems, enforced tenant scoping with PostgreSQL RLS and repository guards, tenant context propagation, noisy-neighbour controls, per-tenant migrations, and tenant lifecycle. Use when building or reviewing a SaaS system where one deployment serves many customers, or when a cross-tenant data leak is suspected.
metadata:
  origin: FORGE
---

# Multi-Tenancy Patterns

A multi-tenant system serves many customers from shared infrastructure. The failure that ends the company is one tenant reading another tenant's rows. Done means: an isolation model chosen deliberately and written down, tenant scoping enforced by the database rather than by developer discipline, tenant context that survives every hop including background jobs and events, and a lifecycle that can provision, export, and hard-delete a tenant without manual SQL.

## When to activate

- Designing the data layer for a SaaS product serving more than one customer
- Adding a `tenant_id` column, or reviewing a query, ORM call, or migration for cross-tenant leakage
- A tenant reports seeing data that is not theirs, or one customer's traffic degrades latency for the rest
- A customer demands data residency, export, or contractual hard deletion
- User says "tenant isolation", "row-level security", "schema per tenant", "noisy neighbour"

## When NOT to use

- Single-tenant internal tools with one organization — use [backend-patterns](../backend-patterns/SKILL.md)
- Per-user authorization inside one tenant (roles, permissions, ownership) — that is [authn-authz-patterns](../authn-authz-patterns/SKILL.md); tenancy is a coarser boundary applied first
- General PostgreSQL indexing and query tuning — [postgres-patterns](../postgres-patterns/SKILL.md); throttling mechanics — [rate-limiting](../rate-limiting/SKILL.md)
- Regulated-health tenancy obligations — [hipaa-compliance](../hipaa-compliance/SKILL.md) layers on top of this

## Prerequisites

- PostgreSQL 12+ (RLS with `FORCE ROW LEVEL SECURITY`) or an equivalent database, and a stable tenant identifier issued at authentication time rather than derived from user input
- A migration tool that can run per-tenant as well as globally — [database-migrations](../database-migrations/SKILL.md)
- Knowledge of the deployed pooler's mode (transaction vs session)

## Process

### 1. Choose an isolation model and record the decision

| Model | Isolation | Ops cost at scale | Blast radius | Per-tenant restore | Residency | Migration cost |
| --- | --- | --- | --- | --- | --- | --- |
| Shared table, `tenant_id` | Logical, via RLS | Low: one schema, one pool | Whole cluster | Hard: filtered export | Cluster-wide only | One migration for all |
| Schema per tenant | Logical, via `search_path` + grants | Medium: catalog bloat, slow `pg_dump` | Whole cluster | Medium: `pg_dump -n` | Cluster-wide only | N migrations, ordered |
| Database per tenant | Physical | High: N pools, N backups | One database | Easy: restore one database | Per-database placement | N migrations, ordered |
| Cell per region or tier | Physical + network | Highest | One cell | Easy | Per-region placement | N cells, ordered |

Default to shared table with `tenant_id` and RLS. Move a tenant to a dedicated database only for a contractual or residency reason, keeping the same code path so the only difference is connection routing. Record the choice with [architecture-decision-records](../architecture-decision-records/SKILL.md); the model is expensive to change later. Hybrid is normal: shared tables for the long tail, dedicated databases for enterprise tenants, with a control-plane registry mapping tenant to shard, region, status, and schema version.

```sql
-- Global registry lives outside tenant data, in its own schema.
CREATE TABLE control.tenant (
  id             uuid PRIMARY KEY,
  slug           citext UNIQUE NOT NULL,
  shard_dsn_ref  text NOT NULL,     -- secret reference, not a DSN carrying a password
  region         text NOT NULL,
  schema_version int  NOT NULL DEFAULT 0,
  status         text NOT NULL CHECK (status IN ('provisioning','active','suspended','purging','purged')),
  purge_after    timestamptz
);
```

### 2. Model the tenant key so it cannot be forgotten

Put `tenant_id` first in the primary key and make every foreign key carry it: a composite FK turns a cross-tenant reference into a constraint violation rather than a silent leak. Leading `tenant_id` on indexes also keeps per-tenant scans local — an index keyed on `created_at` alone will walk other tenants' entries.

```sql
CREATE TABLE app.project (
  tenant_id uuid NOT NULL REFERENCES control.tenant(id),
  id        uuid NOT NULL DEFAULT gen_random_uuid(),
  name      text NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE app.task (
  tenant_id  uuid NOT NULL,
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  title      text NOT NULL,
  PRIMARY KEY (tenant_id, id),
  -- Composite FK: a task can only point at a project in its own tenant.
  FOREIGN KEY (tenant_id, project_id) REFERENCES app.project (tenant_id, id) ON DELETE CASCADE
);
```

### 3. Enforce scoping in the database with RLS

RLS is the backstop: it holds when a raw query is written, an ORM helper bypassed, or a new endpoint forgets the filter.

```sql
ALTER TABLE app.project ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.project FORCE ROW LEVEL SECURITY;   -- also applies to the table owner

CREATE POLICY project_tenant_isolation ON app.project
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

`USING` filters reads and the pre-image of updates and deletes; `WITH CHECK` validates the post-image of inserts and updates, which is what stops a tenant from writing a row into someone else's tenant. The `true` second argument to `current_setting` returns NULL instead of raising when the GUC is unset — NULL compares false, so an unset context returns zero rows rather than erroring. If a loud failure is preferred, drop the `true` and let the missing setting raise.

Never run the application as a superuser or as the table owner without `FORCE`: both bypass policies. Separate the migration role (owns tables, runs DDL) from the runtime role (DML only, no `BYPASSRLS`, no access to `control.tenant`).

### 4. Set the GUC per transaction, never per connection

With a transaction-pooling pooler (PgBouncer in `transaction` mode, Supabase's pooler, RDS Proxy pinning), a `SET` outside a transaction leaks the previous request's tenant onto the next borrower of that connection. Use `set_config(..., is_local => true)`, which resets at commit or rollback.

```typescript
// Every unit of work opens a transaction and stamps the tenant before any query.
export async function withTenant<T>(
  pool: Pool, tenantId: string, fn: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    // is_local = true -> scoped to this transaction, cleared on COMMIT/ROLLBACK.
    await tx.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const out = await fn(tx);
    await tx.query("COMMIT");
    return out;
  } catch (err) {
    await tx.query("ROLLBACK");
    throw err;
  } finally {
    tx.release();
  }
}
```

Forbid direct `pool.query` with a lint rule: `withTenant` is the only supported entry point to the database.

### 5. Add repository guards as defence in depth

RLS can be disabled by a bad migration. A second, cheap check in the data layer catches that before it ships.

```typescript
function assertScoped(sql: string, tenantId: string | null): void {
  if (!tenantId) throw new TenantScopeViolation("no tenant in context");
  const touchesTenantData = /\b(from|join|insert\s+into|update)\s+app\./i.test(sql);
  if (touchesTenantData && !/tenant_id\s*=/i.test(sql)) {
    throw new TenantScopeViolation(`unscoped query: ${sql.slice(0, 120)}`);
  }
}
```

Back this with a test that runs the full endpoint suite as tenant A against a database seeded with tenant B data, asserting no response contains a tenant B identifier. Add one negative test per table attempting a cross-tenant write and expecting a policy violation.

```sql
-- Regression guard: every table in app must have RLS enabled and forced.
SELECT c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'app' AND c.relkind = 'r'
  AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);
-- Must return zero rows. Fail CI otherwise.
```

### 6. Propagate tenant context across every hop

Tenant identity comes from the authenticated principal — the JWT claim, session, or mTLS subject — and never from a query parameter or a client-supplied header on a public edge. Resolve it once at the edge, put it in a request-scoped store, and carry it forward explicitly.

- **HTTP inbound**: middleware resolves tenant from the token, rejects with 401/403 when absent, and stores it in `AsyncLocalStorage` (Node), `context.Context` (Go), or a contextvar (Python).
- **HTTP outbound (internal)**: propagate as a signed header on an internal-only network, or re-mint a service token that carries the tenant claim. Add `tenant_id` to the trace baggage so logs and spans are filterable.
- **Background jobs**: serialize `tenant_id` into the job payload at enqueue time and re-enter `withTenant` at the start of the handler. A job that reads the tenant from ambient state will run under whatever tenant happened to be last. See [background-jobs-queues](../background-jobs-queues/SKILL.md).
- **Events**: put `tenant_id` in the envelope alongside `event_id` and `occurred_at`, not only in the payload, so routing and filtering do not need to parse the body. See [event-driven-architecture](../event-driven-architecture/SKILL.md).
- **Caches**: prefix every key with the tenant — `cache:{tenant_id}:user:{id}`. An unprefixed key is a leak. See [caching-strategy](../caching-strategy/SKILL.md).
- **Cron and admin tooling**: iterate the registry explicitly; a scheduler has no "current tenant".

```go
// Enqueue copies the tenant out of context into the durable payload.
// A job that cannot be attributed to a tenant is never enqueued.
func Enqueue(ctx context.Context, q Queue, kind string, body any) error {
    tid, ok := ctx.Value(tenantKey{}).(uuid.UUID)
    if !ok || tid == uuid.Nil {
        return errors.New("tenant: missing from context")
    }
    return q.Push(ctx, Job{TenantID: tid, Kind: kind, Body: body})
}
```

### 7. Contain noisy neighbours

One tenant should not be able to consume the capacity of the fleet.

- **Request quotas**: token bucket keyed by `tenant_id`, with a per-tenant plan limit and a global circuit breaker. Return 429 with `Retry-After`.
- **Query limits**: `statement_timeout` per role or transaction, plus a lower `idle_in_transaction_session_timeout`. One tenant's unbounded report query is the most common source of pool exhaustion.
- **Connection limits**: cap connections per tier; for database-per-tenant, cap pool size per database so the sum stays under `max_connections`.
- **Queue fairness**: never one FIFO queue. Shard per tier, or weighted round-robin across per-tenant sub-queues, so a tenant enqueuing a million jobs cannot starve the rest. Cap in-flight jobs per tenant.
- **Payload caps**: maximum rows per export, maximum page size, maximum webhook endpoints per tenant.

```sql
ALTER ROLE app_runtime SET statement_timeout = '15s';
ALTER ROLE app_runtime SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE app_reporting SET statement_timeout = '120s';   -- separate role, separate pool
```

Label metrics per tier rather than per tenant unless cardinality allows; keep per-tenant detail in logs and traces.

### 8. Run per-tenant migrations in a defined order

Shared-table tenancy has one schema, so migration is ordinary — but every migration must be backward compatible, because all tenants share the deploy. Use expand/contract: add a nullable column, backfill in batches, start writing, start reading, drop the old column a release later. See [data-backfill-migration](../data-backfill-migration/SKILL.md).

Schema-per-tenant and database-per-tenant need an orchestrator: control plane first, then a canary set (internal tenants, then one small paying tenant), then batches with bounded concurrency that record the per-tenant version. Halt the batch on the first failure and leave the rest on the old version — the application must tolerate both at once. A periodic reconcile job asserts every active tenant is at the expected version and alerts on drift.

```bash
# Bounded-concurrency roll-out with per-tenant version recording.
psql -At -d control -c \
  "SELECT slug FROM control.tenant WHERE status='active' AND schema_version < 42 ORDER BY slug" \
| xargs -P 8 -I{} ./bin/migrate --tenant {} --to 42 --record
```

Never take a global lock in a per-tenant migration. `ALTER TABLE ... ADD COLUMN` with a volatile default, or an unqualified `CREATE INDEX`, will block writes for every tenant on the cluster; use `CREATE INDEX CONCURRENTLY` and add constraints as `NOT VALID` followed by `VALIDATE CONSTRAINT`.

### 9. Handle the tenant lifecycle end to end

**Provisioning.** Idempotent, resumable, driven by the registry status column. Insert the tenant as `provisioning`, create the schema or database, migrate to the current version, seed defaults, create the first admin, then flip to `active`. A failure at any step leaves the tenant in `provisioning` and the job retries from the top.

**Suspension.** Distinct from deletion: status `suspended`, writes rejected at the edge, data retained, reversible.

**Export.** A tenant-scoped export the customer can actually consume: JSON or CSV per table plus object-storage blobs, with a manifest listing table names, row counts, and checksums. Run it as a background job under `withTenant` so RLS constrains it, stream to object storage, hand back a short-lived signed URL. Never dump the shared table and filter afterwards.

**Hard deletion.** Contractual deletion is a state machine, not a `DELETE`:

1. `active` → `purging` with `purge_after = now() + grace`. Access blocked immediately, data retained during grace.
2. After grace, delete rows in batches relying on `ON DELETE CASCADE` from the composite FKs; delete object-storage prefixes, cache keys by tenant prefix, and search-index documents.
3. Purge derived copies: warehouse, data-lake partitions, log retention. Backups usually cannot be edited — the backup retention window is the true deletion horizon and belongs in the contract.
4. Write an immutable deletion receipt (tenant id, requester, timestamps, row counts) to an audit store that survives the purge, then set `purged`.


**Residency.** Placement is decided at provisioning. Route by region from the registry, keep regional clusters and regional object storage, and make cross-region reads impossible rather than discouraged. The global control plane holds only non-personal metadata — id, slug, region, plan. Anything else pins the tenant to a region and cannot live in a global table.

## Checklist

- [ ] Isolation model documented in an ADR; every tenant-scoped table has `tenant_id` leading the primary key, plus composite foreign keys
- [ ] RLS enabled and forced on every table in the tenant schema, verified by a CI query
- [ ] Policies define both `USING` and `WITH CHECK`; runtime role lacks `BYPASSRLS` and does not own tables
- [ ] Tenant GUC set with `set_config(..., true)` inside a transaction, never a bare `SET`
- [ ] No code path reaches the database outside the tenant-scoped helper (lint-enforced); cross-tenant read and write attempts covered by negative tests
- [ ] `tenant_id` present in job payloads, event envelopes, cache keys, log fields, and trace baggage
- [ ] Per-tenant request quota, statement timeout, connection cap, and queue fairness in place
- [ ] Per-tenant schema version recorded, drift alerted on, provisioning idempotent and resumable
- [ ] Export produces a manifest with row counts and checksums; deletion covers primary store, blobs, caches, search, warehouse, and logs, with a documented backup horizon
- [ ] Residency enforced by routing; the global control plane holds no tenant personal data

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Tenant A sees tenant B rows on one endpoint | Raw query bypassing the ORM scope; RLS off on that table | Enable and force RLS; add the CI query that fails on any unprotected table |
| Cross-tenant leak appears only under load | `SET app.tenant_id` issued outside a transaction with a transaction-mode pooler | Switch to `set_config(..., is_local => true)` inside the transaction |
| Insert succeeds into another tenant | Policy has `USING` but no `WITH CHECK` | Add `WITH CHECK` with the same predicate |
| Every query returns zero rows after a refactor | GUC unset, `current_setting(..., true)` returning NULL | Fail fast in middleware when tenant is missing; assert the GUC in the helper |
| Background job writes to the wrong tenant | Tenant read from ambient state at execution time | Serialize `tenant_id` at enqueue; re-enter the scoped helper in the handler |
| One customer's report stalls the whole API | No `statement_timeout`, shared pool | Per-role timeouts; separate pool and role for reporting |
| Migration succeeds for some tenants, fails for others | Unordered fan-out, no per-tenant version tracking | Record version per tenant; halt on first failure; reconcile with a drift job |
| Deleted tenant's data reappears | Warehouse, search index, or cache not purged | Extend the purge state machine to every derived store; verify with the receipt |
| Auditor rejects the residency claim | Personal data in a global control-plane table | Move it to the regional store; keep only id, slug, region, plan globally |

## References

- PostgreSQL documentation: row security policies (`CREATE POLICY`, `ALTER TABLE ... FORCE ROW LEVEL SECURITY`)
- PostgreSQL documentation: `set_config`, `current_setting`, role attributes including `BYPASSRLS`; PgBouncer documentation: pooling modes
- [../postgres-patterns/SKILL.md](../postgres-patterns/SKILL.md), [../database-migrations/SKILL.md](../database-migrations/SKILL.md), [../data-backfill-migration/SKILL.md](../data-backfill-migration/SKILL.md)
- [../authn-authz-patterns/SKILL.md](../authn-authz-patterns/SKILL.md), [../security-review/SKILL.md](../security-review/SKILL.md)
- [../background-jobs-queues/SKILL.md](../background-jobs-queues/SKILL.md), [../event-driven-architecture/SKILL.md](../event-driven-architecture/SKILL.md), [../caching-strategy/SKILL.md](../caching-strategy/SKILL.md), [../rate-limiting/SKILL.md](../rate-limiting/SKILL.md)
- [../architecture-decision-records/SKILL.md](../architecture-decision-records/SKILL.md)
