# Documentation index

This directory is the reference half of FORGE's documentation. A page here answers a
question you already know how to ask: what does this environment variable do, what
frontmatter key is required, which harness supports hooks, what does this term mean. Pages
are organized for scanning — tables, decision matrices, exact paths and flags — and are
meant to be entered in the middle rather than read from the top.

The narrative half lives in [`../guides/`](../guides/). A guide explains why a threshold
exists, walks a whole workflow end to end, and is written to be read in one sitting. Where
a guide argues for a practice, the matching page here lists the settings that implement it.
When both exist on a topic, read the guide once and return to the doc afterwards.

Prerequisites: [CONCEPTS.md](CONCEPTS.md) defines the seven primitives that the rest of
this directory assumes. Read it before authoring anything.

## Start here

| Page | Covers |
| --- | --- |
| [CONCEPTS.md](CONCEPTS.md) | The seven primitives — skill, agent, command, hook, rule, memory entry, MCP server — and the pairs people confuse |
| [GLOSSARY.md](GLOSSARY.md) | Every term used across the docs, alphabetical, one paragraph each |
| [FAQ.md](FAQ.md) | Short answers to first-week questions, each pointing at a deeper page |
| [INSTALLATION.md](INSTALLATION.md) | Every install path, what each writes to disk, and how to remove it |
| [CONFIGURATION.md](CONFIGURATION.md) | The five configuration sources and the precedence order between them |
| [CLI-REFERENCE.md](CLI-REFERENCE.md) | Every binary, subcommand, and flag, read out of the argument parsers |

## Authoring

| Page | Covers |
| --- | --- |
| [SKILL-AUTHORING.md](SKILL-AUTHORING.md) | Writing a skill that triggers: description-as-router, file template, trigger testing |
| [AGENT-AUTHORING.md](AGENT-AUTHORING.md) | Agent frontmatter contract, model tier choice, tool allowlists, prompt defense baseline |
| [HOOKS-GUIDE.md](HOOKS-GUIDE.md) | Lifecycle events, `hooks.json` shape, profiles, exit codes, performance budget |
| [RULES-GUIDE.md](RULES-GUIDE.md) | Common versus language rules, pack selection, authoring, conflict resolution |
| [MEMORY-GUIDE.md](MEMORY-GUIDE.md) | The three stores, session summaries, instincts, the vault, pruning |
| [MCP-GUIDE.md](MCP-GUIDE.md) | Configuring servers, health checks, tool-definition cost, when a skill beats a connector |
| [capability-surface-selection.md](capability-surface-selection.md) | The routing questions that decide rule versus skill versus MCP versus CLI |
| [SKILL-PLACEMENT-POLICY.md](SKILL-PLACEMENT-POLICY.md) | Where curated, generated, and imported skills belong |
| [skill-adaptation-policy.md](skill-adaptation-policy.md) | Turning an outside skill into a FORGE-native surface |
| [PLAN-PRD-PATTERN.md](PLAN-PRD-PATTERN.md) | The markdown-staged planning flow each phase hands to the next |

## Contributing to this repository

| Page | Covers |
| --- | --- |
| [DEVELOPMENT.md](DEVELOPMENT.md) | The local loop: repository layout, every npm script, the validator chain in `npm test`, hook debugging, sandboxed installs, editor setup |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Canonical catalog versus harness adapter projections, the profile-to-file install pipeline, hook dispatch, session lifecycle, on-disk state |
| [TESTING.md](TESTING.md) | Suite layout, the `tests/run-all.js` runner, coverage thresholds, a worked test per surface, and when to delete a test |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | The front door: prerequisites, clone to green, what to create for each kind of addition, commit convention, CI, review expectations |

## Operating a session

