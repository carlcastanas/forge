# Security policy

This page states which versions receive security fixes, how to report a vulnerability, what is
in and out of scope, what FORGE does to defend itself, and how an operator should harden a
deployment.

Prerequisites: for the reasoning behind these controls, read
[docs/THREAT-MODEL.md](docs/THREAT-MODEL.md); for the practical defensive workflow, read
[guides/the-security-guide.md](guides/the-security-guide.md).

## Supported versions

| Version | Status |
| --- | --- |
| 1.0.x | Supported |
| Pre-1.0 development builds | Not supported |

Fixes land on the default branch first. There is one supported release line; backports to
anything older are not provided.

## Reporting a vulnerability

> **The contact address below is a placeholder.** `security@example.com` is not a monitored
> mailbox. Whoever deploys or forks this repository must replace it with a real address, or
> with that fork's private vulnerability reporting channel, before publishing. Leaving the
> placeholder in place means reports go nowhere.

Send reports to `security@example.com`.

Do not open a public issue for a security problem. Do not post it in a pull request, a
discussion thread, or any other public surface until a fix or a coordinated disclosure date
exists.

Include, at minimum:

- The affected file, package, version, and commit.
- Reproduction steps starting from a clean checkout.
- The trust boundary that is crossed and the resulting impact.
- Whether exploitation requires local shell access, a malicious repository, a malicious
  package, a remote unauthenticated actor, or privileged credentials.
- Proof-of-concept output with tokens, keys, local paths, and personal data redacted.

Reports without a reproduction are triaged last, because a claim that cannot be reproduced
cannot be fixed or verified.

## Disclosure timeline

| Stage | Target |
| --- | --- |
| Acknowledgment of receipt | 48 hours |
| Initial assessment and severity call | 7 days |
| Fix or documented mitigation for a critical, in-scope report | 14 days |
| Public advisory | After a fix ships, or on an agreed coordinated date |

Requested embargo: hold public disclosure until a fix is released or 90 days have passed,
whichever comes first. If a report is declined, the response will say which of the following
applies — not reproducible, out of scope, already fixed, or requires a stronger attack path
than the report demonstrates.

## Scope

### In scope

- The catalog shipped from this repository: `agents/`, `skills/`, `commands/`, `rules/`,
  `hooks/`, `mcp-configs/`, `manifests/`, `schemas/`, `workflows/`.
- The install, repair, and uninstall paths under `scripts/`.
- Hook entrypoints in `scripts/hooks/` and their registrations in `hooks/`.
- The validators in `scripts/ci/`, where a bypass would let unsafe content into the catalog.
- Harness adapter directories, where an adapter grants capability the canonical catalog does
  not.
- The published `forge-universal` package contents and its `files` allowlist.
- Release automation and CI workflows in `.github/workflows/`.

Prompt-injection findings are in scope when they show a concrete path from untrusted content
to an action the operator did not authorize — a hook bypass, a permission escalation, a secret
in output, a write outside the intended path.

### Out of scope

- Local command execution by a user who already controls the shell, where no higher-privilege
  boundary is crossed.
- The underlying coding agent, model provider, operating system, or terminal emulator. Report
  those to their own maintainers.
- Third-party MCP servers, plugins, or packages not shipped from this repository. Their
  configuration templates here are in scope; their implementations are not.
- Model output quality, hallucination, or refusal behavior absent a security consequence.
- Findings that require the reporter to first modify tracked files in the checkout.
- Missing hardening that is documented as the operator's responsibility below.
- Automated scanner output submitted without a demonstrated attack path.
- Social engineering of contributors.

### Distribution

Verify what you install. This repository publishes the `forge-universal` npm package and the
`forge@forge` plugin slug; the companion security scanner publishes as `forge-shield`. Packages
with similar names are not covered by this policy and should be treated as unverified until
confirmed against the repository's own metadata. The repository host is a deployment detail —
consult the source you cloned from rather than assuming a canonical URL.

## FORGE's own security posture

Four layers. Each is independent; none is sufficient alone.

### Forge Shield

Forge Shield is the deterministic scanner that inspects agent, hook, MCP, permission, and
secret surfaces and reports findings with severities. It ships as the separate `forge-shield`
package and is driven by `/security-scan`.

```bash
npx forge-shield scan --path . --format text
```

Options that matter: `--format json` for CI gating, `--min-severity` to filter noise, and
`--fix` to apply only the fixes the scanner marks as safe and auto-fixable. The scanner is the
source of truth for what it finds; treat anything beyond its output as judgment, and label it
as such.

Run it before publishing a repository, before installing a plugin or agent pack from anywhere,
and in CI on every change to `hooks/`, `mcp-configs/`, or an adapter directory.

