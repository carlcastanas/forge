# FAQ

Questions that come up in the first week, answered short and answered honestly. Where a claim could not be verified against the repository, the answer says so. Each answer points at the page that goes deeper.

Prerequisites: none. If you have not installed anything yet, start at [INSTALLATION.md](INSTALLATION.md).

## Install and setup

### What is FORGE, in one sentence?

An engineering process installed into a coding agent: plan, test, implement, review, verify, remember, improve — delivered as skills, agents, command shims, rules, lifecycle hooks, and a memory vault. See [CONCEPTS.md](CONCEPTS.md).

### Do I need Claude Code?

No. Claude Code is the reference harness and the most complete one, but there are install targets for Codex, Cursor, OpenCode, Gemini CLI, Zed, Qwen Code, Antigravity, Kimi Code, CodeBuddy, JoyCode, Hermes, OpenClaw, and AdaL, plus separate installers for Kiro and Trae. Support varies a lot. Check [HARNESS-MATRIX.md](HARNESS-MATRIX.md) before committing.

### What are the prerequisites?

Node 18 or newer. Git on `PATH` if you use the Claude plugin path. The `claude` CLI if you use `forge setup`. That is all. Details in [INSTALLATION.md](INSTALLATION.md).

### npm package or Claude Code plugin — which should I use?

