---
name: env-config-management
description: Twelve-factor configuration practice — what belongs in config versus code versus a secret store, precedence layering, typed validation at boot, secret references, drift detection, and testing. Use when adding an environment variable, debugging a works-locally-fails-in-prod config problem, or designing configuration for a new service.
metadata:
  origin: FORGE
---

# Environment and Configuration Management

Configuration is the set of values that differ between deploys of the same build artifact. Getting it wrong produces a class of outage that is hard to debug because the code is identical everywhere. Done means: one typed schema that every environment satisfies, a process that refuses to start rather than run half-configured, secrets present as references instead of values, and a way to see exactly how staging and production differ.

## When to activate

- Adding, renaming, or removing an environment variable
- A service behaves differently across environments with the same image
- `.env` files have drifted and nobody knows which keys are required
- Onboarding fails because required variables are undocumented
- Moving secrets out of the repository or out of plain environment variables
- Designing config for a new service, container image, or Kubernetes workload
- User says "env var", "config schema", "it works locally", "missing environment variable"

## When NOT to use

- Runtime behaviour toggles evaluated per request or per user — that is feature flagging, covered below only at the boundary; see [frontend-patterns](../frontend-patterns/SKILL.md) for client-side gating
- Container and image build concerns — [docker-patterns](../docker-patterns/SKILL.md)
- ConfigMap and Secret object mechanics, projected volumes, reloader patterns — [kubernetes-patterns](../kubernetes-patterns/SKILL.md)
- Release orchestration and rollback — [deployment-patterns](../deployment-patterns/SKILL.md)
- Auditing a specific secret leak or credential exposure — [security-review](../security-review/SKILL.md)

## Prerequisites

- A single build artifact promoted across environments, not rebuilt per environment
- A schema validation library in the target language (Zod, Pydantic, `envconfig`, `viper`)
- A secret store: cloud secret manager, Vault, or the platform's sealed-secret mechanism
- Write access to CI so validation runs before deploy

## Process

### 1. Classify every value

Three destinations, decided by two questions: does it vary between deploys, and does exposure cause harm.

| Value | Varies by deploy | Harmful if exposed | Destination |
| --- | --- | --- | --- |
| Retry ceiling, page size cap, sort order | No | No | Code constant |
| Database host, log level, worker concurrency | Yes | No | Config (env or config file) |
| Database password, signing key, third-party token | Yes | Yes | Secret store, injected as a reference |
| Feature rollout percentage, kill switch | Yes, and mid-deploy | No | Feature flag service |
| Copy strings, locale bundles | No | No | Code or catalog, not config |

The twelve-factor test: could the repository go public tomorrow with no credential change. If not, something in config is actually a secret.

Values that never vary do not belong in config. Every variable that exists must be set somewhere, documented, and maintained. An unused variable is a liability — it will eventually be set to something and read by nobody, or read by something and set by nobody.

### 2. Define precedence and never deviate from it

Later layers override earlier ones, and the order is fixed: built-in defaults, then the per-environment config file, then environment variables, then command-line flags.

Defaults cover local development and safe production behaviour. Config files hold non-secret, environment-shaped structure that is awkward as flat strings. Environment variables carry per-deploy values and secret references. Flags exist for operator overrides and one-off runs.

Two hard rules. Precedence resolves once, at boot, into a single immutable object; nothing reads `process.env` or `os.environ` after that. And no layer partially merges a value: if `DATABASE_URL` is set in the environment, it wins entirely, rather than having its host taken from the file and its port from the environment.

### 3. Parse and validate at boot, then fail fast

An unset variable must crash the process at startup, not produce `undefined` in a request handler at 03:00. Validate everything in one place, report every problem at once, and exit non-zero.

```typescript
import { z } from "zod";

const Schema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  DATABASE_URL: z.string().url().startsWith("postgres://"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  REDIS_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  SESSION_TTL: z.coerce.number().int().positive().default(3600), // seconds
  ALLOWED_ORIGINS: z.string().transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean)),
  FEATURE_NEW_CHECKOUT: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
}).superRefine((cfg, ctx) => {
  // Cross-field invariants belong here, not scattered through the app.
  if (cfg.NODE_ENV === "production" && cfg.LOG_LEVEL === "debug") {
    ctx.addIssue({ code: "custom", message: "LOG_LEVEL=debug is not permitted in production" });
  }
  if (cfg.NODE_ENV === "production" && !cfg.REDIS_URL) {
    ctx.addIssue({ code: "custom", message: "REDIS_URL is required in production" });
  }
});

const parsed = Schema.safeParse(process.env);
if (!parsed.success) {
  // Print every failure, not the first. Never print values — only keys and reasons.
  for (const issue of parsed.error.issues) {
    console.error(`config: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  process.exit(78); // EX_CONFIG
}