| Page | Covers |
| --- | --- |
| [ORCHESTRATION-PATTERNS.md](ORCHESTRATION-PATTERNS.md) | Wave shapes as a catalogue: diagram, applicability, failure modes, implementing surface |
| [CONTEXT-ENGINEERING.md](CONTEXT-ENGINEERING.md) | What consumes the window, how to measure it, and the exact levers that shrink it |
| [COST-AND-MODEL-ROUTING.md](COST-AND-MODEL-ROUTING.md) | Where spend goes, routing to model tiers, caching, and the repo's cost surfaces |
| [EVALUATION-GUIDE.md](EVALUATION-GUIDE.md) | Eval types, grader taxonomy, statistical care, CI gates |
| [token-optimization.md](token-optimization.md) | Settings and habits that reduce token consumption |
| [RECIPES.md](RECIPES.md) | Task-shaped cookbook: goal, sequence to run, what good output looks like |
| [ANTI-PATTERNS.md](ANTI-PATTERNS.md) | The failures a harness reliably produces without a pruning discipline |
| [TEAM-ADOPTION.md](TEAM-ADOPTION.md) | Pilot scope, shared versus personal config, what changes in review and CI |

## Security

| Page | Covers |
| --- | --- |
| [THREAT-MODEL.md](THREAT-MODEL.md) | Assets, trust boundaries, threats per surface, controls, residual risk, scope limits |
| [MCP-CONNECTOR-POLICY.md](MCP-CONNECTOR-POLICY.md) | Why FORGE ships one default connector and everything else wraps a CLI |
| [security/supply-chain-incident-response.md](security/supply-chain-incident-response.md) | Operator runbook for a compromised package or poisoned marketplace artifact |
| [security/forge-039-powershell-gateguard-plan.md](security/forge-039-powershell-gateguard-plan.md) | GateGuard coverage plan for the PowerShell tool surface |
| [../SECURITY.md](../SECURITY.md) | Supported versions, reporting a vulnerability, scope, operator hardening |

## Platform and harness support

| Page | Covers |
| --- | --- |
| [HARNESS-MATRIX.md](HARNESS-MATRIX.md) | Per-harness support levels, derived from the install profiles and adapter definitions |
| [SESSION-ADAPTER-CONTRACT.md](SESSION-ADAPTER-CONTRACT.md) | The canonical `forge.session.v1` snapshot every adapter normalizes into |
| [SELECTIVE-INSTALL-ARCHITECTURE.md](SELECTIVE-INSTALL-ARCHITECTURE.md) | How profiles, modules, and components resolve into a written install |
| [SELECTIVE-INSTALL-DESIGN.md](SELECTIVE-INSTALL-DESIGN.md) | The design rationale behind the selective installer |
| [ANTIGRAVITY-GUIDE.md](ANTIGRAVITY-GUIDE.md) | Antigravity workspace discovery and setup |
| [CODEX-NAVIGATION-GUIDE.md](CODEX-NAVIGATION-GUIDE.md) | Navigation map for Codex agents working inside FORGE |
| [QWEN-GUIDE.md](QWEN-GUIDE.md) | Installing managed surfaces into the Qwen CLI home |
| [JOYCODE-GUIDE.md](JOYCODE-GUIDE.md) | JoyCode adapter and the project-local `.joycode/` layout |
| [HERMES-SETUP.md](HERMES-SETUP.md) | Running FORGE behind the Hermes operator shell |
| [MANUAL-ADAPTATION-GUIDE.md](MANUAL-ADAPTATION-GUIDE.md) | Getting FORGE behavior into a harness with no native layout |

## Migration and troubleshooting

| Page | Covers |
| --- | --- |
| [MIGRATION-1X-TO-2.0.md](MIGRATION-1X-TO-2.0.md) | Upgrading a 1.x install across the repo and plugin rename |
| [HERMES-OPENCLAW-MIGRATION.md](HERMES-OPENCLAW-MIGRATION.md) | Moving a Hermes or OpenClaw operator setup onto the current model |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Harness bugs that affect FORGE users, with workarounds |
| [hook-bug-workarounds.md](hook-bug-workarounds.md) | Workarounds specific to hook-heavy configurations |

## Internal design records

These describe how parts of the system were designed or are intended to evolve. They are
records, not instructions, and they age faster than the pages above.