The plugin if you are on Claude Code and want the harness to manage updates. The npm package if you want file installs, multi-harness support, or the `forge` CLI for planning, doctoring, and memory. You can have the npm package installed and use the plugin path for content; what you must not do is install content twice into the same harness. See [INSTALLATION.md](INSTALLATION.md#pick-one-path-not-two).

### What happens if I install two ways into the same harness?

Duplicated slash commands, hooks that fire twice, and `forge doctor` reporting drift it cannot repair, because the plugin cache is not tracked in install-state. Uninstall both and reinstall through one channel.

### Can I install only part of it?

Yes, and you should. Use a profile (`--profile minimal` through `--profile full`), explicit modules, or individual skills. `forge plan --profile <name> --target <target>` shows exactly what would land before anything is written. See [CONFIGURATION.md](CONFIGURATION.md#selective-and-capability-surface-install).

### How do I see what an install will do before it does it?

```bash
forge install --target claude --profile developer --dry-run
```

Every planned `source -> destination` pair is printed. Add `--json` for machine output.

### Where does everything go?

Depends on the target. `~/.claude` or `./.claude` for Claude Code, `./.cursor` for Cursor, `~/.codex` for Codex, and so on — the full table is in [INSTALLATION.md](INSTALLATION.md#what-each-target-writes-and-where). Every install also writes an install-state file recording exactly what it touched.

### How do I uninstall cleanly?

`forge uninstall --dry-run` first, then without the flag. It removes only what install-state recorded. The plugin path is removed through Claude Code itself with `claude plugin uninstall forge@forge --scope <scope>`. Leftovers like the state database and memory vaults are listed in [INSTALLATION.md](INSTALLATION.md#leftovers).

### How do I update?

`forge auto-update` pulls the latest changes and reinstalls your managed targets using the original request, so your profile and component choices survive. On the plugin path, re-run `forge setup`.

### Something is broken. What do I run first?

```bash
forge doctor
forge list-installed
forge status
```

In that order. `doctor` finds drift, `list-installed` shows what FORGE thinks it owns, `status` reports readiness from the state store. Then [../TROUBLESHOOTING.md](../TROUBLESHOOTING.md).

## Day-to-day use

### How do I actually start using it after install?

Open your harness and describe the task. FORGE works by making the right guidance load at the right moment, not by requiring you to invoke it. When you want an explicit workflow, use a command shim — `/plan`, `/feature-dev`, `/code-review`, `/security-scan`. See [RECIPES.md](RECIPES.md) for task-shaped sequences.

### Do I have to memorize the commands?

No. `forge consult "<what you are doing>"` recommends components. Inside the harness, [../COMMANDS-QUICK-REF.md](../COMMANDS-QUICK-REF.md) is the lookup table. Most work needs a handful: plan, implement, review, verify.

### What is the difference between a skill, an agent, a command, a rule, and a hook?

Rules are always-on constraints injected on a path or event match. Skills are on-demand playbooks that load when relevant. Agents are sub-sessions with their own tool allowlist and model. Commands are thin shims that invoke a skill. Hooks are deterministic code the harness runs at lifecycle events. Full treatment in [CONCEPTS.md](CONCEPTS.md); the routing decision is in [capability-surface-selection.md](capability-surface-selection.md).

### Why is my context window filling up so fast?

Usually rules. Rules are injected wholesale on every match, so their length is a direct, recurring context cost. Skills only cost when they load. Check what is loading, trim rules, and read [CONTEXT-ENGINEERING.md](CONTEXT-ENGINEERING.md). The `context-budget` and `token-budget-advisor` skills exist for exactly this.

### Does FORGE work offline?

The content does — skills, agents, rules, and commands are files on disk. Hooks are local Node scripts. What needs network: the model itself, MCP servers you configure, and `forge auto-update`. The Plan Canvas Mermaid asset can be pointed at a local mirror with `FORGE_PLAN_CANVAS_MERMAID_URL`.

### Can I run FORGE in two harnesses on the same machine?

Yes. Set `FORGE_AGENT_DATA_HOME` to a distinct path per harness so their session, metrics, and learned-skill data do not collide. If you also run the memory MCP server in both, give each a distinct `FORGE_MEMORY_HARNESS` identity and one process each. See [CONFIGURATION.md](CONFIGURATION.md#roots-state-and-identity).

### What does the memory vault actually store?

Titled, kinded, tagged notes: context, decisions, facts, handoffs, lessons, preferences, runbooks. Three scopes — `project`, `team`, `user`. Default recall is `project` and `team`; user scope must be asked for explicitly. Writes are create-only and reject known credential shapes. See [MEMORY-GUIDE.md](MEMORY-GUIDE.md).

### Is memory shared between harnesses?

Yes, that is the point. `forge memory handoff --from codex --target claude` writes a memory addressed to another harness; the other side finds it with `forge memory search --target-harness claude`. All harnesses must resolve the same vault root — the same working directory, or matching `FORGE_MEMORY_PROJECT_ROOT`.

### How do I turn off a hook that is annoying me?

```bash
FORGE_DISABLED_HOOKS=pre:bash:tmux-reminder claude
```

Or drop to a lighter profile with `FORGE_HOOK_PROFILE=minimal`, or turn the runtime off entirely with `FORGE_HOOKS_ENABLED=false`. Hook IDs and their profiles are tabulated in [CONFIGURATION.md](CONFIGURATION.md#hook-profiles).

### What is the difference between the hook profiles?

`minimal` runs telemetry and the hard safety floor. `standard` adds quality gates, governance capture, context monitoring, and continuous-learning observation. `strict` adds workflow policing: auto-tmux for dev servers, tmux reminders, git-push reminders. Default is `standard`.

## Skills and agents

### How many skills are there?

Run `ls -d skills/*/ | wc -l` in the checkout. The number moves between releases, so treat any figure in prose as stale. Same for `ls agents/*.md | wc -l` and `find commands -name '*.md' | wc -l`.

### Should I install all of them?

No. Installing everything is the most common way to make FORGE worse rather than better — more surface to match against, more chance of the wrong playbook loading. Start with `--profile developer` and add capability components when a real task needs them. See [ANTI-PATTERNS.md](ANTI-PATTERNS.md#skill-sprawl).

### How does the model know which skill to load?

Through the skill's `description` frontmatter and its "when to use" section. A vague description means the skill either never loads or loads constantly. This is why skill authoring has a contract. See [SKILL-AUTHORING.md](SKILL-AUTHORING.md).

### How do I write my own skill?

`/skill-create` scaffolds one. The requirements: a directory under `skills/<name>/` with `SKILL.md`, frontmatter with `name`, `description`, and `origin`, and a body with a "when to use" section, concrete mechanics, and examples that were actually run. Full contract in [SKILL-AUTHORING.md](SKILL-AUTHORING.md).

### Where should my own skills live?

Not in the FORGE catalog. Generated and user-imported skills belong in your own skills directory. The policy is in [SKILL-PLACEMENT-POLICY.md](SKILL-PLACEMENT-POLICY.md).

### Should this be a skill or a rule?

If it must apply every time a path or event matches, with no model judgment, it is a rule. If it is a playbook that should load only when relevant, it is a skill. If it needs a structured tool interface across sessions, it is MCP. If it is a deterministic local action, it is a script. The full decision order is in [capability-surface-selection.md](capability-surface-selection.md).

### What is an agent for, if a skill can already carry the playbook?

Isolation. An agent gets its own context window, its own tool allowlist, and its own model. Use one when you want a bounded sub-task done without polluting the main session, or when you want to hard-limit what tools are available. A read-only reviewer with `Read, Grep, Glob` cannot write to your repository even if it decides it should. See [AGENT-AUTHORING.md](AGENT-AUTHORING.md).

### Which agent handles which language?

Routing is by file extension: TypeScript and JavaScript to `typescript-reviewer`, React to `react-reviewer`, Python to `python-reviewer`, Go to `go-reviewer`, Rust to `rust-reviewer`, and so on, with a matching `*-build-resolver` for build failures. The complete table is in [../AGENTS.md](../AGENTS.md).

### Can agents call other agents?

Orchestration patterns, including multi-agent waves and handoffs, are covered in [ORCHESTRATION-PATTERNS.md](ORCHESTRATION-PATTERNS.md) and [../guides/the-orchestration-guide.md](../guides/the-orchestration-guide.md). Before reaching for it, read [ANTI-PATTERNS.md](ANTI-PATTERNS.md#over-orchestration) — most tasks do not need it.

## Cost

### Does FORGE make my sessions more expensive?

It changes the shape of the spend. Rules and injected context cost tokens on every turn. Skills cost only when they load. Sub-agents cost a separate context window each. Hooks cost nothing in tokens but cost wall-clock time. The net effect depends far more on your profile choice than on FORGE itself.

### How do I see what a session cost?

`/cost-report` inside the harness. The `stop:cost-tracker` hook records token and cost metrics per session, and the context monitor emits cost warnings unless you set `FORGE_CONTEXT_MONITOR_COST_WARNINGS` to a falsy value. See [COST-AND-MODEL-ROUTING.md](COST-AND-MODEL-ROUTING.md).

### What is the cheapest useful configuration?

`--profile minimal` with `FORGE_HOOK_PROFILE=minimal`. That gives you rules, agents, commands, platform configs, and workflow support with no hook runtime and no continuous-learning observation.

### Can I route cheap work to a cheap model?

Yes. Agent definitions carry a `model` field (`haiku`, `sonnet`, or `opus`), and the repository convention is that anything above `sonnet` must be justified. The observer loop and session summarizer both default to `haiku` and are overridable with `FORGE_OBSERVER_MODEL` and `FORGE_LLM_SUMMARY_MODEL`. See [COST-AND-MODEL-ROUTING.md](COST-AND-MODEL-ROUTING.md).

### Does the continuous-learning observer cost money?

Yes — it invokes a model. It defaults to `haiku` with a 120-second timeout, a 60-second cooldown between analyses, and a 500-line cap on the transcript slice. Turn it off with `FORGE_SKIP_OBSERVE=1` or by running the `minimal` hook profile.

## Security

### Does FORGE send my code anywhere?

Not on its own. `forge feedback` explicitly uploads no diagnostics and reads no project files. What does leave your machine is whatever your model provider and any MCP servers you configure receive. FORGE does not add a telemetry channel.

### What is Forge Shield?

The security scanner, distributed as the separate `forge-shield` package and invoked from the harness with `/security-scan`. It scans agent, hook, MCP, permission, and secret surfaces — that is, it treats the harness configuration itself as an attack surface.

### What is the threat model?

Prompt injection through fetched pages, MCP responses, issue bodies, package metadata, and third-party file content; homoglyph and zero-width character attacks; supply-chain compromise of dependencies and AI-tool persistence paths. Every agent definition carries a prompt-defense baseline block. Full treatment in [THREAT-MODEL.md](THREAT-MODEL.md) and [../guides/the-security-guide.md](../guides/the-security-guide.md).

### Can a skill or agent run arbitrary commands?

An agent can run whatever its `tools` allowlist permits. The convention is minimum grant: a reviewer gets `Read, Grep, Glob` and nothing more. If you write your own agents, hold that line — see [ANTI-PATTERNS.md](ANTI-PATTERNS.md#agents-with-unrestricted-tools).

### What does GateGuard do?

It is a fact-forcing gate. On the first Edit, Write, or MultiEdit against a file, and on destructive Bash and PowerShell commands, it blocks and demands investigation first. Disable it with `FORGE_GATEGUARD=off`, or narrow it with `GATEGUARD_BASH_ROUTINE_DISABLED=1`, which keeps destructive-command checks active.

### Are memories trusted input?

No. Tool-created memories are always unreviewed context, never executable policy. The vault rejects known credential shapes on write and is create-only. Read memory content as data.

### How do I scan for supply-chain compromise?

```bash
forge security-ioc-scan --home
```

Scans dependency manifests, lockfiles, installed package payloads, and user-level AI-tool persistence paths — Claude, VS Code, LaunchAgents, systemd, local bin, `/tmp`.

### Should I commit FORGE configuration to my repository?

Project-scope install and `forge-install.json` are meant to be committed so collaborators get the same setup. Local scope exists for the opposite case. Do not commit `.env`, and note that the repository's own validators reject absolute home-directory paths in tracked files.

## Teams

### Can a team share one configuration?

Yes. Install at project scope, commit `forge-install.json`, and everyone resolves the same profile and component set. Details in [TEAM-ADOPTION.md](TEAM-ADOPTION.md).

### Shared skills or personal skills?

Both, deliberately separated. Shared skills encode team decisions and go in the repository. Personal skills encode individual workflow and stay in your own skills directory. Mixing them is how a team ends up reviewing someone's shell aliases. See [TEAM-ADOPTION.md](TEAM-ADOPTION.md#shared-versus-personal-skills).

### How should code review change when an agent wrote the code?

The diff still needs a human owner, and the reviewer's job shifts from "is this correct" to "is this correct and did anyone verify it ran." Agent-written tests that were never executed are the single most common failure. See [ANTI-PATTERNS.md](ANTI-PATTERNS.md#unverified-generated-tests) and [TEAM-ADOPTION.md](TEAM-ADOPTION.md#code-review-when-agents-write-code).

### Can FORGE run in CI?

Parts of it. `forge status --exit-code`, `forge loop-status --exit-code`, and `forge platform-audit --exit-code` all return 2 when attention is needed, which makes them usable as gates. `forge doctor --json` catches configuration drift. Running the model itself in CI is a separate decision. See [TEAM-ADOPTION.md](TEAM-ADOPTION.md#ci-integration).

### How do we know whether it helped?

Pick the measure before the pilot, not after. Review-cycle time, escaped defects, and time-to-first-PR on an unfamiliar repository are all measurable. Vibes are not. See [TEAM-ADOPTION.md](TEAM-ADOPTION.md#measuring-whether-it-helped) and [EVALUATION-GUIDE.md](EVALUATION-GUIDE.md).

### What usually goes wrong when a team adopts this?

Mandating it before anyone has piloted it, letting the shared rule set grow without a pruning owner, and treating review output as authoritative. All three are covered in [TEAM-ADOPTION.md](TEAM-ADOPTION.md#organizational-failure-modes).

## Troubleshooting

### Hooks are not firing.

Check three things in order: are hooks enabled at all (`FORGE_HOOKS_ENABLED`, the plugin option, or the managed config), is the hook's ID in `FORGE_DISABLED_HOOKS`, and does the hook's profile list include your active profile. The precedence chain is in [CONFIGURATION.md](CONFIGURATION.md#precedence).

### A slash command appears twice.

Two install paths are stacked on one harness. Run `forge list-installed` and `claude plugin list`, then remove one.

### `forge doctor` reports drift I did not cause.

Either something outside FORGE edited a managed file, or an update changed the source. `forge repair --dry-run` shows what it would rebuild.

### `forge` says `Unknown command`.

The first argument is neither a registered command nor a known legacy language name. Run `forge --help`. Command availability changes between releases.

### `MODULE_NOT_FOUND` when running a subcommand.

You are running from a git clone without dependencies installed. Run `npm install` in the checkout. Both `install.sh` and `install.ps1` do this for you when `node_modules` is missing.

### The OpenCode install refuses to run.

It requires the compiled plugin payload under `.opencode/dist`. Run `npm run build:opencode` from the repository root first. The error message names the exact missing artifacts.

### `forge setup` refuses with a marketplace collision.

A marketplace named `forge` exists that does not point at the official repository. FORGE refuses to overwrite it rather than silently redirecting you. Inspect with `claude plugin marketplace list`.

### The agent keeps ignoring a rule I wrote.

Rules are injected, not enforced. If it must be enforced, it is a hook, not a rule. If it is guidance the model should weigh, the rule is probably too long or too abstract to survive the context. See [RULES-GUIDE.md](RULES-GUIDE.md) and [HOOKS-GUIDE.md](HOOKS-GUIDE.md).

### Sessions are slow to start.

SessionStart injects previous context and instincts. Cap it with `FORGE_SESSION_START_MAX_CHARS`, reduce injected instincts with `FORGE_MAX_INJECTED_INSTINCTS`, or disable injection entirely with `FORGE_SESSION_START_CONTEXT=0`.

### An MCP tool call is being blocked.

The MCP health check marks unhealthy servers and blocks calls to them. Inspect the health state, or set `FORGE_MCP_HEALTH_FAIL_OPEN=1` if you would rather let calls through when the check itself cannot run. Reconnect commands can be registered per server. See [MCP-GUIDE.md](MCP-GUIDE.md).

### How do I report a problem?

`forge feedback` prints the current routes. It uploads nothing — redact anything sensitive before posting publicly.

## Related pages

- [INSTALLATION.md](INSTALLATION.md) · [CONFIGURATION.md](CONFIGURATION.md) · [CLI-REFERENCE.md](CLI-REFERENCE.md)
- [CONCEPTS.md](CONCEPTS.md) · [GLOSSARY.md](GLOSSARY.md)
- [ANTI-PATTERNS.md](ANTI-PATTERNS.md) · [RECIPES.md](RECIPES.md) · [TEAM-ADOPTION.md](TEAM-ADOPTION.md)
- [../TROUBLESHOOTING.md](../TROUBLESHOOTING.md) · [../guides/getting-started.md](../guides/getting-started.md)
