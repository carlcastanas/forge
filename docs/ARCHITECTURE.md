# Architecture

How the pieces of FORGE fit together: what the canonical catalog is, why the harness adapter
directories are projections rather than sources, how an install resolves from a profile down to
a file copy, how hooks dispatch, what happens across a session, and where state ends up on
disk.

Prerequisites: [CONCEPTS.md](CONCEPTS.md) for the vocabulary, and
[DEVELOPMENT.md](DEVELOPMENT.md) for the repository layout this page assumes. Every claim below
was read out of the file named beside it.

## The canonical catalog and its projections

Six directories hold the system. Everything else that looks like content is generated from them
or copied by the installer.

```text
                      CANONICAL CATALOG
   agents/      skills/      commands/     rules/     hooks/    scripts/hooks/
   68 files    318 dirs      94 files    121 files  hooks.json    53 files
                                                 codex-hooks.json
      |            |             |           |          |             |
      +------------+-------------+-----+-----+----------+-------------+
                                       |
                    +------------------+------------------+
                    |                                     |
            GENERATED PROJECTIONS                  INSTALLED COPIES
     .claude-plugin/plugin.json                manifests/ decides which
     .claude-plugin/marketplace.json           paths reach which target
     docs/COMMAND-REGISTRY.json                        |
     .opencode/dist (tsc)                     ~/.claude, ./.cursor, ~/.codex,
     counts in README.md / AGENTS.md          ./.zed, ~/.qwen, ...
```

A projection is anything a script regenerates. `scripts/ci/catalog.js` counts the directories
and rewrites the counts in `README.md`, `AGENTS.md`, `README.zh-CN.md`, the zh-CN doc mirrors,
`.claude-plugin/plugin.json`, and `.claude-plugin/marketplace.json`.
`scripts/ci/generate-command-registry.js` rewrites `docs/COMMAND-REGISTRY.json` from
`commands/`. `scripts/build-opencode.js` compiles `.opencode/` TypeScript into `.opencode/dist`
during `prepack`. None of those outputs is edited by hand.

The harness adapter directories at the repository root — `.claude-plugin/`, `.codex/`,
`.codex-plugin/`, `.cursor/`, `.gemini/`, `.opencode/`, `.zed/`, `.qwen/`, `.agents/`, `.kimi/`,
`.hermes/`, `.openclaw/`, `.adal/`, `.pi/`, `.trae/`, `.kiro/`, `.codebuddy/` — exist because
each harness expects a different on-disk shape. `.claude-plugin/plugin.json` points at
`./skills/` and `./commands/` directly. `.codex/agents/` holds three TOML agent definitions
shaped for Codex. `.cursor/hooks/` holds a per-event JavaScript file for Cursor's hook API;
`.cursor/hooks/adapter.js` translates Cursor's stdin payload into the Claude Code hook shape
and delegates to `scripts/hooks/*.js`, and the per-event files reuse the same hook ids, the same
profile gate, and helpers from `scripts/lib/`.

### Why an adapter must never become a second source of truth

The rule is one sentence in [CLAUDE.md](../CLAUDE.md) and it has teeth. If behavior lands only
in `.cursor/hooks/before-shell-execution.js`, then:

- The Claude, Codex, OpenCode, Zed, Qwen, Antigravity, Hermes, OpenClaw, Kimi, JoyCode,
  CodeBuddy, and Adal users never receive it, and nothing reports that gap.
- `manifests/install-modules.json` does not know about it, so no profile installs it and
  `validate-install-manifests.js` cannot check it.
- `npm run harness:adapters` still prints `Harness Adapter Compliance: PASS`, because the
  adapter records in `scripts/lib/harness-adapter-compliance.js` describe support levels, not
  behavioral equivalence across twelve harnesses.
- The next person to regenerate or rebuild that adapter overwrites it.

The correct move is always: put the behavior in the catalog, add its path to a module in
`manifests/install-modules.json`, and let the adapter project it.

### Recorded harness support

`scripts/lib/harness-adapter-compliance.js` holds twelve adapter records — Claude Code, Codex,
OpenCode, Pi, Cursor, Gemini, Zed, dmux, Orca, Superset, Ghast, and Terminal-only. Each record
declares a state, its supported assets, unsupported surfaces, install on-ramps, verification
commands, risk notes, and the source documents it was derived from. `npm run harness:adapters`
validates those records and the documentation that quotes them. That list is deliberately
narrower than the fifteen install targets below: a target is a place files can be written; an
adapter record is a claim about what works there.

## The install pipeline

