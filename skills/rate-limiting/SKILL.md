---
name: rate-limiting
description: Choose and implement a rate limiting algorithm, enforce it across a distributed fleet with Redis, and expose correct 429 semantics with Retry-After and RateLimit headers. Use when an API needs throttling, a tenant is starving others, or a limiter is rejecting legitimate traffic at burst boundaries.
metadata:
  origin: FORGE
---

# Rate Limiting

A limiter protects a finite resource — database connections, an upstream vendor quota, a per-tenant fairness budget — by shaping how fast callers may consume it. The hard parts are not the counting: they are picking an algorithm whose burst behavior matches the resource, keying the limit so one noisy tenant cannot starve the rest, making the decision atomic across many app instances, and telling the client enough that it backs off correctly instead of hammering harder. Done means limits are enforced identically on every node, `429` responses carry an actionable `Retry-After`, legitimate bursts are not clipped at arbitrary clock boundaries, and the limiter itself is observable.

## When to activate

- Public or partner API needs per-key quotas before launch
- One tenant's traffic is degrading latency for everyone else
- An upstream vendor charges per call or enforces its own quota that must not be exceeded
- Login, signup, password-reset, or OTP endpoints need abuse control
- A limiter already exists and clients report rejections at the top of every minute
- User says "rate limit", "throttle", "429", "quota", "too many requests", "backoff"

## When NOT to use

- Making retries safe once a client does back off: see `../idempotency-patterns/SKILL.md`
- Reducing load by not recomputing at all: see `../caching-strategy/SKILL.md`
- Long-running work that should be queued rather than rejected: see `../background-jobs-queues/SKILL.md`
- Per-request spend caps on metered LLM or vendor usage: see `../cost-tracking/SKILL.md`
- Authentication, authorization, or bot detection: see `../security-review/SKILL.md`
- Network-edge volumetric DDoS absorption — that belongs at the CDN or load balancer, not in application code

## Prerequisites

- Redis reachable from every app instance, with `EVAL`/`EVALSHA` permitted
- A stable identity per caller: API key id, user id, tenant id, or a trustworthy client IP
- Correct client IP extraction behind proxies (`X-Forwarded-For` parsed against a trusted-proxy list, not blindly)
- Knowledge of the actual bottleneck being protected — a limit chosen without one is arbitrary

## Process

### 1. Pick the algorithm

| Algorithm | Memory per key | Burst behavior | Boundary accuracy | Notes |
| --- | --- | --- | --- | --- |
| Fixed window | 1 counter | Up to 2x limit across a boundary | Poor | `INCR` + `EXPIRE`; cheapest, fine for coarse abuse control |
| Sliding window log | One entry per request | Exact | Exact | Sorted set of timestamps; memory scales with limit, use only for small limits |
| Sliding window counter | 2 counters | Smoothed, approximate | Good | Weighted blend of current and previous window; the usual production default |
| Token bucket | 2 fields | Explicit burst up to capacity, then steady rate | Good | Best when bursts are legitimate; naturally supports cost weighting |
| Leaky bucket (queue) | Queue depth | None — output is perfectly smooth | Exact | Shapes rather than rejects; adds latency; use for outbound calls to a rate-limited vendor |

Rule of thumb: **token bucket** for inbound APIs where clients batch legitimately, **sliding window counter** when a flat "N per minute" contract must be honored, **leaky bucket** for outbound traffic to a vendor with a hard ceiling, **fixed window** only for cheap abuse guards.

### 2. Implement the token bucket atomically in Redis

Read-modify-write across multiple commands races under concurrency. The whole decision must be one script.

```lua
-- KEYS[1] = bucket key
-- ARGV[1] = capacity (max burst, tokens)
-- ARGV[2] = refill_rate (tokens per second, may be fractional)
-- ARGV[3] = cost (tokens this request consumes)
-- Returns: { allowed, tokens_remaining_floor, retry_after_ms, reset_after_ms }

local capacity = tonumber(ARGV[1])
local rate     = tonumber(ARGV[2])
local cost     = tonumber(ARGV[3])

local t     = redis.call('TIME')
local now   = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)

local state  = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(state[1])
local ts     = tonumber(state[2])

if tokens == nil or ts == nil then
  tokens = capacity
  ts     = now
end

-- Refill for elapsed time. Clamp negative elapsed (failover clock regression).
local elapsed = now - ts
if elapsed < 0 then elapsed = 0 end
tokens = math.min(capacity, tokens + (elapsed / 1000.0) * rate)

local allowed     = 0
local retry_after = 0

if tokens >= cost then
  allowed = 1
  tokens  = tokens - cost
else
  retry_after = math.ceil(((cost - tokens) / rate) * 1000)
end

redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)

-- Expire once the bucket would be full again; an absent key is an empty full bucket.
local ttl = math.ceil((capacity - tokens) / rate) + 1
redis.call('EXPIRE', KEYS[1], ttl)

local reset_after = math.ceil(((capacity - tokens) / rate) * 1000)
return { allowed, math.floor(tokens), retry_after, reset_after }
```

