---
name: caching-strategy
description: Choose a cache topology, design keys and TTLs, protect against stampedes, and pick an invalidation strategy that matches the tolerance for stale data. Use when adding a cache, debugging stale or leaked cached data, or deciding whether a cache is warranted at all.
metadata:
  origin: FORGE
---

# Caching Strategy

A cache trades correctness for latency and cost. Every cache introduces a second copy of the truth, and the engineering work is deciding how wrong that copy may be, for how long, and who notices. This skill covers the read/write topologies, key design that survives a schema change, TTL selection with jitter, stampede protection, the four invalidation strategies and when each is honest, and the correctness risks that turn a cache into an incident — stale reads after write, negative caching, poisoning through unsanitized key input, and cross-tenant leakage. Done means the staleness window is a documented number, the hit ratio is measured, invalidation has a defined path, and removing the cache degrades latency without changing results.

## When to activate

- A read path is slow or expensive and the same result is computed repeatedly
- Database CPU is dominated by a small set of repeated queries
- A third-party API is metered per call and responses are reusable
- A bug report describes users seeing stale data after saving, or seeing another account's data
- Traffic spikes cause a thundering herd against the origin when a popular key expires
- User says "add caching", "cache invalidation", "stale data", "hit rate", "stampede", "TTL"

## When NOT to use

- Rejecting excess traffic rather than absorbing it: see `../rate-limiting/SKILL.md`
- Redis operational concerns — eviction policy, clustering, connection pooling: see `../redis-patterns/SKILL.md`
- Query plans, missing indexes, and N+1s — fix the query before caching the symptom: see `../postgres-patterns/SKILL.md`
- Propagating changes between services as first-class events: see `../event-driven-architecture/SKILL.md`
- Write-heavy data read once, or anything with a legal requirement to be current on read

## Prerequisites

- Baseline measurements: origin p50/p99 latency, query rate, and the read/write ratio of the target data
- A cache store with TTL support (Redis assumed) and a decision on eviction policy
- Clear ownership of every write path that can change the cached data — an unknown writer means invalidation cannot work
- Tenant identity available at cache-key construction time

## Process

### 1. Decide whether a cache is warranted

Compute the ceiling before building. With hit ratio `h`, effective latency is `h * cache_latency + (1 - h) * (cache_latency + origin_latency)`; the saving scales with `h`, and the invalidation obligation is permanent regardless of `h`. Skip the cache when:

- The read/write ratio is below roughly 10:1 — churn keeps the hit ratio low and invalidation dominates
- The key space is effectively unbounded (per-user per-timestamp queries) — nothing is ever reused
- The origin is already fast and the problem is fan-out — fix the N+1 instead
- Staleness has no acceptable window and there is no event to invalidate on

A cache is warranted when a small hot set absorbs most reads, the origin cost per miss is material, and a staleness window can be named out loud.

### 2. Pick the topology

| Pattern | Who reads/writes the cache | Consistency | Failure behavior | Use when |
| --- | --- | --- | --- | --- |
| Cache-aside (lazy) | Application, explicitly | Stale until TTL or explicit delete | Cache down → all reads hit origin | Default. Most read paths. |
| Read-through | Cache library/provider on miss | Same as cache-aside | Cache down → reads fail unless bypass exists | Uniform access through one client layer |
| Write-through | Write goes to cache and origin synchronously | Cache never staler than origin | Adds write latency; partial-failure handling required | Read-after-write on hot keys |
| Write-behind | Write hits cache, flushed to origin async | Origin lags cache | Data loss on cache failure before flush | Only with a durable buffer; rarely justified |
| Refresh-ahead | Background refresh before expiry | Near-fresh | Wasted refreshes for cold keys | Small, predictable, very hot key set |

Cache-aside is the correct default. Write-through is worth the write-path complexity only for keys read far more often than written and where read-after-write matters. Write-behind trades durability for throughput and needs an explicit durability story; do not reach for it to hide a slow write path.

