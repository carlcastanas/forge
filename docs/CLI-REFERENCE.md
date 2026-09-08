# CLI reference

Every binary the `forge-universal` package puts on `PATH`, every subcommand it routes to, and the flags each one actually parses. Flags here were read out of the argument parsers in `scripts/`, not paraphrased from prose. Where a script accepts something this page does not list, run its `--help`.

Prerequisites:

- FORGE installed as an npm package, or a repository checkout with `npm install` run. See [INSTALLATION.md](INSTALLATION.md).
- Node 18 or newer.

## Binaries

| Binary | Script | What it is |
|---|---|---|
| `forge` | `scripts/forge.js` | Command router. Dispatches to the scripts below. |
| `forge-universal` | `scripts/forge.js` | Alias for `forge`. |
| `forge-install` | `scripts/install-apply.js` | Legacy install entrypoint, kept for existing flows. Identical runtime to `forge install`. |
| `forge-control-pane` | `scripts/control-pane.js` | Local loopback operator control pane. |
| `forge-memory-mcp` | `scripts/memory-mcp.mjs` | Opt-in stdio MCP server over the memory vault. |
| `forge-plan-canvas` | `scripts/plan-canvas.js` | Browser-based plan review loop. |

Unknown arguments are an error almost everywhere. Most parsers throw `Unknown argument: <x>` rather than ignoring it, which means a typo fails loudly instead of silently changing behavior.

## forge

```text
forge <command> [args...]
forge [install args...]
forge --dry-run <command> [args...]
forge help <command>
```

Global behavior, from `resolveCommand` in `scripts/forge.js`:

- `--dry-run` anywhere in the argument list sets `FORGE_DRY_RUN=1` for the child process. Leading `--dry-run` tokens are stripped before command resolution.
- `--help` or `-h` as the first argument prints the router help.
- `help <command>` runs that command with `--help`.
- A first argument that is not a known command is an error, unless it starts with `-` or is a known legacy language name. In that case the whole argument list is routed to `install`. This is what makes `forge typescript` work.
- The exit code of the child process becomes the exit code of `forge`.

### Commands

| Command | Script | Purpose |
|---|---|---|
| `setup` | `setup.js` | Install or update the Claude plugin with guided scope and hook choices |
| `welcome` | `welcome.js` | Print the FORGE welcome output |
| `install` | `install-apply.js` | Install FORGE content, including the guided multi-harness wizard |
| `plan` (alias `install-plan`) | `install-plan.js` | Inspect selective-install manifests and resolved plans |
| `catalog` | `catalog.js` | Discover install profiles and component IDs |
| `consult` | `consult.js` | Recommend components and profiles from a natural-language query |
| `control-pane` | `control-pane.js` | Run the local operator control pane |
| `nasiko` | `nasiko.js` | Install or inspect the optional pinned Nasiko CLI bridge |
| `memory` | `memory.js` | Share durable context across harnesses |
| `list-installed` | `list-installed.js` | Inspect install-state files for the current context |
| `doctor` | `doctor.js` | Diagnose missing or drifted managed files |
| `feedback` | `feedback.js` | Print public feedback routes |
| `repair` | `repair.js` | Restore drifted or missing managed files |
| `auto-update` | `auto-update.js` | Pull latest changes and reinstall managed targets |
| `status` | `status.js` | Query the SQLite state store summary |
| `platform-audit` | `platform-audit.js` | Audit GitHub queues, discussions, roadmap, release, and security evidence |
| `security-ioc-scan` | `ci/scan-supply-chain-iocs.js` | Scan for active supply-chain IOC markers |
| `sessions` | `sessions-cli.js` | List or inspect sessions |
| `work-items` | `work-items.js` | Track linked Linear, GitHub, handoff, and manual work items |
| `session-inspect` | `session-inspect.js` | Emit canonical session snapshots |
| `loop-status` | `loop-status.js` | Inspect transcripts for stale loop wakeups and pending tool results |
| `uninstall` | `uninstall.js` | Remove managed files recorded in install-state |