Fifteen targets, seven profiles, thirty-five modules, eighty-two components. The resolution
order runs from what a user asks for down to individual file operations.

```text
  user request                manifests/                    scripts/lib/
  ------------                ----------                    ------------

  --profile core       install-profiles.json
        |              7 profiles: minimal, opencode,
        |              core, developer, security,
        |              research, full
        v
   module id list  <---+
        |              |
  --with <component>   |      install-components.json
  --without <component>+      82 components in families:
        |                     baseline:  lang:  framework:
        |                     capability:  locale:
        |                     plus synthetic agent: and skill:
        v
   dependency closure         install-modules.json          install-manifests.js
        |                     35 modules, each with          resolveInstallPlan()
        |                       kind, paths[], targets[],
        |                       dependencies[], cost,
        |                       stability
        v
   target filter              module.targets must contain    install-targets/registry.js
        |                     the target, and the adapter    adapter.supportsModule()
        |                     must accept the module
        v
   file operations            adapter maps each source       install-targets/<name>.js
        |                     path to a destination          adapter.planOperations()
        v
   apply + record             copies files, writes           install-executor.js
                              install-state                  install-state.js
```

### Profiles

`manifests/install-profiles.json` defines seven profiles, each a list of module ids.
`validate-install-manifests.js` requires `core`, `developer`, `security`, `research`, and `full`
to exist; `minimal` and `opencode` are additional.

| Profile | Modules | Shape |
| --- | --- | --- |
| `minimal` | 5 | Rules, agents, commands, platform configs, quality workflow. No hook runtime |
| `opencode` | 3 | Commands, platform configs, quality workflow. Excludes `hooks-runtime` by design |
| `core` | 6 | `minimal` plus `hooks-runtime` |
| `developer` | 9 | `core` plus framework/language, database, orchestration |
| `security` | 7 | `core` plus the security module |
| `research` | 9 | `core` plus research APIs, business content, social distribution |
| `full` | 25 | Every currently classified module |

### Modules

A module is the unit the installer actually copies. Each entry in
`manifests/install-modules.json` carries an `id`, a `kind`, a `description`, a `paths` array of
repository-relative source paths, a `targets` array, a `dependencies` array, `defaultInstall`,
`cost`, and `stability`.

Dependencies are real and resolved transitively. Tracing one chain out of the manifest:

```text
machine-learning
  +-- framework-language --+-- rules-core
  |                        +-- agents-core
  |                        +-- commands-core
  |                        +-- platform-configs
  +-- workflow-quality ------- skill-unified-memory --- platform-configs
  +-- database --------------- platform-configs
  +-- devops-infra ----------- platform-configs
  +-- security --------------- workflow-quality
```

That is why `--profile core` reports seven selected modules for six requested: `workflow-quality`
depends on `skill-unified-memory`, which is pulled in even though no profile lists it.

Excluding a component that another selected module depends on is an error, not a silent drop.
`resolveInstallPlan` in `scripts/lib/install-manifests.js` throws
`Module <a> depends on excluded module <b>` rather than producing a broken install.

### Components

`manifests/install-components.json` holds 82 user-facing selections. A component is a friendly
name that expands to one or more module ids, grouped by family prefix: `baseline:`, `lang:`,
`framework:`, `capability:`, `locale:`, plus `agent:` and `skill:` entries. `--with` and
`--without` operate on these, never on modules directly, which is why several components map to
the same module — `lang:typescript`, `framework:react`, and `framework:nextjs` all resolve
through `framework-language`.

### Targets and path mapping

`SUPPORTED_INSTALL_TARGETS` in `scripts/lib/install-manifests.js` lists fifteen: `claude`,
`claude-project`, `cursor`, `antigravity`, `codex`, `gemini`, `opencode`, `codebuddy`,
`joycode`, `qwen`, `zed`, `hermes`, `openclaw`, `kimi`, `adal`. Each has an adapter in
`scripts/lib/install-targets/`.

The adapter owns two decisions: whether a module applies, and where each of its source paths
lands. `claude-home.js` declares `rootSegments: ['.claude']` and
`installStatePathSegments: ['forge', 'install-state.json']`, then remaps sources:

```text
  repository source          claude-home destination
  -----------------          -----------------------
  rules/                ->   ~/.claude/rules/forge/
  rules/common/x.md     ->   ~/.claude/rules/forge/common/x.md
  skills/               ->   ~/.claude/skills/
  docs/<locale>/        ->   ~/.claude/docs/<locale>/
  hooks/                ->   merged into the Claude settings hook block
  everything else       ->   ~/.claude/<same relative path>
```

