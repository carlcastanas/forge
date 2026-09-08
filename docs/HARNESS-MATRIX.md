# Harness matrix

What FORGE actually delivers to each coding agent it has an adapter for. The support levels here were derived by resolving the `full` install profile against each target and reading the adapter definitions, not from marketing copy. Where the repository does not establish a fact, this page says "unverified" rather than guessing.

Prerequisites:

- You know which harness you are evaluating.
- Install paths and destinations are in [INSTALLATION.md](INSTALLATION.md).

## How to read this

| Mark | Meaning |
|---|---|
| Full | The surface installs and the harness consumes it natively |
| Partial | Some of the surface installs, or it installs but the harness needs manual wiring |
| None | The surface does not install for this target |
| N-A | The harness has no such concept |
| unverified | The repository does not establish the answer — confirm against your installed version |

Three separate lists of harnesses exist in this repository and they do not agree:

1. `SUPPORTED_INSTALL_TARGETS` in `scripts/lib/install-manifests.js` — 15 install targets.
2. `HARNESS_CAPABILITIES` in `scripts/lib/harness-capabilities.js` — 14 harnesses, validated against the target list at module load.
3. `ADAPTER_RECORDS` in `scripts/lib/harness-adapter-compliance.js` — 12 compliance entries, including reference-only harnesses that have no installer.

Two more harnesses ship their own shell installers and appear in none of the three lists: Kiro and Trae. Copilot has instruction and prompt files but no installer at all. This page covers everything present in the repository.

## Support matrix

Rows are ordered by how completely FORGE reaches them.

| Harness | Skills | Agents | Commands | Hooks | Rules | Memory | MCP |
|---|---|---|---|---|---|---|---|
| Claude Code | Full | Full | Full | Full | Full | Full | Partial |
| Cursor | Full | Full | Full | Full | Full | Full | Full |
| CodeBuddy | Full | Full | Full | Full | Full | Full | Partial |
| JoyCode | Full | Full | Full | None | Full | Full | Partial |
| Zed | Full | Full | Full | None | Full | Full | Partial |
| Qwen Code | Full | Full | Full | None | Full | Full | Partial |
| Antigravity | Full | Full | Full | None | Full | Full | Partial |
| Codex | Full | Full | None | Partial | None | Full | Full |
| OpenCode | Full | Full | Full | Partial | None | Full | Partial |
| Kimi Code | Partial | Full | Full | None | Full | Full | Full |
| Hermes | Partial | Full | Full | None | Full | Full | Partial |
| OpenClaw | Partial | Full | Full | None | Full | Full | Partial |
| AdaL CLI | Partial | Full | Full | None | Full | Full | Partial |
| Gemini CLI | Partial | None | None | None | None | Full | Partial |
| Kiro | Partial | Full | None | Partial | Full | None | Partial |
| Trae | Full | Full | Full | None | Full | unverified | None |
| Pi | Full | unverified | Full | Partial | Partial | unverified | N-A |
| Copilot | None | None | Partial | None | Partial | None | None |
| Terminal-only | Full | Full | Full | N-A | Full | Full | N-A |
| dmux | N-A | N-A | N-A | N-A | N-A | unverified | unverified |
| Orca | unverified | unverified | unverified | unverified | unverified | unverified | unverified |
| Superset | unverified | unverified | unverified | unverified | unverified | unverified | unverified |
| Ghast | unverified | unverified | unverified | unverified | unverified | unverified | unverified |

Two columns deserve a caveat before the per-harness notes.

**Memory.** Every install target that resolves the `full` profile receives `skills/unified-memory`. The vault itself is harness-independent: `forge memory` is a CLI in the npm package and `forge-memory-mcp` is a standalone stdio MCP server. Any harness that can run a subprocess can use the vault. What differs per harness is whether FORGE registers the MCP server for you — it does not, anywhere. `mcpServers` in `.claude-plugin/plugin.json` is empty, and the `forge-memory-vault` entry in `mcp-configs/mcp-servers.json` must be copied into your harness config by hand. Run one server process per harness with a distinct `FORGE_MEMORY_HARNESS` value.