Command availability moves with the release. Run `forge --help` against your installed version before scripting around a command.

---

## forge setup

Installs or updates the Claude Code plugin `forge@forge`.

```text
forge setup
forge setup --mode claude-plugin --scope user|project|local [options]
forge setup --mode claude-plugin --scope project --move-scope [options]
```

| Flag | Values | Effect |
|---|---|---|
| `--mode` | `claude-plugin` | Install mode |
| `--scope` | `user`, `project`, `local` | Where the plugin is enabled. `user` is global; `project` is committable; `local` is private to your checkout |
| `--hooks` | `off`, `minimal`, `standard`, `strict` | Saves a hook preference into Claude settings for that scope |
| `--move-scope` | flag | Explicitly request migration. Normally auto-detected |
| `--yes`, `-y` | flag | Skip the confirmation prompt |
| `--dry-run` | flag | Inspect and report without changing anything |
| `--json` | flag | Machine-readable output |
| `--help`, `-h` | flag | Show help |

A missing value for `--mode`, `--scope`, or `--hooks` throws `Missing value for <flag>`.

```bash
forge setup --mode claude-plugin --scope user --hooks standard --yes
forge setup --mode claude-plugin --scope local --dry-run --json
forge setup --mode claude-plugin --scope project --move-scope --yes
```

Re-running updates an existing install at its detected scope. Changing scope migrates: the destination is installed and verified before the source is removed.

---

## forge install / forge-install

Two modes share one entrypoint: the guided wizard and the direct installer.

### Guided wizard

```text
forge install --guided [options]
```

| Flag | Values |
|---|---|
| `--harness <id[,id...]>` | repeatable; `claude`, `codex`, `kimi`, or `all` |
| `--all-harnesses` | mutually exclusive with `--harness` |
| `--claude-scope` | `user`, `project`, `local` |
| `--claude-hooks` | `off`, `minimal`, `standard`, `strict` |
| `--profile` | `minimal`, `core`, `developer`, `security`, `research`, `full` (Kimi managed-project content profile) |
| `--yes`, `-y` | apply without confirmation |
| `--dry-run` | preflight and preview |
| `--json` | machine-readable output |
| `--help`, `-h` | show help |

Only Claude Code, Codex, and Kimi Code are guided-ready. Other harnesses go through `--target`.

### Direct install

```text
forge install [--target <target>] [--dry-run] [--json] <language> [<language> ...]
forge install [--target <target>] [--dry-run] [--json] --profile <name> [--with <c>]... [--without <c>]...
forge install [--target <target>] [--dry-run] [--json] --modules <id,id,...> [--with <c>]... [--without <c>]...
forge install [--target <target>] [--dry-run] [--json] --skills <skill-id[,skill-id...]>
forge install [--target claude|claude-project] [--dry-run] [--json] --locale <locale-code>
forge install [--dry-run] [--json] --config <path>
```

| Flag | Effect |
|---|---|
| `--target <target>` | Install target. Defaults to `claude` |
| `--profile <name>` | Resolve and install a manifest profile |
| `--modules <ids>` | Resolve and install explicit module IDs, comma-separated |
| `--with <component>` | Include a user-facing component. Repeatable |
| `--without <component>` | Exclude a user-facing component. Repeatable |
| `--skills <ids>` | Install skill directories by ID, comma-separated |
| `--locale <code>` | Install translated docs. `claude` and `claude-project` only; combinable with `--profile` or `--with` |
| `--config <path>` | Load install intent from a `forge-install.json` |
| `--enable-hooks` | Confirm installing the automatic hook runtime. Required when the selection materializes hooks |
| `--no-hooks` | Install everything except the hook runtime |
| `--dry-run` | Show the plan without copying files |
| `--json` | Emit machine-readable plan or result JSON |
| `--help` | Show help, including the live target, language, and locale lists |

