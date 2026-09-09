# Threat model

This page states what FORGE defends against, what it does not, and where the line falls. It
enumerates the assets an agent session puts at risk, the trust boundaries around them, a
STRIDE-style pass over each surface the system adds, the attacker classes those surfaces are
exposed to, and for every threat: the control FORGE provides, the risk that remains after that
control, and the part the operator has to do themselves.

It is strictly defensive. Nothing here is an exploitation recipe, and every control described
is one that reduces damage rather than one that demonstrates it.

The practical workflow — how to sandbox a session, how to write a deny hook, what to do in the
first ten minutes of an incident — is in
[`../guides/the-security-guide.md`](../guides/the-security-guide.md). Reporting a vulnerability,
supported versions, and the operator hardening checklist are in [`../SECURITY.md`](../SECURITY.md).

Prerequisites: [CONCEPTS.md](CONCEPTS.md) for what each primitive is, and
[HOOKS-GUIDE.md](HOOKS-GUIDE.md) for why a hook is an enforcement mechanism and a rule is not.

## The shape of the problem

A coding agent is a process that reads attacker-influenceable text and holds the ability to
execute commands, read the filesystem, and reach the network. Classical application security
assumes a boundary between code and data. A coding agent has none: text arriving as a file
comment, a tool result, an issue body, a fetched page, or a dependency's README enters the same
context window as the operator's instructions and is weighed by the same mechanism.

So the question is never "can the model be tricked". Assume it can. The question is what
happens next, and that is determined entirely by what the process is permitted to do.

An injection becomes a breach only when three conditions share a runtime:

1. Access to something valuable — source, credentials, customer data, production.
2. Exposure to untrusted content — anything the operator did not author and review.
3. A path out — network egress, a push, an outbound call, or a written file something else reads.

Any two of the three are survivable. The design consequence is to remove one of them per
workflow, and the cheapest one to remove is almost always the third.

## Assets

| Asset | Exposed by default | Bounding control |
| --- | --- | --- |
| Source code in the workspace | Read | Workspace scoping |
| Credentials on disk (`~/.ssh`, `~/.aws`, `.env`, cloud config) | Readable unless denied | Deny rules, separate identity |
| Shell execution | Available | Permission model, sandbox |
| Network egress | Available | Egress allowlist, offline container |
| Version-control remote | Push capability | Scoped token, protected branches |
| Cloud and production systems | Whatever local credentials reach | Do not load those credentials |
| Persistent memory and instincts | Written automatically, reloaded automatically | Scope separation, confidence gates, pruning |
| Configuration, hooks, and MCP entries | Repository-controlled | Trust boundary, config protection, review |
| Session transcripts and metrics logs | Written to disk | Treat as sensitive; retain where the agent cannot write |
| The catalog itself (agents, skills, rules) | Installed from a package | Validators, scanner, pinning |

The right-hand column is the actual security architecture. The left-hand column is what an
adversary receives when that column is empty.

## Trust boundaries

```text
   UNTRUSTED                        SEMI-TRUSTED              TRUSTED
   ─────────                        ────────────              ───────
   fetched pages                    team repository           operator prompts
   third-party repositories         internal docs             reviewed code
   pull requests from outside       first-party deps          reviewed config
   package metadata                 committed config ─┐
   MCP tool output                                    │
   documents and attachments                          │
   another agent's handoff                            │
   recalled memory                                    │
        │                                             │
        └────────────► ┌──────────────────────────────┴──┐
                       │   the context window            │
                       │   (no code/data separation)     │
                       └───────────────┬─────────────────┘
                                       │
                       ┌───────────────┴─────────────────┐
                       │   the permission layer          │  ◄── the real boundary
                       └───────────────┬─────────────────┘
                                       │
                       ┌───────────────┴─────────────────┐
                       │   tools: shell, filesystem,     │
                       │   network, version control      │
                       └─────────────────────────────────┘
```