**MCP.** `platform-configs` installs `mcp-configs/` for every target, so the templates always arrive. "Full" in that column means the adapter also merges a live MCP config into the harness's own file. Only Cursor and Kimi Code do that, plus Codex, whose `config.toml` carries `mcp_servers` entries directly. Everywhere else, MCP is a template you wire up yourself.

## Install targets and destinations

| Harness | Target ID | Destination | Channel | Guided |
|---|---|---|---|---|
| Claude Code | `claude`, `claude-project` | `~/.claude` or `./.claude` | native plugin | yes |
| Codex | `codex` | `~/.codex` | native plugin | yes |
| Kimi Code | `kimi` | `./.kimi-code` | managed project | yes |
| Cursor | `cursor` | `./.cursor` | managed project | no |
| Antigravity | `antigravity` | `./.agents` | managed project | no |
| Gemini CLI | `gemini` | `./.gemini` | managed project | no |
| CodeBuddy | `codebuddy` | `./.codebuddy` | managed project | no |
| JoyCode | `joycode` | `./.joycode` | managed project | no |
| Zed | `zed` | `./.zed` | managed project | no |
| AdaL CLI | `adal` | `./.adal` | managed project | no |
| OpenCode | `opencode` | `$OPENCODE_CONFIG_DIR`, else `$XDG_CONFIG_HOME/opencode`, else `~/.config/opencode` | managed home | no |
| Qwen Code | `qwen` | `~/.qwen` | managed home | no |
| Hermes | `hermes` | `~/.hermes` | managed home | no |
| OpenClaw | `openclaw` | `~/.openclaw` | managed home | no |
| Kiro | none | `./.kiro` or `~/.kiro` | own installer | no |
| Trae | none | `./.trae` / `.trae-cn`, or the home equivalent | own installer | no |
| Pi | none | reads the checkout in place | adapter loaded by Pi | no |
| Copilot | none | `.github/`, `.vscode/` in the repository | committed files | no |

Only Claude Code, Codex, and Kimi Code are guided-ready. Everything else needs an explicit `forge install --target <id>`.

## Committed adapter directories

What a harness receives at install time and what this repository commits for it are two different things. This table is the second one: every harness-shaped directory that exists in the checkout, and what is actually inside it. A directory holding only a README projects nothing on its own — it documents where the installer writes.

| Directory | What it holds | Projects |
|---|---|---|
| `.claude-plugin/` | `plugin.json`, `marketplace.json`, schema notes, README | Skills and commands by reference (`./skills/`, `./commands/`); `mcpServers` is declared empty |
| `.claude/` | 3 commands, 2 rules, repository-local state and workflow files | Commands, rules. No committed skills, agents, or hooks — those install from the repository root |
| `.codex/` | `AGENTS.md`, `config.toml`, 3 agent TOML files | Agents, MCP (6 servers in `config.toml`), instructions |
| `.codex-plugin/` | `plugin.json`, README | Skills, MCP, and hooks by reference to `./skills/`, `./.mcp.json`, `./hooks/codex-hooks.json` |
| `.cursor/` | 11 skills, 39 rules, 17 hook scripts (16 registered), shared scripts | Skills, rules, hooks. Agents and `mcp.json` are written at install time, not committed |
| `.gemini/` | `GEMINI.md` | Instructions only |
| `.opencode/` | `opencode.json`, 35 commands, 25 agent prompts, 9 tools, `forge-hooks.ts`, `dist/` | Commands, agents, hooks, tools; skills by reference to `../skills` |
| `.zed/` | `settings.json` | Tool-permission posture only, no content |
| `.qwen/` | `QWEN.md` | Documentation only |
| `.kiro/` | 43 skills, 33 agents, 13 hooks, 22 steering docs, own installer | Skills, agents, hooks, rules-as-steering, MCP example |
| `.trae/` | `install.sh`, `uninstall.sh`, READMEs | Nothing itself; its installer copies `commands`, `agents`, `skills`, `rules` from the repository root |
| `.hermes/` | README | Nothing |
| `.kimi/` | README | Nothing; the real install root is `./.kimi-code/` |
| `.pi/` | `extensions/index.ts`, `extensions/hook-runtime.js`, README | Session-lifecycle hooks; skills, commands, and rules by reference through the `pi` key in `package.json` |
| `.adal/` | README | Nothing |
| `.openclaw/` | README | Nothing |
| `.agents/` | 39 skills each with `SKILL.md` and `agents/openai.yaml`, `plugins/marketplace.json` | Skills, plugin marketplace metadata. Codex-facing packaging, and also the Antigravity install destination — see the Antigravity note below |
| `.vscode/` | `settings.json` | Copilot instruction wiring only |
| `.codebuddy/` | `install.sh`, `install.js`, `uninstall.sh`, `uninstall.js`, READMEs | Nothing itself; its installer copies `commands`, `agents`, `skills`, `rules` from the repository root |

