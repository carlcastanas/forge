---
name: security-headers-hardening
description: Author and roll out browser security headers safely — CSP via report-only first, HSTS with preload staging, cookie attributes, CORS that does not reflect arbitrary origins, framing and isolation headers. Use when the user asks about Content-Security-Policy, CORS errors, SameSite cookies, clickjacking, HSTS, or a failing security-headers scan.
metadata:
  origin: FORGE
---

# Security Headers and Browser Hardening

Response headers are the cheapest defense-in-depth a web application has, and the
easiest to get subtly wrong: a CSP with `'unsafe-inline'` blocks nothing, a CORS handler
that echoes the request origin is a same-origin bypass, and HSTS preload is a one-way
door. This skill authors each header deliberately and rolls out the risky ones behind a
report-only phase. Done means: a policy that actually restricts something, deployed
without breaking the application, with violation reports going somewhere a human reads.

## When to activate

- Standing up a new web application or public API
- A scanner or customer questionnaire flags missing headers
- Adding third-party scripts, embeds, payment iframes, or an analytics tag
- Debugging a CORS preflight failure or a cookie that is not sent cross-site
- Hardening against clickjacking or cross-site request forgery
- User says "CSP", "Content-Security-Policy", "CORS error", "SameSite", "HSTS",
  "X-Frame-Options", "clickjacking", "security headers score"

## When NOT to use

- Deciding who may call an endpoint. CORS is not authorization — use
  [authn-authz-patterns](../authn-authz-patterns/SKILL.md)
- Sanitizing user-supplied HTML before rendering — use
  [security-review](../security-review/SKILL.md)
- API-only services with no browser client: most of this applies weakly; set
  `Content-Security-Policy: default-src 'none'` and focus on
  [api-design](../api-design/SKILL.md)
- Header configuration for an agent or LLM surface — the relevant risk is
  [prompt-injection-defense](../prompt-injection-defense/SKILL.md)

## Prerequisites

- Ability to set response headers at the edge, in the framework, or both — and knowledge
  of which layer wins when they disagree
- A staging environment that receives representative traffic
- An endpoint that can accept CSP violation reports and store them

## Process

### 1. Set the baseline that carries no compatibility risk

These four rarely break anything and should go in before any CSP work.

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
```

`includeSubDomains` is the part that bites: every subdomain, including internal tools
and legacy hosts, must serve valid TLS from that moment. Confirm that inventory first.
Add `preload` only after `includeSubDomains` has run in production for months without
incident — preload is baked into browser binaries and removal takes release cycles.
`X-XSS-Protection` is obsolete and its filter introduced its own bugs; omit it or send `0`.

### 2. Author a CSP that restricts something real

An allowlist policy is defeated by any host on it that serves user content or a JSONP
endpoint. Prefer nonces or hashes, with `'strict-dynamic'` so loaders can still bring
in their own chunks.

```http
Content-Security-Policy:
  default-src 'self'; base-uri 'none'; object-src 'none';
  frame-ancestors 'none'; form-action 'self';
  script-src 'nonce-{RANDOM}' 'strict-dynamic' https: 'unsafe-inline';
  style-src 'self' 'nonce-{RANDOM}';
  img-src 'self' data: https:; font-src 'self';
  connect-src 'self' https://api.example.com;
  upgrade-insecure-requests; report-uri /csp-report; report-to csp-endpoint
```

Reading that `script-src`: modern browsers honor the nonce and ignore both `https:` and
`'unsafe-inline'`, which are present only as fallbacks for browsers that do not support
nonces. This is the standard strict-CSP shape, not a mistake.

`default-src` covers none of the following, so each must be stated:

- `base-uri 'none'` — without it, an injected `<base>` tag redirects every relative
  script URL to an attacker host, defeating the rest of the policy.
- `object-src 'none'` — legacy plugin content is a script-execution path.
- `frame-ancestors` — the modern replacement for `X-Frame-Options`. Keep the older
  header for very old user agents; where they conflict, `frame-ancestors` wins.
- `form-action 'self'` — stops an injected form from posting credentials elsewhere.

Generate a fresh nonce per response and thread it into the template:

```ts
// Next.js middleware.ts
import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const csp = [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "connect-src 'self' https://api.example.com",
    "report-uri /csp-report",
  ].join("; ");

  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);                 // read this in the layout
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy-Report-Only", csp);
  return res;
}
```

A nonce reused across responses, or derived from anything predictable, is equivalent to
`'unsafe-inline'`.

### 3. Roll out report-only, then enforce

Never ship a first CSP in enforcing mode. The sequence:

1. Deploy `Content-Security-Policy-Report-Only` with the intended policy.
2. Collect reports for at least one full business cycle, so weekly jobs, admin screens,
   and marketing tags all appear.
3. Triage each violated directive: legitimate resource to allow, dead code to delete,
   inline handler to refactor, or a browser extension to ignore.
4. Tighten the policy, redeploy report-only, confirm the report volume drops.
5. Switch the header name to enforcing. Keep the report-only header alongside it,
   carrying the next, stricter policy you are working toward.

The report endpoint must be cheap, unauthenticated, rate-limited, and size-capped. It
receives whatever any browser or extension sends.

```ts
export async function POST(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > 8192) {
    return new Response(null, { status: 413 });
  }
  const r = (await req.json().catch(() => null))?.["csp-report"];
  if (r) {
    logger.warn("csp_violation", {
      directive: String(r["violated-directive"] ?? "").slice(0, 120),
      blocked: String(r["blocked-uri"] ?? "").slice(0, 200),
    });
  }
  return new Response(null, { status: 204 });
}
```

Expect noise from browser extensions injecting scripts. Filter `blocked-uri` values with
extension schemes before alerting, or the signal drowns.

### 4. Set cookie attributes per cookie, not per application

| Attribute | Use | Note |
| --- | --- | --- |
| `HttpOnly` | Every session or auth cookie | Removes it from `document.cookie` |
| `Secure` | Every cookie | Required for `SameSite=None` and for `__Host-` |
| `SameSite=Lax` | Default for session cookies | Sent on top-level GET navigation |
| `SameSite=Strict` | High-value actions, admin sessions | Breaks inbound links from email |
| `SameSite=None; Secure` | Genuine cross-site embedding only | Reintroduces CSRF exposure; pair with tokens |
| `__Host-` prefix | Session cookies | Forces `Secure`, `Path=/`, and no `Domain`; blocks a subdomain from overwriting it |

```http
Set-Cookie: __Host-sid=<value>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200
```

`SameSite=Lax` reduces CSRF but does not eliminate it: `Lax` still permits top-level
navigations, so a state-changing GET endpoint remains reachable. Keep anti-CSRF tokens
on state-changing routes, and never let a GET mutate state.

### 5. Configure CORS without reflecting arbitrary origins

```ts
const ALLOWED = new Set(["https://app.example.com", "https://admin.example.com"]);

