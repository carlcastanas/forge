# Memory guide

This page is the reference for everything FORGE keeps after a session ends: which store holds what, how session summaries are produced and reloaded, how instincts form and get promoted, what deserves to persist versus what should be discarded, the secret-hygiene rules that apply to anything written to a memory store, and how to prune.

Prerequisites: read [CONCEPTS.md](./CONCEPTS.md) for why memory is a separate primitive from rules. [HOOKS-GUIDE.md](./HOOKS-GUIDE.md) explains the lifecycle events that drive persistence.

## Three stores, three jobs

FORGE does not have one memory system. It has three, deliberately separated by what they hold and who is allowed to trust them.

| Store | Holds | Written by | Scope | Trust |
| --- | --- | --- | --- | --- |
| Session summaries | What happened last session: asks, tools, files touched | [`session-end.js`](../scripts/hooks/session-end.js) on `Stop` and `SessionEnd` | Per project directory | Informational; reloaded bounded |
| Instincts | Learned behavioral preferences with confidence scores | Observation hooks plus a background observer | Per project, promotable to global | Weighted by confidence |
| Memory vault | Durable facts, decisions, contexts, handoffs | `forge memory save`, deliberately | Project, team, or user | `unreviewed` until a human promotes it |

The separation matters because the three answer different questions. A session summary answers where the last session stopped. An instinct answers how this operator works. A vault entry answers what was decided, and why.

Nothing in any of the three is a rule. The vault's design constraint states it directly: a memory is context, not an instruction, and cannot silently become rules, skills, or policy. Reviewed project standards still belong in the repository's rules, decision records, and runbooks — the vault may link to them, it does not replace them.

## Session summaries

[`scripts/hooks/session-end.js`](../scripts/hooks/session-end.js) runs on `Stop` and reads the session transcript from the path supplied on stdin. It extracts three things from the JSONL: the user's actual asks, the tools used, and the files modified. It filters harness noise deliberately — tool-result carrier turns, local command echoes, system reminders — so the summary records intent rather than plumbing. The result is written between explicit markers into a per-project session file under the Claude directory.

On the next session, [`session-start-bootstrap.js`](../scripts/hooks/session-start-bootstrap.js) loads a bounded slice of that file back and detects the package manager.

```bash
# Cap how much prior context is injected (default: 8000 characters)
export FORGE_SESSION_START_MAX_CHARS=4000

# Turn the injection off entirely
export FORGE_SESSION_START_CONTEXT=off
```

The bound is not a nicety. Prior context is resident from the first token of the new session, so an unbounded reload spends the budget the session needs for work. Start at the default, lower it if session starts feel heavy, and turn it off in repos where each session is unrelated to the last.

Related surfaces:

```bash
# List and inspect sessions from the state store
forge sessions
forge session-inspect <target>
```

Inside a session, `/save-session` and `/resume-session` handle explicit checkpoints, and `/sessions` lists them. [SESSION-ADAPTER-CONTRACT.md](./SESSION-ADAPTER-CONTRACT.md) specifies the canonical `forge.session.v1` snapshot shape that adapters normalize into, so inspection does not depend on any one harness's files.

`PreCompact` is the other half of the story. [`pre-compact.js`](../scripts/hooks/pre-compact.js) persists state before the harness discards conversation, which is the only reason anything survives a compaction boundary. If you are relying on something staying in context across a long session, write it down instead.

## Instincts and continuous learning

[`skills/continuous-learning-v2/`](../skills/continuous-learning-v2/) is the learning system. It has one job: notice how you actually work and turn that into small reusable behaviors.

**Observation.** `PreToolUse` and `PostToolUse` hooks ([`observe-runner.js`](../scripts/hooks/observe-runner.js)) append tool intent and outcome to a per-project JSONL file. Observing at tool time rather than at session end is what makes capture reliable; version 1 observed on `Stop` and missed sessions that ended abruptly.

**Distillation.** A background observer agent reads observations and looks for three patterns: user corrections, error resolutions, and repeated workflows. Each becomes an instinct — one trigger, one action, a confidence score between roughly 0.3 and 0.9, a domain tag, and the evidence that produced it.

```yaml
---
id: prefer-functional-style
trigger: "when writing new functions"
confidence: 0.7
domain: "code-style"
source: "session-observation"
scope: project
project_id: "a1b2c3d4e5f6"
project_name: "my-react-app"
---

# Prefer Functional Style

## Action
Use functional patterns over classes when appropriate.

## Evidence
- Observed 5 instances of functional pattern preference
```