Targets: `claude`, `claude-project`, `cursor`, `antigravity`, `codex`, `gemini`, `opencode`, `codebuddy`, `joycode`, `qwen`, `zed`, `hermes`, `kimi`, `openclaw`, `adal`.

Component ID grammar for `--with` and `--without`: `<family>:<id>`, where family is one of `baseline`, `lang`, `framework`, `capability`, `agent`, `skill`, `locale`.

If `--config` is not passed and no positional languages were given, a `forge-install.json` in the working directory is loaded automatically.

```bash
forge install --target claude --profile developer --dry-run
forge install --target cursor --profile core --with capability:security --without lang:java
forge install --target codex --modules agents-core,platform-configs --json
forge install --target claude --skills tdd-workflow,verification-loop
forge install --target claude --locale ja-JP
forge install --config ./forge-install.json --dry-run
forge typescript python          # legacy language mode, routed through the same runtime
```

Human-readable output prints mode, target, adapter, install root, install-state path, profile, included and excluded components, requested and selected modules, skipped and excluded modules, operation counts, warnings, and every `source -> destination` pair.

---

## forge plan

Read-only resolution. Never touches the filesystem.

```text
forge plan --list-profiles
forge plan --list-modules
forge plan --list-components [--family <family>] [--target <target>] [--json]
forge plan --profile <name> [--with <c>]... [--without <c>]... [--target <target>] [--json]
forge plan --modules <id,id,...> [--with <c>]... [--without <c>]... [--target <target>] [--json]
forge plan --skills <skill-id[,skill-id...]> [--target <target>] [--json]
forge plan --config <path> [--json]
```

| Flag | Effect |
|---|---|
| `--list-profiles` | List available install profiles |
| `--list-modules` | List install modules |
| `--list-components` | List user-facing components |
| `--family <family>` | Filter listed components by family |
| `--profile <name>` | Resolve a profile |
| `--modules <ids>` | Resolve explicit module IDs |
| `--with` / `--without <component>` | Adjust the resolved component set |
| `--skills <ids>` | Include skill components by directory ID. Bare IDs are prefixed with `skill:` automatically |
| `--config <path>` | Load install intent from a config file |
| `--target <target>` | Filter the plan for one target |
| `--json` | Machine-readable JSON |
| `--help`, `-h` | Show help |

`install-plan` is a registered alias for `plan`.

```bash
forge plan --list-profiles
forge plan --list-components --family capability --json
forge plan --profile developer --target cursor --json
forge plan --skills continuous-learning-v2 --target claude
```

---

## forge catalog

```text
forge catalog profiles [--json]
forge catalog components [--family <family>] [--target <target>] [--json]
forge catalog show <component-id> [--json]
```

| Flag | Effect |
|---|---|
| `--family <family>` | Filter by component family. Aliases are normalized (for example `language` for `lang`) |
| `--target <target>` | Filter to components available for a target |
| `--json` | Machine-readable JSON |
| `--help`, `-h` | Show help |

Running `forge catalog` with no subcommand prints help.

```bash
forge catalog profiles
forge catalog components --family language
forge catalog components --target codex --json
forge catalog show framework:nextjs
```

---

## forge consult

Turns a natural-language description into a recommended profile and component set.

```text
forge consult "<query>" [--target <target>] [--limit <n>] [--json]
forge consult <word> <word> ... [--target <target>]
```

| Flag | Default | Effect |
|---|---|---|
| `--target <target>` | script default | Install target used in the suggested commands |
| `--limit <n>` | script default | Maximum component recommendations. Must be a positive integer |
| `--json` | off | Machine-readable consultation JSON |
| `--help` | — | Show help, including the live defaults |

Unquoted words are joined into one query.

```bash
forge consult "security reviews"
forge consult "Next.js React app" --target cursor
forge consult "operator workflows" --target codex --json
```

---

## forge list-installed

```text
forge list-installed [--target <target>] [--json]
```