Three properties of that diagram are load-bearing.

**Committed configuration crosses from semi-trusted into trusted by accident.** Settings files,
hook registrations, MCP entries, and environment declarations travel through source control and
influence what executes locally. Cloning a repository and opening an agent in it is an action
with consequences.

**A handoff from another agent is untrusted input.** It was written by a process that may have
read a poisoned file or a hostile page. The multi-agent form of this is covered in
[ORCHESTRATION-PATTERNS.md](ORCHESTRATION-PATTERNS.md).

**Recalled memory is untrusted input.** It was written by an agent, it loads automatically at
session start, and it is rarely re-read by a human. See
[MEMORY-GUIDE.md](MEMORY-GUIDE.md).

## STRIDE over the agent surface

STRIDE categories are used as a checklist, not as a taxonomy to defend: spoofing, tampering,
repudiation, information disclosure, denial of service, elevation of privilege. Each surface
below lists the threats that actually apply to it, the control this repository provides, what
remains after that control, and the operator's part.

### Prompt files (`CLAUDE.md`, rules, contexts)

| Threat | Control in FORGE | Residual risk | Operator must |
| --- | --- | --- | --- |
| Tampering: a committed instruction file redirects behavior in an unfamiliar repository | Every agent definition carries a prompt-defense baseline; `rules/` are reviewable, versioned files | The baseline is text in a context window and can lose an argument under pressure | Read `.claude/`, rule files, and committed environment files with `cat` before opening an unfamiliar repository in an agent |
| Tampering: homoglyph or zero-width payloads hidden in a prompt file | `check-unicode-safety.js` runs in `npm test` and rejects homoglyphs and zero-width payloads in tracked content | Only covers content committed to this repository, not content in yours | Run the same class of scan over anything you install |
| Elevation: a file instructs the agent to widen its own permissions | `config-protection.js` blocks edits to protected configuration paths on `PreToolUse` | Covers the configured path set, not every possible settings location | Add deny rules on writes to settings, hook, and credential paths |
| Information disclosure: absolute home paths or secrets committed into prompt text | `validate-no-personal-paths.js` fails the build on absolute home paths | Detects paths, not every secret shape | Keep secret scanning in pre-commit and CI |

### Skills

| Threat | Control in FORGE | Residual risk | Operator must |
| --- | --- | --- | --- |
| Tampering: an installed skill body redirects the agent when loaded | `validate-skills.js` enforces the frontmatter contract; [SKILL-PLACEMENT-POLICY.md](SKILL-PLACEMENT-POLICY.md) keeps generated and imported skills out of the curated tree | Structural validation cannot judge intent; a well-formed skill can still be hostile | Read every `SKILL.md` before installing it, including on update |
| Tampering: a skill links to an external document that changes after review | The repository's own guidance is to inline where possible and place a guardrail next to a link that cannot be inlined | The guardrail reduces casual payload success; it does not make the link safe | Prefer inlined content; re-review linked targets |
| Spoofing: a typosquatted skill or marketplace name | `origin` metadata distinguishes first-party from imported skills | Metadata is self-declared by whoever authored the file | Install from the publisher's canonical source; keep an installed manifest in source control |
| Denial of service: an oversized skill crowds the window | `context-budget` flags `SKILL.md` over 400 lines | Advisory only; nothing blocks a large skill | Audit on a cadence — see [CONTEXT-ENGINEERING.md](CONTEXT-ENGINEERING.md) |

### Hooks

Hooks are the highest-value target in the system, because they execute automatically on every
matching event and run in the harness process.