Notes that matter:

- `TIME` inside the script removes clock skew between app nodes. Scripts calling it require effects replication, which is the default from Redis 5 onward.
- Redis truncates Lua numbers to integers on return, so fractional token state stays in the hash and only floored values are returned.
- Ship with `EVALSHA`, falling back to `EVAL` on `NOSCRIPT`. Every client library worth using does this already.
- Under Redis Cluster the single key keeps the script on one slot. For multiple concurrent limits, either hash-tag the keys into one slot or run one script per limit.

Fixed and sliding windows do not need Lua:

```bash
# Fixed window: N per 60s. Atomic enough — INCR creates the key, EXPIRE is set once.
redis-cli SET   ratelimit:fixed:tenant42:1730000000 0 EX 60 NX
redis-cli INCR  ratelimit:fixed:tenant42:1730000000
```

For the sliding window counter, keep `count:{window_n}` and `count:{window_n-1}` and compute
`estimate = current + previous * (1 - elapsed_fraction_of_current_window)`. Two `GET`s and one `INCR`, no script required, and the boundary doubling of the fixed window disappears.

### 3. Key the limit deliberately

The key determines who is protected from whom.

| Dimension | Key shape | Protects against |
| --- | --- | --- |
| IP | `rl:ip:{ip}:{route_group}` | Unauthenticated abuse, credential stuffing |
| User | `rl:user:{user_id}` | A single account script running wild |
| API key | `rl:key:{api_key_id}` | Contract enforcement, billing tiers |
| Tenant | `rl:tenant:{tenant_id}` | Noisy-neighbor starvation in shared infrastructure |
| Route | `rl:key:{api_key_id}:route:{route_id}` | One expensive endpoint consuming the whole budget |
| Global | `rl:global:{resource}` | Total load on a downstream dependency |

Apply **concentric limits**: a narrow limit on the expensive route, a broader one on the API key, a fleet-wide ceiling on the shared dependency. Evaluate cheapest-first and short-circuit; report the *most restrictive* limit that was hit in the response headers so the client knows which dial to turn.

Never key on unauthenticated IP alone for anything behind login — carriers and corporate NATs share addresses. Never key on a header a caller controls.

Cardinality is a real cost: one Redis key per IP per route per window can be millions of keys. Every key gets a TTL, and route grouping keeps the fan-out bounded.

### 4. Weight by cost, not by request count

One request is not one unit of load. A cursor page of 1000 records, a full-text search, or an LLM call is not equivalent to a `GET` by id.

```typescript
function costOf(req: Request): number {
  if (req.route === "/v1/search") return 5;
  if (req.route === "/v1/reports") return 25;
  const page = Math.min(Number(req.query.limit ?? 50), 1000);
  return 1 + Math.floor(page / 100);
}
```

Charge the estimate before the work, and reconcile after when the true cost is only knowable post-hoc (tokens consumed, rows scanned) by deducting the difference from the same bucket. Token bucket supports this naturally: `cost` is already a script argument. Publish the cost table — an undocumented weight is indistinguishable from a bug to the caller.

### 5. Return correct 429 semantics

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/problem+json
Retry-After: 12
RateLimit-Policy: "sustained";q=1000;w=3600, "burst";q=60;w=60
RateLimit: "burst";r=0;t=12

{
  "type": "/errors/rate-limited",
  "title": "Too Many Requests",
  "status": 429,
  "detail": "Burst limit of 60 requests per 60s exceeded for API key.",
  "policy": "burst"
}
```

Rules:

- `Retry-After` in seconds, computed from the limiter's own state — never a hardcoded constant.
- Emit `RateLimit-Policy` and `RateLimit` per the IETF RateLimit header fields draft; when the quota is depleted, report the *binding* policy, not the most generous one.
- Send the headers on successful responses too, so well-behaved clients can pace themselves instead of discovering the wall.
- `429` means "retry later"; `403` means "never". Do not conflate them.
- Rejected requests must be cheap: reject before authentication where possible, and never log a full request body on rejection.

### 6. Degrade before rejecting

Rejection is the blunt option. When the resource permits it, shed value instead of traffic:

- Serve a stale cached response rather than recomputing (see `../caching-strategy/SKILL.md`)
- Downgrade to a smaller page size or a cheaper model
- Queue the work and return `202` with a status URL
- Drop optional enrichment (recommendations, related items) and return the core payload

Reserve hard `429` for unauthenticated traffic, clearly abusive patterns, and contractual quota ceilings. For paying tenants at the edge of their plan, a degraded response usually beats an error.

### 7. Specify client behavior

Publish it, and implement it in first-party SDKs:

```python
import random, time