`--target` is repeatable. With no target, every target discoverable in the current home and project context is inspected. Only records that exist are reported.

Human output per target: adapter id, install root, install timestamp, profile (or `(legacy/custom)`), selected modules, legacy languages, and source repository version. An unreadable state file is reported as `INVALID (<error>)`.

```bash
forge list-installed
forge list-installed --target claude --target cursor
forge list-installed --json
```

---

## forge doctor

```text
forge doctor [--target <target>] [--json]
```

`--target` is repeatable. Reports per-target `OK`, `WARNING`, or `ERROR`, the install-state path, and a list of issues as `[severity] code: message`. When nothing is found it prints the problem-report routes instead.

```bash
forge doctor
forge doctor --target antigravity --json
```

---

## forge repair

```text
forge repair [--target <target>] [--dry-run] [--json]
```

Rebuilds the files recorded in install-state. `--target` is repeatable. Human output gives per-target status, install-state path, and either planned or repaired path counts, then a summary line `checked=<n>, planned|repaired=<n>, errors=<n>`.

```bash
forge repair --dry-run
forge repair --target cursor
```

---

## forge uninstall

```text
forge uninstall [--target <target>] [--legacy-codex-sync] [--dry-run] [--json]
```

| Flag | Effect |
|---|---|
| `--target <target>` | Repeatable target selector |
| `--legacy-codex-sync` | Force the legacy `sync-forge-to-codex.sh` cleanup path, including marker-only `AGENTS.md` cleanup |
| `--dry-run` | Preview only. Status renders as `WOULD UNINSTALL (dry run)` and the header says nothing was removed |
| `--json` | Machine-readable output |

Only files recorded in install-state are removed. Retained paths are counted and reported. Without install-state, legacy Codex sync artifacts are detected only when a legacy ownership manifest is present.

```bash
forge uninstall --dry-run
forge uninstall --target antigravity
forge uninstall --legacy-codex-sync --dry-run --json
```

---

## forge auto-update

```text
forge auto-update [--target <target>] [--repo-root <path>] [--dry-run] [--json]
```

Pulls the latest repository changes, then reinstalls the current context's managed targets using the original install-state request. The repository root is inferred from recorded operation paths unless `--repo-root` is given; if it cannot be inferred, the command fails with `Unable to infer FORGE repo root from install-state operations`.

```bash
forge auto-update --dry-run
forge auto-update --target claude --repo-root ~/src/forge
```

---

## forge status

```text
forge status [--db <path>] [--json|--markdown] [--write <path>] [--limit <n>] [--exit-code]
```

| Flag | Default | Effect |
|---|---|---|
| `--db <path>` | `~/.claude/forge/state.db` | SQLite state store to query |
| `--json` | off | JSON output. Mutually exclusive with `--markdown` |
| `--markdown` | off | Markdown output |
| `--write <path>` | none | Write the JSON or Markdown output to a file |
| `--limit <n>` | `5` | Rows per section |
| `--exit-code` | off | Exit 2 when readiness needs attention |
| `--help`, `-h` | — | Show help |

Reports active sessions, recent skill runs, install health, pending governance events, and linked work items. Passing both `--json` and `--markdown` throws. A `--db`, `--write`, or `--limit` flag with no value throws.

```bash
forge status
forge status --json
forge status --markdown --write status.md
forge status --exit-code
```

---

## forge sessions

```text
forge sessions [<session-id>] [--db <path>] [--json] [--limit <n>]
```

With no session id, lists recent sessions: id, harness and adapter, state, repository root, start and end timestamps, and worker count. With an id, inspects that session including worker, skill-run, and decision detail. `--limit` defaults to 10.

```bash
forge sessions
forge sessions --limit 25 --json
forge sessions session-active --json
```

---

## forge work-items