### Lifecycle hooks

Hooks are the enforcement layer that runs whether or not the model cooperates. They register in
`hooks/hooks.json` against specific tool matchers and execute Node entrypoints from
`scripts/hooks/`. The security-relevant ones:

| Concern | Mechanism |
| --- | --- |
| Destructive shell commands | Pre-Bash dispatcher with fact-forcing gates before execution |
| Verification bypass | `block-no-verify.js` refuses `--no-verify` on commits |
| Configuration tampering | `config-protection.js` guards protected configuration paths |
| Governance evidence | `governance-capture.js` records secret, policy, and approval events |
| Heredoc smuggling | `gateguard-heredoc.js` inspects heredoc payloads |
| Supply-chain drift | `security:ioc-scan` checks against advisory sources |

A hook that blocks exits `1` and prints why. A hook that warns exits `0`. Hooks run in the
harness process, so a malicious hook is a full compromise — review `hooks/hooks.json` after any
install or update, and treat a hook you did not add as an incident.

### Permission model

FORGE narrows capability at three points:

1. **Agent tool allowlists.** Each of the 68 agents declares an explicit `tools` list.
   Reviewers get read and search tools; only resolvers and generators get `Write` and `Edit`;
   MCP tools are granted individually and never as a whole server. Widening an allowlist is a
   reviewable change on its own.
2. **Command restrictions.** Commands may declare `allowed-tools` and
   `disable-model-invocation` so a shim cannot be triggered by model reasoning alone.
3. **Install profiles.** `manifests/install-profiles.json` controls what is written into a
   target harness. `minimal` and `core` install materially less surface than `full`.

### Repository-level controls

`npm test` refuses content that fails a security check before it can be committed:
`check-unicode-safety.js` rejects homoglyphs and zero-width payloads,
`validate-no-personal-paths.js` rejects absolute home paths, and `validate-hooks.js` rejects
malformed or unregistered hook entrypoints. `.gitleaksignore` scopes secret scanning, and
supply-chain workflows watch advisory sources.

## Hardening guidance for operators

Ordered roughly by return on effort.

**1. Replace the reporting contact.** Before you publish a fork, change
`security@example.com` in this file to a channel someone actually reads.

**2. Install the smallest profile that works.** Start at `core` or `developer`. `full` installs
every module and every rule set, which is both a larger attack surface and a larger context
cost. Add modules when you need them.

**3. Review hooks after every install and update.** Read `hooks/hooks.json` and diff it against
the previous version. Hooks execute; anything that appears there without your knowledge is an
incident, not a surprise.

**4. Audit the agent allowlists you install.** Confirm no agent that should be read-only has
`Write`, `Edit`, or `Bash`. `/security-scan` checks this mechanically.

**5. Pin MCP servers.** Point at pinned versions or vendored copies rather than floating tags,
and grant each server only the tools it needs. See [docs/MCP-GUIDE.md](docs/MCP-GUIDE.md).

**6. Sandbox anything that reads untrusted input.** Run agents that fetch web pages, process
issue bodies, or read third-party repositories in a container or an isolated worktree with no
credentials mounted. Fetched content is data, never instruction.

**7. Keep credentials out of the agent's environment.** Do not export production tokens into a
shell an agent can invoke. Use short-lived, least-privilege credentials scoped to the task.

**8. Gate CI on the scanner.** Run `npx forge-shield scan --format json` and fail the build on
findings at or above your severity floor. Add `npm run security:ioc-scan` to the same job.

**9. Never disable verification to ship.** `--no-verify` exists in Git; it is blocked here for
a reason. A bypassed gate is an unreviewed change.

**10. Log and retain what agents do.** Enable governance capture, keep the tool-use log, and
retain it long enough to investigate. Detection without a record is a guess.

**11. Review generated dependency and configuration changes by hand.** A lockfile edit or an
MCP configuration change proposed by an agent deserves the same scrutiny as one proposed by a
stranger.

## What is deliberately not defended

Stated plainly so nobody assumes otherwise:

- FORGE does not sandbox the coding agent. If the harness can run a command, FORGE's hooks can
  inspect and block specific patterns, but they are not a security boundary against a
  determined local attacker.
- FORGE does not verify model output for correctness. Reviews are advisory; the operator
  decides.
- FORGE does not scan the code of third-party MCP servers or plugins you choose to install.
- FORGE does not protect against a compromised coding agent, model provider, or operating
  system.

Defense in depth belongs at the layer below this one. Read
[docs/THREAT-MODEL.md](docs/THREAT-MODEL.md) for the boundaries this system does and does not
claim.
