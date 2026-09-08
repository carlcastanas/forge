# Configuration

The complete surface you can turn, and where each knob is read. FORGE is configured from five places: environment variables, the Claude plugin `userConfig`, a managed hook config file, install manifests, and per-project files. This page documents all five and the order in which they win.

Prerequisites:

- FORGE is installed. See [INSTALLATION.md](INSTALLATION.md).
- You know which harness you are configuring. Several variables only apply to one adapter. See [HARNESS-MATRIX.md](HARNESS-MATRIX.md).

## Precedence

Two independent precedence chains exist. Do not mix them up.

### Hook enablement and profile

Resolved in `scripts/lib/hook-flags.js`, highest first:

1. `FORGE_HOOKS_ENABLED` / `FORGE_HOOK_PROFILE` environment variables
2. `CLAUDE_PLUGIN_OPTION_HOOKS_ENABLED` / `CLAUDE_PLUGIN_OPTION_HOOK_PROFILE`, which Claude Code sets from the plugin `userConfig` values stored in `settings.json`
3. The managed hook config file: `$FORGE_HOOK_CONFIG`, else `<plugin root>/forge/setup.json`, read for `hooks.enabled` and `hooks.profile`
4. Built-in defaults: enabled `true`, profile `standard`

An unrecognized profile string does not error. It falls back to `standard`. Boolean parsing accepts `1/true/yes/on` and `0/false/no/off`; anything else falls back to the default.

`FORGE_DISABLED_HOOKS` is separate. It is read only from the environment and applies on top of whatever the chain above resolved. A hook runs only if hooks are enabled, its ID is not in the disabled set, and the resolved profile is in the hook's own profile list.

### Install content

Resolved in `scripts/install-apply.js` and `scripts/lib/install/request.js`, highest first:

1. Explicit CLI flags: `--profile`, `--modules`, `--with`, `--without`, `--skills`, `--locale`, `--target`
2. `--config <path>`, an explicit install config file
3. `./forge-install.json` in the working directory, auto-detected when no languages were passed positionally
4. Adapter defaults for the resolved target

## Environment variables

Every variable below was found by grepping the repository. Group headings say which subsystem reads it. Where a default is not set in code, the column says so.

### Hooks and lifecycle

| Variable | Default | Effect |
|---|---|---|
| `FORGE_HOOKS_ENABLED` | `true` | Master switch for the hook runtime. `false` disables every FORGE hook regardless of profile. |
| `FORGE_HOOK_PROFILE` | `standard` | `minimal`, `standard`, or `strict`. Invalid values fall back to `standard`. |
| `FORGE_DISABLED_HOOKS` | empty | Comma-separated hook IDs to skip, case-insensitive (e.g. `post:quality-gate,pre:bash:tmux-reminder`). |
| `FORGE_HOOK_CONFIG` | `<plugin root>/forge/setup.json` | Path to the managed hook config JSON. Only the `hooks` object is read. An unreadable file emits a warning and is ignored. |
| `FORGE_HOOK_ID` | set per invocation | Written by `scripts/hooks/run-with-flags.js` into the child hook's environment; read back by the observation runner to derive the hook phase. Not something you normally set. |
| `FORGE_HOOK_NODE` | platform Node | Overrides the Node binary the Pi extension hook runtime uses. |
| `FORGE_HOOK_INPUT_MAX_BYTES` | per-hook `MAX_STDIN` constant | Caps the stdin payload a hook will read. Used by config protection, governance capture, and the MCP health check. |
| `FORGE_HOOK_INPUT_TRUNCATED` | unset | Set to `1` by the harness shim when the hook payload was cut short, so downstream hooks can degrade instead of misreading. |
| `FORGE_POSTTOOLUSE_PASSTHROUGH` | unset | `1` makes the PostToolUse dispatcher pass tool output through rather than consuming it. |
| `FORGE_GLOBAL_HOOKS_DIR` | `$CODEX_HOME/git-hooks` | Where `scripts/sync-forge-to-codex.sh` installs global git hooks. |
| `FORGE_DRY_RUN` | unset | `1` puts hook dispatchers and `forge memory`/`forge uninstall` into preview mode. `forge --dry-run` sets it for you. |
| `FORGE_SKIP_PRECOMMIT` | unset | `1` bypasses the installed global pre-commit hook for one invocation. |
| `FORGE_SKIP_PREPUSH` | unset | `1` bypasses the installed global pre-push hook for one invocation. |
| `FORGE_SKIP_GIT_HOOKS` | unset | Bypass switch covering the Codex global git-hook pair. |
| `FORGE_PREPUSH_AUDIT` | unset | Toggles the audit step inside the Codex pre-push hook. |