Two more directories are adapter-adjacent rather than adapters:

- `scaffolds/` holds Cursor scaffolding only: `scaffolds/cursor/forge-agent-data.json`, `scaffolds/cursor/hooks.json`, and `scaffolds/cursor/rules/forge-agent-data-home.mdc`. Note that `scaffolds/cursor/hooks.json` is a one-hook file that points at `.cursor/scripts/hooks/cursor-session-env.js`, which is not in the checkout, and it is not the same file as the 16-hook `.cursor/hooks.json`. Treat it as a scaffold template, not as the live registration.
- `plugins/` holds `plugins/README.md` and `plugins/forge/`, a legacy Codex thin-plugin artifact whose `plugin.json` points at `../../skills/` and `../../.mcp.json`.

Neither is a harness in its own right, and neither appears in any of the three harness lists.

## Hook posture

`hooks-runtime` resolves for five targets only: `claude`, `claude-project`, `cursor`, `opencode`, and `codebuddy`. The capability catalog records a hook mode per harness independently of that.

| Harness | Hook mode | FORGE-configured | Note |
|---|---|---|---|
| Claude Code | `profile-selection` | yes | Configured through the off / minimal / standard / strict profile |
| Codex | `native-trust` | yes | Uses Codex native plugin discovery; remains subject to Codex review and trust |
| Cursor | `adapter-configured` | yes | Uses the Cursor project adapter and Cursor's own event names |
| CodeBuddy | `managed-files` | yes | Hook runtime files installed through the project adapter |
| OpenCode | `adapter-opt-in` | no | Runtime support exists in the adapter but is not installed by default |
| Kimi Code, Antigravity, Gemini, JoyCode, Qwen, Zed, AdaL, Hermes, OpenClaw | `not-configured` | no | No FORGE hooks are configured by these adapters |

One inconsistency worth knowing: `hooks-runtime` does not resolve for the `codex` target, yet `.codex-plugin/plugin.json` references `hooks/codex-hooks.json` and the capability catalog marks Codex hooks as configured. Treat Codex hook enforcement as instruction text plus sandbox settings until you have confirmed otherwise on your version. The Codex navigation guide states the same thing plainly: do not assume Codex hook parity with Claude Code.

## Per-harness notes

### Claude Code

The reference implementation. Everything installs, and the plugin path is managed by the harness itself. Hooks register through `hooks/hooks.json` across `PreToolUse`, `PreCompact`, `SessionStart`, `PostToolUse`, `PostToolUseFailure`, `Stop`, and `SessionEnd`. Rules land under `<root>/rules/forge`, skills land flat under `<root>/skills/`.

The row above describes what the installer delivers, not what is committed here. The committed `.claude/` directory in this repository is small on purpose — three commands, two rules, and repository-local state files. It holds no `skills/`, `agents/`, or `hooks/` tree; those arrive at install time from the canonical `skills/`, `agents/`, and `hooks/` directories at the repository root.

Missing: nothing structural. The MCP column is Partial only because `plugin.json` declares no servers — you supply your own.

