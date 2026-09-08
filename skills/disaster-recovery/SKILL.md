---
name: disaster-recovery
description: Planning and proving recovery from data loss, region failure, ransomware, or total environment destruction. Covers per-tier RPO/RTO derivation, DR strategy selection, restore drills that actually restore, backup immutability, recovery dependency ordering, and runbook structure. Use when the user asks about backups, restore testing, RPO/RTO, failover to another region, a DR plan, or "what happens if we lose the database".
metadata:
  origin: FORGE
---

# Disaster Recovery

Disaster recovery is the set of decisions and rehearsed procedures that bring a system back after loss that normal redundancy does not cover: a deleted database, a corrupted volume, an encrypted fileshare, a lost region, a revoked account. The output is not a document, it is a demonstrated recovery time. Done is: every tier has a stated RPO and RTO derived from business impact, every backup class has a dated successful restore into a clean environment, and the recovery order is written down and has been walked.

## When to activate

- Setting or reviewing backup policy for a data store, object bucket, or cluster.
- Answering "how much data can we lose" or "how long can we be down" for a service.
- A restore was attempted and failed, or has never been attempted.
- Designing multi-region or cross-account topology.
- Ransomware or destructive-action exposure is being assessed.
- After an incident where recovery was slower than expected.
- User says "DR plan", "RPO", "RTO", "restore drill", "backup strategy", "failover to another region", "we lost the database".

## When NOT to use

- A live outage is in progress and the cause is unknown. Drive the incident first: `../incident-response/SKILL.md`. Return here only when recovery from backup becomes the mitigation.
- The concern is a bad schema change that needs reverting, not data loss: `../database-migrations/SKILL.md`.
- The concern is a bad release that needs rolling back: `../release-management/SKILL.md`.
- The goal is to discover unknown failure modes rather than recover from a known one: `../chaos-engineering/SKILL.md`.

## Prerequisites

- An inventory of stateful assets: databases, object storage, search indexes, message queues, secret stores, IaC state, DNS zones, certificate material, registry images.
- Named owners per asset. Unowned data does not get restored.
- A clean target environment creatable on demand from infrastructure-as-code, in a separate account or project.
- Restore-path credentials stored where the disaster cannot destroy them. A password manager running in the failed region is not a recovery credential store.
- Monitoring for backup jobs, and separately for restore verification.

## Process

### 1. Define RPO and RTO precisely, per tier

**RPO (recovery point objective)** is the maximum acceptable data loss measured backward from the moment of failure; it is set by backup or replication frequency. **RTO (recovery time objective)** is the maximum acceptable time from failure to restored service; it is set by restore mechanics and human process. Neither is chosen globally — derive both from what breaks for the business when the asset is gone, then group assets into tiers.

| Tier | Asset shape | RPO shape | RTO shape | Typical mechanism |
| --- | --- | --- | --- | --- |
| 0 | Money movement, auth, ledger | Near-zero (synchronous replication) | Minutes | Active-active or synchronous standby with automated failover |
| 1 | Primary user-facing transactional data | Minutes (continuous WAL shipping) | Under an hour | Warm standby, PITR, scripted promotion |
| 2 | Internal tooling, reporting, derived stores | Hours | Hours to a day | Nightly snapshot restore, rebuild from source of truth |
| 3 | Rebuildable artifacts, caches, search indexes | Not applicable | Rebuild window | Reindex or regenerate from tier 0-2 data |

Write the derivation, not just the number: "RPO of five minutes because a lost order cannot be reconstructed from any other system and support cannot manually replay more than a handful." A tier assignment without a stated business reason gets argued about during the disaster. Record the *measured* RPO and RTO next to the target; the gap between them is the actual DR backlog.

### 2. Pick the strategy that matches the RTO

| Strategy | Standby state | Cost | Realistic RTO | Failure it handles poorly |
| --- | --- | --- | --- | --- |
| Backup and restore | Nothing running | Lowest | Hours to days | Anything with a short RTO; restore time scales with data size |
| Pilot light | Data replicated, compute off | Low | Tens of minutes to hours | Capacity cold-start; unproven scale-up under load |
| Warm standby | Scaled-down full stack running | Medium | Minutes to tens of minutes | Config drift between primary and standby |
| Active-active | Full stack serving in both | Highest | Near-zero for infrastructure loss | Logical corruption and bad data replicate instantly |

Active-active protects against infrastructure loss, not against a destructive bug or a malicious delete — those replicate. Point-in-time recovery and immutable backups are the control for logical corruption, and every tier needs them regardless of replication topology.

### 3. Treat restores, not backup jobs, as the evidence

A backup job that exits zero proves a file was written. It does not prove the file is complete, readable, decryptable, or restorable into a working system. The only artifact that counts is a completed restore into a clean environment with verified contents. Run drills on a cadence tied to tier — tier 0-1 monthly, tier 2 quarterly, tier 3 on change — and record for each: date, operator, source artifact id, target environment, wall-clock restore time, verification result, and every deviation from the runbook.