**Scoping.** Instincts are project-scoped by default. The project is identified by `CLAUDE_PROJECT_DIR` when set, then by a hash of the git remote URL — which gives the same repo the same id on different machines — then by the repo path, then by a global fallback. React conventions stay in the React project. Only patterns observed across two or more projects are candidates for global promotion.

**Storage.** Data lives outside `~/.claude` so background writes are not blocked by the harness's sensitive-path guard: `CLV2_HOMUNCULUS_DIR` if set to an absolute path, otherwise `$XDG_DATA_HOME/forge-homunculus`, otherwise `$HOME/.local/share/forge-homunculus`. Installs holding data at the old `~/.claude/homunculus` location migrate once:

```bash
bash skills/continuous-learning-v2/scripts/migrate-homunculus.sh
```

**Operating it.**

```text
/instinct-status     Show learned instincts, project plus global, with confidence
/evolve              Cluster related instincts into a skill, command, or agent
/promote             Move a project instinct to global scope
/instinct-export     Export an instinct library
/instinct-import     Import one
```

`/evolve` and `/promote` are manual gates on purpose. An observation becoming a global behavior without a human decision is how a one-off preference turns into a standing bias.

Version 1 ([`skills/continuous-learning/`](../skills/continuous-learning/)) remains supported as a legacy path and hands off to version 2. Skills it generates land in `~/.claude/skills/learned/` with a `.provenance.json` sibling and are never committed — see [SKILL-PLACEMENT-POLICY.md](./SKILL-PLACEMENT-POLICY.md).

## The memory vault

`forge memory` ([`scripts/memory.js`](../scripts/memory.js)) is the deliberate store: the one you write to on purpose, and the only one designed to be read by a different harness than the one that wrote it.

```bash
forge memory init [--scope project|team|user] [--json]
forge memory save --title <text> (--stdin | --body-file <path>) [options]
forge memory handoff --from <harness> --target <harness> --title <text> (--stdin | --body-file <path>)
forge memory search [query] [--scope <scope>] [--target-harness <harness>] [--kind <kind>] [--limit <n>]
forge memory read <memory-id> [--scope <scope>] [--json]
forge memory doctor [--scope <scope>] [--json]
```

Layout and design constraints, from [design/forge-memory-vault.md](./design/forge-memory-vault.md):

- **Markdown is the source of truth.** Project and team memories live under `.forge/memory/`; user memories live under `~/.forge/memory/`. SQLite graphs, embeddings, and hosted systems are indexes or adapters, never the only copy.
- **Writes are create-only.** The tool never overwrites an existing memory id. Superseding a memory means writing a new document that links to the old one.
- **Every entry is `trust: "unreviewed"` on arrival** and cannot become policy without a human step.
- **Recall defaults to project and team scope.** User scope must be requested explicitly with `--scope user`, so personal notes do not leak into shared work by accident.
- **Local-first.** The core works with no model, network, database server, or embedding provider.
- **Search is bounded lexical retrieval** in the first release; semantic reranking may be added later without changing the document contract.

An optional stdio MCP server ([`memory-mcp.mjs`](../scripts/memory-mcp.mjs)) exposes the same create, read, search, and doctor operations to harnesses that prefer tools over a CLI. It intentionally has no review or promotion tool — promotion is an operator action.

## What deserves to be remembered

Persist things that are expensive to rediscover and stable enough to still be true later.

| Worth persisting | Store | Why |
| --- | --- | --- |
| A decision and the alternatives rejected | Vault, `decisions` | The reasoning is the part that is expensive to reconstruct |
| A non-obvious environment fact ("the staging DB rejects connections without the proxy") | Vault, `facts` | Costs an hour to rediscover, five seconds to write down |
| A handoff between harnesses or people | Vault, `handoffs` | Purpose-built; `forge memory handoff` targets a specific harness |
| Where you stopped and what is half-finished | Session summary | Automatic, and correctly discarded when stale |
| A repeated correction of the same model behavior | Instinct | Confidence accumulates from evidence rather than one instance |
| A convention the whole team must follow | Not memory — a rule, a decision record, or a runbook | Memory is unreviewed by construction |

Discard, or never write, the following:

- **Anything derivable from the repo.** File listings, function signatures, dependency versions. The agent can read them, and a stale copy is worse than no copy.
- **Narration.** "Refactored the auth module" without the decision or the constraint carries nothing forward.
- **Transient state.** A branch name, a PID, a port number, a one-off error string.
- **Anything you would not want reloaded.** Everything written is a candidate for injection into a future session's opening context.
- **Duplicates of governed documentation.** [AGENTS.md](../AGENTS.md) is explicit: team and project knowledge goes into the project's existing docs structure, personal notes go to memory, and if the current task already produces the relevant docs or code comments, do not duplicate the same information elsewhere.