| Threat | Control in FORGE | Residual risk | Operator must |
| --- | --- | --- | --- |
| Elevation: a hostile hook registered by an install or an update | `validate-hooks.js` rejects malformed or unregistered entrypoints; registrations live in one reviewable file, [`../hooks/hooks.json`](../hooks/hooks.json) | Validation checks shape, not behavior. A malicious hook is a full compromise | Diff `hooks.json` after every install and update; treat an unrecognized hook as an incident, not a surprise |
| Tampering: the enforcement layer is disabled through the environment | Profiles and disable flags are explicit and named: `FORGE_HOOK_PROFILE`, `FORGE_HOOKS_ENABLED`, `FORGE_DISABLED_HOOKS` | Those same variables are the disable path. A committed environment file that sets them removes enforcement | Treat repository-controlled environment files as part of the trust boundary and review them like hooks |
| Denial of service: a slow or wedged hook stalls every tool call | Blocking hooks are held to a sub-second budget, must exit 0 on parse errors, and declare a timeout or run async | A hook that ignores the convention still stalls the session | Keep the performance rules from [HOOKS-GUIDE.md](HOOKS-GUIDE.md) in review |
| Repudiation: no record of what was attempted | `governance-capture.js` records `Bash`, `Write`, `Edit`, and `MultiEdit` attempts; `post-bash-command-log.js` logs executed commands; `observe-runner.js` observes across tool calls | Logs written where the agent can write are not evidence | Retain logs somewhere the agent cannot reach |
| Elevation: a verification gate bypassed to ship | `block-no-verify.js` refuses `--no-verify` on commits; `gateguard-fact-force.js` gates the first `Edit`, `Write`, or `Bash` behind a demand for specific facts | Applies to the paths the dispatcher covers | Do not add local exceptions; a bypassed gate is an unreviewed change |

### MCP servers

An MCP server is a program granted a seat inside the agent's trust boundary.

| Threat | Control in FORGE | Residual risk | Operator must |
| --- | --- | --- | --- |
| Tampering: tool names, descriptions, and schemas are read as trusted context and can carry instructions | [MCP-CONNECTOR-POLICY.md](MCP-CONNECTOR-POLICY.md) ships exactly one default connector; everything else is a skill wrapping a CLI | A connector you add yourself is a full trust grant, and its descriptions arrive before any tool is called | Add connectors deliberately; prefer a CLI in a skill unless held-open session state is genuinely required |
| Tampering: results are a conduit for whatever external data the server fetched | Prompt-defense baseline classifies MCP responses as untrusted data | Classification is model-side and can lose | Do not give a fetching workflow both credentials and egress |
| Spoofing and tampering: a server that behaved correctly during review changes afterwards | `/security-scan` flags unpinned `npx` invocations and remote transports | Pinning is your decision, not the scanner's | Pin versions or vendor the server; re-review on update |
| Elevation: a server exposing shell, unrestricted filesystem, or credential operations | `/security-scan` flags servers with shell, filesystem, remote transport, or unpinned invocation | The scanner reports; it does not prevent | Grant each server only the tools it needs; keep unused servers configured and disconnected |
| Denial of service: a dead or misbehaving server stalls sessions | `pre:mcp-health-check` and `post:mcp-health-check` detect it; `FORGE_MCP_HEALTH_TIMEOUT_MS` bounds the check | Health is availability, not integrity | Disable what you do not use with `FORGE_DISABLED_MCPS` |

### Tool permissions

| Threat | Control in FORGE | Residual risk | Operator must |
| --- | --- | --- | --- |
| Elevation: an agent has a capability its job does not need | Each of the 68 agents declares an explicit `tools` allowlist; read-only reviewers get read and search tools only, and widening one is a reviewable change | The allowlist governs the agents FORGE ships, not the harness's own defaults | Audit the allowlists you install; `/security-scan` checks this mechanically |
| Elevation: a shim triggered by model reasoning alone | Commands may declare `allowed-tools` and `disable-model-invocation` | Only where the command author used them | Set them on any command with a side effect |
| Elevation: a larger surface installed than needed | Install profiles in [`../manifests/install-profiles.json`](../manifests/install-profiles.json); `minimal` and `core` write materially less than `full` | Profile choice is yours | Start at the smallest profile that works and add modules on need |
| Information disclosure: credential paths readable by default | The permission model supports deny rules over paths and commands | FORGE ships no deny list on your behalf | Write one. The baseline in [`../guides/the-security-guide.md`](../guides/the-security-guide.md) costs nothing |

