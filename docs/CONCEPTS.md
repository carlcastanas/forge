# Concepts

This page is the mental model for everything FORGE installs. It defines the seven primitives — skill, agent, command, hook, rule, memory entry, MCP server — states the one distinction that separates each pair people confuse, shows how they stack up inside a single session, and ends with a decision table that turns an intent into a file you author. Read this before authoring anything; the per-primitive authoring guides assume it.

Prerequisites: a working FORGE install and a coding agent that loads it (Claude Code is the reference harness). No code required.

## The seven primitives at a glance

| Primitive | Lives in | Loaded | Decided by | Can block work |
| --- | --- | --- | --- | --- |
| Skill | [`skills/<name>/SKILL.md`](../skills/) | On demand, when its description matches the task | The model | No |
| Agent | [`agents/<name>.md`](../agents/) | On delegation, into a separate context | The model, or an explicit request | No |
| Command | [`commands/<name>.md`](../commands/) | When the user types `/<name>` | The user | No |
| Hook | [`hooks/hooks.json`](../hooks/hooks.json) + [`scripts/hooks/`](../scripts/hooks/) | Deterministically, on a lifecycle event | The harness | Yes |
| Rule | [`rules/**/*.md`](../rules/) | Always, or when a file path matches | Install choice plus path globs | No |
| Memory entry | Session files, instincts, memory vault | At session start, or on explicit recall | Lifecycle hooks and the operator | No |
| MCP server | [`mcp-configs/mcp-servers.json`](../mcp-configs/mcp-servers.json), [`.mcp.json`](../.mcp.json) | At session start, tool schemas resident | Install and config | No |

Two properties explain most of the design. First, **who decides**: a hook fires whether or not the model wants it, a skill fires only if the model judges it relevant. Second, **what it costs**: a rule and an MCP tool schema occupy context on every turn; a skill body occupies context only after it activates.

## Skill

A skill is a workflow written for the model to read: a procedure, its triggers, its failure modes, and the commands that prove it worked. It is a single Markdown file, `SKILL.md`, in a directory named after the skill, with YAML frontmatter carrying at minimum `name` and `description`. FORGE marks first-party skills with `metadata.origin: FORGE`.

```markdown
---
name: context-budget
description: Audits Claude Code context window consumption across agents, skills, MCP servers, and rules. Use when the context window is filling up too fast and the agents, skills, MCP servers, or rules consuming it need to be identified.
metadata:
  origin: FORGE
---

# Context Budget
```

The `description` is not documentation. It is the routing signal — the only part of the skill that is resident before activation, and therefore the only text that can cause activation. A skill with a precise body and a vague description never runs. See [SKILL-AUTHORING.md](./SKILL-AUTHORING.md).

Skills are the canonical workflow surface in this repo. [AGENTS.md](../AGENTS.md) states the policy plainly: new workflow contributions land in `skills/` first, and `commands/` exists for slash-entry compatibility during migration.

## Agent

An agent is a subagent definition: a role, a model tier, an explicit tool allowlist, and a prompt. It runs in its own context window and returns a result to the caller. The frontmatter contract is enforced by [`scripts/ci/validate-agents.js`](../scripts/ci/validate-agents.js), which requires `model` and `tools`, restricts `model` to `haiku`, `sonnet`, or `opus`, and rejects `tools` written as a YAML sequence.

```markdown
---
name: code-reviewer
description: Expert code review specialist. Proactively reviews code for quality, security, and maintainability. Use immediately after writing or modifying code. MUST BE USED for all code changes.
tools: Read, Grep, Glob, Bash
model: sonnet
---
```

The defining property is context isolation. An agent reads fifty files and returns four paragraphs; the caller pays for the four paragraphs. That is the whole reason to delegate. See [AGENT-AUTHORING.md](./AGENT-AUTHORING.md).

## Command

A command is a user-triggered prompt template. The user types `/plan` and the file's body enters the conversation as instructions. Frontmatter carries a `description` and often an `argument-hint`; [`scripts/ci/validate-commands.js`](../scripts/ci/validate-commands.js) checks frontmatter syntax and verifies that every command and agent a file references actually exists.

```markdown
---
description: Restate requirements, assess risks, and create step-by-step implementation plan. WAIT for user CONFIRM before touching any code.
argument-hint: "[feature description | path/to/*.prd.md]"
---
```

Commands cost nothing until typed, and they carry no ambiguity about whether to fire. Their weakness is discovery: a user who does not know `/plan` exists never runs it. That asymmetry is why FORGE moved workflow bodies into skills and left commands as thin entry points — see [COMMANDS-QUICK-REF.md](../COMMANDS-QUICK-REF.md) for the catalog.

## Hook

A hook is deterministic automation bound to a harness lifecycle event. It is not a prompt and the model cannot decline it. Registration lives in [`hooks/hooks.json`](../hooks/hooks.json); implementations live in [`scripts/hooks/`](../scripts/hooks/) as cross-platform Node scripts that read the tool payload as JSON on stdin.