```text
forge work-items list [--db <path>] [--json] [--limit <n>]
forge work-items show <id> [--db <path>] [--json]
forge work-items upsert [<id>] --title <title> [options] [--json]
forge work-items close <id> [--status done] [--db <path>] [--json]
forge work-items claim [<id>] --owner <name> [--as agent|human] [--db <path>] [--json]
forge work-items sync-github --repo <owner/repo> [--db <path>] [--json]
```

| Flag | Effect |
|---|---|
| `--id <id>` | Stable local work-item id for upsert |
| `--title <title>` | Item title. Required for upsert |
| `--source <source>` | Source system: `linear`, `github`, `handoff`, `manual` |
| `--source-id <id>` | Source-local identifier, for example `FORGE-20` or a PR number |
| `--status <status>` | `open`, `in-progress`, `blocked`, `done`, or another label |
| `--priority <priority>` | Optional priority label |
| `--url <url>` | Optional source URL |
| `--owner <owner>` | Owner label. Required for `claim` |
| `--as <agent\|human>` | On claim, records whether the owner is an agent or a person |
| `--repo-root <path>` | Repository root to associate |
| `--repo <path>` | GitHub repo for `sync-github`; otherwise an alias for `--repo-root` |
| `--github-repo <owner/repo>` | Explicit GitHub repo for `sync-github` |
| `--session-id <id>` / `--session <id>` | Associated session id |
| `--metadata-json <json>` | JSON metadata payload |
| `--db <path>` | SQLite state database |
| `--limit <n>` | Row limit for `list` |
| `--json` | Machine-readable output |

`--repo` is context-sensitive: under `sync-github` it means the GitHub repository, everywhere else it means the repository root. When `FORGE_GH_SHIM` is set, `sync-github` runs `node <shim>` instead of `gh`.

```bash
forge work-items list --json
forge work-items upsert linear-forge-20 --source linear --source-id FORGE-20 \
  --title "Review control-plane contract" --status blocked
forge work-items claim linear-forge-20 --owner review-agent --as agent
forge work-items close linear-forge-20 --status done
forge work-items sync-github --repo carlcastanas/forge
```

---

## forge session-inspect

```text
forge session-inspect <target> [--adapter <id>] [--target-type <type>] [--write <output.json>]
forge session-inspect --list-adapters
```

Targets:

| Target form | Meaning |
|---|---|
| `<plan.json>` | Orchestration or dmux plan file |
| `<session-name>` | Dmux session name, when the coordination directory exists |
| `claude:latest` | Most recent Claude session history entry |
| `claude:<id\|alias>` | Specific Claude session or alias |
| `<session.tmp>` | Direct path to a Claude session file |
| `skills:health` | Skill failure and success patterns from observations |
| `skills:amendify` | Propose a `SKILL.md` patch from failure evidence |
| `skills:evaluate` | Compare baseline against amended skill outcomes |

Additional flags parsed: `--adapter <id>`, `--target-type <type>`, `--skill <id>`, `--amendment-id <id>`, `--observations <path>`, `--write <path>`, `--list-adapters`.

Output conforms to the `forge.session.v1` snapshot defined in [SESSION-ADAPTER-CONTRACT.md](SESSION-ADAPTER-CONTRACT.md).

```bash
forge session-inspect claude:latest
forge session-inspect .claude/plan/workflow.json
forge session-inspect skills:amendify --skill api-design
forge session-inspect claude:a1b2c3d4 --write ./session.json
```

---

## forge loop-status

```text
forge loop-status [--json] [--home <dir>] [--limit <n>] [--watch]
forge loop-status --transcript <session.jsonl> [--json] [--watch]
```

