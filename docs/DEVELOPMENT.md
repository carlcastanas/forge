# Development

The local loop for working inside the FORGE repository: where things live, what every script
does, which validator will reject your change and why, how to run one test instead of all of
them, and how to exercise hooks and installs without touching the setup you actually use.

Prerequisites: a green checkout as described in [../CONTRIBUTING.md](../CONTRIBUTING.md). This
page assumes `npm ci --ignore-scripts` has run and `npm test` passes before you started editing.

## Repository layout

Each directory below is the source of truth for exactly one thing. When two places describe the
same fact, the one named here wins and the other is a projection that must be regenerated.

| Path | Source of truth for |
| --- | --- |
| `agents/` | Subagent definitions. 68 Markdown files, one per agent, frontmatter required |
| `skills/` | Curated skills. 318 directories, each containing `SKILL.md` |
| `commands/` | Slash-command shims. 94 Markdown files; the filename is the command name |
| `rules/` | Rule text. 121 rule files across 22 stack directories, plus `rules/README.md` |
| `hooks/` | Which hook runs on which lifecycle event (`hooks.json`, `codex-hooks.json`) |
| `scripts/hooks/` | Hook behavior. The entrypoints the registrations above name |
| `scripts/ci/` | The validators. What "valid" means for every catalog surface |
| `scripts/lib/` | Shared helpers for scripts and hooks, including the install engine |
| `manifests/` | Which files get installed, for which target, under which profile |
| `schemas/` | JSON Schemas the validators enforce against the manifests and `hooks.json` |
| `mcp-configs/` | MCP server configuration templates |
| `contexts/` | Context presets: `dev`, `review`, `research` |
| `workflows/` | Native workflow scripts |
| `tests/` | Node suites (`*.test.js`) and Python suites (`test_*.py`) |
| `docs/` | Reference documentation, look-up oriented |
| `guides/` | Long-form narrative guides |
| `examples/` | Worked examples |
| `src/` | The Python `llm-abstraction` package built by `pyproject.toml` |
| `docker/` | Container harness for plugin-setup platform tests |