FORGE registers hooks under seven events today — `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PreCompact`, `SessionStart`, `Stop`, and `SessionEnd` — out of the larger set the validator accepts. A `PreToolUse` hook that exits `2` blocks the tool call; every other exit code lets work continue.

```json
{
  "matcher": "Write|Edit|MultiEdit",
  "hooks": [{ "type": "command", "command": "node scripts/hooks/config-protection.js", "timeout": 5 }],
  "description": "Block modifications to linter/formatter config files.",
  "id": "pre:config-protection"
}
```

Hooks are the only primitive that can stop the agent, which makes them the right home for invariants and the wrong home for advice. See [HOOKS-GUIDE.md](./HOOKS-GUIDE.md).

## Rule

A rule is a standing constraint injected into context rather than a procedure the model chooses to follow. FORGE ships 122 rule files in two layers: [`rules/common/`](../rules/common/) holds language-agnostic principles with no frontmatter, so they apply everywhere they are installed; language directories such as [`rules/python/`](../rules/python/) and [`rules/typescript/`](../rules/typescript/) declare `paths` globs that scope them to matching files.

```markdown
---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Testing

> This file extends [common/testing.md](../common/testing.md) with Python specific content.
```

When the two layers disagree, the language-specific file wins — [`rules/README.md`](../rules/README.md) documents that precedence explicitly. Rules are cheap individually and expensive in aggregate, because installed rules are resident. See [RULES-GUIDE.md](./RULES-GUIDE.md).

## Memory entry

Memory is everything that outlives the session. FORGE keeps three distinct kinds and does not blur them:

- **Session summaries.** [`scripts/hooks/session-end.js`](../scripts/hooks/session-end.js) extracts user asks, tools used, and files modified from the transcript and writes a session file under the Claude directory. [`scripts/hooks/session-start-bootstrap.js`](../scripts/hooks/session-start-bootstrap.js) loads a bounded slice of it back on the next session.
- **Instincts.** [`skills/continuous-learning-v2/`](../skills/continuous-learning-v2/) observes tool use through `PreToolUse`/`PostToolUse` hooks and distills atomic, confidence-scored behaviors, scoped per project by default and promoted to global only when a pattern recurs across projects.
- **The memory vault.** `forge memory` ([`scripts/memory.js`](../scripts/memory.js)) stores create-only Markdown documents under `.forge/memory/` and `~/.forge/memory/` that any harness can read.

The vault's governing constraint is worth internalizing: a memory is context, not an instruction. Entries land as `trust: "unreviewed"` and cannot silently become policy. See [MEMORY-GUIDE.md](./MEMORY-GUIDE.md).

## MCP server

An MCP server is an external process exposing tools and resources to the agent over the Model Context Protocol. FORGE ships exactly one default connector, `chrome-devtools`, in [`.mcp.json`](../.mcp.json); everything else is an opt-in entry in [`mcp-configs/mcp-servers.json`](../mcp-configs/mcp-servers.json).

The reason is arithmetic, not taste. Tool schemas load into every session whether or not a tool is called, so each default connector taxes every user's context window permanently. [MCP-CONNECTOR-POLICY.md](./MCP-CONNECTOR-POLICY.md) records the June 2026 audit that dropped six former defaults to skills or to nothing. See [MCP-GUIDE.md](./MCP-GUIDE.md).

## The pairs that get confused

### Skill vs command

A skill is chosen by the model from a description; a command is chosen by the user from a keystroke. Same body, different trigger. Write the skill; add a command only when a user needs a name to type.

### Skill vs rule

A skill is a procedure loaded when relevant; a rule is a constraint present whether relevant or not. "How to write a Django migration" is a skill. "Never commit a hardcoded secret" is a rule.

### Skill vs agent

A skill runs in the current context and can edit the current work; an agent runs in a separate context and returns a report. Reach for an agent when the reading is large and the answer is small, or when the work needs a narrower tool set than the main session has.

### Agent vs subagent

Same thing. "Agent" is the definition file; "subagent" is that definition running as a delegated task.

### Rule vs hook

A rule asks the model to comply; a hook makes compliance unnecessary. If a violation must be impossible rather than discouraged, it is a hook. [`config-protection.js`](../scripts/hooks/config-protection.js) exists because asking a model not to weaken a lint config is weaker than refusing the write.

### Hook vs command

A hook is triggered by the harness on an event; a command is triggered by a person typing. A hook can block a tool call; a command cannot.

### Memory vs rule

Memory records what happened; a rule states what must hold. Promoting a memory into a rule is a deliberate review step, never automatic — the vault's create-only, unreviewed-by-default design enforces that gap.

### MCP server vs skill wrapping a CLI