| Flag | Default | Effect |
|---|---|---|
| `--json` | off | Machine-readable status |
| `--home <dir>` | real home | Home directory to scan |
| `--transcript <path>` | none | Inspect one transcript directly |
| `--limit <n>` | `10` | Maximum recent transcripts to inspect |
| `--bash-timeout-seconds <n>` | `1800` | Age at which a pending Bash call counts as stale |
| `--wake-grace-multiplier <n>` | `2` | Grace multiplier for scheduled wakeups |
| `--now <time>` | now | Override the current time: ISO, epoch ms, or `now` |
| `--exit-code` | off | Exit 2 on attention signals, 1 on scan errors |
| `--watch` | off | Refresh until interrupted |
| `--watch-count <n>` | unlimited | Stop after n refreshes |
| `--watch-interval-seconds <n>` | `5` | Seconds between refreshes |
| `--write-dir <dir>` | none | Write `index.json` and per-session snapshots |

A flag that requires a value and is given none throws `<flag> requires a value`.

```bash
forge loop-status --json
forge loop-status --watch --watch-interval-seconds 10
forge loop-status --transcript ~/.claude/projects/-repo/session.jsonl
```

---

## forge memory

Cross-harness durable context. Writes are create-only and reject known credential shapes. Tool-created memories are unreviewed context, never executable policy.

```text
forge memory init [--scope project|team|user] [--json]
forge memory save --title <text> (--stdin | --body-file <path>) [options]
forge memory handoff --from <harness> --target <harness> --title <text> (--stdin | --body-file <path>) [options]
forge memory search [query] [--scope <scope>] [--target-harness <harness>] [--kind <kind>] [--limit <n>] [--json]
forge memory read <memory-id> [--scope <scope>] [--json]
forge memory doctor [--scope <scope>] [--json]
```

| Write option | Effect |
|---|---|
| `--scope <scope>` | `project` (default), `team`, or `user` |
| `--source-harness <name>` | Originating harness. Defaults to `FORGE_MEMORY_HARNESS`, else `unknown` |
| `--target <name>` | Repeatable target harness. Defaults to all |
| `--kind <kind>` | `context`, `decision`, `fact`, `handoff`, `lesson`, `note`, `preference`, or `runbook` |
| `--tag <tag>` | Repeatable lowercase tag |
| `--link <memory-id>` | Repeatable related memory id |
| `--stdin` | Read the body from standard input |
| `--body-file <path>` | Read the body from a regular, non-symlink file |

Default recall scopes are `project` and `team`. User scope must be requested explicitly with `--scope user`.

```bash
forge memory init --scope project --scope team
echo "Auth migration blocked on the session-token rename." \
  | forge memory save --title "Auth migration blocker" --kind decision --stdin
forge memory handoff --from codex --target claude --title "Continue migration" --stdin
forge memory search "migration blockers" --target-harness hermes --json
forge memory read mem_auth_migration_blocker
forge memory doctor --json
```

---

## forge nasiko

Optional bridge to a separately installed, pinned Nasiko CLI.

```text
forge nasiko status [--install-dir <absolute-path>] [--json]
forge nasiko install --version <vX.Y.Z> --yes [--install-dir <absolute-path>] [--json]
forge nasiko install --version <vX.Y.Z> --dry-run [--install-dir <absolute-path>] [--json]
forge nasiko uninstall --version <vX.Y.Z> --yes [--install-dir <absolute-path>] [--json]
```

| Flag | Effect |
|---|---|
| `--version <v>` | Pinned release. Required for install and uninstall |
| `--install-dir <path>` | Absolute install directory |
| `--yes`, `-y` | Confirm the mutation |
| `--dry-run` | Preview only |
| `--json` | Machine-readable output |

The installer is opt-in, accepts only qualified pinned releases, verifies SHA-256 digests before extraction, and never executes fetched shell or PowerShell code. `FORGE_NASIKO_CLI_EXECUTABLE` must be an absolute path.

---

## forge platform-audit

```text
forge platform-audit [options]
```

