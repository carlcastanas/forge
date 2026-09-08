---
name: api-versioning-deprecation
description: Deciding when a version is actually needed, choosing a versioning style, keeping changes additive, and retiring an endpoint with Deprecation and Sunset headers, measured usage, and a migration path. Use when planning a breaking API change, adding a version scheme, deprecating an endpoint or field, or setting a removal date.
metadata:
  origin: FORGE
---

# API Versioning and Deprecation

Most changes that get a new version did not need one, and most endpoints that get deleted were still in use by someone who was never told. Both mistakes are expensive: a premature version doubles the surface to maintain forever, and an unmeasured removal is an outage attributed to the provider. Done means additive changes ship without a version bump, genuine breaks get one deliberate scheme applied consistently, deprecations are announced in-band with machine-readable headers and a dated sunset, and nothing is removed until traffic data shows who is left.

## When to activate

- A proposed change would break existing clients, and someone suggests `/v2`
- Choosing a versioning style for a new public or partner API
- Removing a field, endpoint, enum value, or default behaviour
- Setting a sunset date, or being asked how long a deprecation window should be
- Clients break on a change that looked additive
- User says "should this be v2", "deprecate this endpoint", "Sunset header", "breaking change policy"

## When NOT to use

- Designing the resources, status codes, and payloads in the first place — `../api-design/SKILL.md`
- GraphQL schema evolution and `@deprecated` field mechanics — `../graphql-patterns/SKILL.md`
- Protobuf field-number and wire-compatibility rules — `../grpc-protobuf/SKILL.md`
- Evolving an event payload delivered to webhook consumers — `../webhook-design/SKILL.md`
- Changing the database underneath a stable contract — `../database-migrations/SKILL.md`
- Recording why a scheme was chosen — `../architecture-decision-records/SKILL.md`

## Prerequisites

- An OpenAPI (or equivalent) document checked into version control
- Per-client request telemetry: version, route, and user agent or key id attributable to an account
- A published changelog and a way to reach integrators (email on file, dashboard banner)

## Process

### 1. Establish what actually breaks

Version only when a change cannot be made compatible. Classify first.

Non-breaking: adding an optional request field; adding a response field; adding an endpoint; adding an optional query parameter; relaxing a validation rule; adding an enum value **if** clients were told to tolerate unknown values.

Breaking: removing or renaming anything; changing a type (`"42"` to `42`, scalar to array); making an optional request field required; tightening validation; changing a default; changing pagination semantics; changing an error code for an existing condition; changing the meaning of a field while keeping its name (the worst kind — nothing fails loudly).

Grey area worth treating as breaking: adding a required field to a webhook payload consumers validate strictly; changing sort order; changing rate limits.

```bash
# make the classification mechanical, not a judgement call in review
oasdiff breaking openapi.previous.yaml openapi.yaml --fail-on ERR
oasdiff changelog openapi.previous.yaml openapi.yaml --format markdown > CHANGELOG.api.md
```

### 2. Write both sides as tolerant readers

Most breakage comes from clients that are stricter than the contract requires, and from servers that reject anything unrecognised. Postel's discipline is a design rule, not a slogan.

Server: ignore unknown request fields rather than rejecting them, unless strictness is a documented security control. Client: never fail on unknown response fields, never assume an enum is closed, never depend on field order or on the absence of a field.

```typescript
// tolerant reader: parse the fields this client needs, pass the rest through untouched
const InvoiceSchema = z.object({
  id: z.string(),
  amount_cents: z.number().int(),
  status: z.enum(["draft", "open", "paid"]).catch("unknown_forward_compatible"),
}).passthrough();   // unknown fields survive round-trips instead of being stripped
```

Round-tripping matters: a client that reads, mutates, and writes back an object must preserve fields it does not understand, or every update silently deletes newer data.

### 3. Choose one versioning style and apply it everywhere