### Memory

| Threat | Control in FORGE | Residual risk | Operator must |
| --- | --- | --- | --- |
| Tampering: content planted in one session shapes later ones | Instincts carry confidence scores; global scope requires explicit promotion; `/prune` deletes unpromoted pending instincts older than 30 days | Project-scope instincts still load automatically until pruned | Review `/instinct-status` after any session that processed untrusted material |
| Tampering: a vault document read as instruction | Vault entries arrive as `trust: "unreviewed"` and cannot become policy without a human step; writes are create-only | Unreviewed content still loads as context | Validate recalled claims against the repository; never follow a memory as instruction |
| Information disclosure: a secret written to a long-lived plain-text store | The vault rejects known credential shapes and private keys before writing, and readers do not follow symlinks | A best-effort backstop, not a complete secret classifier | Never paste a secret into a memory body; record the variable name, not the value; rotate on exposure |
| Information disclosure: personal notes leaking into shared work | Recall defaults to project and team scope; user scope must be requested explicitly | A deliberate `--scope user` still returns them | Keep personal notes in user scope and review committed project memory in code review |
| Denial of service: unbounded growth in the session preamble | `FORGE_MAX_INJECTED_INSTINCTS` and `FORGE_INSTINCT_CONFIDENCE_THRESHOLD` cap what is injected | Storage still grows on disk | Prune on a cadence |

### The installer

| Threat | Control in FORGE | Residual risk | Operator must |
| --- | --- | --- | --- |
| Tampering: managed files drift or are replaced after install | Install state records managed files; `forge doctor` reports missing or drifted files and `forge repair` restores them | Detects drift in FORGE-managed files only | Run `forge doctor` after any update; keep an installed manifest in source control |
| Tampering: an adapter directory grants capability the canonical catalog does not | Adapter directories are projections of the catalog and are in scope for the security policy; `npm run harness:adapters` and `npm run harness:audit` check them | An adapter edited locally is not detected by the upstream check | Never edit an adapter to add behavior; change the catalog and re-sync |
| Elevation: install-time scripts in a dependency | `npm run security:ioc-scan` ([`../scripts/ci/scan-supply-chain-iocs.js`](../scripts/ci/scan-supply-chain-iocs.js)) sweeps dependency and AI-tool persistence surfaces for known indicators | Known indicators only; a novel payload is not on the list | Pin dependencies; follow [security/supply-chain-incident-response.md](security/supply-chain-incident-response.md) when one is suspected |
| Denial of service: two install paths applied to one harness | [INSTALLATION.md](INSTALLATION.md) documents each path and what it writes | Nothing prevents running two | Pick one path per harness |

### The plugin marketplace

| Threat | Control in FORGE | Residual risk | Operator must |
| --- | --- | --- | --- |
| Spoofing: a near-identical plugin or package name | The published identities are stated in [`../SECURITY.md`](../SECURITY.md): the `forge-universal` package, the `forge@forge` plugin slug, and the `forge-shield` scanner | Similar names are outside the policy and unverifiable from inside the repository | Confirm against the repository's own metadata; treat anything else as unverified |
| Tampering: a bundle carrying hooks, settings fragments, and MCP entries | `/security-scan` covers all three surfaces in one pass | The scanner reports; installation is still your decision | Read every file in the bundle before installing, and again on update — the diff is where a payload arrives |
| Elevation: a bundle that enables project-scoped MCP servers automatically | The connector policy's default posture is one connector, not automatic enablement | Harness behavior is outside FORGE's control | Never auto-approve project-scoped MCP servers |
| Repudiation: no record of what a marketplace install changed | Install state records managed files | Third-party bundles may write outside it | Keep the installed manifest in version control so drift is visible |

