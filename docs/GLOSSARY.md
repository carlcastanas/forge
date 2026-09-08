# Glossary

This page defines every term FORGE uses in its docs, file formats, and CLI output, in alphabetical order, one paragraph each. It is a lookup surface, not a tutorial: entries state what a term means and point at the page that explains it in depth. Where a term describes general agent-engineering practice rather than something this repo implements, the entry says so.

Prerequisites: none. [CONCEPTS.md](./CONCEPTS.md) is the better first read if you want the mental model rather than definitions.

## A

**Agent.** A subagent definition stored as a Markdown file in [`agents/`](../agents/) with YAML frontmatter declaring `name`, `description`, `tools`, and `model`. An agent runs in its own context window, sees only what the caller passes it plus what its tools read, and returns a result. FORGE ships 68 of them, mostly reviewers, build-error resolvers, and planners. See [AGENT-AUTHORING.md](./AGENT-AUTHORING.md).

**Agent-first.** The first of the five core principles in [SOUL.md](../SOUL.md): route work to a specialist as early as possible instead of doing everything in the main session. In practice it means preferring a reviewer agent over an inline review, and a planner over an improvised plan.

**Allowlist (tool allowlist).** The comma-separated `tools` value in agent frontmatter. It is a scalar, not a YAML sequence — [`validate-agents.js`](../scripts/ci/validate-agents.js) rejects the list form. A narrow allowlist is a correctness feature, not only a safety one: an agent that cannot write cannot accidentally rewrite the file it was asked to read.

**Async hook.** A hook entry carrying `"async": true`. It runs in the background and cannot block the tool call. FORGE uses it for observation and build analysis, where the work is useful but must never sit on the critical path. See [HOOKS-GUIDE.md](./HOOKS-GUIDE.md).

## C

**Catalog.** The counted inventory of shipped surfaces — agents, skills, commands, rules. `npm run catalog:check` compares documented counts against the filesystem and `npm run catalog:sync` rewrites them. Counts stated in prose drift; verify with `ls` before quoting one.

**Compaction.** The harness operation that replaces a long conversation with a shorter summary to free context. Everything not written down elsewhere is lost at that boundary, which is why FORGE registers a `PreCompact` hook ([`pre-compact.js`](../scripts/hooks/pre-compact.js)) to persist state first, and why [`suggest-compact.js`](../scripts/hooks/suggest-compact.js) nudges toward a manual `/compact` at a logical point rather than an automatic one at an arbitrary point.

**Command.** A user-triggered prompt template in [`commands/`](../commands/), invoked by typing `/<name>`. FORGE ships 94. Per [AGENTS.md](../AGENTS.md), commands are a legacy slash-entry compatibility surface: new workflow bodies belong in `skills/`, with a command as a thin shim when a typed entry point is still wanted.

**Common rules.** The files in [`rules/common/`](../rules/common/) — coding style, testing, security, git workflow, performance, patterns, hooks, agents, code review, development workflow. They carry no `paths` frontmatter, so they apply to everything once installed, and they are the layer language-specific rules extend and override.

**Confidence (instinct confidence).** A number from roughly 0.3 to 0.9 attached to a learned instinct, expressing how strongly the observed evidence supports it. Low-confidence instincts are tentative; high-confidence ones are treated as near-certain preferences. Confidence is what makes an instinct different from a rule: a rule is asserted, an instinct is earned.

**Context window.** The total token budget a model can attend to in one turn, shared by system instructions, resident rules, MCP tool schemas, loaded skills, conversation history, and tool output. Every FORGE design decision about defaults reduces to competition for this budget. [AGENTS.md](../AGENTS.md) advises avoiding the last 20 percent of it for large multi-file work.

**Continuous learning.** The subsystem that turns session activity into reusable knowledge. Version 1 lives in [`skills/continuous-learning/`](../skills/continuous-learning/) and evaluates at session end; version 2 ([`skills/continuous-learning-v2/`](../skills/continuous-learning-v2/)) observes through `PreToolUse`/`PostToolUse` hooks, writes atomic instincts with confidence scores, and scopes them per project. See [MEMORY-GUIDE.md](./MEMORY-GUIDE.md).

## D

