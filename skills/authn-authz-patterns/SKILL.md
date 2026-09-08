---
name: authn-authz-patterns
description: Defensive patterns for choosing and implementing authentication and authorization — session cookies vs bearer tokens, OAuth2/OIDC flow selection, JWT validation pitfalls, refresh-token rotation, and RBAC/ABAC/ReBAC modeling. Use when the user asks to add login, pick an OAuth flow, debug JWT verification, design roles and permissions, or review who is allowed to do what.
metadata:
  origin: FORGE
---

# Authentication and Authorization Patterns

Authentication answers "who is calling". Authorization answers "may this caller do
this to this object". Most breaches in application code come from conflating the two,
or from enforcing the second one in a layer that can be bypassed. This skill picks the
right credential shape, validates it correctly, and puts the permission decision where
every path must cross it. Done means: one authentication boundary, one authorization
call site per resource operation, and a test that fails when either is removed.

## When to activate

- Adding login, signup, SSO, or "sign in with" to an application
- Choosing between session cookies and bearer tokens for a new client
- Implementing or reviewing JWT issuance, verification, or refresh
- Designing roles, permissions, tenancy scoping, or sharing semantics
- Reviewing an endpoint that reads a caller-supplied identifier
- User says "add auth", "which OAuth flow", "JWT not verifying", "role-based access",
  "multi-tenant permissions", "who can see this record"

## When NOT to use

- Broad pre-deployment security sweep across all categories — use
  [security-review](../security-review/SKILL.md)
- Storing and rotating the signing keys and client secrets themselves — use
  [secrets-management](../secrets-management/SKILL.md)
- Cookie flags, CORS, and CSP as HTTP surface concerns — use
  [security-headers-hardening](../security-headers-hardening/SKILL.md)
- Enumerating what an attacker would try against the whole system — use
  [threat-modeling](../threat-modeling/SKILL.md)
- Postgres row-level policy authoring specifically — use
  [postgres-patterns](../postgres-patterns/SKILL.md)

## Prerequisites

- Know which clients exist: browser SPA, server-rendered app, native mobile, machine-to-machine
- Know whether identity is first-party or federated through an external provider
- A library that already implements the protocol. Never hand-roll OAuth, PKCE, or
  password hashing. Reasonable choices: `oauth4webapi` or `openid-client` (Node),
  `authlib` (Python), `golang.org/x/oauth2` + `go-oidc` (Go)

## Process

### 1. Pick the credential shape before the library

| Client | Default choice | Why |
| --- | --- | --- |
| Browser app, same site as API | Opaque session id in a cookie | Server-side revocation, no token parsing in JS, immune to XSS exfiltration when `HttpOnly` |
| Browser app, cross-origin API | Cookie via a same-site BFF proxy | Keeps the token off the front end entirely |
| Native mobile / desktop | OAuth2 authorization code + PKCE, token in OS keychain | No client secret can be kept in a shipped binary |
| Service to service | Client credentials, or mTLS / workload identity | No user is present; short-lived and audience-scoped |
| Third-party integrator | Authorization code + PKCE with consent | Delegated access, user-revocable |

Rules that fall out of the table:

- Implicit flow and resource-owner password grant are obsolete. Do not add them.
- A public client has no secret. Treat any secret shipped to a browser or app store
  as already disclosed.
- Never store a bearer token in `localStorage`. Any script injection reads it.

### 2. Make the session or token verifiable and revocable

Opaque session identifiers, when the app owns its own identity:

```ts
import { randomBytes, createHash } from "node:crypto";

// 256 bits from a CSPRNG. Store only the hash, so a DB dump is not a session dump.
export function issueSession(userId: string) {
  const raw = randomBytes(32).toString("base64url");
  const lookup = createHash("sha256").update(raw).digest("hex");
  return {
    cookieValue: raw,
    row: {
      lookup,
      userId,
      createdAt: new Date(),
      absoluteExpiry: new Date(Date.now() + 12 * 60 * 60 * 1000),
      idleExpiry: new Date(Date.now() + 30 * 60 * 1000),
    },
  };
}
```

Set it with every attribute that matters:

```http
Set-Cookie: sid=<value>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200
```

Rotate the identifier on privilege change — login, step-up, password change, role
grant. Failing to rotate is session fixation.

### 3. Validate JWTs against the full checklist, not just the signature

Every one of these has been the root cause of a real bypass class:

```ts
import { createRemoteJWKSet, jwtVerify } from "jose";

const jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, jwks, {
    algorithms: ["RS256"],   // pin: never read `alg` from the token header
    issuer: ISSUER,          // reject tokens minted by another tenant or environment
    audience: API_AUDIENCE,  // reject an ID token replayed as an access token
    clockTolerance: 30,      // seconds, not minutes
    maxTokenAge: "15m",
  });
  if (!payload.sub) throw new Error("token missing subject");
  return payload;
}
```

- Pin the algorithm list. A verifier that trusts the header accepts `alg: none`, or
  accepts an HMAC signed with the public RSA key it published.
- Verify `iss` and `aud`. Without them, a token from a shared identity provider tenant
  is accepted by your API.
- Do not trust `kid` as a filesystem or URL path. Resolve it against a fetched JWKS.
- A signed JWT cannot be un-issued. Keep access tokens short (5-15 minutes) and hold
  revocation in the refresh path or a deny list keyed by `jti`.
- Claims are input. `payload.role` is only trustworthy if your own issuer set it and
  the audience check passed.

