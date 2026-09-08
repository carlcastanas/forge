---
name: data-quality-validation
description: Keep bad data out of downstream systems — data contracts and expectations, null/range/uniqueness/freshness/referential checks, blocking gates versus observing monitors, quarantine instead of drop, alert thresholds that survive contact with reality, and safe backfills after a bad load. Use when the user asks about data validation, dbt tests, Great Expectations, a pipeline that loaded corrupt rows, schema drift from an upstream source, or a dashboard showing wrong numbers.
metadata:
  origin: FORGE
---

# Data Quality and Validation

Bad data is worse than missing data, because missing data stops a dashboard and bad data
gets acted on. The two things that determine whether a pipeline is trustworthy are where
the checks sit relative to the write, and whether a failing check actually stops
something. This skill places both. Done means: every producer-consumer boundary has a
declared contract, violations are caught before publication, failing rows are held
somewhere inspectable rather than discarded, and the alerts still get read after a month.

## When to activate

- Building or reviewing an ingestion pipeline, ELT model, or reverse-ETL sync
- A downstream consumer reports numbers that do not reconcile
- An upstream provider changed a field, a type, or a nullability without notice
- Choosing where to put tests: source, staging, mart, or serving layer
- Designing on-call alerting for data pipelines, or fixing alert fatigue
- Cleaning up after a bad load and planning a backfill
- User says "data quality", "dbt test", "Great Expectations", "schema drift",
  "null values in production", "the numbers look wrong", "freshness alert"

## When NOT to use

- Validating user input at an API boundary — use [api-design](../api-design/SKILL.md)
- Schema evolution and rollout mechanics for a relational database — use
  [database-migrations](../database-migrations/SKILL.md)
- Query performance and index design — use
  [postgres-patterns](../postgres-patterns/SKILL.md)
- Deciding whether a metric change is real — use
  [ab-testing-experimentation](../ab-testing-experimentation/SKILL.md)
- Cross-team interface agreements for service APIs — use
  [contract-first](../contract-first/SKILL.md)

## Prerequisites

- A named owner for each source table and each published dataset
- A transformation framework that can run assertions (dbt, SQLMesh, Great Expectations,
  Soda, or plain SQL in an orchestrator)
- The ability to fail a pipeline step and stop publication
- A quarantine location with the same schema as the target, plus a rejection reason

## Process

### 1. Write the contract before writing the checks

A contract states what a consumer may rely on. Without it, every check is one engineer's
guess and the argument after an incident has no reference point.

```yaml
# contracts/orders.yml
dataset: analytics.fct_orders
owner: data-platform
consumers: [finance-reporting, growth-dashboards, churn-model]
sla: { freshness: 2h, availability: 99.5%, breaking_change_notice: 14d }
schema:
  order_id:      { type: string,    unique: true, not_null: true }
  customer_id:   { type: string,    not_null: true, references: dim_customer.customer_id }
  status:        { type: string,    accepted: [pending, paid, shipped, refunded, cancelled] }
  total_cents:   { type: integer,   min: 0, max: 100000000 }
  placed_at:     { type: timestamp, not_null: true, not_future: true }
semantics:
  grain: one row per order, post-deduplication
  refunds: represented as status=refunded; the original row is retained, not deleted
  test_orders: excluded upstream by internal-domain filter
```

The `semantics` block prevents the most expensive class of data bug: two teams both
reading a correct table and getting different answers because they assumed different
grain.

### 2. Cover the five check families

| Family | Question | Typical assertion |
| --- | --- | --- |
| Schema | Are the columns and types what was agreed? | Column presence, type match, no unexpected additions |
| Completeness | Is anything missing? | Not-null on required fields; row count within an expected band |
| Validity | Are values in range? | Accepted-value sets, numeric bounds, regex on identifiers, no future timestamps |
| Uniqueness / integrity | Is the grain right and are keys resolvable? | Unique on the grain key; foreign keys resolve; no orphans |
| Freshness / volume | Did it arrive, and is the amount plausible? | Max timestamp within the SLA; row count deviation from trailing median |