| Style | Example | Fits | Costs |
| --- | --- | --- | --- |
| URI path | `/v2/invoices` | Public REST, cache keys, obvious in logs | Version leaks into every URL; resource identity changes across versions |
| Media type | `Accept: application/vnd.acme.invoice+json;version=2` | Per-resource evolution, strict REST | Hard to try in a browser; proxies and caches need `Vary` |
| Header | `X-API-Version: 2` | Global switch without touching URLs | Invisible in logs unless captured; easy to forget on one call |
| Date | `Acme-Version: 2026-02-01` | Frequent small breaks, per-account pinning | Requires a transformation layer that upgrades old requests |

Date-based versioning with account pinning is what large payment and messaging APIs converge on: an account is pinned to the version current when it integrated, changes ship as dated releases, and a compatibility layer transforms between them. It scales to many small breaks but requires infrastructure that transforms requests and responses at the edge, which is the point most teams underestimate.

For internal services, prefer no version at all: coordinate deploys, keep changes additive, and use a consumer-driven contract test to catch breaks — see `../contract-first/SKILL.md`.

Pick one. Two styles in the same API means every client has two things to get wrong.

### 4. Deprecate in-band with dated headers

Announce in the response itself so an integrator discovers the deprecation while testing, not in an email nobody read. `Deprecation` carries when the deprecation took effect; `Sunset` carries when the resource stops responding; a `Link` with `rel="sunset"` points at the migration guide. Both dates are IMF-fixdate.

```http
HTTP/1.1 200 OK
Content-Type: application/json
Deprecation: Tue, 01 Sep 2026 00:00:00 GMT
Sunset: Sun, 01 Mar 2027 00:00:00 GMT
Link: </docs/migrations/invoices-v1-to-v2>; rel="sunset"; type="text/html"
Warning: 299 - "GET /v1/invoices is deprecated; use GET /v2/invoices"
```

`Deprecation` may also be a boolean-ish `true` when the effective date is unknown, but a date is more useful. Emit these on every deprecated route, not just the documentation. Mirror them in the OpenAPI document so generated clients surface the state.

```yaml
paths:
  /v1/invoices:
    get:
      deprecated: true
      summary: List invoices (deprecated)
      description: |
        Deprecated 2026-09-01, sunset 2027-03-01. Use `GET /v2/invoices`.
        Differences: `amount` (string, major units) becomes `amount_cents` (integer, minor units);
        offset pagination becomes cursor pagination.
      x-sunset: "2027-03-01"
```

### 5. Size the window by who is on the other end

The window starts when the deprecation is announced through every channel, not when the code was written.

- Internal services under the same deploy pipeline: days to weeks; coordinate directly.
- First-party mobile clients: at least as long as the tail of unforced app upgrades, typically six to twelve months. Old builds cannot be patched.
- Public and partner APIs: six months minimum for a field, twelve for an endpoint or version. Contractual commitments override.
- Anything embedded in firmware or on-premise installs: assume years, and plan a server-side shim.

Publish the policy before the first deprecation. A window announced alongside the break reads as a deadline imposed, not a policy applied.

### 6. Communicate breaks in a form clients can consume

A changelog entry humans read plus a diff machines read.

```markdown
## 2026-09-01

### Deprecated
- `GET /v1/invoices` — sunset 2027-03-01. Use `GET /v2/invoices`.
  `amount` (string, major units) becomes `amount_cents` (integer, minor units).
  Offset pagination (`page`, `per_page`) becomes cursor pagination (`limit`, `starting_after`).

### Added
- `Invoice.tax_breakdown` (array) on all versions. Additive; no action required.
```

Publish the OpenAPI document per version at a stable path so clients can diff it themselves and regenerate SDKs. Reach integrators through the channel they actually watch: a dashboard banner keyed to accounts observed calling the deprecated route beats a broadcast email.

### 7. Give clients a concrete migration path

Reduce migration to a mechanical change, and make it testable before the cutover.

- Ship the replacement before deprecating the old surface; never announce a removal without a live alternative.
- Run both in parallel, with the old route implemented as a translation over the new one — one code path, no divergence in behaviour.
- Offer an opt-in header so a client can exercise the new behaviour against production data before switching for real.
- Provide a per-account flag to flip forward and back during rollout.
- Publish a diff of the generated SDK, not only the wire format, when SDKs are the primary interface.