### Quality gates and safety

| Variable | Default | Effect |
|---|---|---|
| `FORGE_QUALITY_GATE_FIX` | `false` | `true` lets the post-edit quality gate apply formatter fixes instead of only reporting. |
| `FORGE_QUALITY_GATE_STRICT` | `false` | `true` makes quality-gate findings blocking rather than advisory. |
| `FORGE_GATEGUARD` | enabled | Set to `0`, `false`, `off`, `disabled`, or `disable` to turn off the GateGuard fact-forcing gate. Narrower relief is available through `GATEGUARD_BASH_ROUTINE_DISABLED=1`, which keeps destructive-command checks active. |
| `FORGE_GOVERNANCE_CAPTURE` | off | Must be exactly `1` to enable governance event capture (secrets, policy violations, approval requests). |
| `FORGE_ENABLE_INSAITS` | off | Enables the optional Insaits security wrapper hook. |

### Session and context

| Variable | Default | Effect |
|---|---|---|
| `FORGE_SESSION_ID` | from harness payload | Fallback session identifier when the harness does not supply `session_id` or `CLAUDE_SESSION_ID`. Used by the context monitor, metrics bridge, cost tracker, and GateGuard. |
| `FORGE_SESSION_START_CONTEXT` | on | Set to `0`, `false`, `off`, `none`, or `disabled` to stop SessionStart from injecting previous-session context. |
| `FORGE_SESSION_START_MAX_CHARS` | `8000` | Character cap on injected SessionStart context. Non-integer or negative values fall back to the default. `0` is honored. |
| `FORGE_SESSION_RETENTION_DAYS` | `30` | Days of session state to keep. `0`, `off`, `false`, `disabled`, `never`, or `none` disables pruning entirely. |
| `FORGE_SESSION_RECORDING_DIR` | unset | Directory for canonical session snapshot recordings written by the session adapters. |
| `FORGE_CONTEXT_WINDOW_TOKENS` | inferred from transcript | Explicit context-window size in tokens. Also honors Claude Code's `CLAUDE_CODE_AUTO_COMPACT_WINDOW`. Set this when the transcript would otherwise make FORGE report roughly double usage. |
| `FORGE_CONTEXT_MONITOR_COST_WARNINGS` | on | Set to a falsy value to silence cost warnings from the context monitor while keeping context tracking. |

### Continuous learning and instincts

| Variable | Default | Effect |
|---|---|---|
| `FORGE_INSTINCT_CONFIDENCE_THRESHOLD` | `0.7` | Minimum confidence for an instinct to be injected at SessionStart. Must be a plain decimal in `[0, 1]`; `0x1`, `1e2`, and `0.7x` are rejected and fall back. |
| `FORGE_MAX_INJECTED_INSTINCTS` | `6` | Cap on instincts injected per session. Must be a plain positive integer. |
| `FORGE_INSTINCT_RELEVANCE_RANKING` | on | Set to `off`, `false`, `0`, or `no` to inject instincts unranked. |
| `FORGE_SKIP_OBSERVE` | `0` | `1` skips the continuous-learning observation hook. Set automatically inside the observer subprocess to prevent recursion. |
| `FORGE_OBSERVE_SKIP_PATHS` | `observer-sessions,.claude-mem` | Comma-separated path fragments the observer ignores. |
| `FORGE_OBSERVE_RUNNER_TIMEOUT_MS` | unset (runner default) | Hard timeout for the observation runner subprocess. |
| `FORGE_OBSERVER_MODEL` | `haiku` | Model the observer loop invokes. |
| `FORGE_OBSERVER_MAX_TURNS` | unset | `--max-turns` passed to the observer invocation. |
| `FORGE_OBSERVER_TIMEOUT_SECONDS` | `120` | Per-analysis timeout for the observer loop. |
| `FORGE_OBSERVER_IDLE_TIMEOUT_SECONDS` | `1800` | Idle time before the observer loop exits. |
| `FORGE_OBSERVER_ANALYSIS_COOLDOWN` | `60` | Minimum seconds between observer analyses. |
| `FORGE_OBSERVER_MAX_ANALYSIS_LINES` | `500` | Line cap on the transcript slice handed to the observer. |
| `FORGE_OBSERVER_SIGNAL_EVERY_N` | `20` | Emit an observer signal every N observations. |
| `FORGE_OBSERVER_NOSURVIVE_WARN_AFTER` | `3` | Consecutive non-surviving observer runs before warning. |
| `FORGE_OBSERVER_ALLOW_WINDOWS` | `false` | Permit the observer loop to run under Windows. |