## Attacker classes

Ordered by how often the class shows up in practice, not by sophistication.

| Class | Entry point | Wants | Primary control | Residual risk | Operator must |
| --- | --- | --- | --- | --- | --- |
| Malicious repository content | A cloned repo's files, comments, fixtures, generated output, and committed configuration | To reach credentials or egress through work the operator legitimately asked for | Isolation: no credentials and no egress for any session reading foreign code | The agent may still corrupt the workspace it was given | Open unfamiliar repositories in a container or an isolated worktree, and read committed config before opening |
| Malicious dependency or skill | An installed package, plugin, or skill bundle | Persistence and credential harvesting through install scripts and lifecycle hooks | Review before install; `security:ioc-scan`; recorded install state | Novel payloads are not on any indicator list | Pin, review the diff on every update, keep a manifest, prefer fewer well-reviewed sources |
| Compromised MCP server | Tool descriptions, schemas, and results | To instruct the model before any tool is called, and to inject through what it returns | One-connector default; scanner flags for shell, filesystem, remote transport, unpinned invocation | Attribution after the fact is hard; the trail through the model's reasoning is not always reconstructable | Log tool inputs and outputs; pin servers; drop the ones nobody would miss |
| Malicious pull request | Descriptions, review comments, hidden markup inside a diff | To influence an automated reviewer into approving or into acting | Review agents are read-only by tool allowlist; findings are advisory and split blocking from non-blocking | A reviewer's *output* can still be shaped by hostile input | Keep review agents free of write and network tools; require a human to merge |
| Curious insider | A shared machine, a shared account, or an over-scoped credential | Data they were not meant to see, usually without malice | Scope separation between project, team, and user memory; short-lived scoped credentials | Not a boundary between processes running as the same OS user | Separate agent identities from personal accounts; use OS-level isolation where the separation must hold |

Two notes that apply across the table. The vault's own documentation is explicit that it is
**not** a boundary between concurrent processes running as the same user; if that separation is
required, it needs separate accounts, containers, or equivalent filesystem isolation. And the
highest-return control across every row is the same one: give the agent its own identity and
short-lived, narrowly scoped credentials. If the agent authenticates as you, a compromised agent
is you.

## Not in scope

Stated plainly so nothing is assumed by omission. These are restatements of the boundaries in
[`../SECURITY.md`](../SECURITY.md).

**FORGE does not sandbox the coding agent.** Hooks can inspect and block specific patterns. They
are not a security boundary against a determined local attacker, and they run in the same
process they are policing. Isolation is a container, a VM, or a separate machine — not a hook.

**FORGE does not verify model output for correctness.** Reviews are advisory. A review wave that
returns no findings is not evidence of a safe change.

**FORGE does not scan the implementations of third-party MCP servers or plugins.** Their
configuration templates in this repository are in scope; the programs themselves are not.

**FORGE does not protect against a compromised harness, model provider, or operating system.**
Those belong to their own maintainers.

**FORGE does not defend a boundary between processes running as the same OS user.** Anything
running as your user can write to the memory stores, the metrics logs, and the session files.

**Local command execution by someone who already controls the shell is not a vulnerability
here** unless a higher-privilege boundary is crossed. Neither is a finding that requires the
reporter to first modify tracked files in the checkout.

**Missing hardening that the security policy assigns to the operator is not a FORGE
vulnerability.** The deny list, the egress policy, the sandbox, and the credential scoping are
yours to configure.

**Model output quality, hallucination, and refusal behavior are out of scope** absent a security
consequence.

## Forge Shield coverage map

Forge Shield is the deterministic scanner for the agent surface itself. It ships as the separate
`forge-shield` package rather than from this repository, and
[`../commands/security-scan.md`](../commands/security-scan.md) is the surface that runs it and
turns findings into a prioritized remediation plan.