export const config = Object.freeze(parsed.data);
export type Config = typeof config;
```

Coerce to real types at the boundary. `PORT` is a number, `SESSION_TTL` is a duration, `ALLOWED_ORIGINS` is a list. Strings leaking past the boundary produce `"false"` being truthy and `"8080" + 1` producing `"80801"`.

Never log the parsed config object. Log the key names and their source layer, and redact anything whose key matches a secret pattern.

### 4. Layer environments without duplicating everything

The common failure is four near-identical `.env` files that diverge one key at a time. Keep a base layer and per-environment deltas that contain only what actually differs.

```yaml
# config/base.yaml — committed, no secrets
server:
  port: 8080
  request_timeout: 30s
database:
  pool_max: 10
  statement_timeout: 15s
log:
  level: info
  format: json

# config/production.yaml — committed, overrides only
database:
  pool_max: 50
log:
  sample_rate: 0.1
```

Secrets never appear in either file. They arrive as environment variables holding references, resolved at boot by the secret client. Everything else stays visible in version control, so a diff between environments is a diff between two small files.

Local development gets a committed `.env.example` listing every key with a safe placeholder, and an uncommitted `.env` for real values. `.env` is in `.gitignore`; `.env.example` is the source of truth for the key list and is validated against the schema in CI.

### 5. Handle secrets as references, not values

The environment variable holds a pointer. The process resolves it at boot over an authenticated channel and keeps the plaintext in memory only.

```bash
# What the deploy sets — safe to appear in a manifest, a log, or a ticket.
DATABASE_PASSWORD_REF=secret://prod/postgres/app#password
STRIPE_SECRET_KEY_REF=secret://prod/stripe/live#api_key
```

Rules that hold regardless of the store:

- No secret in the repository, in a Dockerfile `ENV`, in an image layer, in a CI log, or in a crash report. Enforce with a pre-commit secret scanner and a CI scan of the full history.
- No secret in a URL that gets logged. Compose the DSN after resolution; log the redacted form.
- Grant read on a per-secret, per-workload basis. A worker that never charges a card does not get the payment key.
- Rotation is a two-key window, not a cutover: publish the new version, make the application accept both old and new (verify against a key set, not a single key), roll the deploy, revoke the old version, then confirm no principal is still reading it. Signing keys need a `kid` so both are distinguishable.
- Support in-place refresh where the platform re-projects a secret: watch the mount or subscribe to the rotation event and swap the credential in the client pool, rather than requiring a restart.
- Record last-rotated timestamps and alert on age. A secret nobody has rotated in two years is a secret nobody can rotate safely.

### 6. Detect drift between environments

Drift is a key set present in one environment and absent in another, or a value type that diverged. Detect it mechanically rather than during an incident.

```bash
#!/usr/bin/env bash
# Compare key sets across environments. Values are never printed or compared.
set -euo pipefail

keys() { ./bin/config dump-keys --env "$1" | sort -u; }

diff <(keys staging) <(keys production) > /tmp/config-drift.txt || true

if [[ -s /tmp/config-drift.txt ]]; then
  echo "config drift between staging and production:"
  sed 's/^</  staging only: /; s/^>/  production only: /' /tmp/config-drift.txt
  exit 1