```python
def get_product(product_id: str, tenant_id: str) -> dict:
    key = cache_key("product", tenant_id, product_id)
    hit = redis.get(key)
    if hit is not None:
        return decode(hit)
    row = db.fetch_product(tenant_id, product_id)
    if row is None:
        redis.set(key, NEGATIVE_SENTINEL, ex=jitter(60))   # short negative TTL
        return None
    redis.set(key, encode(row), ex=jitter(600))
    return row
```

On write, delete rather than update: `redis.delete(key)` after the origin transaction commits. Deleting is idempotent and cannot write a value the origin never had. Updating the cache from application state races with concurrent writers.

### 3. Design keys for change

A key is an API. It will outlive the code that wrote it.

```text
{app}:{version}:{tenant}:{entity}:{id}:{variant}
forge:v3:t_8f21:product:p_1049:full
forge:v3:t_8f21:product:p_1049:summary
```

Rules that pay off later:

- **Namespace prefix** so multiple services or environments can share an instance without collision.
- **Schema version segment.** When the serialized shape changes, bump `v3` to `v4`. Old entries age out on their own; no flush, no deploy-ordering hazard between old and new code reading each other's payloads.
- **Tenant segment always present** for anything tenant-scoped, placed before the entity so key scans stay useful. See `../multi-tenancy-patterns/SKILL.md`.
- **Variant segment** for the projection or locale, so a summary read never returns the full payload.
- **Hash long or unbounded key material** rather than embedding it: `sha256` of the canonicalized filter object. Never put a raw caller-supplied string in a key — normalize, allowlist, then hash. See risk 3 below.

### 4. Choose TTLs, and jitter them

TTL is the staleness contract written as a number. Derive it from tolerance, not from habit:

| Data | Typical TTL | Rationale |
| --- | --- | --- |
| Reference data (countries, plans) | hours to days | Changes rarely, event-invalidated when it does |
| Product/catalog detail | 5–30 min | Tolerable lag, high read volume |
| Per-user personalized views | 30–120 s | Personalization drifts fast |
| Permission and feature-flag checks | 5–30 s | Short, because revocation must land quickly |
| Negative (not-found) results | 30–60 s | Long enough to blunt scans, short enough that creation appears promptly |
| Vendor API responses | Their `Cache-Control`, floored | Never cache longer than the provider permits |

Always jitter — keys populated together expire together and re-stampede together. `jitter(ttl) = int(ttl * uniform(0.85, 1.15))` applied at every write is sufficient; a fixed spread of 10–20% breaks the synchronization without materially changing the staleness contract.

### 5. Protect against stampedes

When a hot key expires under load, every concurrent request misses and hits the origin at once.

**Single-flight lock.** One request recomputes; the rest wait briefly or serve stale.

```go
func (c *Cache) GetOrLoad(ctx context.Context, key string, ttl time.Duration,
 load func(context.Context) ([]byte, error)) ([]byte, error) {

 if v, err := c.rdb.Get(ctx, key).Bytes(); err == nil {
  return v, nil
 }

 lockKey, token := "lock:"+key, uuid.NewString()
 ok, err := c.rdb.SetNX(ctx, lockKey, token, 10*time.Second).Result()
 if err != nil {
  return load(ctx) // cache unavailable: fail open to the origin
 }
 if !ok { // another worker is loading; bounded wait, then fall back
  if v, found := c.waitForKey(ctx, key, 250*time.Millisecond); found {
   return v, nil
  }
  return load(ctx)
 }
 defer c.releaseIfOwner(ctx, lockKey, token) // compare-and-delete via Lua

 v, err := load(ctx)
 if err != nil {
  return nil, err
 }
 c.rdb.Set(ctx, key, v, jitter(ttl))
 return v, nil
}
```

Release must be owner-checked (Lua `GET` then `DEL` if the token matches), or a slow holder deletes a lock a successor now owns.

