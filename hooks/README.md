# Hooks

Hooks are the only part of FORGE the model cannot decide to skip. The harness runs them on
lifecycle events, which makes them the right place for enforcement and the wrong place for
anything slow or clever.

This page is the map of what ships. The authoring contract, the exit-code semantics, the
profiles, and the debugging procedure live in
[../docs/HOOKS-GUIDE.md](../docs/HOOKS-GUIDE.md) — read that before writing one.

## Files

| Path | Purpose |
| --- | --- |
| `hooks.json` | The executable hook graph the harness loads |
| `codex-hooks.json` | The Codex-adapted graph |
| `memory-persistence/` | Session summary and continuous-learning hook definitions |
| `../scripts/hooks/` | The hook implementations |

## Dispatchers, not a flat list

Most events route through a single dispatcher rather than registering one harness entry per
check. `pre:bash:dispatcher` fans out to the Bash pre-checks; `posttooluse-dispatcher.js`
fans out to the post-tool observers. This keeps the harness-visible graph small and lets a
check be disabled by id without editing `hooks.json`.

The consequence worth knowing: a check named below may not appear as its own entry in
`hooks.json`. Its id is still what `FORGE_DISABLED_HOOKS` expects.

## Hook ids

Disable any of these by id:

```bash
export FORGE_DISABLED_HOOKS="pre:bash:tmux-reminder,stop:desktop-notify"
```

### PreToolUse

| Id | Trigger | Effect |
| --- | --- | --- |
| `pre:bash:dispatcher` | `Bash` | Fans out to the Bash pre-checks below |
| `pre:bash:auto-tmux-dev` | Dev-server commands | Routes long-running servers into tmux so logs stay readable |
| `pre:bash:tmux-reminder` | Long-running commands | Warns only |
| `pre:bash:commit-quality` | `git commit` | Checks the commit before it lands |
| `pre:bash:block-no-verify` | `--no-verify` | Blocks the hook-bypass flag |
| `pre:bash:git-push-reminder` | `git push` | Warns only |
| `pre:bash:gateguard-fact-force` | `Bash` | Fact-check gate |
| `pre:edit-write:gateguard-fact-force` | `Edit`, `Write` | Fact-check gate |
| `pre:powershell:gateguard-fact-force` | `PowerShell` | Fact-check gate |

### PostToolUse

| Id | Effect |
| --- | --- |
| `post:bash:dispatcher` | Fans out to the Bash post-checks |
| `post:bash:build-complete` | Reports build results |
| `post:bash:command-log-audit` | Command audit log |
| `post:bash:command-log-cost` | Cost accounting per command |
| `post:bash:pr-created` | Notices a PR was opened |
| `post:edit:accumulator` | Batches edits for the end-of-turn checks |
| `post:edit:console-warn` | Flags stray console statements |
| `post:edit:design-quality-check` | UI change quality check |
| `post:observe:continuous-learning` | Feeds the learning loop (runs inside the dispatcher) |
| `post:governance-capture` | Governance trail |
| `post:quality-gate` | Quality gate evaluation |
| `post:skill:track` | Records which skills fired |
| `post:session-activity-tracker` | Session activity |
| `post:forge-context-monitor` | Context and cost warnings |
| `post:forge-metrics-bridge` | Metrics export |

### Stop and session events

| Id | Event | Effect |
| --- | --- | --- |
| `session:start` | SessionStart | Injects rules, memory, and instincts |
| `session:end:marker` | SessionEnd | Writes the session marker |
| `stop:format-typecheck` | Stop | Formats and type-checks accumulated edits |
| `stop:check-console-log` | Stop | Final console-statement sweep |
| `stop:evaluate-session` | Stop | Session evaluation |
| `stop:cost-tracker` | Stop | Records session cost |
| `stop:session-end` | Stop | Session summary |
| `stop:plan-canvas-pending` | Stop | Warns about an unreviewed plan |
| `stop:desktop-notify` | Stop | Desktop notification |
| `post-failure-reconnect` | PostToolUseFailure | MCP reconnect attempt |

## Profiles

`FORGE_HOOK_PROFILE` selects how much of the graph runs. An unrecognised value falls back to
`standard`.

| Profile | Runs |
| --- | --- |
| `minimal` | Session bookkeeping only; nothing that can block |
| `standard` | Adds write-time checks and verification prompts (default) |
| `strict` | Blocks on failed checks instead of warning |

## Two rules that prevent most hook incidents

A hook runs on every matching event, in the critical path of the user's work.

1. **Never block on the network.** A hook that calls an API adds its latency and its outages
   to every tool call.
2. **Warn before you block.** A blocking hook that is wrong is worse than no hook. Ship it as
   a warning, watch what it would have blocked, then promote it.

Turn the whole layer off with `FORGE_HOOKS_ENABLED=0`. Hooks are read at session start, so a
change takes effect in the next session, not the current one.