Harness adapter directories sit at the repository root as dotfiles: `.claude-plugin/`,
`.codex/`, `.codex-plugin/`, `.cursor/`, `.gemini/`, `.opencode/`, `.zed/`, `.qwen/`,
`.agents/`, `.kimi/`, `.hermes/`, `.openclaw/`, `.adal/`, `.pi/`, `.trae/`, `.kiro/`,
`.codebuddy/`. None of them is a source of truth. See
[ARCHITECTURE.md](ARCHITECTURE.md#the-canonical-catalog-and-its-projections) for why that rule
exists and what breaks when it is violated.

## Scripts, grouped by what they are for

Everything below is declared in `package.json`. Run with `npm run <name>`; `yarn <name>` is
equivalent.

### Before you commit

| Script | Runs | When you want it |
| --- | --- | --- |
| `test` | Nine validators, two consistency checks, then `tests/run-all.js` | Every commit. This is the gate |
| `lint` | `eslint .` then `markdownlint '**/*.md' --ignore node_modules` | Every commit. Not part of `test`, and it carries pre-existing findings — see the note below |
| `coverage` | `c8` over `scripts/**/*.{js,mjs}` running `tests/run-all.js`, thresholds 80/80/79/80 | After changing anything under `scripts/` |
| `links:check` | `scripts/ci/validate-links.js` | After adding or moving any doc link |
| `links:warn` | The same check in report-only mode, always exit 0 | While drafting, when you expect intermediate breakage |

`npm run lint` does not currently reach zero findings on a clean checkout. markdownlint reports
pre-existing issues in the translated `docs/<locale>/` trees and a few catalog files, and
`eslint .` aborts if a nested project inside the tree ships its own ESLint config that the root
flat config does not ignore. Capture the baseline before you edit, then lint your own diff:

```bash
npx markdownlint CONTRIBUTING.md docs/DEVELOPMENT.md
npx eslint scripts/hooks/my-hook.js
```

Neither lint failure blocks `npm test`, which is the gate that has to be green.

### Regeneration

| Script | Rewrites | Paired check |
| --- | --- | --- |
| `catalog:sync` | Counts in `README.md`, `AGENTS.md`, `README.zh-CN.md`, the zh-CN doc mirrors, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` | `catalog:check` |
| `command-registry:write` | `docs/COMMAND-REGISTRY.json` from `commands/` | `command-registry:check` |
| `command-registry:generate` | Nothing; prints registry statistics to stdout | — |
| `build:opencode` | `.opencode/dist` via `tsc -p .opencode/tsconfig.json`. Also runs as `prepack` | — |

`catalog:check` and `command-registry:check` both run inside `npm test`, so forgetting the
write step fails the build rather than shipping a stale number.

### Audits and readiness reports

These are diagnostic. None of them runs in `npm test`; several are wired into CI or release
workflows.

| Script | Reports |
| --- | --- |
| `harness:adapters` | Adapter compliance across the 12 recorded harnesses. Prints `Harness Adapter Compliance: PASS` and the adapter count |
| `harness:audit` | Scores this repository (or a consumer project) across eight harness categories out of 80 |
| `platform:audit` | Git cleanliness, GitHub queues, discussions, roadmap, release and security evidence |
| `observability:ready` | A 21-point readiness score across live status, session trace, tool activity, packaging, and release safety |
| `operator:dashboard` | Operator readiness dashboard |
| `discussion:audit` | Response coverage over the project's GitHub Discussions, emitted as `forge.discussion-audit.v1` |
| `security:ioc-scan` | Supply-chain indicators of compromise in dependencies and AI-tool persistence surfaces. Runs in the CI security job |
| `security:advisory-sources` | The advisory feeds the IOC scan consults |
| `preview-pack:smoke` | Smoke test over a packed preview artifact |
| `release:approval-gate` | Release approval gate evidence |
| `release:video-suite` | Release video suite generation |
| `test:plugin-setup-platform` | `docker/plugin-setup/run-platform-tests.js`. Requires Docker |

### Operator and runtime surfaces

These start long-running processes or drive an installed FORGE. They are not part of the
development loop for a catalog change.

| Script | Starts |
| --- | --- |
| `dashboard` | The Python TUI dashboard (`forge_dashboard.py`) |
| `dashboard:web` | The web dashboard server |
| `control:pane` | The local operator control pane |
| `claw` | The NanoClaw REPL, a dependency-free session-aware wrapper around `claude -p` |
| `orchestrate:status` | Orchestration status readout |
| `orchestrate:worker` | A Codex orchestration worker (bash) |
| `orchestrate:tmux` | The tmux worktree orchestrator |
| `welcome` | Prints the post-install message |

## The validator chain in `npm test`

`npm test` is a single `&&` chain. It stops at the first non-zero exit, so read the first
failure and ignore everything after it.

| Order | Step | Catches | Most common way to fail it |
| --- | --- | --- | --- |
| 1 | `check-unicode-safety.js` | Emoji, zero-width characters, bidirectional overrides, the Unicode Tag block, invisible math operators, and Hangul fillers in any tracked text file | Pasting content from a rendered web page or a chat client, which carries a variation selector or a zero-width joiner. `--write` auto-fixes `.md`, `.mdx`, and `.txt` |
| 2 | `validate-agents.js` | Missing or malformed frontmatter; `model` outside `haiku`/`sonnet`/`opus`; missing `tools`; duplicate keys | Omitting `tools` on a new agent, or writing `model: claude-sonnet-4` instead of `sonnet` |
| 3 | `validate-commands.js` | Empty or unreadable command files, unterminated frontmatter, cross-references to agents or skills that do not exist | Renaming a skill and leaving a command pointing at the old name |
| 4 | `validate-rules.js` | Rule file structure and placement under `rules/`. It reports 122 files: the 121 rules plus the index | Adding a rule outside a recognized stack directory |
| 5 | `validate-skills.js` | Missing or empty `SKILL.md`; frontmatter without `name` or `description`; a `description` written as a literal block scalar. Covers curated skills and the translated `docs/<locale>/skills/` mirrors — 837 directories in total | Writing an unquoted `description` that contains a colon, which breaks the YAML parse. Note that frontmatter findings are warnings by default; only structural findings fail. Pass `--strict` or set `CI_STRICT_SKILLS=1` to make them errors |
| 6 | `validate-hooks.js` | `hooks/hooks.json` against `schemas/hooks.schema.json`, unknown lifecycle event names, malformed matchers, missing entrypoints | Registering a hook whose `command` names a script path that does not exist |
| 7 | `validate-install-manifests.js` | Profiles, modules, and components against their schemas; unknown module references; duplicate path claims; **any curated skill not referenced by an install module** | Adding `skills/<name>/` without adding the path to a module in `manifests/install-modules.json` |
| 8 | `validate-no-personal-paths.js` | `/Users/<name>` and `C:\Users\<name>` in `README.md`, `skills/`, `commands/`, `agents/`, `docs/`, `.opencode/commands` | Pasting real terminal output into a doc without redacting the home directory |
| 9 | `validate-links.js` | Relative Markdown links that resolve nowhere, across root pages, `docs/`, and `guides/`. Locale trees are excluded on purpose | Linking a page you plan to add in a follow-up commit |
| 10 | `catalog:check` | Documented counts that disagree with the directories | Adding a skill and not running `catalog:sync` |
| 11 | `command-registry:check` | `docs/COMMAND-REGISTRY.json` out of date with `commands/` | Adding a command and not running `command-registry:write` |
| 12 | `tests/run-all.js` | Everything else | See [TESTING.md](TESTING.md) |

One validator runs in CI but not here: `scripts/ci/validate-workflow-security.js`. Run it by
hand after editing anything in `.github/workflows/`.

Each validator can be run on its own, which is much faster than the whole chain while you
iterate:

```bash
node scripts/ci/validate-skills.js
```

```text
Validated 837 skill directories
```

## Run one test file

`tests/run-all.js` spawns each `tests/**/*.test.js` as its own Node process, so every test file
is directly runnable:

```bash
node tests/hooks/check-hook-enabled.test.js
```

```text
=== Testing check-hook-enabled.js ===

No arguments:
  ✓ returns yes when no hookId provided

Default profile (standard):
  ✓ returns yes for hook with default profiles
  ...

Results: Passed: 9, Failed: 0
```

There is no test-name filter. To narrow further, comment out cases or add a temporary file
under `tests/` — the runner discovers by glob, not by a manifest.

Python tests are not part of `tests/run-all.js`. CI runs them separately:

```bash
python -m pytest tests/test_*.py -m "not integration"
python -m ruff check src tests
python -m mypy src
```

## Debug a hook locally

Two helpers under `scripts/hooks/` make hooks runnable outside a live agent session.

### Is this hook even enabled?

`check-hook-enabled.js` takes a hook id and the comma-separated profile list from the
registration, and prints `yes` or `no`:

```bash
node scripts/hooks/check-hook-enabled.js pre:bash:commit-quality strict
```

```text
no
```

That hook is registered for the `strict` profile only, and the default profile is `standard`.
Switch the profile and it turns on:

```bash
FORGE_HOOK_PROFILE=strict node scripts/hooks/check-hook-enabled.js pre:bash:commit-quality strict
```

```text
yes
```

The gate is implemented in `scripts/lib/hook-flags.js` and reads, in order of precedence:

| Variable | Values | Effect |
| --- | --- | --- |
| `FORGE_HOOKS_ENABLED` | `1/true/yes/on` or `0/false/no/off` | Master switch. Default on |
| `FORGE_HOOK_PROFILE` | `minimal`, `standard`, `strict` | Selected profile. An unrecognized value falls back to `standard` |
| `FORGE_DISABLED_HOOKS` | comma-separated hook ids | Disables those ids regardless of profile |
| `FORGE_HOOK_CONFIG` | a path | Managed config file; defaults to `<plugin root>/forge/setup.json` |

`CLAUDE_PLUGIN_OPTION_HOOKS_ENABLED` and `CLAUDE_PLUGIN_OPTION_HOOK_PROFILE` are consulted when
the matching `FORGE_` variable is absent, then the managed config file, then the defaults.

### Run the hook against a payload

`run-with-flags.js` is the wrapper every registration in `hooks/hooks.json` invokes. Its
signature is `run-with-flags.js <hookId> <scriptRelativePath> [profilesCsv]`, and it reads the
hook event as JSON on stdin. Feed it a payload by hand:

```bash
echo '{"tool":"Bash","tool_input":{"command":"git commit --no-verify -m x"}}' \
  | node scripts/hooks/run-with-flags.js pre:bash:block-no-verify \
    scripts/hooks/block-no-verify.js minimal,standard,strict
echo "exit=$?"
```

```text
BLOCKED: --no-verify flag is not allowed with git commit. Git hooks must not be bypassed.
exit=2
```

Set `FORGE_DRY_RUN=1` to see what would run without running it. The preview goes to stderr and
stdin is passed through unchanged with exit 0:

```bash
echo '{"tool":"Bash","tool_input":{"command":"git commit --no-verify -m x"}}' \
  | FORGE_DRY_RUN=1 node scripts/hooks/run-with-flags.js pre:bash:block-no-verify \
    scripts/hooks/block-no-verify.js minimal,standard,strict
```

```text
[DryRun] Hook "pre:bash:block-no-verify" would execute: scripts/hooks/block-no-verify.js (enabled=true, profiles=minimal,standard,strict) tool=Bash command=git commit --no-verify -m x
{"tool":"Bash","tool_input":{"command":"git commit --no-verify -m x"}}
```

Behavior worth knowing while debugging:

- Stdin is capped at 1 MiB. Past that, the wrapper suppresses pass-through rather than echoing
  a JSON document cut mid-stream, writes a warning to stderr, and sets
  `FORGE_HOOK_INPUT_TRUNCATED=1` for the hook.
- If the hook module exports `run`, the wrapper `require`s it and calls it in-process, awaiting
  the result so an `async run()` works. Otherwise it spawns a child Node process with a 30
  second timeout. A hook with module-scope side effects must not export `run`.
- Script paths are resolved against the plugin root and rejected if they escape it.
- Errors inside the wrapper fail open: stdin is echoed and the exit code is 0.

Several hooks are not registered individually. `pre:bash:dispatcher` fans out through
`scripts/hooks/bash-hook-dispatcher.js`, and the two PostToolUse entries fan out through
`scripts/hooks/posttooluse-dispatcher.js`. To debug one of those, call the sub-hook module
directly through `run-with-flags.js` using the id listed in the dispatcher source. The full map
is in [ARCHITECTURE.md](ARCHITECTURE.md#hook-dispatch).

## Test an install without touching your real setup

Two independent mechanisms, for two different problems.

### Preview the plan: `--dry-run`

`scripts/install-apply.js` computes the whole plan and prints it without writing anything.
`scripts/install-plan.js` does the same for inspection only and never writes at all. The `forge`
CLI accepts a global `--dry-run` that sets `FORGE_DRY_RUN=1` for the subcommand.

```bash
node scripts/install-apply.js --target claude --profile core --dry-run
```

```text
Dry-run install plan:

Mode: manifest
Target: claude
Adapter: claude-home
Install root: <home>/.claude
Install-state: <home>/.claude/forge/install-state.json
Profile: core
Included components: (none)
Excluded components: (none)
Requested modules: rules-core, agents-core, commands-core, hooks-runtime, platform-configs, workflow-quality
Selected modules: rules-core, agents-core, commands-core, hooks-runtime, platform-configs, skill-unified-memory, workflow-quality
Operations: 691

Warnings:
- Applying this plan requires an explicit hook decision: --enable-hooks or --no-hooks.

Planned file operations:
- rules/README.md -> <home>/.claude/rules/forge/README.md
...
```

Add `--json` for a machine-readable plan. `--dry-run` on its own is enough for reviewing
manifest changes: it exercises profile expansion, dependency resolution, target filtering, and
destination mapping without creating a file.

### Point the install somewhere else: a sandbox home

The install root is derived from the home directory, so overriding `HOME` for one command
relocates the entire install. This was verified by running the dry run above with a temporary
home; the plan retargets cleanly:

```bash
SANDBOX="$(mktemp -d)"
HOME="$SANDBOX" node scripts/install-apply.js --target claude --profile core --dry-run \
  | head -8
```

Drop `--dry-run` and the same command writes a complete install into `$SANDBOX/.claude`,
leaving your real one untouched:

```bash
HOME="$SANDBOX" node scripts/install-apply.js --target claude --profile minimal | tail -1
```

```text
Done. Install-state written to <sandbox>/.claude/forge/install-state.json
```

`minimal` is the useful profile here because it carries no hook runtime. Any profile that
materializes hooks additionally requires an explicit `--enable-hooks` or `--no-hooks`, which is
what the warning in the plan above is telling you. Remove the sandbox directory when done.

Runtime data is a separate root from the install root. `FORGE_AGENT_DATA_HOME` moves the
memory, session, learned-skill, alias, and metrics tree; it defaults to `~/.claude` and is
resolved by `scripts/lib/agent-data-home.js`. A tilde is expanded, and a project may propose a
value in `.cursor/forge-agent-data.json`, but only inside the default Cursor or Claude data
directories — anything else is refused with a warning. Set it when exercising session hooks:

```bash
FORGE_AGENT_DATA_HOME="$(mktemp -d)" node tests/hooks/session-end.test.js
```

The two overrides compose. `HOME` controls where an install lands; `FORGE_AGENT_DATA_HOME`
controls where a running FORGE keeps its state.

## Editor setup

`.vscode/settings.json` is the only editor configuration in the repository, and it configures
GitHub Copilot rather than formatting:

- `chat.promptFiles` is enabled, which activates the prompt files in `.github/prompts/`:
  `plan`, `tdd`, `refactor`, `build-fix`, and `security-review`.
- Code generation and test generation are instructed from `.github/copilot-instructions.md`.
  Test generation additionally requires tests before implementation, Arrange-Act-Assert
  structure, and 80 percent coverage.
- Commit message generation is instructed to use Conventional Commits with a subject under 72
  characters.

There is no workspace formatter setting, no recommended extensions file, and no EditorConfig.
Style is enforced by the linters instead:

| Tool | Config | Notes |
| --- | --- | --- |
| ESLint | `eslint.config.js` | Flat config, CommonJS by default, ES modules for `*.mjs`. Ignores `.opencode/dist`, `.cursor`, `coverage`, `workflows/**/*.workflow.*`. `no-unused-vars` is an error with an `^_` escape hatch; `eqeqeq` is a warning |
| markdownlint | `.markdownlint.json` | Line length, inline HTML, and fenced-block language tags are disabled as lint rules. Write the language tag anyway — the house style requires it |
| Prettier | `.prettierrc` | Single quotes, no trailing commas, semicolons, 2-space tabs, 200-column width. Not wired into a script; nothing runs it for you |

Scripts are CommonJS Node unless the filename ends in `.mjs`. File and directory names are
lowercase with hyphens.