```yaml
# models/schema.yml — dbt
models:
  - name: fct_orders
    tests:
      - dbt_utils.recency: { datepart: hour, field: placed_at, interval: 2 }
    columns:
      - name: order_id
        tests: [unique, not_null]
      - name: customer_id
        tests:
          - not_null
          - relationships: { to: ref('dim_customer'), field: customer_id }
      - name: status
        tests:
          - accepted_values: { values: [pending, paid, shipped, refunded, cancelled] }
      - name: total_cents
        tests:
          - dbt_utils.accepted_range: { min_value: 0, max_value: 100000000 }
```

Volume checks are the ones most often skipped and most often the first sign of an
upstream break. A row count that drops 90% passes every column-level test ever written.

```sql
-- Fail the run when yesterday's volume departs from the trailing median
with daily as (
  select date_trunc('day', placed_at) as d, count(*) as n
  from {{ ref('fct_orders') }}
  where placed_at >= current_date - interval '15 days'
  group by 1
), baseline as (
  select percentile_cont(0.5) within group (order by n) as med
  from daily where d < current_date
)
select d, n, med from daily, baseline
where d = current_date - interval '1 day'
  and (n < med * 0.6 or n > med * 1.8)
```

### 3. Decide gate or monitor, per check

This is the design decision that matters most.

**Gate** — blocks publication. Use when a violation makes the dataset actively
misleading: broken grain, missing required key, referential break, values outside a
range that downstream code assumes.

**Monitor** — records and alerts, does not block. Use when a violation is
informational or when blocking causes more harm than the bad data: a slight freshness
miss, a distribution shift, a new category appearing in a low-cardinality field.

Implement the gate with a staging pattern so a failing run never leaves a partially
written table:

```sql
BEGIN;
CREATE TABLE analytics.fct_orders_staging (LIKE analytics.fct_orders INCLUDING ALL);
INSERT INTO analytics.fct_orders_staging SELECT * FROM transform_output;

DO $$
DECLARE bad bigint;
BEGIN
  SELECT count(*) INTO bad FROM analytics.fct_orders_staging
   WHERE order_id IS NULL OR total_cents < 0 OR placed_at > now();
  IF bad > 0 THEN
    RAISE EXCEPTION 'gate failed: % invalid rows, publication aborted', bad;
  END IF;
END $$;

ALTER TABLE analytics.fct_orders RENAME TO fct_orders_prev;
ALTER TABLE analytics.fct_orders_staging RENAME TO fct_orders;
COMMIT;
```

An atomic swap makes rollback a rename rather than a restore.

### 4. Quarantine rather than drop

Dropping bad rows makes the pipeline green and the numbers wrong. Route them somewhere
inspectable, with enough context to fix the source.

```sql
INSERT INTO quarantine.orders_rejected
SELECT s.*, current_timestamp AS rejected_at, '{{ invocation_id }}' AS run_id,
  case
    when s.order_id is null    then 'missing_order_id'
    when s.total_cents < 0     then 'negative_total'
    when s.placed_at > now()   then 'future_timestamp'
    when d.customer_id is null then 'unresolved_customer'
  end AS reject_reason
FROM staging.orders s
LEFT JOIN analytics.dim_customer d USING (customer_id)
WHERE s.order_id is null OR s.total_cents < 0
   OR s.placed_at > now() OR d.customer_id is null;
```

Then treat quarantine as a queue with an owner, not an archive:

- Alert when the rejection rate crosses a threshold, and when the quarantine table stays
  non-empty beyond a stated period.
- Report rejected counts beside accepted counts in the run summary, so partial ingestion
  is visible.
- Give quarantine rows a retention policy; an unbounded reject table becomes its own
  storage and privacy problem.
- Support replay: reprocessing a quarantine batch should be one command.

### 5. Set alert thresholds that survive a month

Alert fatigue kills data quality programs faster than missing checks.