### 4. Rotate refresh tokens and detect reuse

```ts
async function redeemRefresh(presented: string) {
  const row = await db.refreshTokens.findByHash(sha256(presented));
  if (!row) throw new AuthError("unknown refresh token");

  if (row.usedAt) {
    // Replay of an already-redeemed token: the family is compromised.
    await db.refreshTokens.revokeFamily(row.familyId);
    await audit.log("refresh_reuse_detected", { familyId: row.familyId });
    throw new AuthError("refresh token reuse");
  }

  await db.refreshTokens.markUsed(row.id);
  return issueRefresh({ userId: row.userId, familyId: row.familyId });
}
```

One-time-use plus family revocation turns a stolen refresh token into a detectable
event instead of silent persistent access. Cap the family with an absolute lifetime so
a quiet session cannot be extended forever.

### 5. Choose the authorization model that matches the questions asked

| Model | Decides on | Reach for it when | Cost |
| --- | --- | --- | --- |
| RBAC | Subject's role | Roles are few and stable; admin/member/viewer | Role explosion once exceptions appear |
| ABAC | Attributes of subject, resource, environment | Decisions depend on department, region, status, time | Hard to answer "who can see X" |
| ReBAC | Graph edges between subject and object | Sharing, folder inheritance, org hierarchies | Needs a relationship store and consistency story |

Most products start RBAC, then need one ABAC condition (tenant match) and one ReBAC
relation (document shared with user). Model the tenant boundary first and separately —
it is not a role, it is a partition, and it must be enforced even for administrators.

### 6. Enforce at the layer that cannot be routed around

Ordered from weakest to strongest:

1. Hiding a button in the UI — not enforcement
2. Middleware on a route prefix — bypassed by any handler mounted elsewhere
3. Service-layer check inside the operation — good
4. Data-layer predicate that scopes every query — strongest

Put the decision in the service, and back it with a data-layer predicate so a missed
call site returns nothing rather than everything:

```ts
export async function getInvoice(ctx: Ctx, invoiceId: string) {
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, orgId: ctx.orgId },   // tenant predicate, always
  });
  if (!invoice) throw new NotFoundError();        // not 403: do not confirm existence
  if (!(await can(ctx, "invoice:read", invoice))) throw new NotFoundError();
  return invoice;
}
```

Return 404 rather than 403 for objects the caller may not know exist. A 403 is an
existence oracle that supports enumeration.

### 7. Test the negative cases

```ts
test("cross-tenant read is not possible", async () => {
  const res = await api.get(`/invoices/${tenantB.invoiceId}`)
    .set("Authorization", `Bearer ${tenantA.token}`);
  expect(res.status).toBe(404);
});

test("token signed by a foreign issuer is rejected", async () => {
  const res = await api.get("/me").set("Authorization", `Bearer ${forgedToken}`);
  expect(res.status).toBe(401);
});

test("expired access token cannot be refreshed twice", async () => {
  await api.post("/token").send({ refresh_token: rt });
  const replay = await api.post("/token").send({ refresh_token: rt });
  expect(replay.status).toBe(401);
});
```

Add one such test per protected resource type. A permission regression that no test
catches is indistinguishable from a feature.

## Checklist

- [ ] Credential shape chosen per client type and written down in the design note
- [ ] No bearer token in `localStorage`; browser sessions use `HttpOnly` cookies
- [ ] Session identifier is CSPRNG-generated, stored hashed, rotated on privilege change
- [ ] JWT verification pins `algorithms`, checks `iss`, `aud`, `exp`, and clock skew
- [ ] Access tokens expire in 15 minutes or less
- [ ] Refresh tokens are single-use with family revocation on reuse
- [ ] Tenant scoping is a query predicate, not a role check
- [ ] Every mutating endpoint calls the authorization function before the write
- [ ] Unauthorized reads of unknown objects return 404, not 403
- [ ] Negative tests exist for cross-tenant access and forged tokens
- [ ] Authorization decisions and denials are logged with subject, action, object

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Token from staging works in production | `iss` or `aud` not verified | Pin both to the environment's values and fail closed |
| Verification passes for a forged token | Algorithm taken from the token header | Pass an explicit `algorithms` allowlist |
| User keeps access after being disabled | Long-lived access token with no revocation path | Shorten to minutes; check status on refresh |
| One user sees another tenant's rows | Authorization checked but tenant not scoped in the query | Add `orgId` predicate at the data layer |
| Logout does not end the session elsewhere | Stateless JWT with no server-side record | Track a session or `jti` deny list; revoke the refresh family |
| Attacker enumerates valid object ids | 403 returned for existing objects, 404 for missing | Return 404 uniformly |
| Session survives a password reset | Sessions keyed only to user id, never invalidated | Bump a per-user session epoch and reject older sessions |
| Mobile app secret found in a decompiled build | Confidential-client flow used in a public client | Switch to authorization code with PKCE, no secret |

## References

- RFC 6749 (OAuth 2.0) and RFC 9700 (OAuth 2.0 Security Best Current Practice)
- RFC 7636 (PKCE), RFC 8725 (JSON Web Token Best Current Practices)
- OpenID Connect Core 1.0
- OWASP Application Security Verification Standard, chapters V2 and V4
- OWASP Top 10, A01 Broken Access Control
- [secrets-management](../secrets-management/SKILL.md),
  [security-headers-hardening](../security-headers-hardening/SKILL.md),
  [threat-modeling](../threat-modeling/SKILL.md)