The `rules/forge/` namespace exists so a FORGE install never collides with rules the user wrote
themselves. Other targets use different roots and a flat `forge-install-state.json` instead of
the `forge/` subdirectory.

Hook installation is a special case. `planClaudeHooksOperations` in
`scripts/lib/install-targets/helpers.js` merges the registrations into the harness settings file
rather than copying `hooks/hooks.json` verbatim, and the plan refuses to apply without an
explicit decision:

```text
Warnings:
- Applying this plan requires an explicit hook decision: --enable-hooks or --no-hooks.
```

That gate exists because hooks execute code on the user's machine on every tool call. Consent is
recorded, not assumed.

## Hook dispatch

`hooks/hooks.json` registers 24 matchers across seven lifecycle events. Every registration
starts with the same inline `node -e` resolver, which finds the plugin root — from
`CLAUDE_PLUGIN_ROOT`, then `~/.claude`, then the plugin and marketplace cache layouts — and
exports it. From there the entries split. The PreToolUse, PreCompact, SessionStart, and
PostToolUseFailure entries hand off through `scripts/hooks/plugin-hook-bootstrap.js`. The
PostToolUse, Stop, and SessionEnd entries carry their own inline wrapper that spawns the target
directly and drains stdout before exiting. Both paths land on
`scripts/hooks/run-with-flags.js`, except the three consolidated dispatchers, which are invoked
as scripts in their own right.

```text
  harness lifecycle event
          |
          v
  node -e root resolver  ->  plugin-hook-bootstrap.js (or an inline wrapper)
          |
          v
  run-with-flags.js <hookId> <script> <profilesCsv>
          |
          +-- hook-flags.js: enabled? profile match? not in FORGE_DISABLED_HOOKS?
          |        no  -> echo stdin, exit 0
          |
          +-- FORGE_DRY_RUN=1 -> print [DryRun] preview to stderr, echo stdin, exit 0
          |
          +-- module exports run()?  yes -> require() and await run(raw, ctx)  (in-process)
                                     no  -> spawnSync(node, script)  (30s timeout)
```

The registered entries, read out of `hooks/hooks.json`:

| Event | Hook id | Matcher | Entrypoint | Mode |
| --- | --- | --- | --- | --- |
| PreToolUse | `pre:bash:dispatcher` | `Bash` | `pre-bash-dispatcher.js` | sync |
| PreToolUse | `pre:powershell:gateguard-fact-force` | `PowerShell` | `gateguard-fact-force.js` | timeout 5 |
| PreToolUse | `pre:write:doc-file-warning` | `Write` | `doc-file-warning.js` | sync, warns only |
| PreToolUse | `pre:edit-write:suggest-compact` | `Edit\|Write` | `suggest-compact.js` | sync |
| PreToolUse | `pre:observe:continuous-learning` | `.*` | `observe-runner.js` | async, timeout 10 |
| PreToolUse | `pre:governance-capture` | `Bash\|PowerShell\|Write\|Edit\|MultiEdit` | `governance-capture.js` | timeout 10 |
| PreToolUse | `pre:config-protection` | `Write\|Edit\|MultiEdit` | `config-protection.js` | timeout 5 |
| PreToolUse | `pre:mcp-health-check` | `.*` | `mcp-health-check.js` | sync |
| PreToolUse | `pre:edit-write:gateguard-fact-force` | `Edit\|Write\|MultiEdit` | `gateguard-fact-force.js` | timeout 5 |
| PreCompact | `pre:compact` | `.*` | `pre-compact.js` | sync |
| SessionStart | `session:start` | `.*` | `session-start-bootstrap.js` | sync |
| SessionStart | `session-start:plan-canvas-sessions` | `.*` | `plan-canvas-sessions.js` | sync |
| PostToolUse | `post:dispatcher:sync` | `.*` | `posttooluse-dispatcher.js sync` | timeout 30 |
| PostToolUse | `post:dispatcher:async` | `.*` | `posttooluse-dispatcher.js async` | async, timeout 45 |
| PostToolUseFailure | `post:mcp-health-check` | `.*` | `mcp-health-check.js` | sync |
| PostToolUseFailure | `post:skill:track` | `Skill` | `skill-run-tracker.js` | sync |
| Stop | `stop:plan-canvas-pending` | `.*` | `plan-canvas-pending.js` | sync |
| Stop | `stop:format-typecheck` | `.*` | `stop-format-typecheck.js` | timeout 300 |
| Stop | `stop:check-console-log` | `.*` | `check-console-log.js` | sync |
| Stop | `stop:session-end` | `.*` | `session-end.js` | async, timeout 10 |
| Stop | `stop:evaluate-session` | `.*` | `evaluate-session.js` | async, timeout 10 |
| Stop | `stop:cost-tracker` | `.*` | `cost-tracker.js` | async, timeout 10 |
| Stop | `stop:desktop-notify` | `.*` | `desktop-notify.js` | async, timeout 10 |
| SessionEnd | `session:end:marker` | `.*` | `session-end-marker.js` | async, timeout 10 |