### Session summarization

| Variable | Default | Effect |
|---|---|---|
| `FORGE_SKIP_LLM_SUMMARY` | unset | Any truthy value skips LLM session summarization. |
| `FORGE_LLM_SUMMARY_MODEL` | `haiku` | Model used to summarize a session. |
| `FORGE_LLM_SUMMARY_INTERVAL` | `50` | Summarize every N messages. Non-positive or non-finite values fall back to 50. |
| `FORGE_LLM_SUMMARY_CONTEXT_THRESHOLD` | `20` | Remaining-context percentage below which a summary is forced. |
| `FORGE_LLM_SUMMARY_SUBPROCESS` | set internally | Recursion guard set to `1` in the summarizer subprocess so a Stop hook cannot re-enter summarization. Do not set it yourself. |

### MCP

| Variable | Default | Effect |
|---|---|---|
| `FORGE_DISABLED_MCPS` | empty | Comma-separated MCP server names to strip during install and during Codex MCP config merge. |
| `FORGE_MCP_CONFIG_PATH` | adapter-resolved | Explicit path (or paths) to the MCP config the health check reads. |
| `FORGE_MCP_HEALTH_STATE_PATH` | adapter-resolved | Where MCP health state is persisted. |
| `FORGE_MCP_HEALTH_TIMEOUT_MS` | `5000` | Per-probe timeout for MCP health checks and HTTP transport probes. |
| `FORGE_MCP_HEALTH_TTL_MS` | `120000` | How long a health verdict stays fresh. |
| `FORGE_MCP_HEALTH_BACKOFF_MS` | `30000` | Base retry backoff after a failure; doubles per consecutive failure, capped at 600000 ms. |
| `FORGE_MCP_HEALTH_FAIL_OPEN` | off | `1`, `true`, or `yes` allows MCP calls through when the health check itself cannot run. Off means unhealthy servers are blocked. |
| `FORGE_MCP_RECONNECT_COMMAND` | unset | Fallback command used to reconnect any unhealthy MCP server. |
| `FORGE_MCP_RECONNECT_<SERVER>` | unset | Per-server reconnect command. The server name is uppercased with non-alphanumerics replaced by `_`. Checked before the generic command. |
| `FORGE_MCP_RECONNECT_TIMEOUT_MS` | `5000` | Timeout for a reconnect attempt. |

### Memory vault

| Variable | Default | Effect |
|---|---|---|
| `FORGE_MEMORY_HARNESS` | `unknown` | Lowercase identity written as the source harness on saved memories. Each harness running `forge-memory-mcp` must use a distinct value. |
| `FORGE_MEMORY_PROJECT_ROOT` | `<nearest project root>/.forge/memory` | Overrides the project and team vault location. Setting it also moves the trusted path boundary to the override. |
| `FORGE_MEMORY_USER_ROOT` | `~/.forge/memory` | Overrides the user vault location. |
| `FORGE_MEMORY_ALLOW_USER_SCOPE` | off | Must be exactly `1` for the MCP server to touch user-scope memories. Default recall scopes are `project` and `team` only. |

### Roots, state, and identity

