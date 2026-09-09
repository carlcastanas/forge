---
name: secrets-management
description: End-to-end handling of credentials — where secrets live, how they reach a running process, how they rotate, how leaks are detected, and what to do in the first hour after one leaks. Use when the user asks about environment variables, a vault, API key rotation, a committed credential, pre-commit secret scanning, or "we leaked a key".
metadata:
  origin: FORGE
---

# Secrets Management

A secret is any value that grants access and cannot be derived: API keys, database
passwords, signing keys, OAuth client secrets, webhook signing tokens, service account
JSON. This skill covers their full lifecycle — issue, store, deliver, rotate, revoke —
and the incident path when one escapes. Done means: no plaintext secret in the
repository or in a build artifact, every secret has a named owner and a rotation
interval, and a leak triggers revocation rather than a discussion.

## When to activate

- Adding a new third-party integration that issues a key
- Setting up environment configuration for a new service or environment
- A credential was committed, pasted into a ticket, or printed in a log
- Rotating keys after an employee departure or a vendor incident
- Wiring CI/CD so builds can reach registries and cloud APIs
- User says "where do I put this API key", "leaked secret", "rotate credentials",
  "gitleaks", "vault", "sealed secrets", ".env in git"

## When NOT to use

- Verifying tokens presented by callers — that is
  [authn-authz-patterns](../authn-authz-patterns/SKILL.md)
- Third-party package trust and install-time risk — that is
  [dependency-supply-chain](../dependency-supply-chain/SKILL.md)
- Evidence collection for an audit — that is
  [soc2-readiness](../soc2-readiness/SKILL.md)
- General code-level vulnerability sweep — that is
  [security-review](../security-review/SKILL.md)

## Prerequisites

- Access to the platform's secret store (cloud secret manager, CI secret settings,
  or a self-hosted vault)
- `git` history access for the repository under review
- A scanner available: `gitleaks`, `trufflehog`, or `detect-secrets`

## Process

### 1. Inventory before you improve anything

You cannot rotate what you cannot list. Build the inventory from three sources.

```bash
# 1. What the code expects at runtime
grep -rEho '(process\.env\.[A-Z0-9_]+|os\.environ\[["'"'"'][A-Z0-9_]+|getenv\("[A-Z0-9_]+)' \
  --include='*.ts' --include='*.js' --include='*.py' --include='*.go' . \
  | grep -oE '[A-Z0-9_]{4,}' | sort -u

# 2. What is already sitting in the working tree
find . -name '.env*' -not -path './node_modules/*' -not -name '.env.example'

# 3. What history contains
gitleaks detect --source . --redact --report-format sarif --report-path gitleaks.sarif
```

Record for each secret: name, what it unlocks, blast radius if disclosed, owner,
where it is stored, and rotation interval. A spreadsheet is acceptable; no inventory
is not.

### 2. Choose a storage backend by blast radius

| Backend | Fits | Limits |
| --- | --- | --- |
| Cloud secret manager (AWS Secrets Manager, GCP Secret Manager, Azure Key Vault) | Anything running in that cloud | Per-secret cost; needs IAM design |
| HashiCorp Vault | Multi-cloud, dynamic short-lived database credentials, PKI | Operational weight; seal/unseal procedure |
| Platform-native (GitHub Actions secrets, Vercel/Fly/Render env) | CI and small app deployments | Weak audit trail, no versioning, easy to over-share |
| SOPS + age, committed encrypted | GitOps repos, small teams, no vault available | Key distribution is manual; rotation touches every file |
| Kubernetes `Secret` alone | Nothing on its own | Base64 is encoding, not encryption; enable envelope encryption at rest and use External Secrets or Sealed Secrets |

Two rules regardless of backend: secrets are scoped per environment (a staging key
must not open production), and every read is attributable to a principal.

### 3. Deliver at runtime, never at build time

Build-time injection bakes the value into a layer, an artifact, or a client bundle.

```dockerfile
# Wrong: the value is recoverable from image history forever.
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}

# Right: mounted only for the duration of one build step, never persisted.
RUN --mount=type=secret,id=npm_token \
    NPM_TOKEN="$(cat /run/secrets/npm_token)" npm ci
```

Any variable a bundler inlines is public. `NEXT_PUBLIC_*`, `VITE_*`, `REACT_APP_*`
and `EXPO_PUBLIC_*` values ship to the browser or the app binary. Never put a
server-side key behind those prefixes.

For Kubernetes, pull from the real store rather than committing a manifest:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: api-credentials
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: cluster-secret-store
    kind: ClusterSecretStore
  target:
    name: api-credentials
  data:
    - secretKey: DATABASE_URL
      remoteRef:
        key: prod/api/database-url
