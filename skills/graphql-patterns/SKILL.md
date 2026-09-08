---
name: graphql-patterns
description: Schema design, DataLoader batching, Relay connections, error modelling, persisted queries, complexity limits, and federation for production GraphQL servers. Use when designing a GraphQL schema, fixing N+1 resolvers, adding pagination, hardening a public GraphQL endpoint, or splitting a graph into subgraphs.
metadata:
  origin: FORGE
---

# GraphQL Patterns

A GraphQL endpoint is one public surface where every client writes its own query. That shifts the failure modes: schema mistakes are permanent, resolvers fan out into N+1 database traffic, and an unbounded query is a denial-of-service vector. Done means nullability and identity are deliberate, every list-reachable resolver batches, pagination is cursor-based, expected failures are typed, and the endpoint rejects queries that are too deep, too complex, or not on the allowlist.

## When to activate

- Designing a new GraphQL schema, or reviewing an SDL diff before it ships
- Latency scales with list size, or logs show hundreds of near-identical `SELECT ... WHERE id = $1`
- Adding pagination to a list field, or replacing offset pagination
- Deciding how a mutation reports a business failure (validation, conflict, insufficient funds)
- Hardening a public or partner graph against expensive queries; splitting a graph into subgraphs
- User says "N+1 in resolvers", "add a connection field", "federation @key", "persisted queries"

## When NOT to use

- REST resources, status codes, URL structure — `../api-design/SKILL.md`
- Choosing a version scheme or deprecation window — `../api-versioning-deprecation/SKILL.md`
- Internal binary RPC with streaming — `../grpc-protobuf/SKILL.md`
- Application-wide error taxonomy, or SQL tuning behind the resolvers — `../error-handling/SKILL.md`, `../postgres-patterns/SKILL.md`

## Prerequisites

- A GraphQL server with a request-scoped context (Apollo Server, Yoga, gqlgen, Strawberry)
- DataLoader or an equivalent per-request batching primitive
- SDL in version control and diffable in CI
- Ability to read the database query log for one HTTP request in isolation

## Process

### 1. Design the schema before the resolvers

Nullability is a contract. A non-null field that throws nulls the entire subtree up to the nearest nullable parent. Mark a field non-null only when the server can always produce it.

```graphql
type Order implements Node {
  id: ID!                       # opaque, globally unique, never a raw DB integer
  status: OrderStatus!          # enum, not String — clients switch on it
  placedAt: DateTime!
  cancelledAt: DateTime         # nullable: absence is meaningful
  customer: Customer!           # an order without a customer is a bug
  lineItems(first: Int, after: String): OrderLineItemConnection!
  invoice: Invoice              # nullable: may not exist yet, and may fail to load
}

enum OrderStatus { DRAFT PENDING PAID FULFILLED CANCELLED }
```

- `ID!` is opaque. Encode type plus key (`base64("Order:1934")`) so clients cannot construct one and the underlying key can change.
- Prefer `[Tag!]!` for collections; an empty list beats `null`. Enums for closed sets; document that clients must tolerate unknown values.
- Every mutation takes one `input` object; adding an input field later is non-breaking. Never reuse an output type as an input type — they diverge immediately.

### 2. Give every mutation a payload type

Return a wrapper, never a bare entity. The wrapper is the only place to add fields later without breaking clients. Return the mutated entity so the client cache updates without a refetch.

```graphql
input CancelOrderInput { orderId: ID!  reason: CancellationReason!  clientMutationId: String }

type CancelOrderPayload {
  order: Order                  # nullable: absent on failure
  clientMutationId: String      # echoed back; correlates optimistic updates
  errors: [CancelOrderError!]!  # always present, empty on success
}
```

### 3. Kill N+1 with request-scoped DataLoaders

Any resolver on a type inside a list runs once per element. Batch at the loader, and construct loaders per request so caching never crosses users.