| Variable | Default | Effect |
|---|---|---|
| `FORGE_AGENT_DATA_HOME` | `~/.claude` | Root for memory hooks, sessions, learned skills, aliases, and metrics. Set it to a separate path (for example `$HOME/.cursor/forge`) when running FORGE in two harnesses on one machine. A project may also propose a value in `.cursor/forge-agent-data.json`, but only inside the default Cursor or Claude data directories; anything else is refused with a warning. |
| `FORGE_PLUGIN_ROOT` | derived | Plugin root used when `CLAUDE_PLUGIN_ROOT` is absent. Read by the observation runner, hook bootstrap, and PostToolUse dispatcher. |
| `FORGE_STATE_DB_PATH` | `~/.claude/forge/state.db` | SQLite state store used by `forge status`, `forge sessions`, `forge work-items`, and the control pane. |
| `FORGE_VERSION` | package version | Injected into the session environment by the OpenCode plugin. Read, not set, by consumers. |
| `FORGE_PLUGIN` | `"true"` | Marker the OpenCode plugin sets so downstream scripts know they are inside a plugin session. |
| `FORGE_ROOT` | `/forge` | Mount point for the FORGE checkout inside the Docker plugin-setup harness. |
| `FORGE_PROJECT_DIR` | `/workspace/project` | Project directory inside the Docker plugin-setup harness. |

### Local servers and terminal integration

| Variable | Default | Effect |
|---|---|---|
| `FORGE_DASHBOARD_HOST` | loopback | Bind host for `npm run dashboard:web`. |
| `FORGE_DASHBOARD_PORT` | `3456` | Port for the web dashboard. A positional argument overrides it. |
| `FORGE_PLAN_CANVAS_PORT` | server default | Port for the Plan Canvas review server. |
| `FORGE_PLAN_CANVAS_STATE_DIR` | adapter-resolved | Directory holding Plan Canvas session state and `server.json`. |
| `FORGE_PLAN_CANVAS_IDLE_MS` | server default | Idle window before the Plan Canvas server shuts itself down. |
| `FORGE_PLAN_CANVAS_STOP_SCOPE` | current session | `all` makes the Stop hook consider every open review session, not just the current one. |
| `FORGE_PLAN_CANVAS_MERMAID_URL` | bundled CDN URL | Override for the Mermaid asset, for air-gapped mirrors. A failed fetch degrades rather than breaking the page. |
| `FORGE_TUI_BIN` | discovered | Explicit path to the TUI binary the control pane's message sink invokes. |
| `FORGE_TERMINAL` | adapter default | Terminal application the `terminal-opener` skill launches. |

### External CLI bridges

| Variable | Default | Effect |
|---|---|---|
| `FORGE_NASIKO_CLI_EXECUTABLE` | unset | Absolute path to the pinned Nasiko CLI that `forge nasiko` invokes. Must be absolute; a relative value is rejected. FORGE deliberately does not discover this client through `PATH`. |
| `FORGE_GH_SHIM` | unset | Path to a Node script that stands in for the `gh` CLI. When set, `forge work-items sync-github` and `forge platform-audit` run `node <shim>` instead of `gh`. |
| `FORGE_GH_SHIM_LOG` | unset | Path the shim writes its invocation log to. |

### Adapter-specific

| Variable | Default | Effect |
|---|---|---|
| `FORGE_PI_RULES` | enabled | Disables rule injection in the Pi extension adapter (`.pi/extensions/index.ts`). |

### CI, release, and container harness

These are read by repository tooling rather than by an installed FORGE.

| Variable | Default | Effect |
|---|---|---|
| `FORGE_UNICODE_SCAN_ROOT` | repository root | Root directory for `scripts/ci/check-unicode-safety.js`. |
| `FORGE_WORKFLOWS_DIR` | default workflows dir | Directory `scripts/ci/validate-workflow-security.js` scans. |
| `FORGE_RELEASE_PACKAGE` | unset | Path to the downloaded release `.tgz` under verification. Required by the packed-artifact lifecycle check. |
| `FORGE_RELEASE_SHA256` | unset | Expected 64-character SHA-256 digest for that artifact. |
| `FORGE_VIDEO_SOURCE_ROOT` | unset | Source root for `npm run release:video-suite`. |
| `FORGE_VIDEO_RELEASE_SUITE_ROOT` | unset | Output root for the release video suite. |
| `FORGE_TMPFS_SIZE` | `2g` | Size of the container `/tmp` tmpfs in the Docker plugin-setup harness. |
| `FORGE_WORKSPACE_SIZE` | `1g` | Size of the private container workspace tmpfs. |