### The two fan-out dispatchers

Twenty-four registrations do not mean twenty-four hooks. Two of them are dispatchers that call
many sub-hooks in one process, each still gated by its own id and profile list.

`scripts/hooks/bash-hook-dispatcher.js` backs the Bash pre and post phases:

```text
  pre:bash:dispatcher (matcher Bash)
    +-- pre:bash:block-no-verify      minimal,standard,strict   block-no-verify.js
    +-- pre:bash:auto-tmux-dev        (default profiles)        auto-tmux-dev.js
    +-- pre:bash:tmux-reminder        strict                    pre-bash-tmux-reminder.js
    +-- pre:bash:git-push-reminder    strict                    pre-bash-git-push-reminder.js
    +-- pre:bash:commit-quality       strict                    pre-bash-commit-quality.js
    +-- pre:bash:gateguard-fact-force standard,strict           gateguard-fact-force.js

  post:bash:dispatcher (invoked from the async PostToolUse dispatcher)
    +-- post:bash:command-log-audit   (default profiles)        post-bash-command-log.js
    +-- post:bash:command-log-cost    (default profiles)        post-bash-command-log.js
    +-- post:bash:pr-created          standard,strict           post-bash-pr-created.js
    +-- post:bash:build-complete      standard,strict           post-bash-build-complete.js
```

`scripts/hooks/posttooluse-dispatcher.js` splits PostToolUse into a synchronous phase that can
influence the turn and an asynchronous phase that must not block it:

```text
  post:dispatcher:sync  (timeout 30)
    +-- post:edit:design-quality-check    Edit|Write|MultiEdit       standard,strict
    +-- post:edit:accumulator             Edit|Write|MultiEdit       standard,strict
    +-- post:edit:console-warn            Edit                       standard,strict
    +-- post:governance-capture           Bash|PowerShell|Write|...  standard,strict
    +-- post:session-activity-tracker     *                          standard,strict
    +-- post:forge-metrics-bridge         *                          minimal,standard,strict
    +-- post:forge-context-monitor        *                          standard,strict

  post:dispatcher:async (timeout 45)
    +-- post:bash:dispatcher              Bash                       minimal,standard,strict
    +-- post:quality-gate                 Edit|Write|MultiEdit       standard,strict
    +-- post:observe:continuous-learning  *                          standard,strict
    +-- post:skill:track                  Skill                      standard,strict
```

Consolidating into dispatchers is a context and latency decision: one Node process per phase
instead of eleven, and one place that owns stdin, pass-through, and exit codes.

### Profiles as a blast radius control

Three profiles exist: `minimal`, `standard` (the default), and `strict`. A registration's third
argument is the list of profiles in which it runs. Reading the tables above, `minimal` keeps
only the safety and metrics floor — `block-no-verify` and `forge-metrics-bridge` — while
`strict` adds the reminders and commit-quality gates that would be noise for most sessions.
`FORGE_DISABLED_HOOKS` removes individual ids on top of whatever the profile selects.

## Session lifecycle

```text
  SessionStart
    |  session-start-bootstrap.js resolves the plugin root, then spawns
    |  run-with-flags.js session:start scripts/hooks/session-start.js minimal,standard,strict
    |
    |  session-start.js (scripts/lib/utils.js + observer-sessions.js):
    |    - finds *-session.tmp files under the session search dirs, max age 7 days
    |    - dedupes by basename, newest wins
    |    - injects the most recent summary on stdout, capped at ~8000 chars
    |    - lists learned skills (max 6) and relevance-ranked instincts (max 6,
    |      confidence >= 0.7)
    |    - writes a session lease and detects the project type and package manager
    |
    |  plan-canvas-sessions.js restores any open plan canvas
    v
  ... turns ...
    |
    |  PreToolUse  -> gates and observations before each tool call
    |  PostToolUse -> sync phase (quality, metrics, context monitor)
    |                 async phase (bash post-processing, quality gate, learning)
    |  PreCompact  -> pre-compact.js writes an LLM-generated summary into the
    |                 active session file, so the next launch still reads a good
    |                 summary even though compaction was lossy
    v
  Stop  (fires after every assistant response, not once per session)
    |  sync:  plan-canvas-pending, stop-format-typecheck (timeout 300),
    |         check-console-log
    |  async: session-end.js reads the transcript JSONL at transcript_path,
    |         extracts user asks, tool names, and modified files, and rewrites
    |         the session summary between
    |         <!-- FORGE:SUMMARY:START --> and <!-- FORGE:SUMMARY:END -->
    |  async: evaluate-session, cost-tracker, desktop-notify
    v
  SessionEnd
       session-end-marker.js removes this session's lease; when the last lease
       for the project is gone it stops the observer for that project
```