fi
```

Run this in CI on every change to the schema, and on a schedule against live environments. Pair it with a boot-time report: each service logs its config key names and the layer each value came from, so a drift finding can be traced to a layer rather than guessed at.

Also detect the reverse direction: keys defined in the schema that no environment sets, and keys set in an environment that the schema does not define. The second is usually a leftover from a removed feature and should be deleted, not tolerated.

### 7. Choose safe defaults, and keep flags out of config

A default is used when nobody thought about the value. Make the unconsidered case the safe one: authentication on, TLS verification on, debug endpoints off, destructive operations disabled, rate limits present, timeouts finite. Never default a production-relevant credential to a development value — an empty required secret must fail validation, not fall back to `changeme`.

Configuration and feature flags solve different problems and should not be conflated:

| Dimension | Configuration | Feature flag |
| --- | --- | --- |
| Change cadence | At deploy | At runtime, seconds |
| Scope | Whole process | Per user, tenant, percentage |
| Store | Env, file, secret manager | Flag service with an audit trail |
| Failure mode | Process refuses to start | Evaluates to a documented default |
| Lifetime | Permanent | Temporary; deleted after rollout |

A boolean env var is acceptable as a kill switch that requires a restart. Anything needing gradual rollout, targeting, or a fast revert without a deploy belongs in a flag service. Every flag gets an owner and a removal date; a flag older than its rollout is dead code with a runtime cost.

### 8. Test configuration

- **Schema unit tests**: valid input parses to the expected typed shape; each invalid input produces a specific error. Cover coercion edge cases — `"0"`, `""`, `"false"`, whitespace, a list with a trailing comma.
- **Example-file test**: `.env.example` parses cleanly against the schema. This is what stops the example from rotting.
- **Cross-field tests**: assert the production invariants (debug logging rejected, required-in-production keys enforced) with `NODE_ENV=production` fixtures.
- **Integration smoke**: the container starts with only the documented required keys set, and exits non-zero with a readable message when one is removed.
- **No global mutation in tests**: build config from an explicit input object rather than mutating `process.env`, so tests stay parallel-safe.

```bash
# Startup contract: removing a required key must fail loudly and quickly.
docker run --rm -e NODE_ENV=production -e PORT=8080 app:ci; test $? -eq 78
```

### 9. Document the schema where it is enforced

The schema file is the documentation. Attach a description, an example, and an owner to each key rather than maintaining a separate table that drifts. Generate the reference from the schema in CI.

Every key needs: name, type, required or default, which environments set it, what it affects, whether it is a secret, and the blast radius of a wrong value. Record a change to the config contract — a renamed key, a changed default, a newly required variable — as a migration note in the release, because a rename is a breaking change for every deploy target. Ship rename support as an overlap window: accept both names, warn on the old one, remove it a release later.

## Checklist

- [ ] One build artifact promoted across environments; nothing rebuilt per environment
- [ ] Every value classified as code constant, config, secret, or feature flag
- [ ] Precedence fixed at defaults < file < env < flags, resolved once at boot into a frozen object
- [ ] No read of `process.env` or equivalent outside the config module; enforced by lint
- [ ] Schema validates and type-coerces every key, reporting all failures at once and exiting non-zero
- [ ] Cross-field invariants asserted in the schema, not scattered across the codebase
- [ ] Base plus per-environment delta files; no near-duplicate full copies
- [ ] `.env` ignored, `.env.example` committed and validated against the schema in CI
- [ ] Secrets held as references, resolved at boot, never in the repo, image, or logs
- [ ] Rotation supports a two-key overlap window; secret age monitored
- [ ] Drift check compares key sets across environments and fails CI on divergence
- [ ] Defaults are the safe choice in every case; no credential defaults to a placeholder
- [ ] Feature flags live in a flag service with owners and removal dates, not in env vars
- [ ] Startup contract tested: missing required key exits non-zero with a readable message
- [ ] Config reference generated from the schema; renames shipped with an overlap window

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Works locally, fails in production | Variable set only in the developer's `.env`, absent from the deploy | Add to schema as required; drift check catches the gap before deploy |
| Boolean flag always on | String `"false"` is truthy | Coerce to boolean in the schema; forbid raw env reads |
| Timeout ignored | Value read as a string and used in arithmetic | Coerce to number with an explicit unit in the key name |
| Process starts, first request 500s | Lazy config read inside a handler | Validate everything at boot; fail fast with exit 78 |
| Only the first config error is shown | Validator throws on first failure | Collect and print all issues before exiting |
| Secret found in a build log | Secret passed as a build argument or printed on startup | Move to runtime reference; redact by key pattern; scan history and rotate |
| Rotation broke authentication | Single-key cutover with no overlap | Accept a key set with `kid`; roll deploy, then revoke the old version |
| Staging and production diverge silently | No drift detection | Scheduled key-set comparison in CI, failing on divergence |
| A key nobody sets is required | Schema not reconciled after a feature was removed | Reverse drift check for unset schema keys and unschema'd set keys |
| Flag left on for a year | Rollout toggle stored as an env var with no owner | Move to the flag service; assign owner and removal date |
| Config change needs a rebuild | Values baked into the image at build time | Read at runtime; the image must be environment-agnostic |
| Tests pass alone, fail in parallel | Tests mutating global environment state | Construct config from an explicit input object per test |

## References

- The Twelve-Factor App: Config, Build/Release/Run, Dev/Prod Parity
- POSIX `sysexits.h`: `EX_CONFIG` (78)
- OWASP Application Security Verification Standard: configuration and secret management requirements
- [../docker-patterns/SKILL.md](../docker-patterns/SKILL.md), [../kubernetes-patterns/SKILL.md](../kubernetes-patterns/SKILL.md), [../deployment-patterns/SKILL.md](../deployment-patterns/SKILL.md)
- [../security-review/SKILL.md](../security-review/SKILL.md), [../error-handling/SKILL.md](../error-handling/SKILL.md), [../backend-patterns/SKILL.md](../backend-patterns/SKILL.md)
- [../architecture-decision-records/SKILL.md](../architecture-decision-records/SKILL.md)