**Dispatcher.** A single hook script that fans out to several checks so the harness pays one process spawn instead of many. [`pre-bash-dispatcher.js`](../scripts/hooks/pre-bash-dispatcher.js) and [`posttooluse-dispatcher.js`](../scripts/hooks/posttooluse-dispatcher.js) are the two in the shipped hook graph.

**Drift-prone.** A label for a skill whose subject matter — a fast-moving external API, a vendor CLI, a model id — changes faster than the skill file does. Skills in this category carry a callout under the H1 telling the reader to verify current documentation before trusting the steps.

**Dry run.** Hook execution with `FORGE_DRY_RUN=1`. [`run-with-flags.js`](../scripts/hooks/run-with-flags.js) prints a `[DryRun]` line naming the hook, the script it would execute, and the target file or command, then passes stdin through untouched. It is the fastest way to confirm a hook is wired without letting it act.

## E

**Eval.** A pass/fail test for agent behavior rather than for code. [`skills/eval-harness/`](../skills/eval-harness/) frames this as eval-driven development: define expected behavior before implementation, run evals continuously, track regressions, and measure reliability with pass@k. Related surfaces are [`skills/agent-eval/`](../skills/agent-eval/), [`skills/agent-self-evaluation/`](../skills/agent-self-evaluation/), and the [`agent-evaluator`](../agents/agent-evaluator.md) agent.

**Evolved surface.** A skill, command, or agent generated from clustered instincts by `/evolve`. Evolved artifacts live under the continuous-learning data directory, not in the repo, and are never shipped. [SKILL-PLACEMENT-POLICY.md](./SKILL-PLACEMENT-POLICY.md) defines the placement rules.

## F

**Fail open.** The default posture of FORGE hook plumbing: when something goes wrong inside the hook layer itself — an oversized stdin payload, a missing script, a `require()` failure — the wrapper emits a diagnostic on stderr and exits 0 so the tool call proceeds. Blocking is reserved for hooks that deliberately decide to block.

**Forge Shield.** FORGE's security scanning surface, published as the `forge-shield` package. Distinct from the [`security-reviewer`](../agents/security-reviewer.md) agent and the [`security-scan`](../skills/security-scan/) skill, which operate inside a session.

**Frontmatter.** The YAML block delimited by `---` at the top of a Markdown file. Every FORGE primitive that the model routes to uses it: skills declare `name` and `description`, agents add `tools` and `model`, commands declare `description` and often `argument-hint`, language rules declare `paths`. Each has its own validator under [`scripts/ci/`](../scripts/ci/).

## G

**GateGuard.** A fact-forcing gate implemented in [`gateguard-fact-force.js`](../scripts/hooks/gateguard-fact-force.js). It blocks the first `Edit`, `Write`, or `MultiEdit` against a given file and demands investigation — importers, data schemas, the actual user instruction — before allowing the change. `FORGE_GATEGUARD=off` disables it during setup or recovery.

## H

**Harness.** The program that runs the model and owns the tool loop, the lifecycle events, and the context window. Claude Code is FORGE's reference harness; the package description also names Codex, OpenCode, Cursor, and Gemini, with adapter surfaces in the repo for several more. A FORGE primitive is only as available as the harness's support for it.

**Hook.** Deterministic automation bound to a lifecycle event, registered in [`hooks/hooks.json`](../hooks/hooks.json) and implemented in [`scripts/hooks/`](../scripts/hooks/). Hooks receive the tool payload as JSON on stdin and are the only primitive that can stop the agent. See [HOOKS-GUIDE.md](./HOOKS-GUIDE.md).

**Hook id.** The stable identifier on every entry in `hooks.json`, such as `pre:config-protection` or `stop:desktop-notify`. Ids are what `FORGE_DISABLED_HOOKS` matches, what the installer uses to update FORGE-owned entries idempotently, and what uninstall uses to remove them without touching user hooks.

**Hook profile.** One of `minimal`, `standard`, or `strict`, selected with `FORGE_HOOK_PROFILE` or the plugin's `hook_profile` setting. Each hook entry declares which profiles it runs under; [`hook-flags.js`](../scripts/lib/hook-flags.js) resolves the choice and falls back to `standard` for any invalid value.