Two details that surprise people. First, `Stop` is a per-response event, so `session-end.js`
runs many times in a session and updates the same summary file rather than appending a new one.
Second, the summary written at `Stop` is exactly what `session-start.js` reads back on the next
launch — that loop is the whole of cross-session continuity.

## Where state lives on disk

Two independent roots. The install root is where FORGE's files were written; the agent data home
is where a running FORGE keeps what it learns. They default to the same place under Claude Code
and diverge as soon as you run a second harness.

```text
  INSTALL ROOT                        (target adapter, rootSegments)
  ~/.claude/                          claude          ./.claude/    claude-project
    forge/install-state.json          what FORGE wrote, for repair and uninstall
    forge/state.db                    SQLite state store (sql.js), 0600, dir 0700
    rules/forge/                      installed rules, namespaced away from user rules
    skills/                           installed skills
    agents/  commands/  AGENTS.md     installed catalog
    settings.json                     hook registrations merged in, with consent

  other targets: ./.cursor/, ~/.codex/, ./.zed/, ~/.qwen/, ~/.hermes/, ./.agents/,
  ./.codebuddy/, ./.joycode/, ~/.openclaw/, ./.kimi-code/, ./.adal/, ./.gemini/,
  and the OpenCode config dir. Those record forge-install-state.json at their root.

  AGENT DATA HOME                     $FORGE_AGENT_DATA_HOME, default ~/.claude
    session-data/                     *-session.tmp summaries (canonical)
    sessions/                         legacy location, still searched
    skills/learned/                   skills the system wrote for itself
    metrics/costs.jsonl               cost records
    metrics/tool-usage.jsonl          tool activity

  ~/.claude/state/skill-runs.jsonl    skill execution telemetry. Note the literal
                                      ~/.claude: scripts/lib/skill-evolution/tracker.js
                                      builds this from the home directory and does
                                      not follow FORGE_AGENT_DATA_HOME

  MEMORY VAULT                        scripts/lib/memory-vault.js
    <project>/.forge/memory/          project scope
    ~/.forge/memory/                  global scope

  OBSERVER                            scripts/lib/observer-sessions.js
    $XDG_DATA_HOME/forge-homunculus/  or ~/.local/share/forge-homunculus/
      projects/                       per-project observer state and session leases
      projects.json                   project registry
```

`FORGE_AGENT_DATA_HOME` is resolved by `scripts/lib/agent-data-home.js`. A tilde is expanded. A
project may propose a value in `.cursor/forge-agent-data.json`, but only inside the default
Cursor or Claude data directories; anything else is refused with a warning. Running FORGE in two
harnesses on one machine without setting it means both write to `~/.claude` and their session
data collides.

The state store writes through `scripts/lib/state-store/index.js`, which refuses symlinks and
non-regular files at the database path, creates the directory `0700`, writes the file `0600`,
and replaces it atomically through a temporary file in the same directory.

## Related pages

| Page | Covers |
| --- | --- |
| [SELECTIVE-INSTALL-ARCHITECTURE.md](SELECTIVE-INSTALL-ARCHITECTURE.md) | The installer in more depth, including reinstall and ownership |
| [SESSION-ADAPTER-CONTRACT.md](SESSION-ADAPTER-CONTRACT.md) | The `forge.session.v1` snapshot adapters normalize into |
| [HOOKS-GUIDE.md](HOOKS-GUIDE.md) | Authoring a hook, exit codes, and the performance budget |
| [HARNESS-MATRIX.md](HARNESS-MATRIX.md) | Per-harness support levels |
| [architecture/cross-harness.md](architecture/cross-harness.md) | Cross-harness design notes |
| [THREAT-MODEL.md](THREAT-MODEL.md) | Trust boundaries around these same surfaces |