| Flag | Default | Effect |
|---|---|---|
| `--format <text\|json\|markdown>` | `text` | Output format |
| `--json` | — | Alias for `--format json` |
| `--markdown` | — | Alias for `--format markdown` |
| `--write <path>` | none | Write JSON or Markdown output to a file |
| `--root <dir>` | cwd | Repository root to inspect |
| `--repo <owner/repo>` | none | GitHub repo to inspect. Repeatable |
| `--skip-github` | off | Skip live GitHub queue and discussion checks |
| `--max-open-prs <n>` | `20` | Fail above this open PR count |
| `--max-open-issues <n>` | `20` | Fail above this open issue count |
| `--max-dirty-files <n>` | `0` | Fail above this blocking dirty-file count |
| `--allow-untracked <path>` | none | Ignore untracked files under a path. Repeatable |
| `--use-env-github-token` | off | Keep `GITHUB_TOKEN` when invoking `gh` |
| `--exit-code` | off | Return 2 when the audit is not ready |

```bash
forge platform-audit --json --allow-untracked docs/drafts/
forge platform-audit --skip-github --exit-code
```

---

## forge security-ioc-scan

```text
forge security-ioc-scan [options]
```

| Flag | Default | Effect |
|---|---|---|
| `--root <dir>` | repository root | Directory to scan |
| `--home` | off | Also scan user-level Claude, VS Code, LaunchAgent, systemd, local bin, and `/tmp` persistence targets |
| `--home-dir <dir>` | real home | Home directory to use with `--home` |
| `--json` | off | JSON instead of text |
| `--help`, `-h` | — | Show help |

Scans dependency manifests, lockfiles, installed package payloads, and AI-tool persistence paths for supply-chain IOC markers.

```bash
forge security-ioc-scan --home
forge security-ioc-scan --root /path/to/project --json
```

---

## forge feedback

```text
forge feedback [--json] [--help|-h]
```

Prints the public routes for install problems, quick feedback, and feature ideas. It uploads nothing and reads no project files.

---

## forge welcome

```text
forge welcome
```

Prints the FORGE welcome output.

---

## forge-control-pane

A loopback-only HTTP server over the FORGE state store.

```text
forge-control-pane [--host 127.0.0.1] [--port 8765] [--db <forge2.db>] [--state-db <state.db>] [--config <forge2.toml>] [--query <text>]
```

| Flag | Default | Effect |
|---|---|---|
| `--host <h>` | `127.0.0.1` | Bind host |
| `--port <n>` | `8765` | Port. Must be 0-65535, otherwise `Invalid --port value` |
| `--db <path>` | from config or `FORGE2_DB_PATH` | Control-pane database |
| `--state-db <path>` | from config or `FORGE_STATE_DB_PATH` | State store holding agent work items |
| `--config <path>` | default config paths | TOML config file |
| `--query <text>` | empty | Initial query |
| `--read-only` | off | Disable action execution endpoints |
| `--no-open` | off | Do not open a browser after start |
| `--help`, `-h` | — | Show help |

On start it prints the URL, the database paths, and whether actions are enabled or read-only. A browser is opened automatically on macOS only. Host and Origin headers are gated through a shared loopback guard.

```bash
forge-control-pane --port 8765
forge-control-pane --read-only --no-open
forge-control-pane --state-db ~/.claude/forge/state.db --query "blocked"
```

Also reachable as `forge control-pane` and `npm run control:pane`.

---

## forge-plan-canvas

A browser review loop that lets a person respond to an agent mid-task.

```text
forge-plan-canvas                      Show server status and sessions
forge-plan-canvas open <file>          Open (or resume) a review session
forge-plan-canvas await <file>         Block until the human sends feedback
forge-plan-canvas pending              Show feedback queued for no listener
forge-plan-canvas typing <file>        Show a thinking/typing indicator in chat
forge-plan-canvas end <file>           End a session as the agent
forge-plan-canvas stop                 Shut down the canvas server
forge-plan-canvas server               Run the server in the foreground
```

| Subcommand | Flags |
|---|---|
| `open` | `--no-open` (do not launch a browser), `--reopen` (reopen a session the user ended from the browser) |
| `await` | `--reply <msg>` (show an agent reply before waiting), `--timeout-ms <n>` (return `{status:"waiting"}` after n ms; tests and debugging only) |
| `typing` | `--state <thinking\|typing\|idle>`, defaults to `typing` |
| `server` | `--port <n>`, `--host <h>` |