### Cursor

The most complete non-Claude adapter, and the only one besides Codex and Kimi with live MCP wiring. `.cursor/hooks/` holds 17 JavaScript files, 16 of which `.cursor/hooks.json` registers as commands across 15 events: session start and end, shell execution before and after, file edits, MCP execution before and after, file reads, prompt submission, subagent start and stop, tab reads and edits, pre-compact, and stop (`beforeShellExecution` registers two commands, which is why 16 commands cover 15 events). The seventeenth file, `.cursor/hooks/adapter.js`, is a shared library the others require and is not registered as a hook. Rules are flattened into `.cursor/rules/` (39 committed files) and renamed `.md` to `.mdc`. `.cursor/skills/` carries 11 project-local skill directories. Agents are flattened into `.cursor/agents/` with Cursor-safe filenames at install time. The root `.mcp.json` is merged into `.cursor/mcp.json`.

Missing: `AGENTS.md` is deliberately skipped, because Cursor treats a nested `AGENTS.md` as directory context. If you run FORGE in Cursor alongside Claude Code, set `FORGE_AGENT_DATA_HOME` to a separate root.

### CodeBuddy

Full content install plus the hook runtime, delivered as managed files under `./.codebuddy/`. Rules are flattened into `<root>/rules/`. Ships its own `install.sh` / `install.js` and `uninstall.sh` / `uninstall.js` in addition to `forge install --target codebuddy`.

Missing: no live MCP merge.

### JoyCode

Same shape as CodeBuddy minus the hook runtime. Commands, agents, skills, and flattened rules under `./.joycode/`.

Missing: hooks, live MCP merge.

### Zed

Commands, agents, skills, and flattened rules under `./.zed/`, plus project settings. The committed `.zed/settings.json` is a security posture rather than content: `agent.tool_permissions` defaults to `confirm`, with `always_deny` patterns for `rm -rf /` and reads of `.env`, `.pem`, and `.key` files, `always_confirm` for `sudo`, package installs, and `gh` subcommands, and an `edit_file.always_deny` list covering `.env`, `.pem`, `.key`, `.p12`, and `.pfx`.

Missing: hooks, live MCP merge.

### Qwen Code

Commands, agents, skills, rules, and Qwen config into `~/.qwen/`. Rule directory structure is preserved rather than flattened. The Qwen guide is explicit that the scope is deliberately narrow: it avoids unverified hook-runtime claims until Qwen's hook and event contract is confirmed.

Missing: hooks (by design, pending contract confirmation), live MCP merge.

### Antigravity

Installs to `./.agents/`. The mapping is not one-to-one: `rules/` flattens into `.agents/rules/`, `commands/` becomes `.agents/workflows/`, `agents/*.md` goes to `.agents/agents/` with frontmatter transformed (Claude model tiers become `flash` or `pro`, Claude tool names become Antigravity equivalents, and unsupported tool identifiers are never emitted because invalid names can hang custom-agent execution), and `skills/<name>/` goes to `.agents/skills/<name>/`.

FORGE does not copy the repository's own `.agents/` tree wholesale — that directory is Codex-facing skill packaging with its own marketplace metadata. Native install requires FORGE 2.2.0 or newer; earlier versions used the legacy `.agent/` adapter. Do not rename `.agent/` to `.agents/` by hand: install-state holds absolute paths. Rerun the installer instead.

Missing: hooks, live MCP merge.

### Codex

Instruction-backed rather than hook-backed. What installs: agents, `AGENTS.md`, the skill catalog, and platform configs. `.codex/config.toml` carries the operating posture (`approval_policy = "on-request"`, `sandbox_mode = "workspace-write"`, live web search) and registers MCP servers directly. Three role layers live in `.codex/agents/`: an explorer for read-only evidence gathering, a reviewer for correctness, security, and missing tests, and a docs researcher for API and release-note verification.

Missing: `rules-core` and `commands-core` do not resolve for the `codex` target. Codex may not execute slash commands natively; the navigation guide tells you to read the command file and perform the steps by hand. Hook parity is not established.