```typescript
import DataLoader from "dataloader";

export function createLoaders(db: Db, viewer: Viewer) {
  return {
    customerById: new DataLoader<string, Customer | null>(async (ids) => {
      const rows = await db.customer.findMany({
        where: { id: { in: [...ids] }, tenantId: viewer.tenantId },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      return ids.map((id) => byId.get(id) ?? null); // order and arity must match keys
    }),

    lineItemsByOrderId: new DataLoader<string, OrderLineItem[]>(async (orderIds) => {
      const rows = await db.orderLineItem.findMany({
        where: { orderId: { in: [...orderIds] } },
        orderBy: [{ orderId: "asc" }, { position: "asc" }],
      });
      const grouped = Map.groupBy(rows, (r) => r.orderId);
      return orderIds.map((id) => grouped.get(id) ?? []);
    }),
  };
}

await startStandaloneServer(server, {
  context: async ({ req }) => {
    const viewer = await authenticate(req);
    return { viewer, loaders: createLoaders(db, viewer) }; // per request, never module-level
  },
});
```

The batch function must return an array the same length as `keys`, in the same order, and return `null`/`[]` rather than throwing on a miss. Violating either corrupts data silently.

```bash
# verify with a counter, not by eye
curl -s localhost:4000/graphql -H 'content-type: application/json' \
  -d '{"query":"{ orders(first:50){ nodes { customer { name } } } }"}' > /dev/null
grep -c 'FROM "customer"' server.log   # expect 1, not 50
```

### 4. Paginate with Relay cursor connections

Offset pagination drifts when rows are inserted mid-scroll and degrades on deep pages. Cursors encode a position in a total order, and that order must be unique — sorting by `placedAt` alone breaks on ties.

```graphql
type OrderConnection {
  edges: [OrderEdge!]!
  nodes: [Order!]!        # convenience; keep edges for cursors
  pageInfo: PageInfo!
  totalCount: Int         # optional and nullable — often a second full scan
}

type OrderEdge { cursor: String!  node: Order! }
type PageInfo { hasNextPage: Boolean!  hasPreviousPage: Boolean!  startCursor: String  endCursor: String }

type Query {
  orders(first: Int, after: String, last: Int, before: String, filter: OrderFilter): OrderConnection!
}
```

```sql
-- keyset page: strictly after the decoded cursor, limit+1 to compute hasNextPage
SELECT * FROM "order"
WHERE tenant_id = $1
  AND (placed_at, id) < ($2::timestamptz, $3::uuid)
ORDER BY placed_at DESC, id DESC
LIMIT $4 + 1;
```

Enforce a maximum `first`/`last` (100 is a common ceiling) and reject requests passing neither.

### 5. Type expected failures; keep the errors array for faults

The top-level `errors` array is for what a client cannot act on field-by-field: auth failure, internal exception, malformed query. Outcomes a client must branch on belong in the type system.

```graphql
interface UserError { message: String!  path: [String!] }
type InsufficientFundsError implements UserError { message: String!  path: [String!]  shortfallCents: Int! }
union CancelOrderResult = CancelOrderSuccess | InsufficientFundsError | OrderAlreadyCancelledError
```

Partial data is normal: a failing nullable field resolves to `null` and appends an entry with a `path`. Attach a stable machine code under `extensions`; never parse `message`.

```json
{
  "data": { "order": { "id": "T3JkZXI6MTkzNA==", "invoice": null } },
  "errors": [{ "message": "Invoice service unavailable", "path": ["order", "invoice"],
               "extensions": { "code": "UPSTREAM_UNAVAILABLE", "retryable": true } }]
}
```

### 6. Bound cost: persisted queries, depth, complexity

Automatic persisted queries cut request size: the client sends a SHA-256 hash, the server replies `PersistedQueryNotFound` on a miss, the client retries once with the full document.

```http
POST /graphql HTTP/1.1
Content-Type: application/json

{"variables":{"first":20},
 "extensions":{"persistedQuery":{"version":1,
   "sha256Hash":"ec2e01311ab3b02f3d8c8c712f9e579356d332cf4b5b03e4b1a4c9c02d7f4a11"}}}
```