MCP earns its cost when the job needs held-open session state, streaming, an auth handshake, or structured browsing. Stateless request/response work is a skill calling a CLI. That is the exact test in [MCP-CONNECTOR-POLICY.md](./MCP-CONNECTOR-POLICY.md), and it is why `gh` beat the GitHub MCP server in this repo.

## How they compose across one session

The primitives are layered by when they load, not by importance.

```text
session start
  |
  +-- SessionStart hooks fire            -> prior session summary, package manager detection
  +-- rules resident                     -> common/ always, language rules on matching paths
  +-- MCP tool schemas resident          -> cost paid up front, every turn
  |
user types /plan  ------------------------> command body enters the conversation
  |
model recognizes the task
  +-- skill description matches          -> SKILL.md body loads
  +-- delegation warranted               -> agent runs in its own context, returns a summary
  |
model calls Edit
  +-- PreToolUse hooks run               -> may warn, may block with exit 2
  +-- tool executes
  +-- PostToolUse hooks run              -> format, typecheck, observe
  |
each response
  +-- Stop hooks run                     -> quality gate, console.log audit, session summary
  |
context fills
  +-- PreCompact hook                    -> persist state before compaction
  |
session end
  +-- SessionEnd hook                    -> lifecycle marker and cleanup
  +-- instincts distilled from observations
```

Three consequences follow from that ordering.

**Resident cost is paid before any work happens.** Rules and MCP schemas are already in context when the first prompt arrives. Skills and agent bodies are not. This is the practical content of the FORGE claim "optimize the context window, persist everything else" — push what you can out of the resident layer and into the on-demand layer, then push the durable parts into memory rather than back into context.

**Hooks are the only reliable layer.** A skill can fail to trigger, an agent can be skipped, a rule can be reasoned around. A hook runs. Anything that must happen every single time belongs there, which is also why hooks that block need a much higher correctness bar than hooks that warn.

**Memory closes the loop.** Observations feed instincts; instincts can evolve into skills, commands, or agents; those become part of the next session's resident or on-demand layer. The `/evolve` and `/promote` commands are the manual gates on that path — nothing is promoted without a decision.

## Decision table: I want to, therefore I author a

| I want to | Author a | Why not the neighbor |
| --- | --- | --- |
| Teach a repeatable procedure the model should recognize on its own | Skill | A command would require the user to know its name |
| Give a procedure a name the user can type | Command shim over an existing skill | Duplicating the body in both places guarantees drift |
| Read a large area of the codebase and return a short verdict | Agent | A skill would spend the main context on the reading |
| Run the same work with a narrower tool set than the main session | Agent with a tight `tools` list | Skills inherit the session's tools |
| State a constraint that applies to every file of a language | Rule under the language directory with `paths` globs | A skill only applies when it triggers |
| State a constraint that applies to every project | Rule under `rules/common/` | Language directories are scoped by globs |
| Make a class of mistake impossible rather than discouraged | `PreToolUse` hook that exits 2 | Rules are advisory; the model can reason past them |
| Format, typecheck, or lint after every edit | `PostToolUse` hook | Asking the model to remember costs a reminder every turn |
| Carry state across a compaction boundary | `PreCompact` hook plus a memory write | In-context notes do not survive compaction |
| Carry a decision into next week's session | Memory vault entry (`forge memory save`) | Session summaries are lossy and get pruned |
| Capture a habit the model should acquire from observed behavior | Instinct, via continuous learning | Hand-writing a rule for every observed preference does not scale |
| Call an external stateless API as one step of a workflow | Skill that calls the CLI or REST endpoint directly | An MCP server would tax every session's context |
| Hold an interactive session against an external system (live browser debugging, auth handshake, streaming) | MCP server | A one-shot CLI cannot hold the session open |
| Change what loads at session start | Install module selection, then a `SessionStart` hook if behavior is needed | Editing resident text is the expensive lever |

When two rows fit, pick the one lower in the resident-cost order: skill before rule, rule before MCP server, and a CLI-wrapping skill before any new connector.

## Where to go next

- [SKILL-AUTHORING.md](./SKILL-AUTHORING.md) — descriptions that route, scoping, progressive disclosure, why skills fail to fire
- [AGENT-AUTHORING.md](./AGENT-AUTHORING.md) — frontmatter contract, model tiers, tool allowlists, prompt defense
- [HOOKS-GUIDE.md](./HOOKS-GUIDE.md) — lifecycle events, profiles, exit codes, performance budget
- [RULES-GUIDE.md](./RULES-GUIDE.md) — the two layers, path scoping, conflicts, context budget
- [MEMORY-GUIDE.md](./MEMORY-GUIDE.md) — sessions, instincts, the vault, secret hygiene, pruning
- [MCP-GUIDE.md](./MCP-GUIDE.md) — connector policy, health checks, untrusted output, schema cost
- [GLOSSARY.md](./GLOSSARY.md) — every term used above, defined once
- [capability-surface-selection.md](./capability-surface-selection.md) — the in-repo routing guide this page expands on