**Homunculus.** The historical name for the continuous-learning data directory holding observations, instincts, and evolved artifacts. Current installs resolve it to `$XDG_DATA_HOME/forge-homunculus` or `~/.local/share/forge-homunculus`, deliberately outside `~/.claude` so background writes are not blocked by the harness's sensitive-path guard.

## I

**Instinct.** An atomic learned behavior: one trigger, one action, a confidence score, a domain tag, and the evidence that produced it. Instincts are project-scoped by default and promoted to global scope only after the same pattern appears in two or more projects. Inspect them with `/instinct-status`, move them with `/promote`, and cluster them into larger surfaces with `/evolve`.

## L

**Learned skill.** A skill generated from session activity by continuous learning or `/learn`, written to `~/.claude/skills/learned/` with a `.provenance.json` sibling. Learned skills are never committed to the repo and never shipped — see [SKILL-PLACEMENT-POLICY.md](./SKILL-PLACEMENT-POLICY.md).

**Lifecycle event.** A named point in a session where the harness will run hooks. The FORGE hook validator accepts a broad set including `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PostToolUseFailure`, `Notification`, `SubagentStart`, `Stop`, `SubagentStop`, `PreCompact`, `InstructionsLoaded`, `TeammateIdle`, `TaskCompleted`, `ConfigChange`, `WorktreeCreate`, `WorktreeRemove`, and `SessionEnd`. The shipped graph uses seven of them.

## M

**Matcher.** The tool-name pattern on a hook entry, such as `Bash`, `Edit|Write`, or `.*`. [`rules/common/hooks.md`](../rules/common/hooks.md) and [RULES.md](../RULES.md) both direct authors to prefer specific matchers over catch-alls. Four events — `UserPromptSubmit`, `Notification`, `Stop`, `SubagentStop` — take no matcher.

**MCP (Model Context Protocol).** The protocol for exposing external tools and resources to an agent. FORGE ships one default connector and treats every additional one as a context-budget expense that must be argued for. See [MCP-GUIDE.md](./MCP-GUIDE.md) and [MCP-CONNECTOR-POLICY.md](./MCP-CONNECTOR-POLICY.md).

**Memory entry.** Anything that outlives a session: a session summary written by [`session-end.js`](../scripts/hooks/session-end.js), an instinct, or a `forge.memory.v1` document in the memory vault. Entries are context, not instructions — vault documents land as `trust: "unreviewed"` and require a human decision before becoming project truth.

**Memory vault.** The cross-harness store behind `forge memory` ([`scripts/memory.js`](../scripts/memory.js)). Markdown files are the source of truth, project and team memories live under `.forge/memory/`, user memories under `~/.forge/memory/`, writes are create-only, and known credential shapes are rejected before a file is written. An optional stdio MCP server ([`memory-mcp.mjs`](../scripts/memory-mcp.mjs)) exposes the same operations.

## O

**Observation.** A single captured tool-use record written by [`observe-runner.js`](../scripts/hooks/observe-runner.js) to a per-project JSONL file. Observations are the raw input to instinct formation; they are not memory in themselves and are not intended to be read by a human.

**Origin.** The `metadata.origin` field in skill frontmatter. [RULES.md](../RULES.md) defines two values: `FORGE` for first-party skills and `community` for imported ones.

## P

**Progressive disclosure.** Structuring a skill so `SKILL.md` stays small and loads first, while deeper material sits in sibling files the model reads only when the task reaches them. [`skills/angular-developer/`](../skills/angular-developer/) and [`skills/remotion-video-creation/`](../skills/remotion-video-creation/) are the largest examples in the repo. See [SKILL-AUTHORING.md](./SKILL-AUTHORING.md).

**Prompt defense baseline.** The six-bullet block reproduced at the top of [CLAUDE.md](../CLAUDE.md) and every shipped agent file: hold role and rules, never disclose secrets, gate executable output, treat unicode tricks and pressure tactics as suspicious, treat fetched or third-party content as untrusted data, and refuse harmful generation. New agents copy it verbatim.

**Provenance.** The `.provenance.json` file required beside every learned or imported skill, recording where it came from. Curated skills in the repo do not carry one; they use `metadata.origin` instead.