```bash
# 1. Verify the backup artifact is intact before trusting it
restic check --read-data-subset=10%          # samples real data blocks, not just the index
borg check --verify-data /path/to/repo       # equivalent for Borg repositories

# 2. Inspect a Postgres dump without restoring it
pg_restore --list backup.dump | head -50

# 3. Restore into a throwaway database, timed
time pg_restore --dbname="postgresql://localhost:5432/drill_$(date +%Y%m%d)" \
  --jobs=4 --no-owner --exit-on-error backup.dump
```

Verification must compare against a known expectation, not merely confirm the process finished:

```sql
-- Row counts for the tables that matter, compared to the source snapshot
SELECT relname, n_live_tup FROM pg_stat_user_tables
WHERE relname IN ('orders', 'payments', 'users') ORDER BY relname;

-- Content checksum over a stable ordering, comparable across environments
SELECT md5(string_agg(id::text || ':' || total_cents::text, ',' ORDER BY id))
FROM orders WHERE created_at < '2026-01-01';
```

For physical backups and point-in-time recovery:

```bash
pg_basebackup --pgdata=/var/lib/postgresql/base --format=tar --gzip \
  --wal-method=stream --checkpoint=fast --progress
```

```ini
# postgresql.conf on the recovery target: stop at a chosen point, then inspect
restore_command = 'cp /mnt/wal_archive/%f %p'
recovery_target_time = '2026-03-14 09:12:00+00'
recovery_target_action = 'pause'
```

Cluster and volume level:

```bash
etcdctl snapshot status snapshot.db --write-out=table
etcdctl snapshot restore snapshot.db --data-dir=/var/lib/etcd-restored --name=node1 \
  --initial-cluster=node1=https://10.0.0.1:2380 \
  --initial-advertise-peer-urls=https://10.0.0.1:2380

velero restore create drill-$(date +%Y%m%d) --from-backup nightly-20260314 \
  --namespace-mappings prod:drill
velero restore describe drill-$(date +%Y%m%d) --details
```

If a drill exceeds the tier's RTO, that is a finding with an owner, not a footnote.

### 4. Make the backups survive the disaster

- **3-2-1.** Three copies, two storage classes, one off-site — in practice a different region and a different account.
- **Immutability.** Object lock in compliance or governance mode so a compromised credential cannot delete or shorten retention. This is the primary ransomware control.

```bash
aws s3api put-object-lock-configuration \
  --bucket acme-backups-primary \
  --object-lock-configuration '{
    "ObjectLockEnabled": "Enabled",
    "Rule": {"DefaultRetention": {"Mode": "COMPLIANCE", "Days": 35}}
  }'
```

- **Blast-radius isolation.** The backup account's credentials must not be reachable from the production account, and production roles must not hold delete permission on backup buckets.
- **Encryption with recoverable keys.** A backup encrypted with a key held only in the destroyed KMS is not a backup.
- **Retention (grandfather-father-son).** Daily, weekly, monthly to the compliance horizon. Retention must exceed the realistic detection time for silent corruption; corruption found after the oldest good copy aged out is unrecoverable.

### 5. Back up the things that are not the database

Recovery stalls on the assets nobody treated as data:

- Secrets and their access policies
- Infrastructure-as-code state files, and the lock table behind them
- DNS zone exports
- TLS certificates **and their private keys**, plus the issuance automation's account key
- CI/CD pipeline configuration, runner registration, and deploy credentials
- IAM roles, policies, and identity-provider configuration
- Container registry images referenced by currently deployed manifests
- Message queue contents in flight, or an explicit decision that in-flight messages are acceptable loss
- Feature flag configuration — a restored service running default flag values behaves nothing like production (`../feature-flags-rollout/SKILL.md`)

```bash
# Examples of the exports that are routinely missing from DR plans
aws route53 list-resource-record-sets --hosted-zone-id "$ZONE_ID" > dns-zone.json
terraform state pull > terraform-state-$(date +%Y%m%d).json
kubectl get secret -A -o yaml > cluster-secrets.yaml   # encrypt this artifact at rest
```

### 6. Order the recovery by dependency

Draw the graph before the disaster. Restoring in the wrong order wastes the RTO on retries.

```text
1. Identity and access        IdP, IAM roles, break-glass credentials
2. Network and DNS            VPC, routing, resolvers, zone records
3. Secrets management         KMS keys, secret store, certificate issuance
4. Data stores                Databases, object storage, then PITR replay
5. Stateless services         API and web tiers, in dependency order
6. Async workers              Consumers, schedulers, replay of queued work
7. Edge and CDN               Cache purge, origin repoint, traffic reopen
```

Two traps to check explicitly. **Circular dependency:** the secret store needs an identity token while the identity provider reads its config from the secret store — break the cycle with a documented break-glass credential held outside both systems, and test that it works. **Cold start:** a long-running system holds warm caches, established connections, and pre-scaled capacity; a restored one has none, so model the cold-start load and stage traffic back rather than reopening at 100% (`../load-testing/SKILL.md`).

