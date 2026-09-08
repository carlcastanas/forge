# Installation

Every supported way to get FORGE onto a machine, what each one writes to disk, and how to take it back off. Read this before running anything: the paths differ, and running two of them against the same harness is the single most common way to end up with a broken install.

Prerequisites:

- Node.js 18 or newer (`engines.node` in `package.json` is `>=18`)
- Git on `PATH` — required for the Claude plugin marketplace path; setup aborts with a `Git is required for Claude marketplace setup` error if `git` is missing
- The `claude` CLI on `PATH` — required only for the Claude Code plugin path, which shells out to `claude plugin marketplace ...` and `claude plugin install ...`
- A POSIX shell for `install.sh`, or PowerShell for `install.ps1`

## Pick one path, not two

FORGE can reach a harness through more than one channel. The channels do not know about each other.

| If you want | Use | Do not also run |
|---|---|---|
| FORGE inside Claude Code, managed by Claude Code | `forge setup --mode claude-plugin` | `forge install --target claude` |
| FORGE files copied into a directory you control | `forge install --target <target>` | the plugin marketplace path for the same harness |
| A multi-harness first-run | `forge install --guided` | separate per-harness installs afterwards |

Stacking the plugin install and the file install for Claude Code gives you two copies of the same skills, agents, and hook registrations. The symptoms are duplicated slash commands, hooks that fire twice, and `forge doctor` reporting drift it cannot repair, because the plugin cache is not tracked in install-state. If you have already done this, uninstall both (see [Uninstalling](#uninstalling)) and reinstall through one channel.

## Install paths

### npm package

The published package is `forge-universal`. Installing it globally puts six binaries on `PATH`.

```bash
npm install -g forge-universal
forge --help
```

| Binary | Script |
|---|---|
| `forge` | `scripts/forge.js` |
| `forge-universal` | `scripts/forge.js` (alias) |
| `forge-install` | `scripts/install-apply.js` |
| `forge-control-pane` | `scripts/control-pane.js` |
| `forge-memory-mcp` | `scripts/memory-mcp.mjs` |
| `forge-plan-canvas` | `scripts/plan-canvas.js` |

Installing the package writes nothing into any harness directory. It only gives you the CLI. Content lands on disk when you run `forge setup`, `forge install`, or one of the adapter installers below. See [CLI-REFERENCE.md](CLI-REFERENCE.md) for every subcommand.

### Claude Code plugin marketplace

This is the managed path for Claude Code. FORGE registers a marketplace named `forge` pointing at the repository, then installs the plugin `forge@forge` at a scope you choose.

```bash
forge setup
forge setup --mode claude-plugin --scope user --hooks standard --yes
forge setup --mode claude-plugin --scope project --dry-run --json
```

Scopes, as validated in `scripts/lib/claude-plugin-setup.js`:

| Scope | Meaning |
|---|---|
| `user` | Global for the current user; FORGE is available in every project |
| `project` | Shared project configuration a repository can commit for collaborators |
| `local` | Private project configuration; FORGE is enabled here without committing the choice |

What setup does:

1. Verifies `git` is available and that no conflicting or legacy FORGE plugin is installed in another scope.
2. Runs `claude plugin marketplace add` (or `update`) for the `forge` marketplace, then re-lists marketplaces to verify. A marketplace already named `forge` that does not point at the official repository is refused rather than overwritten.
3. Runs `claude plugin install forge@forge --scope <scope>` and verifies the plugin is enabled at exactly that scope.
4. Writes your hook preference into the Claude settings file for that scope, under `pluginConfigs["forge@forge"].options`.

Re-running setup updates an existing `forge@forge` install at its detected scope. Choosing a different scope triggers a migration: the destination is installed and verified before the source scope is removed.

The settings file is `settings.json` inside the Claude config directory — `$CLAUDE_CONFIG_DIR` when set, otherwise `~/.claude`. The written shape:

```json
{
  "pluginConfigs": {
    "forge@forge": {
      "options": {
        "hooks_enabled": true,
        "hook_profile": "standard"
      }
    }
  }
}
```

`--hooks off` writes `hooks_enabled: false` and leaves `hook_profile` at `standard`.

### Guided multi-harness install

```bash
forge install --guided
forge install --guided --harness claude --harness codex --harness kimi --yes
forge install --guided --all-harnesses --dry-run --json
```

Only three harnesses are guided-ready (`guidedReady: true` in `scripts/lib/harness-capabilities.js`): Claude Code, Codex, and Kimi Code. Everything else is reachable through explicit `forge install --target` commands. Guided flags:

| Flag | Values |
|---|---|
| `--harness <id[,id...]>` | repeatable; `claude`, `codex`, `kimi`, or `all` |
| `--all-harnesses` | selects all three; mutually exclusive with `--harness` |
| `--claude-scope` | `user`, `project`, `local` |
| `--claude-hooks` | `off`, `minimal`, `standard`, `strict` |
| `--profile` | Kimi managed-project content profile |
| `--yes`, `-y` | apply without confirmation |
| `--dry-run` | preflight and preview without changing files |
| `--json` | machine-readable output |

The guided installer configures FORGE only. It does not install or authenticate provider CLIs.

### install.sh

`install.sh` is a thin wrapper. It resolves the real package root through any symlinks, runs `npm install --no-audit --no-fund` when `node_modules` is absent (the git-clone case), converts the path with `cygpath` under MSYS2/Git Bash, and then execs `node scripts/install-apply.js` with your arguments unchanged.

```bash
./install.sh --target claude --profile developer
./install.sh --target cursor --dry-run --json
./install.sh typescript python
```

Anything documented for `forge install` works here identically, because it is the same runtime.

### install.ps1

The Windows-native equivalent. It walks symlinks with `Get-Item -Force`, runs `npm install` if `node_modules` is missing, then invokes `node scripts/install-apply.js @args` and propagates the exit code.

```powershell
.\install.ps1 --target claude --profile core
```

### Manual and per-harness adapter installers

Three adapters ship their own shell installers rather than going through the Node runtime. They copy from the repository checkout, so you need a clone.

| Harness | Installer | Behavior |
|---|---|---|
| Kiro | `.kiro/install.sh [dir\|~]` | Copies the contents of `.kiro/` (agents, skills, hooks, steering, settings, scripts, docs) into a project `.kiro/` or, with `~`, into `~/.kiro/` |
| Trae | `.trae/install.sh [dir\|~]` | Copies `commands`, `agents`, `skills`, and `rules` from the repository root into `.trae/` (or `.trae-cn/` when `TRAE_ENV=cn`), non-destructively, tracking what it wrote in a manifest |
| CodeBuddy | `.codebuddy/install.sh` / `.codebuddy/install.js` | Project install under `./.codebuddy/`; also reachable as `forge install --target codebuddy` |

Trae also ships `.trae/uninstall.sh`, and CodeBuddy ships `.codebuddy/uninstall.sh`.

You can also install by hand: copy the directories you want out of the checkout and into the harness directory. Nothing in FORGE requires the installer to have run, but a hand copy is not recorded in install-state, so `forge doctor`, `forge repair`, and `forge uninstall` will not see it. See [MANUAL-ADAPTATION-GUIDE.md](MANUAL-ADAPTATION-GUIDE.md).

## What each target writes, and where

Targets come from `SUPPORTED_INSTALL_TARGETS` and the adapters in `scripts/lib/install-targets/`. The destination roots below are the ones the adapters resolve.

| Target | Root | Kind |
|---|---|---|
| `claude` (default) | `~/.claude` (or `$CLAUDE_CONFIG_DIR`), managed rules under `rules/forge`, flat skills under `skills/` | home |
| `claude-project` | `./.claude`, same layout | project |
| `cursor` | `./.cursor` | project |
| `antigravity` | `./.agents` | project |
| `codex` | `~/.codex` | home |
| `gemini` | `./.gemini` | project |
| `opencode` | `$OPENCODE_CONFIG_DIR`, else `$XDG_CONFIG_HOME/opencode`, else `~/.config/opencode` | home |
| `codebuddy` | `./.codebuddy` | project |
| `joycode` | `./.joycode` | project |
| `qwen` | `~/.qwen` | home |
| `zed` | `./.zed` | project |
| `hermes` | `~/.hermes` | home |
| `kimi` | `./.kimi-code` | project |
| `openclaw` | `~/.openclaw` | home |
| `adal` | `./.adal` | project |

Every non-guided install also writes an **install-state** file under the target root — for the Claude targets that is `<root>/forge/install-state.json`. It records the request, the resolved modules, and every file operation. `forge list-installed`, `forge doctor`, `forge repair`, and `forge uninstall` all read it. Without it, those commands have nothing to work from.

Separately, the SQLite state store defaults to `~/.claude/forge/state.db` and backs `forge status`, `forge sessions`, and `forge work-items`.

Preview before committing:

```bash
forge install --target cursor --profile developer --dry-run
forge install --target claude --profile core --dry-run --json
```

The dry-run plan prints the mode, target, adapter, install root, install-state path, selected modules, and every planned `source -> destination` operation.

## Choosing what to install

Three ways to express intent, all of which resolve through the same manifest system in `manifests/`:

```bash
# 1. A profile
forge install --target claude --profile developer

# 2. Explicit modules
forge install --target claude --modules rules-core,agents-core,commands-core

# 3. A profile plus component adjustments
forge install --target claude --profile core --with capability:security --without lang:java
```

Profiles available today (`forge catalog profiles`):

| Profile | Modules | Intent |
|---|---|---|
| `minimal` | 5 | Low-context Claude Code setup: rules, agents, commands, platform configs, quality workflow. No hook runtime. |
| `opencode` | 3 | Default OpenCode setup. Deliberately excludes `hooks-runtime`. |
| `core` | 6 | Harness baseline with commands, hooks, platform configs, quality workflow. |
| `developer` | 9 | Default engineering profile. |
| `security` | 7 | Baseline plus security-specific guidance. |
| `research` | 9 | Investigation, synthesis, publishing. |
| `full` | 26 | Everything currently classified. |

Component IDs are namespaced `baseline:`, `lang:`, `framework:`, `capability:`, plus `agent:`, `skill:`, and `locale:` families. `forge catalog components --family capability` lists them. Details in [SELECTIVE-INSTALL-ARCHITECTURE.md](SELECTIVE-INSTALL-ARCHITECTURE.md) and [capability-surface-selection.md](capability-surface-selection.md).

You can also install individual skills without a profile:

```bash
forge install --target claude --skills continuous-learning-v2,tdd-workflow
```

And translated docs, for the Claude targets only:

```bash
forge install --target claude --locale ja-JP
```

## Choosing a hook profile

FORGE ships lifecycle hooks. The profile decides how many of them run. Valid values are `minimal`, `standard`, and `strict`; an invalid value falls back to `standard` (`VALID_PROFILES` in `scripts/lib/hook-flags.js`).

| Profile | What runs | Choose it when |
|---|---|---|
| `minimal` | Only hooks tagged `minimal` — in the PostToolUse dispatcher that is the metrics bridge and the Bash sub-dispatcher; in the Bash dispatcher, the `--no-verify` block | You want lifecycle telemetry and the hard safety floor, nothing else |
| `standard` (default) | Everything except the `strict`-only Bash checks: quality gate, design-quality check, post-edit accumulator, console warnings, governance capture, session activity, context monitor, continuous-learning observation, skill-run tracking | Normal day-to-day engineering |
| `strict` | Everything, including auto-tmux for dev servers, tmux reminders, and git-push reminders | You want the harness to police workflow habits, not just code |

Two more controls, independent of profile:

- `hooks_enabled: false` (plugin option) or `FORGE_HOOKS_ENABLED=false` turns the whole hook runtime off.
- `FORGE_DISABLED_HOOKS=post:quality-gate,pre:bash:tmux-reminder` disables individual hook IDs while leaving the rest on.

Setting the profile:

```bash
# Claude Code plugin path — persists in settings.json
forge setup --mode claude-plugin --scope user --hooks strict

# Any harness, for one shell
FORGE_HOOK_PROFILE=minimal claude
```

Precedence is documented in [CONFIGURATION.md](CONFIGURATION.md#precedence). Hook behavior in depth is in [HOOKS-GUIDE.md](HOOKS-GUIDE.md).

If a profile or module set would materialize the hook runtime, `forge install` requires you to say so explicitly with `--enable-hooks`, or to opt out with `--no-hooks`. That gate exists so a hook runtime never lands on a machine by accident.

## Verifying the install

Run these in order. Each one answers a different question.

```bash
# 1. Is the CLI on PATH and which commands does it expose?
forge --help

# 2. What did FORGE install into this home/project context?
forge list-installed
forge list-installed --json

# 3. Are the managed files still where install-state says they are?
forge doctor
forge doctor --target cursor --json

# 4. What does the state store know about sessions and install health?
forge status
forge status --exit-code
```

`forge doctor` reports per-target `OK`, `WARNING`, or `ERROR` with issue codes. `forge status --exit-code` returns 2 when readiness needs attention, which makes it usable as a CI or shell gate.

For the Claude Code plugin path specifically, confirm with the harness itself rather than with FORGE:

```bash
claude plugin marketplace list
claude plugin list
```

You should see exactly one `forge@forge` entry, in exactly one scope.

If `forge doctor` reports drift, `forge repair` rebuilds the managed files recorded in install-state:

```bash
forge repair --dry-run
forge repair --target claude
```

## Keeping it current

```bash
forge auto-update --dry-run
forge auto-update --target claude
```

`auto-update` pulls the latest repository changes and reinstalls the current context's managed targets using the original install-state request, so your profile and component choices survive the update. It infers the repository root from the recorded operations, or takes `--repo-root <path>`.

For the plugin path, re-running `forge setup` updates the installed `forge@forge` in place.

## Uninstalling

### File installs

```bash
forge uninstall --dry-run
forge uninstall --target cursor
forge uninstall --target antigravity --dry-run --json
```

The uninstaller removes only files recorded in install-state. Dry-run output is explicitly labeled `WOULD UNINSTALL (dry run)` so it cannot be mistaken for a completed removal. Files FORGE did not write are retained and reported.

If no install-state is found, the uninstaller also looks for legacy `sync-forge-to-codex.sh` artifacts, but only when a legacy ownership manifest is present. Force that path with `--legacy-codex-sync`, which additionally cleans marker-only `AGENTS.md` blocks.

### Claude Code plugin

Remove it through the harness, since Claude Code owns the plugin cache:

```bash
claude plugin uninstall forge@forge --scope user
claude plugin marketplace remove forge
```

Then delete the FORGE block from `pluginConfigs` in the relevant `settings.json` if you want the hook preference gone as well.

### Adapter installers

Kiro, Trae, and CodeBuddy manage their own manifests. Use `.trae/uninstall.sh` and `.codebuddy/uninstall.sh`. The Kiro installer does not ship an uninstaller; remove the copied directories under `.kiro/` by hand.

### Leftovers

None of the uninstall paths touch these. Remove them yourself if you want a clean machine:

| Path | What it holds |
|---|---|
| `~/.claude/forge/state.db` | SQLite state store: sessions, skill runs, work items, install health |
| `<project>/.forge/memory/` | Project and team memory vaults |
| `~/.forge/memory/` | User-scope memory vault |
| Plan Canvas state directory | Review-session state; relocatable with `FORGE_PLAN_CANVAS_STATE_DIR` |

## Troubleshooting

| Symptom | Likely cause | Check |
|---|---|---|
| `Error: Unknown command: <x>` from `forge` | Not a registered command and not a legacy language name | `forge --help` |
| `Git is required for Claude marketplace setup` | `git` missing from `PATH` | `git --version` |
| `forge setup` refuses with a marketplace collision | A marketplace named `forge` exists that is not the official source | `claude plugin marketplace list` |
| `is already installed at <scope> scope` | Scope change attempted without migration | rerun with `--move-scope --yes` |
| Slash commands appear twice | Two install paths stacked on one harness | `forge list-installed` and `claude plugin list` |
| Hooks do not fire | Hooks disabled, or the hook's profile does not include your current profile | [CONFIGURATION.md](CONFIGURATION.md), [HOOKS-GUIDE.md](HOOKS-GUIDE.md) |
| `MODULE_NOT_FOUND` on a `forge` subcommand | Dependencies not installed in a git clone | `npm install` in the checkout |

More cases in [../TROUBLESHOOTING.md](../TROUBLESHOOTING.md).

## Related pages

- [CONFIGURATION.md](CONFIGURATION.md) — environment variables, plugin options, precedence
- [CLI-REFERENCE.md](CLI-REFERENCE.md) — every binary, subcommand, and flag
- [HARNESS-MATRIX.md](HARNESS-MATRIX.md) — what each harness actually supports
- [SELECTIVE-INSTALL-ARCHITECTURE.md](SELECTIVE-INSTALL-ARCHITECTURE.md) — how manifests, modules, and install-state fit together
- [../guides/getting-started.md](../guides/getting-started.md) — the first twenty minutes after a successful install