### OpenCode

A full adapter package rather than a file copy. `.opencode/` contains `opencode.json`, 35 command files, 25 agent prompt files under `.opencode/prompts/agents/`, 9 TypeScript tools, and a `forge-hooks.ts` plugin. Skills are read from the canonical `skills/` directory through `opencode.json` rather than copied. Instructions come from `.opencode/instructions/INSTRUCTIONS.md`.

Agents reach OpenCode through that adapter package, not through the install manifest: `agents-core` does not resolve for the `opencode` target. The Agents column is Full because the harness does receive them, but they come from `.opencode/`, so a partial or hand-rolled install will not have them.

The install refuses to run until the plugin payload is built. You will see this exact error otherwise:

```text
OpenCode install requires the compiled plugin payload under .opencode/dist, but the following
artefact(s) were missing or had the wrong type: .opencode/dist/index.js, .opencode/dist/plugins,
.opencode/dist/tools. Run node scripts/build-opencode.js (or: npm run build:opencode) from the
repo root before re-running the installer.
```

The `opencode` install profile deliberately excludes `hooks-runtime`; opt in with `--modules hooks-runtime`. `rules-core` does not resolve for this target.

Missing: rules, hooks by default.

### Kimi Code

Managed project install under `./.kimi-code/` — note the directory name differs from the `.kimi/` documentation folder in this repository, and the adapter deliberately does not recreate the `.kimi` name. Discovers `.kimi-code/AGENTS.md`, `.kimi-code/skills/`, `.agents/skills/`, and `.kimi-code/mcp.json`. The root `.mcp.json` is merged into `.kimi-code/mcp.json`, which is why MCP is Full here. Verified against Kimi Code 0.31.x.

Missing: the language, framework, and capability skill modules do not resolve for this target, so you get the workflow and memory skills but not the full catalog. No hook mapping exists.

### Hermes, OpenClaw, AdaL CLI

The three home- and project-scoped instruction harnesses receive nearly the same set at install time: rules, agents, commands, platform configs, the workflow-quality skill set, and `skills/unified-memory`. Hermes and OpenClaw write to `~/.hermes` and `~/.openclaw`; AdaL writes to `./.adal`. The Hermes installer explicitly does not touch `config.yaml` or `.env`.

One difference: resolving the `full` profile gives Hermes and OpenClaw seven modules and AdaL six. AdaL is the only one of the three that does not resolve `nasiko-control-plane`. Kimi Code resolves the same seven as Hermes and OpenClaw.

The committed `.hermes/`, `.openclaw/`, and `.adal/` directories each contain a README and nothing else. They document where the installer writes; they are not adapter payloads.

Missing for all three: hooks, the language and framework skill modules, live MCP merge.

Hermes has the most developed memory story of any harness in the repository: the setup guide walks through vault initialization, per-harness `FORGE_MEMORY_HARNESS` identities, and handoffs between Hermes and Codex. See [HERMES-SETUP.md](HERMES-SETUP.md).

### Gemini CLI

The thinnest supported target. Resolving the `full` profile against `gemini` yields three modules: `platform-configs`, `skill-unified-memory`, and the optional Nasiko bridge. The committed adapter is a single `.gemini/GEMINI.md` instruction file.

Missing: rules, agents, commands, hooks, and the entire skill catalog beyond unified memory. If you need FORGE content in Gemini CLI, use the manual packing approach in [MANUAL-ADAPTATION-GUIDE.md](MANUAL-ADAPTATION-GUIDE.md).

### Kiro

Outside the install system entirely. `kiro` is not in `SUPPORTED_INSTALL_TARGETS` and has no adapter, but `.kiro/` is the second-richest committed surface in the repository: 43 skill directories, 33 agents in paired `.md` and `.json` form, 13 `*.kiro.hook` files, and 22 steering documents that play the role rules play elsewhere. Install with `.kiro/install.sh [dir|~]`, which copies `.kiro/` into a project or into `~/.kiro/`.