```http
GET /v1/invoices?limit=50 HTTP/1.1
Acme-Version-Preview: 2027-03-01     # opt in to post-sunset behaviour for testing
```

### 8. Measure usage, then remove

Removal is a data decision. Instrument before announcing, so the window has a baseline.

```sql
-- who is still on the deprecated route, and is the trend going to reach zero by sunset?
SELECT account_id,
       date_trunc('week', requested_at) AS week,
       count(*)                         AS calls,
       max(requested_at)                AS last_seen
FROM api_request_log
WHERE route = '/v1/invoices'
  AND requested_at >= now() - interval '90 days'
GROUP BY account_id, week
HAVING count(*) > 0
ORDER BY account_id, week;
```

Sequence the endgame rather than flipping a switch:

1. Traffic to the deprecated route trends toward zero; remaining accounts are named and contacted individually.
2. Run announced brownout tests: return 410 Gone for a scheduled window (an hour, then a day) well before sunset. Anyone still integrated finds out while someone is watching.
3. At sunset, return `410 Gone` with a body pointing at the migration guide — not 404, which reads as a bug.
4. Keep the 410 in place well past sunset; a route that starts 404ing loses the only signal that tells a stranded client what happened.

## Checklist

- [ ] Change classified as breaking or non-breaking by a tool, not by opinion
- [ ] Non-breaking changes ship without a version bump
- [ ] Exactly one versioning style across the API, documented
- [ ] Server ignores unknown request fields; clients tolerate unknown response fields and enum values
- [ ] Round-tripping clients preserve fields they do not understand
- [ ] `Deprecation` and `Sunset` headers plus `Link rel="sunset"` on every deprecated route
- [ ] OpenAPI marks the operation `deprecated: true` with the migration described
- [ ] Deprecation window sized to the client population and published as policy beforehand
- [ ] Changelog entry plus a machine-readable OpenAPI diff published per release
- [ ] Replacement live and reachable before the deprecation is announced
- [ ] Per-account usage of the deprecated surface tracked from announcement to removal
- [ ] Named remaining accounts contacted; scheduled 410 test run before sunset
- [ ] Post-sunset responses are `410 Gone` with a pointer to the migration guide

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Clients break on a change believed additive | Enum value added to a closed client switch, or validation tightened | Treat enum additions as breaking unless tolerance is documented |
| `/v2` exists for a change that was additive | No classification step before the version decision | Run a breaking-change diff in CI as the gate |
| Two versioning styles coexist | Different teams shipped different schemes | Pick one, migrate, record the decision in an ADR |
| Nobody noticed the deprecation | Announced only in docs or email | Emit `Deprecation`/`Sunset` on the live route; banner the affected accounts |
| Sunset arrives with traffic still flowing | No usage telemetry attributable to an account | Instrument per account at announcement; contact the named tail |
| Removal causes an outage attributed to the provider | No scheduled 410 test before sunset | Run announced brownout windows first |
| Clients report data silently disappearing | Round-tripping client strips unknown fields | Preserve unknown fields on read-modify-write |
| Old version diverges in behaviour from the new one | Two independent implementations | Implement the old route as a translation over the new |
| Date-based versioning becomes unmaintainable | Transformations applied ad hoc per handler | Centralise upgrade/downgrade transforms at the edge, one per dated release |

## References

- RFC 9110 HTTP Semantics (status codes, content negotiation, IMF-fixdate)
- RFC 8594 The Sunset HTTP Header Field
- RFC 9745 The Deprecation HTTP Header Field
- RFC 8288 Web Linking (`rel="sunset"`)
- OpenAPI Specification (`deprecated`, specification extensions)
- Semantic Versioning specification
- `../api-design/SKILL.md`, `../contract-first/SKILL.md`
- `../graphql-patterns/SKILL.md`, `../grpc-protobuf/SKILL.md`, `../webhook-design/SKILL.md`
- `../database-migrations/SKILL.md`, `../architecture-decision-records/SKILL.md`