**Stale-while-revalidate.** Store a logical `fresh_until` inside the payload and set the physical TTL well beyond it. Past `fresh_until`, return the stale value immediately and trigger one background refresh. Strongest option for user-facing reads: a miss never blocks.

**Probabilistic early expiration.** Refresh before expiry with a probability that rises as expiry nears, so refreshes spread out naturally:

```python
import math, random, time

def should_refresh_early(fetched_at: float, ttl: float, compute_cost_s: float,
                         beta: float = 1.0) -> bool:
    age = time.time() - fetched_at
    return age - compute_cost_s * beta * math.log(random.random()) >= ttl
```

### 6. Pick an invalidation strategy

| Strategy | Mechanism | Staleness | Cost | Fits |
| --- | --- | --- | --- | --- |
| TTL only | Wait for expiry | Up to the TTL | Near zero | Tolerant reads, unknown or numerous writers |
| Event-driven delete | Writer deletes affected keys after commit | Seconds | Requires knowing every key touched | Single-owner entities |
| Version bump | Key embeds an entity or schema version counter | Immediate | Extra read of the version, or bump it in-process | Widely-fanned-out derived data |
| Tag-based | Keys registered in a tag set; invalidate the set | Immediate | Extra bookkeeping per write | Lists and aggregates spanning many entities |

Version bump avoids enumerating dependent keys:

```python
# Bump on write; every reader composes the current version into its key.
version = redis.incr(f"ver:{tenant_id}:product:{product_id}")
key = f"forge:v3:{tenant_id}:product:{product_id}:v{version}:summary"
```

Old versions are never read again and evict naturally under an LRU policy. That makes the eviction policy load-bearing: with `noeviction` and no TTL, orphaned versions accumulate until the instance fills. Set a TTL anyway.

Event-driven invalidation must run **after** the origin transaction commits — invalidating inside the transaction lets a concurrent read repopulate the cache with pre-commit data. Emit the invalidation through the transactional outbox when it must not be lost; see `../idempotency-patterns/SKILL.md`.

### 7. Work through the correctness risks

**Stale read after write.** The user saves, is redirected, and sees the old value. Delete the key after commit, and for the redirect specifically, bypass the cache for that request (a `no-cache` request hint, or read-your-writes routing keyed on a recent-write marker). Deleting before commit is a race, not a fix.

**Double-delete for replicated origins.** With read replicas, a post-commit delete can be repopulated from a replica that has not yet applied the write. Delete once after commit, then schedule a second delete after the expected replication lag.

**Negative caching.** Without it, a scan of nonexistent ids becomes a full-rate origin scan. With too long a TTL, a newly created resource appears missing. Use a distinct sentinel value — never an empty string, which is indistinguishable from a miss in several clients — and a short TTL, and delete the negative entry on creation of that id.

**Poisoning through unsanitized key input.** Any caller-controlled value that reaches a key can, unnormalized, create unbounded distinct keys (a cache-busting DoS) or, worse, collide with a key another caller reads. At the HTTP layer, an unkeyed header that changes the response body is the classic cache-poisoning vector: if a response varies on a header, that header must be in the cache key or in `Vary`. Normalize, allowlist, then hash.

**Cross-tenant leakage.** The highest-severity cache bug. A key missing its tenant segment serves one tenant's data to another, and the failure is silent. Enforce it structurally: a single `cache_key()` constructor that requires a tenant argument, plus a test asserting no key literal is built by string concatenation at call sites.

```python
def cache_key(entity: str, tenant_id: str, *parts: str, variant: str = "full") -> str:
    if not tenant_id:                       # structural, not conventional
        raise ValueError("tenant_id required for cache key")
    return ":".join(("forge", SCHEMA_VERSION, tenant_id, entity, *parts, variant))
```

**Caching authorization decisions.** Cache the permission *lookup*, never the final allow/deny for a resource the caller may lose access to. Keep those TTLs in seconds and invalidate on role change.

### 8. Place the layer deliberately