For first-party clients make the allowlist mandatory: build an operation manifest at compile time and reject any hash not in it. That removes arbitrary queries from the threat model. Then cap whatever does execute.

```typescript
const server = new ApolloServer({
  schema,
  validationRules: [
    depthLimit(12),
    createComplexityLimitRule(2000, {
      // a connection multiplies child cost by its page size
      listFactor: (args: { first?: number; last?: number }) => args.first ?? args.last ?? 50,
      onCost: (cost) => metrics.histogram("graphql.query_cost", cost),
    }),
  ],
});
```

Disable introspection and field suggestions on production partner graphs. Charge a token budget proportional to computed cost rather than counting requests — see `../rate-limiting/SKILL.md`.

### 7. Federate only when team boundaries demand it

Federation buys independent deployment per subgraph at the cost of a router and cross-subgraph latency. One team with one schema does not need it.

```graphql
# subgraph: orders — owns Order, references Customer by key
type Order @key(fields: "id") { id: ID!  total: Money!  customer: Customer! }

extend type Customer @key(fields: "id") {
  id: ID! @external
  orders(first: Int, after: String): OrderConnection!
}
```

The router resolves the entity from its owning subgraph via `_entities` and a representation `{ __typename: "Customer", id: "..." }`. Implement the reference resolver through a loader — it is called per representation.

```typescript
const resolvers = {
  Customer: {
    __resolveReference: (ref: { id: string }, ctx: Context) => ctx.loaders.customerById.load(ref.id),
  },
};
```

Each field has exactly one owning subgraph. Run composition in CI: a subgraph change that fails composition or breaks a manifest operation fails the build.

## Checklist

- [ ] Non-null fields can genuinely always be produced; nullable fields are nullable on purpose
- [ ] `ID` values are opaque and globally unique; no raw primary keys leak
- [ ] Every mutation takes one `input` and returns a payload containing the mutated entity
- [ ] Every list-reachable resolver goes through a request-scoped DataLoader
- [ ] Batch functions return same-length, same-order arrays and never throw on a miss
- [ ] List fields use cursor connections with a unique composite sort key and a max page size
- [ ] Business failures are typed; `errors` entries carry a stable `extensions.code`
- [ ] Persisted queries or an operation allowlist enforced on public traffic
- [ ] Depth and complexity limits reject expensive documents before execution; introspection off in production
- [ ] Schema diff and federation composition run in CI against the client operation manifest

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Latency scales with list length; repeated single-row selects | Field resolver hits the database per parent | Move the fetch into a DataLoader keyed by parent id |
| Users intermittently see each other's data | Loader created at module scope, cache shared across requests | Build loaders in the per-request context factory |
| Loader returns the wrong record for some keys | Batch returned rows in database order, not key order | Index into a `Map` and remap over `keys` |
| Whole response is `data: null` | Non-null field threw; error propagated to the root | Make the field nullable, or return a typed error |
| Deep pages slow; items duplicated or skipped | Offset pagination over a mutating list, or non-unique sort key | Keyset pagination on `(sortColumn, id)` |
| One request pins a CPU core | Nested lists multiply out with no complexity limit | Add depth and complexity rules; cap `first` |
| Clients break after a small schema change | Field removed or enum value added with no deprecation window | `@deprecated`, measure usage, then remove |
| Router returns null for a federated field | Missing `__resolveReference` or mismatched `@key` fields | Implement the resolver; align key selection sets |
| `PersistedQueryNotFound` loops | Hash computed over a different document string than sent | Hash the exact query text; retry once with the full document |

## References

- GraphQL specification; GraphQL over HTTP specification
- Relay GraphQL Cursor Connections specification
- Relay GraphQL Server specification (Global Object Identification, mutation input/payload)
- Apollo Federation specification; Automatic Persisted Queries protocol (Apollo)
- `../api-design/SKILL.md`, `../api-versioning-deprecation/SKILL.md`
- `../rate-limiting/SKILL.md`, `../caching-strategy/SKILL.md`
- `../postgres-patterns/SKILL.md`, `../error-handling/SKILL.md`