| Page | Covers |
| --- | --- |
| [ARCHITECTURE-IMPROVEMENTS.md](ARCHITECTURE-IMPROVEMENTS.md) | Architect-level improvement backlog for the repository |
| [FORGE-2.0-REFERENCE-ARCHITECTURE.md](FORGE-2.0-REFERENCE-ARCHITECTURE.md) | The 2.0 execution mirror and its component boundaries |
| [FORGE-2.0-SESSION-ADAPTER-DISCOVERY.md](FORGE-2.0-SESSION-ADAPTER-DISCOVERY.md) | Discovery notes behind the session adapter contract |
| [continuous-learning-v2-spec.md](continuous-learning-v2-spec.md) | The v2 continuous-learning architecture |
| [COMMAND-AGENT-MAP.md](COMMAND-AGENT-MAP.md) | Which command invokes which agent or skill |
| [COMMAND-REGISTRY.json](COMMAND-REGISTRY.json) | Generated command registry; regenerate with `npm run command-registry:write` |

## Subdirectories

| Directory | Contents |
| --- | --- |
| [architecture/](architecture/) | Cross-harness design, adapter compliance, observability readiness, progress-sync contract, and related architecture notes |
| [security/](security/) | Incident-response runbooks and per-surface hardening plans |
| [design/](design/) | Design documents for the memory vault, plan canvas, and agent proximity |
| [examples/](examples/) | Templates for product capability and project guideline documents |
| [business/](business/) | Metrics, launch copy, and content-pack material |
| [testing/](testing/) | Reserved for testing reference material; currently empty |

Translated documentation lives in per-locale trees: `de-DE`, `es`, `ja-JP`, `ko-KR`,
`pt-BR`, `ru`, `th`, `tr`, `uk-UA`, `ur`, `vi-VN`, `zh-CN`, `zh-TW`. Coverage varies widely
by locale and each tree lags the English source deliberately, so the link validator in
[`../scripts/ci/validate-links.js`](../scripts/ci/validate-links.js) excludes them. Treat
English as the source of truth when the two disagree.

## Three reading paths

**Installing it for the first time.** [INSTALLATION.md](INSTALLATION.md) to get it on disk,
then [CONCEPTS.md](CONCEPTS.md) so the vocabulary means something, then
[../guides/getting-started.md](../guides/getting-started.md) for the first twenty minutes of
real use. Come back to [CONFIGURATION.md](CONFIGURATION.md) the first time a default annoys
you, and [HARNESS-MATRIX.md](HARNESS-MATRIX.md) the first time something does not work in a
harness other than Claude Code.

**Extending the catalog.** [CONCEPTS.md](CONCEPTS.md) and
[capability-surface-selection.md](capability-surface-selection.md) to decide which primitive
you are actually writing, then the matching authoring page —
[SKILL-AUTHORING.md](SKILL-AUTHORING.md), [AGENT-AUTHORING.md](AGENT-AUTHORING.md),
[HOOKS-GUIDE.md](HOOKS-GUIDE.md), or [RULES-GUIDE.md](RULES-GUIDE.md). Check
[ANTI-PATTERNS.md](ANTI-PATTERNS.md) before you add rather than after, and
[EVALUATION-GUIDE.md](EVALUATION-GUIDE.md) for how to tell whether the addition helped.
[../CONTRIBUTING.md](../CONTRIBUTING.md) has the pull-request contract.

**Running it on something that matters.** [THREAT-MODEL.md](THREAT-MODEL.md) for what is and
is not defended, [../guides/the-security-guide.md](../guides/the-security-guide.md) for the
defensive workflow, and [../SECURITY.md](../SECURITY.md) for the operator hardening list.
Then [CONTEXT-ENGINEERING.md](CONTEXT-ENGINEERING.md) and
[COST-AND-MODEL-ROUTING.md](COST-AND-MODEL-ROUTING.md) to keep sessions inside a budget, and
[TEAM-ADOPTION.md](TEAM-ADOPTION.md) when more than one person is involved.