### Test harness only

Set by the test suite to stub external behavior. They have no effect on a normal install and should never be set in a real session.

`FORGE_TEST_HOME`, `FORGE_TEST_BASH`, `FORGE_TEST_REGISTRY`, `FORGE_TEST_READER`, `FORGE_TEST_NPM_PACK`, `FORGE_TEST_NPM_CWD`, `FORGE_TEST_CHILD_PID_FILE`, `FORGE_TEST_CLAUDE_STATE`, `FORGE_TEST_CLAUDE_CALLS`, `FORGE_TEST_CLAUDE_WRITE_XDG_DATA`, `FORGE_TEST_CLAUDE_CREATE_READ_ARTIFACTS`, `FORGE_TEST_CLAUDE_OVERWRITE_READ_ARTIFACTS`, `FORGE_CODEX_ISOLATION_INTEGRATION`, `FORGE_FAKE_GH_MODE`, `FORGE_MCP_TEST_MARKER`.

### Named in documentation, not read by shipped code

`FORGE_MODE`, `FORGE_DB_PATH`, `FORGE_WORKTREE_ROOT`, and `FORGE_DEFAULT_AGENT` appear in `skills/plan-orchestrate/SKILL.md` and in a research note as proposals or as skill-local shell variables. No shipped script reads them from the environment. Treat them as unverified — confirm against your installed version before depending on them.

### Not environment variables

Several `FORGE_`-prefixed identifiers in the codebase are JavaScript constants or error codes, not configuration: `FORGE_ENABLE_VALUES`, `FORGE_DISABLE_VALUES`, `FORGE_SKILL_SENTINEL`, `FORGE_LEGACY_PLUGIN_DIRS`, `FORGE_CACHE_PLUGIN_NAMES`, `FORGE_CACHE_MARKETPLACES`, `FORGE_PLUGIN_KEY_PATTERNS`, `FORGE_SERVERS`, `FORGE_PACKAGE_NAMES`, `FORGE_SCRIPT`, `FORGE_WORDMARK`, `FORGE_GRADIENT`, `FORGE_VERSION_PATTERN`, `FORGE_BEGIN_MARKER`, `FORGE_END_MARKER`, `FORGE_MEMORY_SECRET`, `FORGE_MEMORY_LOCATION_MISMATCH`, `FORGE_SETTINGS_CHANGED`, `FORGE_SETTINGS_PARENT_CHANGED`, `FORGE_FINAL_DESTINATION_SYMLINK`. Setting them in a shell does nothing.

### Non-FORGE variables FORGE honors

| Variable | Effect |
|---|---|
| `CLAUDE_CONFIG_DIR` | Claude config directory; overrides `~/.claude` for plugin inventory and settings. |
| `CLAUDE_PLUGIN_ROOT` | Plugin root; takes precedence over `FORGE_PLUGIN_ROOT`. |
| `CLAUDE_PLUGIN_OPTION_HOOKS_ENABLED`, `CLAUDE_PLUGIN_OPTION_HOOK_PROFILE` | Set by Claude Code from plugin `userConfig`; second in the hook precedence chain. |
| `CLAUDE_SESSION_ID` | Session identity fallback ahead of `FORGE_SESSION_ID`. |
| `CLAUDE_CODE_AUTO_COMPACT_WINDOW` | Alternate source for the context window size. |
| `CLAUDE_RULES_DIR` | Overrides the managed rules directory during install planning. |
| `OPENCODE_CONFIG_DIR`, `XDG_CONFIG_HOME` | Resolve the OpenCode install root, in that order, before `~/.config/opencode`. |
| `CODEX_HOME` | Base for the Codex global git-hooks directory. |
| `TRAE_ENV=cn` | Makes the Trae installer target `.trae-cn/` instead of `.trae/`. |
| `GATEGUARD_BASH_ROUTINE_DISABLED` | Narrow GateGuard relief that keeps destructive-command checks active. |
| `HOME`, `USERPROFILE` | Home directory resolution across every path helper. |

## Plugin userConfig

`.claude-plugin/plugin.json` declares exactly two user-configurable options:

```json
{
  "userConfig": {
    "hooks_enabled": {
      "type": "boolean",
      "title": "Enable FORGE hooks",
      "description": "Run FORGE's local lifecycle, quality, and safety automation. Disable this to keep skills and commands without local hook automation.",
      "default": true
    },
    "hook_profile": {
      "type": "string",
      "title": "FORGE hook profile",
      "description": "Choose minimal, standard, or strict. Invalid values safely fall back to standard.",
      "default": "standard"
    }
  }
}
```

The manifest also declares `"mcpServers": {}` (no servers registered by default), `"skills": ["./skills/"]`, and `"commands": ["./commands/"]`.

Values persist in the Claude settings file for the scope you installed at, under `pluginConfigs["forge@forge"].options`. `forge setup --hooks <mode>` writes them; `--hooks off` sets `hooks_enabled: false` and leaves `hook_profile` at `standard`.

Turning hooks off does not remove skills, agents, commands, or rules. It only stops the lifecycle automation.

## Hook profiles

Three profiles, defined by `VALID_PROFILES` in `scripts/lib/hook-flags.js`. Each registered hook carries its own profile list; a hook runs when the active profile is in that list.

| Hook ID | Event | Profiles |
|---|---|---|
| `pre:bash:block-no-verify` | PreToolUse Bash | minimal, standard, strict |
| `pre:bash:auto-tmux-dev` | PreToolUse Bash | strict |
| `pre:bash:tmux-reminder` | PreToolUse Bash | strict |
| `pre:bash:git-push-reminder` | PreToolUse Bash | strict |
| `pre:bash:commit-quality` | PreToolUse Bash | standard, strict |
| `pre:bash:gateguard-fact-force` | PreToolUse Bash | standard, strict |
| `post:bash:command-log-audit` | PostToolUse Bash | standard, strict |
| `post:bash:command-log-cost` | PostToolUse Bash | standard, strict |
| `post:edit:design-quality-check` | PostToolUse Edit/Write/MultiEdit | standard, strict |
| `post:edit:accumulator` | PostToolUse Edit/Write/MultiEdit | standard, strict |
| `post:edit:console-warn` | PostToolUse Edit | standard, strict |
| `post:governance-capture` | PostToolUse | standard, strict |
| `post:session-activity-tracker` | PostToolUse | standard, strict |
| `post:forge-metrics-bridge` | PostToolUse | minimal, standard, strict |
| `post:forge-context-monitor` | PostToolUse | standard, strict |
| `post:bash:dispatcher` | PostToolUse | minimal, standard, strict |
| `post:quality-gate` | PostToolUse Edit/Write/MultiEdit | standard, strict |
| `post:observe:continuous-learning` | PostToolUse | standard, strict |
| `post:skill:track` | PostToolUse Skill / PostToolUseFailure Skill | standard, strict |

Registered events, from `hooks/hooks.json`: `PreToolUse`, `PreCompact`, `SessionStart`, `PostToolUse`, `PostToolUseFailure`, `Stop`, `SessionEnd`. Additional entries not in the profile-gated dispatchers include `pre:write:doc-file-warning`, `pre:edit-write:suggest-compact`, `pre:config-protection`, `pre:mcp-health-check`, `pre:edit-write:gateguard-fact-force`, `pre:compact`, `session:start`, `session-start:plan-canvas-sessions`, the `Stop` set (`stop:plan-canvas-pending`, `stop:format-typecheck`, `stop:check-console-log`, `stop:session-end`, `stop:evaluate-session`, `stop:cost-tracker`, `stop:desktop-notify`), and `session:end:marker`.

Practical recipes:

```bash
# Run with no hooks at all for one command
FORGE_HOOKS_ENABLED=false claude

# Telemetry only
FORGE_HOOK_PROFILE=minimal claude

# Everything except the two noisiest reminders
FORGE_HOOK_PROFILE=strict \
FORGE_DISABLED_HOOKS=pre:bash:tmux-reminder,pre:bash:git-push-reminder \
  claude

# Make the quality gate blocking and self-fixing
FORGE_QUALITY_GATE_STRICT=true FORGE_QUALITY_GATE_FIX=true claude
```

More depth in [HOOKS-GUIDE.md](HOOKS-GUIDE.md).

## Selective and capability-surface install

What lands on disk is chosen through the manifest system in `manifests/`, not through environment variables.