def backoff_sleep(attempt: int, retry_after: float | None) -> float:
    if retry_after is not None:
        return retry_after + random.uniform(0, 1.0)      # honor the server, add jitter
    capped = min(30.0, 0.5 * (2 ** attempt))             # exponential, capped
    return random.uniform(0, capped)                     # full jitter
```

Full jitter — sampling uniformly from `[0, capped]` rather than adding a small jitter to a fixed delay — is what prevents synchronized retry storms after an incident. Cap total attempts and total elapsed time, not just per-attempt delay. Pair retries with an idempotency key so a retried write cannot duplicate.

### 8. Make it observable and testable

Emit per decision: `limit_key_dimension`, `policy_name`, `allowed`, `remaining`, `cost`. Then track:

- Rejection rate by policy and by tenant — a single tenant at 90% rejection is usually a broken integration, not an attacker
- p99 `remaining` per tier — persistently near zero means the limit is mis-sized
- Limiter latency and Redis error rate

Decide the fail mode explicitly. **Fail-open** (allow when Redis is unreachable) for revenue endpoints; **fail-closed** for login, signup, and anything protecting a hard vendor quota. Write it down; the default in most libraries is fail-open and that is frequently wrong.

Testing requires deterministic time. Inject the clock rather than sleeping:

- Assert exactly `capacity` requests pass instantly, then the next is rejected
- Advance the clock by `1/rate` and assert exactly one more passes
- Fire concurrent requests from N goroutines/tasks and assert the total allowed equals capacity exactly — this catches non-atomic implementations
- Assert `Retry-After` matches the observed time until the next success

## Checklist

- [ ] Algorithm chosen against the actual bottleneck and its burst tolerance, and recorded
- [ ] Decision is a single atomic Redis operation or Lua script
- [ ] Every limiter key has a TTL; key cardinality bounded
- [ ] Concentric limits: route, principal, tenant, global
- [ ] Expensive operations weighted, and the cost table documented
- [ ] `Retry-After` computed from limiter state, `RateLimit` headers on success and rejection
- [ ] Fail-open vs fail-closed decided per endpoint class, covered by a test; degradation paths considered before hard rejection
- [ ] First-party clients use full-jitter backoff plus idempotency keys
- [ ] Rejection rate tracked by tenant and policy, alerting on a single-tenant spike
- [ ] Concurrency test proves the limit holds under parallel load

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Clients rejected at the top of every minute | Fixed window boundary doubling upstream, then a hard cliff | Move to sliding window counter or token bucket |
| Allowed count exceeds the limit under load | Non-atomic read-modify-write across commands | Single Lua script or `INCR`-based counter |
| Limits inconsistent across app nodes | Per-process in-memory counters | Centralize in Redis; keep local counters only as a pre-filter |
| Redis memory climbing steadily | Keys created without TTL | Set `EXPIRE` in the same script that creates the key |
| Everything rejected during a Redis blip | Fail-closed default on a revenue path | Choose the fail mode per endpoint; add a local fallback limiter |
| Retry storms after recovery | Fixed backoff, no jitter | Full jitter, capped attempts, honor `Retry-After` |
| One tenant starves the rest despite a global limit | No per-tenant dimension | Add concentric per-tenant limits |
| Legitimate batch jobs blocked | Steady-rate limiter with no burst allowance | Token bucket with capacity above the batch size |
| Every user behind one office IP throttled | Keying on IP for authenticated traffic | Key on user or API key; keep IP limits for unauthenticated routes only |

## References

- RFC 9110 HTTP Semantics, status code 429 and the `Retry-After` header
- RFC 9457, Problem Details for HTTP APIs
- IETF draft: RateLimit header fields for HTTP
- Redis command documentation for EVAL, EVALSHA, INCR, EXPIRE, HMGET, TIME
- `../redis-patterns/SKILL.md`
- `../caching-strategy/SKILL.md`
- `../idempotency-patterns/SKILL.md`