| Layer | Controlled by | Invalidation | Good for |
| --- | --- | --- | --- |
| Browser | `Cache-Control`, `ETag` | Content-hashed URLs only | Immutable static assets |
| CDN / edge | Origin headers, purge API | Purge by URL, tag, or surrogate key | Anonymous HTML, images, public API reads |
| Application (Redis) | Application code | Full control | Per-tenant, per-user, computed results |
| In-process (LRU) | Process memory | TTL only; no cross-node purge | Tiny, hot, tolerant data such as feature flags |
| Database | Buffer pool, materialized views | Refresh policy | Query plans and hot pages; not a design lever |

Each layer multiplies the maximum staleness. Two layers at 5 minutes can serve 10-minute-old data. Sum them and state the total. Never cache a personalized or authenticated response at a shared layer without `Cache-Control: private` — that is the same leakage risk with a wider blast radius. In-process caches cannot be invalidated across a fleet; use them only where TTL-only invalidation is acceptable.

### 9. Measure

Instrument every lookup with `hit`, `miss`, `stale_served`, `refresh_triggered`, and origin latency on miss, labeled by key namespace — an aggregate hit ratio hides a namespace at 5%.

- **Hit ratio by namespace.** Below roughly 70% on a hot path, either the TTL is too short, the key is too specific, or the data does not belong in a cache.
- **Origin load delta.** The number that justifies the cache. Measure it by disabling the cache namespace in staging under load.
- **Staleness distribution.** Age at serve time, p50 and p99, compared against the documented window.
- **Eviction rate and key cardinality.** Sustained evictions before TTL mean the working set exceeds memory and the hit ratio is a lie; key growth outpacing traffic means unbounded key material.

Keep a kill switch per namespace. Every cache must be disableable at runtime without a deploy, and the system must remain correct with it off — slower, but correct.

## Checklist

- [ ] Read/write ratio and origin cost measured before the cache was added
- [ ] Topology chosen and recorded; cache-aside unless a specific reason applies
- [ ] All keys built through one constructor requiring tenant and schema version; caller-supplied key material normalized, allowlisted, hashed
- [ ] Every entry has a jittered TTL; negative results use a distinct sentinel and a short TTL
- [ ] Stampede protection on every expensive key; invalidation strategy named per namespace and run after commit
- [ ] Replication lag accounted for when the origin has read replicas
- [ ] Authenticated responses never cached at a shared layer
- [ ] Total staleness across layers summed and documented
- [ ] Hit ratio, staleness, and eviction rate emitted per namespace
- [ ] Per-namespace kill switch exists and correctness holds with the cache off

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Origin spikes when a popular key expires | No stampede protection | Single-flight lock, or stale-while-revalidate |
| User sees old data right after saving | Cache deleted before commit, or not at all | Delete after commit; bypass on the read-after-write request |
| Stale value returns seconds after a correct delete | Repopulated from a lagging read replica | Second delayed delete past the replication lag |
| One tenant sees another's data | Tenant missing from the key | Enforce tenant in the key constructor; audit all call sites |
| Memory full, evictions before TTL | Working set exceeds capacity | Raise memory, shorten TTLs, or shrink payloads |
| Deploy serves corrupted objects | Serialization changed without a key version | Bump the schema version segment |
| Unbounded key growth from one endpoint | Raw caller input in the key | Normalize, allowlist, hash |
| Response varies by a header not in the key | Unkeyed header at a shared cache | Add it to the key or to `Vary` |

## References

- RFC 9111 HTTP Caching, including `Cache-Control`, `Vary`, and freshness calculation
- RFC 5861, HTTP Cache-Control Extensions for Stale Content (`stale-while-revalidate`, `stale-if-error`)
- Redis command documentation for SET (EX, NX), GET, DEL, INCR, EVAL, and the maxmemory-policy configuration
- "Optimal Probabilistic Cache Stampede Prevention" (the XFetch early-refresh formulation)
- `../redis-patterns/SKILL.md`
- `../postgres-patterns/SKILL.md`
- `../multi-tenancy-patterns/SKILL.md`