Missing: no commands. MCP exists only as `.kiro/settings/mcp.json.example`. No FORGE memory surface. No uninstaller — remove the copied directories by hand. Because it is outside install-state, `forge doctor`, `forge repair`, and `forge uninstall` do not see it.

### Trae

Also outside the install system. `.trae/install.sh` copies `commands`, `agents`, `skills`, and `rules` from the repository root into `.trae/` — or `.trae-cn/` when `TRAE_ENV=cn` — non-destructively, recording what it wrote in a manifest. `.trae/uninstall.sh` reverses it. Passing `~` installs to the home equivalent for all Trae projects.

Missing: no hooks, no MCP surface, no install-state. Memory support is unverified.

### Pi

An adapter Pi loads itself rather than a target FORGE installs to. The `pi` key in `package.json` points Pi at `./.pi/extensions/index.ts`, `./skills`, and `./commands`, so skills and commands are read from the canonical directories with no copies. The extension ships a hook runtime (`.pi/extensions/hook-runtime.js`) that honors `FORGE_HOOK_PROFILE` and `FORGE_DISABLED_HOOKS` for SessionStart and SessionEnd, and rule injection can be disabled with `FORGE_PI_RULES`.

Missing: Pi core has no MCP surface, so that column is N-A. The `pi` target cannot be passed to `forge install --target`. Agent and memory support are unverified.

### Copilot

Not an install target and not an adapter — just committed files. `.github/copilot-instructions.md` carries the FORGE baseline rules (research first, plan before coding, test-driven, review before committing, conventional commits). `.github/prompts/` holds five prompt files: `plan`, `tdd`, `build-fix`, `refactor`, and `security-review`. `.vscode/settings.json` enables `chat.promptFiles` and wires the instruction file into Copilot's code-generation and test-generation instruction lists, plus a commit-message instruction.

Missing: everything else. No skills, no agents, no hooks, no MCP, no memory. The prompt files are the only command-shaped surface and they are a hand-maintained subset of the 94 command shims.

### dmux, Orca, Superset, Ghast, Terminal-only

These appear in the adapter compliance scorecard but not in the install system. dmux is adapter-backed and shows up as a session-inspection source rather than a content destination — `forge session-inspect` reads dmux plans and emits `forge.session.v1` snapshots. Orca, Superset, and Ghast are marked reference-only, meaning the repository records them without shipping an adapter. Terminal-only is recorded as native, describing the case where FORGE is used through the CLI and skill files directly with no harness integration at all.

For all of these, treat every content column as unverified and use [MANUAL-ADAPTATION-GUIDE.md](MANUAL-ADAPTATION-GUIDE.md).

## Checking your own installation

Do not trust this table over your machine.

```bash
# What resolves for a target, without writing anything
forge plan --profile full --target <target> --json

# What is actually installed and where
forge list-installed --json

# Drift
forge doctor --json

# Adapter compliance scorecard
npm run harness:adapters
npm run harness:audit

# Session adapters available for inspection
forge session-inspect --list-adapters
```

`forge plan --profile full --target <target>` is the single most useful check. Its `selectedModuleIds` list is the ground truth for what a target can receive.

## Related pages

- [INSTALLATION.md](INSTALLATION.md) — install paths per harness
- [CONFIGURATION.md](CONFIGURATION.md) — the environment variables each adapter reads
- [MANUAL-ADAPTATION-GUIDE.md](MANUAL-ADAPTATION-GUIDE.md) — running FORGE in a harness with no adapter
- [SESSION-ADAPTER-CONTRACT.md](SESSION-ADAPTER-CONTRACT.md) — the cross-harness session snapshot schema
- [ANTIGRAVITY-GUIDE.md](ANTIGRAVITY-GUIDE.md), [QWEN-GUIDE.md](QWEN-GUIDE.md), [HERMES-SETUP.md](HERMES-SETUP.md), [CODEX-NAVIGATION-GUIDE.md](CODEX-NAVIGATION-GUIDE.md) — per-harness depth
