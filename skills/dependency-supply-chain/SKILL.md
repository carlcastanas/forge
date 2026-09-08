---
name: dependency-supply-chain
description: Defend the software supply chain — lockfile discipline, SBOM generation, build provenance and artifact signing, upgrade cadence, triaging CVEs by reachability rather than count, and the install-script and typosquat risks that bypass scanners. Use when the user asks about npm audit noise, a dependency CVE, SBOM, sigstore/provenance, Dependabot/Renovate policy, or whether a package is safe to add.
metadata:
  origin: FORGE
---

# Dependency and Supply-Chain Security

Most code shipped to production was written by strangers. The exposure is not only
known vulnerabilities in libraries; it is the install step that runs arbitrary code on
a developer laptop, the maintainer account that gets phished, and the build machine
that can rewrite an artifact after tests pass. This skill sets the controls that keep
dependency intake deliberate and builds reproducible. Done means: every build resolves
from a committed lockfile, produces an SBOM and provenance, and every advisory is
triaged by whether the vulnerable code path is reachable.

## When to activate

- Adding a dependency, especially one with few maintainers or recent first publish
- `npm audit` / `pip-audit` / `govulncheck` output needs triage or is being ignored
- Setting up or tuning Dependabot, Renovate, or an equivalent update bot
- A customer or auditor asks for an SBOM or artifact provenance
- A package on which the project depends was reported compromised
- Configuring CI so a build cannot be tampered with between test and publish
- User says "supply chain", "SBOM", "CVE in a dependency", "typosquat",
  "postinstall script", "sigstore", "pin dependencies"

## When NOT to use

- Credentials used to authenticate to registries — use
  [secrets-management](../secrets-management/SKILL.md)
- Vulnerabilities in first-party code — use
  [security-review](../security-review/SKILL.md)
- Container base-image and runtime hardening — use
  [docker-patterns](../docker-patterns/SKILL.md)
- Producing evidence artifacts for an audit — use
  [soc2-readiness](../soc2-readiness/SKILL.md)

## Prerequisites

- The project's package manager and its lockfile format
- CI with the ability to fail a build and to publish attestations
- An advisory source: the ecosystem's own database, OSV, or a commercial feed
- Awareness of which ecosystems execute code at install time (npm, PyPI with sdists,
  RubyGems) and which do not by default (Go modules, Rust crates)

## Process

### 1. Make resolution deterministic

A lockfile that CI ignores is decoration.

```bash
npm ci                          # fails if package.json and the lockfile disagree
pnpm install --frozen-lockfile
yarn install --immutable
pip install --require-hashes -r requirements.txt
go mod verify
cargo build --locked
```

Commit lockfiles for applications. Enable integrity hashes — `--require-hashes` in pip
and `integrity` fields in npm lockfiles turn a registry substitution into a build
failure — and keep `go.sum` checksum-database verification on. One lockfile per
repository: two package managers means two resolution graphs, and one of them is
unscanned.

### 2. Gate what gets installed, not only what gets flagged

Install-time code execution is the shortest path from a malicious publish to a
developer's SSH keys.

```bash
# npm: refuse lifecycle scripts by default; commit this to the repo's .npmrc
echo "ignore-scripts=true" >> .npmrc
```

```json
// package.json — pnpm: explicit allowlist, everything else is skipped
{ "pnpm": { "onlyBuiltDependencies": ["esbuild", "sharp"] } }
```

Additional intake gates worth enforcing:

- Minimum release age (Renovate `minimumReleaseAge`, or a registry proxy quarantine).
  Most malicious publishes are pulled within hours to days; a delay absorbs them.
- A private registry proxy (Artifactory, Verdaccio, Nexus) so the build does not depend
  on the public registry being intact at build time.
- Review of new packages: publish age, maintainer count, download history, whether the
  repository link resolves to real source, and whether the name is one edit away from a
  popular package.

Name patterns to check before adding: single-character transposition, hyphen versus dot,
an unscoped copy of a scoped package, and an internal name that also exists publicly.
Dependency confusion is defeated by scoping internal packages and configuring the
registry so a private scope never falls back to the public index.

### 3. Generate an SBOM as build output

```bash
# CycloneDX from the resolved tree, not from the manifest
npx @cyclonedx/cyclonedx-npm --output-format json --output-file sbom.cdx.json

# Language-agnostic, works on a built container image
syft packages ghcr.io/example/api:1.4.2 -o cyclonedx-json=sbom.cdx.json

# Scan the SBOM rather than re-resolving
grype sbom:sbom.cdx.json --fail-on high
```

Generate it from the artifact that ships. An SBOM produced from a manifest omits
transitive resolution and platform-specific packages, which is where the findings live.
Store each SBOM with the release so an advisory published next year can be checked
against what actually shipped.

### 4. Sign artifacts and attach provenance

Provenance answers: which source commit, which builder, which parameters produced this
artifact.

```yaml
# .github/workflows/release.yml
permissions:
  id-token: write        # keyless signing identity
  contents: read
  attestations: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11  # pin by SHA
      - run: npm ci && npm run build
      - uses: actions/attest-build-provenance@v1
        with: { subject-path: "dist/*.tgz" }
      - run: npm publish --provenance --access public
```