| Selector | Shape | Example |
|---|---|---|
| Profile | one of seven named sets | `--profile developer` |
| Module | manifest module IDs | `--modules rules-core,commands-core` |
| Component | `<family>:<id>` | `--with capability:security` |
| Skill | skill directory ID | `--skills tdd-workflow,verification-loop` |
| Locale | translated docs, Claude targets only | `--locale ja-JP` |

Component families: `baseline`, `lang`, `framework`, `capability`, `agent`, `skill`, `locale`.

Inspect before installing:

```bash
forge catalog profiles
forge catalog components --family capability
forge catalog show framework:nextjs
forge plan --profile developer --target cursor --json
```

Two behavioral rules worth knowing:

- The `hooks-runtime` module is only defined for the `claude`, `claude-project`, `cursor`, `opencode`, and `codebuddy` targets. Requesting it elsewhere resolves to nothing.
- If your selection materializes hooks, `forge install` requires `--enable-hooks` to confirm, or `--no-hooks` to skip them. This gate is deliberate: a hook runtime should never appear on a machine without an explicit yes.

Which surface a capability belongs in at all — rule, skill, MCP server, CLI, or direct API — is decided in [capability-surface-selection.md](capability-surface-selection.md). The install mechanics are in [SELECTIVE-INSTALL-ARCHITECTURE.md](SELECTIVE-INSTALL-ARCHITECTURE.md).

## Per-project overrides

| File | Read by | Purpose |
|---|---|---|
| `./forge-install.json` | `forge install`, `forge plan` | Install intent, auto-detected in the working directory. Validated against `schemas/forge-install-config.schema.json`. |
| `./.cursor/forge-agent-data.json` | agent-data resolution | Proposes an `agentDataHome`. Only accepted if it is user-anchored, free of `..`, and resolves inside the default Cursor or Claude data directories. |
| `./.claude/package-manager.json` | package-manager detection | Pins the project package manager. Written by `forge`'s package-manager setup. |
| `<plugin root>/forge/setup.json` | `scripts/lib/hook-flags.js` | Managed hook config: `hooks.enabled` and `hooks.profile`. Third in the hook precedence chain. |
| `./.claude/settings.json` (project scope) | Claude Code | Holds `pluginConfigs["forge@forge"].options` when FORGE is installed at project scope. |
| `./.mcp.json` | install adapters | Source MCP config; merged into `.cursor/mcp.json` and `.kimi-code/mcp.json` by those adapters. |
| `~/.claude/forge2.toml` | `forge-control-pane` | Control pane configuration, merged from the default config paths or an explicit `--config`. |

The install config file:

```json
{
  "$schema": "../schemas/forge-install-config.schema.json",
  "version": 1,
  "target": "claude-project",
  "profile": "developer",
  "include": ["capability:security", "framework:nextjs"],
  "exclude": ["lang:java"]
}
```

`version` must be the integer `1` and is required. `target` must be one of the fifteen supported targets. `profile` and each `modules` entry match `^[a-z0-9-]+$`. Each `include`/`exclude` entry must match `^(baseline|lang|framework|capability):[a-z0-9-]+$` — note the schema's component pattern does not admit `agent:`, `skill:`, or `locale:` prefixes, so request those through CLI flags instead. Unknown top-level keys are rejected.

## Verifying what is actually in effect

```bash
# What the installer thinks is installed
forge list-installed --json

# Drift between install-state and the filesystem
forge doctor --json

# Readiness from the state store
forge status --json

# Adapter compliance across harnesses
npm run harness:adapters
npm run harness:audit
```

`forge doctor` reports per-target status with issue codes. `forge status --exit-code` exits 2 when readiness needs attention.

## Related pages

- [INSTALLATION.md](INSTALLATION.md) — install paths and what each writes
- [CLI-REFERENCE.md](CLI-REFERENCE.md) — every command and flag
- [HOOKS-GUIDE.md](HOOKS-GUIDE.md) — hook authoring and behavior
- [MEMORY-GUIDE.md](MEMORY-GUIDE.md) — the memory vault in depth
- [MCP-GUIDE.md](MCP-GUIDE.md) — MCP server conventions
- [HARNESS-MATRIX.md](HARNESS-MATRIX.md) — which of this applies where