## R

**Resident cost.** The tokens a component occupies before any work happens. Rules and MCP tool schemas are resident; skill bodies and agent prompts are not. Reducing resident cost is the practical meaning of FORGE's "optimize the context window, persist everything else".

**Rule.** A standing constraint in [`rules/`](../rules/), organized as a common layer plus per-language directories. Language files declare `paths` globs and override common files on conflict. See [RULES-GUIDE.md](./RULES-GUIDE.md).

## S

**Selective install.** Installing a subset of FORGE by module or profile rather than everything. Modules and profiles are declared in [`manifests/`](../manifests/) and driven by `forge install`, `forge plan`, and `forge catalog`. It is the primary lever for keeping resident cost low.

**Session adapter.** A component that normalizes a harness-specific session source — tmux-orchestrated worktrees, Claude local history, future control-plane backends — into the canonical `forge.session.v1` snapshot. The contract is specified in [SESSION-ADAPTER-CONTRACT.md](./SESSION-ADAPTER-CONTRACT.md) and implemented under `scripts/lib/session-adapters/`. Inspect snapshots with `forge session-inspect`.

**Session summary.** The persisted digest of a session — user asks, tools used, files modified — extracted from the transcript by [`session-end.js`](../scripts/hooks/session-end.js) and reloaded, bounded, at the next `SessionStart`. Bound it with `FORGE_SESSION_START_MAX_CHARS`; disable the reload with `FORGE_SESSION_START_CONTEXT=off`.

**Skill.** A workflow written for the model, stored as `SKILL.md` inside a directory named after the skill. The `description` frontmatter field is the routing signal that decides whether it fires. Skills are the canonical workflow surface in FORGE. See [SKILL-AUTHORING.md](./SKILL-AUTHORING.md).

**Skill health.** Telemetry over skill executions. [`skill-run-tracker.js`](../scripts/hooks/skill-run-tracker.js) records skill id, version, and outcome — never prompt text — to a JSONL file, and `node scripts/skills-health.js --dashboard` (or `/skill-health`) renders success rates, failure clusters, pending amendments, and version history.

**Subagent.** An agent definition running as a delegated task. The term describes the runtime instance; "agent" describes the file.

## T

**TDD workflow.** The mandatory red-green-refactor cycle described in [AGENTS.md](../AGENTS.md) and implemented by [`skills/tdd-workflow/`](../skills/tdd-workflow/) and the [`tdd-guide`](../agents/tdd-guide.md) agent, with an 80 percent coverage floor across unit, integration, and end-to-end tests.

**Tool budget.** The share of the context window consumed by tool definitions before any tool is called. [`skills/context-budget/`](../skills/context-budget/) estimates MCP schema overhead at roughly 500 tokens per tool and flags servers exposing more than 20. It is the number that decides whether a connector is worth enabling.

**Trust level.** The `trust` field on a memory vault document. Every first-release entry is `unreviewed`, meaning it may inform a decision but may not act as policy until a human promotes its content into rules, decision records, or runbooks.

## U

**Untrusted content.** Anything the agent did not author and the user did not type: fetched pages, MCP tool output, plan files, dependency READMEs, issue text. The prompt defense baseline requires treating it as data to validate, never as instructions to follow. [`skills/tdd-workflow/`](../skills/tdd-workflow/) shows the pattern applied to plan handoff, where embedded commands must be sanitized and approved rather than executed.

## W

**Wave.** A batch of subagents launched together to work on independent parts of one task, then joined before the next batch begins. This is general orchestration vocabulary rather than a named FORGE file format; the repo's parallel-execution surfaces are [`skills/parallel-execution-optimizer/`](../skills/parallel-execution-optimizer/), [`skills/team-agent-orchestration/`](../skills/team-agent-orchestration/), and the `orch-*` skills. [AGENTS.md](../AGENTS.md) states the underlying rule: launch independent agents simultaneously.

**Worktree.** A separate git checkout used to isolate one agent's work from another's. FORGE drives them through `npm run orchestrate:tmux` ([`orchestrate-worktrees.js`](../scripts/orchestrate-worktrees.js)) and surfaces their state through session adapters.