Environment: `FORGE_PLAN_CANVAS_PORT`, `FORGE_PLAN_CANVAS_STATE_DIR`, `FORGE_PLAN_CANVAS_IDLE_MS`. Requests are constrained to the loopback host and an allowlist of safe paths; anything else throws.

```bash
forge-plan-canvas open ./PLAN.md
forge-plan-canvas await ./PLAN.md --reply "Draft ready for review"
forge-plan-canvas stop
```

---

## forge-memory-mcp

A stdio MCP server exposing the memory vault. It takes no command-line flags; it is configured entirely through the environment and started by an MCP client.

Tools:

| Tool | Purpose |
|---|---|
| `memory_save` | Create an unreviewed memory. Create-only |
| `memory_search` | Search memories within the allowed scopes |
| `memory_read` | Read one memory by id |
| `memory_doctor` | Report vault health |

Protocol versions accepted: `2025-11-25` (latest), `2025-06-18`, `2025-03-26`, `2024-11-05`, `2024-10-07`. Message and response payloads are capped at 1 MiB.

Environment that matters: `FORGE_MEMORY_HARNESS` (set a distinct lowercase identity per harness), `FORGE_MEMORY_PROJECT_ROOT`, `FORGE_MEMORY_USER_ROOT`, and `FORGE_MEMORY_ALLOW_USER_SCOPE=1` to permit user-scope access. Run one server process per harness; do not share one.

Startup fails with a clear message if the `ajv` dependency is missing.

---

## npm scripts

Repository-only. These are not on `PATH` after a package install; run them from a checkout.

| Script | Command |
|---|---|
| `npm test` | The full validation chain, ending in `node tests/run-all.js` |
| `npm run lint` | ESLint plus markdownlint |
| `npm run coverage` | c8 with line, function, branch, and statement thresholds |
| `npm run catalog:check` / `catalog:sync` | Verify or regenerate the catalog |
| `npm run command-registry:check` / `:write` / `:generate` | Verify or regenerate the command registry |
| `npm run harness:adapters` | Harness adapter compliance scorecard |
| `npm run harness:audit` | Harness audit |
| `npm run platform:audit` | Platform audit |
| `npm run security:ioc-scan` | Supply-chain IOC scan |
| `npm run security:advisory-sources` | Advisory source check |
| `npm run observability:ready` | Observability readiness |
| `npm run operator:dashboard` | Operator readiness dashboard |
| `npm run control:pane` | Control pane |
| `npm run dashboard` / `dashboard:web` | Python dashboard / Node web dashboard |
| `npm run orchestrate:status` / `:worker` / `:tmux` | Orchestration helpers |
| `npm run build:opencode` | Build the OpenCode plugin bundle. Runs on `prepack` |
| `npm run preview-pack:smoke` | Packed-artifact smoke test |
| `npm run release:approval-gate` / `release:video-suite` | Release gates |
| `npm run discussion:audit` | Discussion audit |
| `npm run claw` | OpenClaw helper |

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Error. `forge` prints `Error: <message>` to stderr |
| `2` | Attention needed. Used by `forge status --exit-code`, `forge loop-status --exit-code`, and `forge platform-audit --exit-code` |

`forge` propagates the child process exit code. A child terminated by a signal raises an error rather than silently returning success.

## Related pages

- [INSTALLATION.md](INSTALLATION.md) — install paths and prerequisites
- [CONFIGURATION.md](CONFIGURATION.md) — environment variables the CLI reads
- [RECIPES.md](RECIPES.md) — these commands assembled into task-shaped sequences
- [../COMMANDS-QUICK-REF.md](../COMMANDS-QUICK-REF.md) — in-harness slash commands, which are a different surface from this CLI