export function cors(req: Request, res: Headers) {
  const origin = req.headers.get("origin");
  if (!origin || !ALLOWED.has(origin)) return;      // omit the header entirely

  res.set("Access-Control-Allow-Origin", origin);   // echo only after allowlist match
  res.set("Vary", "Origin");                        // or a cache serves one tenant's ACAO to another
  res.set("Access-Control-Allow-Credentials", "true");
  res.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE");
  res.set("Access-Control-Allow-Headers", "content-type,authorization");
  res.set("Access-Control-Max-Age", "600");
}
```

Three failure patterns to reject in review: `Allow-Origin: *` together with
`Allow-Credentials: true` (browsers refuse it, and the fix is an allowlist rather than a
workaround); matching with `origin.endsWith("example.com")`, which admits
`https://evil-example.com`; and omitting `Vary: Origin` behind a shared cache, which
serves one requester's allowed origin to everyone.

CORS relaxes the browser's same-origin restriction. It never grants permission — the
server must still authenticate and authorize the request.

### 6. Add isolation headers where the app supports them

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

COOP severs the `window.opener` relationship and is safe for most applications; CORP
limits who may embed your resources. COEP is the disruptive one — it requires every
cross-origin subresource to opt in via CORP or CORS, so stage it behind
`Cross-Origin-Embedder-Policy-Report-Only` and expect to fix third-party assets.

### 7. Verify from outside the application

```bash
curl -sI https://app.example.com | grep -iE \
  'strict-transport|content-security|x-frame|x-content-type|referrer|permissions|cross-origin'

# Confirm the preflight allowlist rejects an unknown origin
curl -si -X OPTIONS https://api.example.com/v1/orders \
  -H 'Origin: https://evil.example' \
  -H 'Access-Control-Request-Method: POST' | head -20
```

Check error responses and static assets too. Frameworks commonly apply middleware to
matched routes only, leaving 404 pages, health checks, and CDN-served files unprotected.

## Checklist

- [ ] HSTS set with a long max-age; `includeSubDomains` only after subdomain TLS audit
- [ ] `preload` withheld until the policy has soaked in production
- [ ] `nosniff`, `Referrer-Policy`, and `Permissions-Policy` present on all responses
- [ ] CSP uses per-response nonces, not `'unsafe-inline'` for real script execution
- [ ] `base-uri`, `object-src`, `frame-ancestors`, and `form-action` all set explicitly
- [ ] CSP shipped report-only first; reports triaged before enforcing
- [ ] Report endpoint is rate-limited, size-capped, and extension noise is filtered
- [ ] Session cookies are `HttpOnly`, `Secure`, `SameSite`, and `__Host-` prefixed
- [ ] CORS allowlist compares full origins; `Vary: Origin` is set
- [ ] No `Allow-Origin: *` on any endpoint that accepts credentials
- [ ] Headers verified on error pages, static assets, and API routes, not just the home page
- [ ] A test asserts the presence of each header so a refactor cannot silently drop them

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| CSP present but XSS still executes | `'unsafe-inline'` in `script-src` with no nonce | Move to nonce plus `'strict-dynamic'` |
| Injected `<base>` redirects all scripts | `base-uri` not set | Add `base-uri 'none'` |
| Site unreachable after an HSTS change | `includeSubDomains` with a subdomain lacking TLS | Fix TLS; the browser will not skip HSTS until max-age lapses |
| Preflight passes for an unknown origin | Substring matching on origin | Exact-match against an allowlist set |
| One tenant sees another's CORS header | Missing `Vary: Origin` behind a cache | Add `Vary: Origin` |
| Cookie missing on cross-site POST | `SameSite=Lax` or `Strict` with genuine cross-site flow | Use `None; Secure` and add CSRF tokens |
| Headers absent on 404 and static files | Middleware scoped to matched routes | Apply at the edge or the reverse proxy |
| Report endpoint floods the log platform | Extension violations unfiltered | Drop extension schemes; sample and rate-limit |
| CSP breaks after a deploy | Nonce cached with the HTML response | Mark HTML `no-store` or move the nonce to a per-request header |

## References

- W3C Content Security Policy Level 3
- RFC 6797 (HSTS), RFC 6454 (Web Origin), RFC 6265bis (cookie prefixes and SameSite)
- Fetch Living Standard, CORS protocol
- OWASP Secure Headers Project; OWASP CSP Cheat Sheet
- [authn-authz-patterns](../authn-authz-patterns/SKILL.md),
  [security-review](../security-review/SKILL.md),
  [api-design](../api-design/SKILL.md)