- Alert on the aggregate rejection rate crossing a threshold, not on each rejected row.
- Use trailing baselines with seasonality, not fixed constants. "Below 60% of the
  same-weekday median" beats "fewer than 10,000 rows".
- Route by severity: gate failures page, monitor breaches open a ticket, distribution
  drift lands in a weekly digest.
- Deduplicate by dataset and check, and suppress downstream alerts when an upstream
  dataset already failed. One broken source should produce one page, not forty.
- Delete any check that has never caught a real problem and has fired more than twice.

Track four operational metrics per dataset — freshness lag, rejection rate, row-count
deviation, check pass rate. They explain most incidents.

### 6. Backfill deliberately after a bad load

```markdown
## Backfill BF-2026-06-11 fct_orders

1. Stop the schedule. Pause downstream consumers that read incrementally.
2. Scope the damage: min/max/count over `_loaded_at` for the suspect window.
3. Snapshot the affected partitions before touching them.
4. Fix the transformation. Add the check that would have caught this, and prove it
   fails against the bad input and passes against the good input.
5. Reprocess into a staging table; reconcile totals against the source of record.
6. Swap partitions atomically. Do not update in place.
7. Notify consumers with the affected window and which metrics moved.
8. Replay the quarantine batch for that window.
9. Complete only when the reconciliation query returns zero variance.
```

Idempotency is what makes this survivable. A pipeline whose reruns duplicate rows turns
one incident into two. Key on a natural or deterministic surrogate key and use
merge/upsert or partition-replace semantics, never blind append.

### 7. Push checks upstream over time

A check at the mart layer catches the symptom. A check at ingestion catches the cause,
and a contract enforced at the producer prevents it. Each incident should move one check
one layer earlier. When an upstream provider cannot be changed, put a schema-drift
detector immediately after ingestion so the failure is attributed correctly rather than
surfacing three models later as a wrong number.

## Checklist

- [ ] Every published dataset has a contract with owner, consumers, schema, and SLA
- [ ] Contract records grain and semantics, not only column types
- [ ] Checks exist in all five families, including volume and freshness
- [ ] Each check is explicitly a gate or a monitor, and gates actually block publication
- [ ] Publication is atomic; a failed run leaves the previous table intact
- [ ] Invalid rows are quarantined with a reason and a run identifier, never dropped
- [ ] Quarantine has an owner, an alert threshold, retention, and a replay path
- [ ] Run summaries report accepted and rejected counts together
- [ ] Alerts use trailing seasonal baselines and are deduplicated across the lineage
- [ ] Pipelines are idempotent; reruns do not duplicate rows
- [ ] Backfill runbook exists, including snapshot, reconciliation, and consumer notice
- [ ] Each incident moves at least one check earlier in the pipeline

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Tests pass, dashboards wrong | Grain changed; duplicates at the join | Add a uniqueness test on the grain key |
| Row count collapsed but no alert | Only column-level tests exist | Add volume checks against a seasonal baseline |
| Bad rows silently disappeared | Filtered out instead of quarantined | Route to quarantine with a reason column |
| Partially written table read downstream | No atomic swap | Build to staging and rename in a transaction |
| One upstream break pages forty times | No lineage-aware suppression | Deduplicate and suppress downstream on upstream failure |
| Backfill created duplicates | Append-only, non-idempotent load | Switch to merge or partition-replace |
| Nobody responds to data alerts | Everything is severity one | Split gate/monitor routing; retire checks that never fire |
| New enum value breaks a model weeks later | No schema-drift detection at ingestion | Add a drift check immediately after the source |
| Two teams report different revenue | Semantics undocumented | Record grain and inclusion rules in the contract |

## References

- dbt tests, `dbt_utils` and `dbt_expectations` test packages
- Great Expectations expectation suites; Soda checks; SQLMesh audits
- Data contract patterns for producer-consumer interfaces
- [database-migrations](../database-migrations/SKILL.md),
  [contract-first](../contract-first/SKILL.md),
  [postgres-patterns](../postgres-patterns/SKILL.md),
  [ab-testing-experimentation](../ab-testing-experimentation/SKILL.md)