### 7. Write the runbook so a stranger can execute it

Each recovery procedure gets one file with a fixed shape:

```markdown
# Runbook: restore primary Postgres from PITR

Scope         Cluster `orders-prod` only.
Preconditions Ticket open, incident commander assigned, writes confirmed stopped.
Authority     Incident commander approves the recovery target time; never choose it alone.
Estimated     Measured at the most recent drill — record the figure, do not estimate it.

## Steps
1. Freeze writes.
   $ kubectl scale deploy/orders-api --replicas=0
   Expect: `deployment.apps/orders-api scaled`; connection count drops to zero.
2. Identify the last good base backup.
   $ aws s3 ls s3://acme-backups-primary/pg/base/ --recursive | tail -5
   Expect: an entry newer than the target recovery time minus the WAL retention window.
...

## Verification
- Row counts for orders, payments, users match the pre-incident snapshot within the RPO window.
- Health endpoint returns 200 and a smoke transaction completes.

## Fallback
If PITR replay stalls, restore the most recent nightly logical dump (higher data loss,
requires incident commander sign-off) and reconcile from the payment provider ledger.

## Communications
Status page updated at start, halfway, and completion. Owner: the communications lead.
```

Steps state expected output. A step with no expected output cannot be verified by someone who has not run it before.

### 8. Plan for split-brain and failback

Failover creates two candidate sources of truth. Decide in advance. **Fencing:** the old primary must be demonstrably unable to accept writes before the new one is promoted; automated promotion without fencing produces divergence. **Reconciliation:** if both accepted writes, name the authoritative side and the procedure for replaying or discarding the other, with a manual queue and an owner for records that cannot be reconciled automatically. **Failback:** returning to the original region is a second planned migration, not an automatic reversal — schedule it, rehearse it, and do not attempt it during the incident.

## Checklist

- [ ] Every stateful asset has a tier, an owner, and a stated RPO and RTO with a business rationale
- [ ] Measured RPO and RTO are recorded next to the targets, with the gap tracked as work
- [ ] Every tier 0-1 asset has a dated, successful restore into a clean environment within the last month
- [ ] Restore verification compares row counts or checksums against a known expectation
- [ ] Backups are cross-region, cross-account, and immutable under object lock
- [ ] Encryption keys are recoverable independently of the destroyed environment, and retention exceeds realistic silent-corruption detection time
- [ ] Secrets, IaC state, DNS, certificates, CI config, IAM, and registry images are all covered
- [ ] Recovery dependency graph is documented and has no untested circular dependency
- [ ] Break-glass credentials exist outside the primary environment and were used in the last drill
- [ ] Runbooks state preconditions, decision authority, expected output per step, verification, fallback, and comms
- [ ] Fencing and failback procedures are written and rehearsed

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Backups green for months, restore fails | Job verified the write, never the read | Add `restic check --read-data-subset` or `pg_restore --list` to the job, plus a scheduled full restore drill |
| Restore completes but the application errors | Engine or extension version mismatch between backup and target | Pin engine and extension versions in the drill environment; record them in the runbook |
| Restore exceeded RTO | RTO never measured, only asserted | Time every drill; either fund a faster strategy or renegotiate the tier |
| Ransomware also encrypted the backups | Production credentials had delete or overwrite rights on the backup store | Move backups to a separate account with object lock; remove delete permission from all production roles |
| Cannot decrypt the backup | Key material lived only in the destroyed environment | Escrow keys in a separate account or offline; verify decryption during every drill |
| Recovery blocked at step one | Circular dependency between identity and secrets | Create and test break-glass credentials stored outside both systems |
| Restored region fell over on reopen | Cold caches and no warm capacity | Pre-scale, warm caches, and ramp traffic in stages |
| Two regions accepted writes | Promotion without fencing the old primary | Require a fencing check as a hard gate before promotion; document the reconciliation procedure |
| Nobody could run the runbook | Written by the author of the system, for the author of the system | Have someone who has never run it execute the next drill unaided; fix every place they stalled |

## References

- `../incident-response/SKILL.md` — declaring severity and running the response while recovery proceeds
- `../chaos-engineering/SKILL.md` — rehearsing dependency loss and failover before it is forced
- `../database-migrations/SKILL.md` — reversible schema change and expand-contract patterns
- `../release-management/SKILL.md` — rollback readiness distinct from data recovery
- `../postmortem-authoring/SKILL.md` — writing up a drill that missed its target
- `../load-testing/SKILL.md` — modelling cold-start capacity before reopening traffic
- `../feature-flags-rollout/SKILL.md` — restoring flag state alongside service state
- PostgreSQL documentation: continuous archiving and PITR; `pg_basebackup`, `pg_dump`, `pg_restore`
- restic and BorgBackup repository check documentation; Velero backup and restore documentation
- AWS S3 Object Lock (governance and compliance retention modes)
- etcd disaster recovery guide (`etcdctl snapshot save` / `restore`)