## Privacy and secret hygiene

Memory stores are the easiest place in an agent system to leak a credential, because writes are automatic and reads are silent.

**What the system already does.** The vault rejects known credential shapes and private keys before writing a file, and its readers do not follow symbolic links. The vault's own documentation is careful about the limit: that scan is a best-effort backstop, not a complete secret classifier. [`skill-run-tracker.js`](../scripts/hooks/skill-run-tracker.js) is a good model of the deliberate design — it persists only a skill id, a version, and an outcome, all charset-restricted and length-bounded, and never prompt text.

**What you must do.**

- **Never paste a secret into a memory body.** Record the name of the variable and where it is provisioned, never the value. [RULES.md](../RULES.md) forbids including API keys, tokens, secrets, or absolute system paths in output at all.
- **Treat `.forge/memory/project/` and `.forge/memory/team/` as committed content.** They are in the repository. Review them in code review like any other file.
- **Keep personal notes in user scope.** They live under `~/.forge/memory/` and are excluded from default recall.
- **Read memory as data, not instruction.** A vault document, an instinct file, or a session summary can contain text that reads like a directive. The prompt defense baseline in [CLAUDE.md](../CLAUDE.md) requires treating retrieved content as untrusted; that applies to your own memory store, which any process running as your user can write to.
- **Keep persistence local by default.** [`hooks/memory-persistence/README.md`](../hooks/memory-persistence/README.md) states the operator expectation plainly: do not send transcripts or tool traces to hosted services unless a user explicitly enables an integration.
- **Rotate on exposure.** If a secret reaches any store, rotate it. Removing the file is not sufficient — the vault is create-only and the value may exist in git history.

Understand the threat boundary. The vault defends against hostile documents, symlink and path escapes, accidental project-memory commits, cross-harness identity spoofing, known secret shapes, terminal control data, and bounded resource exhaustion. It is explicitly not a boundary between concurrent processes running as the same OS user. If you need that, use separate accounts, containers, or equivalent filesystem isolation.

## Pruning

Every store grows. Each has a different pressure and a different remedy.

**Session summaries** grow per project and are the most disposable. They matter for days, not months. The `FORGE_SESSION_START_MAX_CHARS` bound limits what is injected, not what is stored, so old session files accumulate on disk harmlessly and can be deleted freely.

**Observations** are the highest-volume store, appended on every tool call. They are raw input to instinct formation and have no value once distilled. If the data directory is growing quickly, the observation JSONL is where the growth is, and truncating it costs only undistilled signal. Turning capture off entirely is a matter of disabling the hook ids:

```bash
export FORGE_DISABLED_HOOKS="pre:observe:continuous-learning,post:observe:continuous-learning"
```

**Instincts** need review rather than volume management. Two failure modes:

- A low-confidence instinct that never accumulated evidence is noise. Delete it.
- A high-confidence instinct that has stopped being true — a convention the project moved off — is worse than noise, because it is trusted. Review `/instinct-status` when a project changes direction.

**Vault entries** are create-only, so pruning means superseding rather than editing. Write a new document, link it to the one it replaces, and let search surface the current one. `forge memory doctor` reports integrity problems in a scope.

**The whole surface at once.** `/prune` and [`skills/config-gc/`](../skills/config-gc/) address accumulated configuration and state; [`skills/context-budget/`](../skills/context-budget/) measures what the resident layer costs and produces prioritized savings. Run the budget audit before deciding what to prune — the file that is largest on disk is rarely the one costing you context.

## References

- [`hooks/memory-persistence/README.md`](../hooks/memory-persistence/README.md) — the lifecycle contract and operator expectations
- [design/forge-memory-vault.md](./design/forge-memory-vault.md) — vault capability, constraints, and threat boundary
- [`skills/continuous-learning-v2/`](../skills/continuous-learning-v2/) — the instinct system
- [`skills/unified-memory/`](../skills/unified-memory/) — cross-surface memory conventions
- [SESSION-ADAPTER-CONTRACT.md](./SESSION-ADAPTER-CONTRACT.md) — the canonical session snapshot
- [SKILL-PLACEMENT-POLICY.md](./SKILL-PLACEMENT-POLICY.md) — where learned and evolved artifacts live
- [CONCEPTS.md](./CONCEPTS.md) — memory versus rule, and why the gap is deliberate