Pin third-party actions and container base images by digest, not by tag. A mutable tag
means build inputs can change without any commit in your repository. Verify on the
consuming side, or signing was ceremony:

```bash
cosign verify-attestation \
  --type slsaprovenance \
  --certificate-identity-regexp '^https://github\.com/example/api/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  ghcr.io/example/api@sha256:<digest>
```

### 5. Triage advisories by reachability, not by count

An audit report with 140 findings gets ignored. Reduce it to the ones that matter with
three filters, in order.

1. **Is it in the production dependency graph?** Build tooling and test fixtures are a
   different risk class than code that serves requests.
2. **Is the vulnerable symbol reachable from your code?** This filter removes most of
   the noise. Use a tool that does call-graph analysis where one exists.

```bash
npm audit --omit=dev --audit-level=high
npm ls semver                  # show the path that pulls the vulnerable version in
govulncheck ./...              # Go: reports only reachable vulnerable functions
osv-scanner --call-analysis --recursive .
```

3. **Does the exploit precondition hold in your deployment?** A parser denial-of-service
   reachable only from internally generated input is a different priority than the same
   bug on an unauthenticated endpoint.

Record the outcome so the same finding is not re-triaged next week:

```yaml
# .osv-scanner.toml
[[IgnoredVulns]]
id = "GHSA-xxxx-xxxx-xxxx"
ignoreUntil = 2026-12-01
reason = "Vulnerable path is the CLI arg parser; the service never invokes it. Re-check at upgrade."
```

Every suppression carries a reason and an expiry. A permanent ignore is an accepted
risk that nobody re-reads.

### 6. Set an upgrade cadence that keeps the delta small

Large infrequent upgrades are riskier than small frequent ones, because the diff cannot
be reviewed.

```json
{
  "extends": ["config:recommended"],
  "minimumReleaseAge": "3 days",
  "packageRules": [
    { "matchUpdateTypes": ["patch", "pin", "digest"], "automerge": true },
    { "matchDepTypes": ["devDependencies"], "matchUpdateTypes": ["minor"], "automerge": true },
    { "matchUpdateTypes": ["major"], "dependencyDashboardApproval": true }
  ],
  "vulnerabilityAlerts": { "minimumReleaseAge": null, "labels": ["security"] }
}
```

Automerge is only safe behind a test suite you trust. If the suite is weak, the bot is
an unreviewed write path into production; fix the suite first.

### 7. Have a response path for a compromised package

When a package you depend on is reported malicious:

1. Pin to the last known-good version across every lockfile and rebuild.
2. Determine whether the malicious version was ever installed: check CI logs, lockfile
   history, and developer machines.
3. Treat every credential reachable from an affected environment as disclosed. Rotate
   registry tokens, cloud keys, SSH keys, and CI secrets.
4. Inspect for persistence: modified shell profiles, added SSH authorized keys, new
   scheduled tasks, unexpected outbound connections in the build window.
5. Add the malicious version to a registry deny policy so it cannot be reinstalled.
6. Record the timeline. See [secrets-management](../secrets-management/SKILL.md) for
   the credential side.

## Checklist

- [ ] Lockfile committed; CI installs with a frozen/immutable flag
- [ ] Integrity hashes enabled for the ecosystem in use
- [ ] Install lifecycle scripts disabled by default with a reviewed allowlist
- [ ] Internal packages scoped; registry configured against public fallback
- [ ] Minimum release age or a quarantining proxy in front of the public registry
- [ ] SBOM generated from the built artifact and stored with the release
- [ ] Build provenance attested; artifacts signed; verification runs at deploy
- [ ] CI actions and base images pinned by digest
- [ ] Advisory triage filters by production scope, then reachability, then precondition
- [ ] Every suppression carries a reason and an expiry date
- [ ] Update bot configured with automerge limited to what the test suite covers
- [ ] A written response path exists for a compromised upstream package

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Audit output ignored by the team | Findings unranked, dev-only noise included | Filter by production scope and reachability before reporting |
| CI installs a version not in the lockfile | `npm install` used instead of `npm ci` | Switch to the frozen-install command and fail on drift |
| Build breaks when a registry is unavailable | Direct dependency on the public index | Put a caching proxy in front, with retention |
| Malicious postinstall ran on a laptop | Lifecycle scripts enabled by default | Set `ignore-scripts`, allowlist the few that need it |
| SBOM omits real transitive packages | Generated from the manifest | Generate from the resolved tree or the built image |
| Signature verification never fails | Verification not wired into deploy | Enforce `cosign verify` as a deploy gate |
| Bot opens 40 PRs a week, none merged | No automerge policy, no grouping | Automerge patches, group by ecosystem, gate majors |
| Same CVE re-triaged repeatedly | Decision not recorded | Record suppressions with reason and expiry in the repo |

## References

- SLSA framework, build provenance levels
- CycloneDX and SPDX SBOM specifications
- OSV schema and the OpenSSF Scorecard checks
- Sigstore (`cosign`) keyless signing and attestation verification
- OWASP Top 10, A06 Vulnerable and Outdated Components
- [secrets-management](../secrets-management/SKILL.md),
  [soc2-readiness](../soc2-readiness/SKILL.md),
  [docker-patterns](../docker-patterns/SKILL.md)