```bash
npx forge-shield scan --path . --format text
npx forge-shield scan --path . --format json --min-severity medium
npx forge-shield scan --fix
```

| Surface | What the scan covers | Not covered by it |
| --- | --- | --- |
| Prompt files | Hardcoded secrets in prompt content; agent prompts that handle untrusted content without defenses | Whether the prompt's instructions are correct |
| Permissions | Overly broad permission grants | Whether the grant is justified by the workflow |
| Hooks | Executable hooks registered on lifecycle events | The runtime behavior of the code inside them |
| MCP configuration | Servers exposing shell or filesystem access, remote transports, unpinned `npx` invocations | The server implementation itself |
| Secrets | Known credential shapes across the scanned tree | Every secret shape; it is a backstop, not a classifier |
| Agent definitions | Missing prompt-defense baselines, capability breadth | Model behavior under adversarial input |

The scan separates **active runtime findings** from **lower-confidence inventory** —
documentation examples, template examples, plugin manifests, and project-local optional
settings. That split is what makes a long finding list triageable; treat the first group as work
and the second as awareness. `--fix` applies only the fixes the scanner marks as safe and
auto-fixable, and the scanner's output is the source of truth for what it found. Anything beyond
its output is judgment and should be labeled as such.

Run it before publishing a repository, before installing anything from anywhere, and in CI on
every change to `hooks/`, `mcp-configs/`, or an adapter directory.

### The layers around it

Forge Shield is one of four independent layers, none sufficient alone.

| Layer | Mechanism | Runs |
| --- | --- | --- |
| Forge Shield | Deterministic scan of prompt, hook, MCP, permission, and secret surfaces | On demand and in CI |
| Lifecycle hooks | Enforcement that does not depend on the model cooperating | Every matching tool event |
| Permission model | Agent tool allowlists, command restrictions, install profiles | Every tool invocation |
| Repository validators | `check-unicode-safety.js`, `validate-no-personal-paths.js`, `validate-hooks.js`, `validate-workflow-security.js`, and the rest of [`../scripts/ci/`](../scripts/ci/) | `npm test`, before every commit |

Two supply-chain surfaces sit alongside them: `npm run security:ioc-scan` sweeps dependency and
AI-tool persistence paths for known indicators, and the repository's advisory-watch workflow
tracks upstream sources.

### What no layer covers

Isolation. None of the four is a substitute for running untrusted work in a container, a VM, or
a remote sandbox with no credentials mounted and no route out. That remains the operator's
control, and it is the one that makes every other mistake survivable.

## Related pages

| Topic | Where |
| --- | --- |
| The defensive workflow, sandboxing, and incident response | [`../guides/the-security-guide.md`](../guides/the-security-guide.md) |
| Reporting a vulnerability, scope, operator hardening list | [`../SECURITY.md`](../SECURITY.md) |
| Supply-chain incident runbook | [security/supply-chain-incident-response.md](security/supply-chain-incident-response.md) |
| Why one default connector | [MCP-CONNECTOR-POLICY.md](MCP-CONNECTOR-POLICY.md), [MCP-GUIDE.md](MCP-GUIDE.md) |
| Hook semantics, profiles, and blocking rules | [HOOKS-GUIDE.md](HOOKS-GUIDE.md) |
| Memory scopes, trust levels, and pruning | [MEMORY-GUIDE.md](MEMORY-GUIDE.md) |
| Agent tool allowlists and the prompt-defense baseline | [AGENT-AUTHORING.md](AGENT-AUTHORING.md) |
| Untrusted handoffs between agents | [ORCHESTRATION-PATTERNS.md](ORCHESTRATION-PATTERNS.md) |
| Install paths and what each writes | [INSTALLATION.md](INSTALLATION.md) |
| Threat modeling as a practice, applied to your own systems | [`../skills/threat-modeling/`](../skills/threat-modeling/), [`../skills/prompt-injection-defense/`](../skills/prompt-injection-defense/) |