```

Prefer short-lived, federated credentials over stored ones wherever the platform
supports it: OIDC from CI to cloud (no long-lived cloud keys in the CI settings),
IAM roles for workloads, Vault dynamic database credentials with a TTL.

### 4. Rotate on a schedule, not on an incident

Rotation is only routine if the application tolerates two valid credentials at once.
Design for overlap:

1. Issue credential B while A remains valid.
2. Push B to the store; workloads pick it up on next refresh or restart.
3. Watch the provider's last-used metric for A until it goes quiet.
4. Revoke A. Record the date.

Rotation intervals worth defending: 90 days for third-party API keys, 30 days or
dynamic for database credentials, immediately on departure of anyone who held the
value, immediately on any suspected disclosure.

If a credential cannot be rotated without downtime, that is a design defect. Log it
and fix the overlap support before the next cycle.

### 5. Block commits and scan history

Pre-commit is the cheap gate:

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.4
    hooks:
      - id: gitleaks
```

CI is the gate that cannot be skipped with `--no-verify`:

```yaml
# .github/workflows/secret-scan.yml
name: secret-scan
on: [pull_request]
jobs:
  gitleaks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - run: |
          curl -sSL -o gitleaks.tar.gz \
            "$GITLEAKS_RELEASE_URL"
          tar -xzf gitleaks.tar.gz gitleaks
          ./gitleaks detect --source . --redact --exit-code 1
```

Enable the hosting provider's own push protection where available. Tune the ruleset
until the false-positive rate is low enough that engineers stop bypassing it — a
scanner everyone skips is worse than none, because it produces false confidence.

Keep `.env.example` with keys and empty values committed, and every real `.env*`
file in `.gitignore`.

### 6. Respond to a leak in a fixed order

The first action is always revocation. Rewriting history is not a remediation — the
value was already fetched by every clone, fork, CI cache, and mirror.

1. Revoke or rotate the credential at the provider. Now.
2. Determine exposure window: first commit or log timestamp to revocation time.
3. Pull provider access logs for that window. Look for calls from unfamiliar
   addresses, regions, or user agents.
4. Assess reach: what data or spend could that credential touch.
5. Record the incident with timeline, scope, and remediation.
6. Only then clean the artifact, so the value stops being trivially discoverable:

```bash
git filter-repo --replace-text <(echo 'AKIAEXAMPLEKEYVALUE==>REDACTED')
# Coordinate: every collaborator must re-clone. Force-push rewrites shared history.
```

7. Add a scanner rule that would have caught this exact shape.
8. Ask why the pipeline let it through, and fix that instead of the person.

### 7. Keep secrets out of the places nobody scans

- Logs: redact before serializing. Filter by key name and by value shape.
- Error trackers and APM: configure the SDK's deny list for headers, cookies, and
  request bodies.
- CI job output: mask registered secrets, and never `echo` a variable to debug it.
- Shell history: prefer a file or stdin over an inline flag; `export HISTCONTROL=ignorespace`.
- LLM prompts and agent transcripts: a key pasted into a prompt has left your boundary.
- Screenshots and support tickets: crop and redact before attaching.

```ts
const DENY = /^(authorization|cookie|set-cookie|x-api-key|.*token.*|.*secret.*|.*password.*)$/i;
export const redact = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, DENY.test(k) ? "[REDACTED]" : v]));
```

## Checklist

- [ ] Secret inventory exists with owner, blast radius, and rotation interval per entry
- [ ] No plaintext secret in the repository, in history, or in an image layer
- [ ] `.gitignore` covers every `.env*` variant; `.env.example` holds keys only
- [ ] Staging and production credentials are distinct and separately scoped
- [ ] No server-side secret sits behind a client-exposed prefix
- [ ] CI authenticates to cloud providers by OIDC where supported
- [ ] Secret scanning runs in CI and blocks the merge, not only on pre-commit
- [ ] Every secret can be rotated with two valid values in flight
- [ ] Log, APM, and error-tracker redaction is configured and verified with a test
- [ ] A written leak-response runbook names who revokes and where access logs live

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Key still works after history rewrite | Rewriting is not revocation | Revoke at the provider first, always |
| Secret found in a container image | Passed as `ARG`/`ENV` at build | Use `RUN --mount=type=secret` or inject at runtime |
| API key visible in browser devtools | Client-exposed env prefix | Move the call server-side; revoke the exposed key |
| Rotation causes an outage | No overlap window supported | Add dual-credential acceptance before rotating |
| Scanner alerts ignored by the team | High false-positive rate | Tune rules, add an allowlist with expiry, keep the CI gate |
| Nobody knows who owns a credential | No inventory | Build the inventory before the next rotation cycle |
| Secret appears in Sentry payloads | Default SDK scrubbing left unconfigured | Add a deny list for headers and body fields |
| CI holds long-lived cloud access keys | OIDC federation not configured | Switch to a workload identity trust policy and delete the keys |

## References

- OWASP Secrets Management Cheat Sheet
- NIST SP 800-57 Part 1, key management lifecycle
- CIS Benchmarks, secrets and credential-management sections
- Tooling: `gitleaks`, `trufflehog`, `detect-secrets`, SOPS, External Secrets Operator
- [authn-authz-patterns](../authn-authz-patterns/SKILL.md),
  [dependency-supply-chain](../dependency-supply-chain/SKILL.md),
  [soc2-readiness](../soc2-readiness/SKILL.md)
