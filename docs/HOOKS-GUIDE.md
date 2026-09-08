# Hooks guide

This page is the reference for FORGE's hook layer: the lifecycle events available, the shape of [`hooks/hooks.json`](../hooks/hooks.json), the three runtime profiles, how to write a hook script, what exit codes mean, the performance budget a hook must fit inside, how to debug one that does not fire, and the safety rules that apply to any hook capable of blocking work.

Prerequisites: read [CONCEPTS.md](./CONCEPTS.md) for why a hook is the right surface only when compliance must be guaranteed rather than requested. [`hooks/README.md`](../hooks/README.md) covers installation and the shipped hook inventory; this page covers authoring and operation.

## What a hook is

A hook is a command the harness runs at a lifecycle event. It receives the event payload as JSON on stdin, may write diagnostics to stderr, writes stdout back to the harness, and signals its verdict with an exit code. The model does not choose to run it and cannot decline it. That is the entire reason the layer exists.

FORGE implements hook logic as cross-platform Node scripts in [`scripts/hooks/`](../scripts/hooks/) so the same graph works on Windows, macOS, and Linux.

## Lifecycle events

[`scripts/ci/validate-hooks.js`](../scripts/ci/validate-hooks.js) accepts these events:

`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PostToolUseFailure`, `Notification`, `SubagentStart`, `Stop`, `SubagentStop`, `PreCompact`, `InstructionsLoaded`, `TeammateIdle`, `TaskCompleted`, `ConfigChange`, `WorktreeCreate`, `WorktreeRemove`, `SessionEnd`.

Four of them take no `matcher`: `UserPromptSubmit`, `Notification`, `Stop`, and `SubagentStop`.

The shipped graph uses seven:

| Event | Entries | What FORGE does there | Can block |
| --- | --- | --- | --- |
| `SessionStart` | 2 | Load bounded prior context and detect the package manager; surface open Plan Canvas reviews | No |
| `PreToolUse` | 9 | Bash preflight, doc-file warning, compaction suggestion, observation capture, governance capture, config protection, MCP health check, GateGuard | Yes, exit 2 |
| `PostToolUse` | 2 | One synchronous and one asynchronous dispatcher covering format, typecheck, quality gate, design quality, logging | No |
| `PostToolUseFailure` | 2 | MCP health marking and reconnect; skill run tracking | No |
| `PreCompact` | 1 | Persist state before the context is compacted | No |
| `Stop` | 7 | Format and typecheck, console.log audit, session summary, pattern extraction, cost telemetry, desktop notification, pending Plan Canvas check | Yes, on hook failure |
| `SessionEnd` | 1 | Lifecycle marker and cleanup log | No |

The distinction that matters when choosing an event: `PreToolUse` is the only place where prevention is possible. Everything later is detection.

## The hooks.json shape

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node scripts/hooks/run-with-flags.js pre:config-protection scripts/hooks/config-protection.js standard,strict",
            "timeout": 5
          }
        ],
        "description": "Block modifications to linter/formatter config files.",
        "id": "pre:config-protection"
      }
    ]
  }
}
```

Field by field:

| Field | Level | Required | Notes |
| --- | --- | --- | --- |
| `id` | Entry | Yes | Stable identifier. Drives `FORGE_DISABLED_HOOKS`, idempotent reinstall, and clean uninstall |
| `matcher` | Entry | Yes, except on the four matcher-free events | A tool-name pattern. Prefer specific over `.*` |
| `description` | Entry | Recommended | One line, stating the behavior and whether it blocks |
| `hooks` | Entry | Yes | Array of executable entries |
| `type` | Executable | Yes | One of `command`, `http`, `prompt`, `agent` |
| `command` | Executable | For `command` type | The shell command to run |
| `timeout` | Executable | No | Non-negative number of seconds |
| `async` | Executable | No | Boolean, `command` type only. Async hooks cannot block |

The shipped file wraps every command in a plugin-root resolution shim so the hook works whether FORGE is loaded as a plugin, installed manually, or resolved from a plugin cache. Do not hand-edit that shim; the installer rewrites commands against the real Claude root. As [`hooks/README.md`](../hooks/README.md) states, do not paste the repo `hooks.json` directly into `~/.claude/settings.json` — install it:

```bash
bash ./install.sh --target claude --modules hooks-runtime --enable-hooks
```

```powershell
pwsh -File .\install.ps1 --target claude --modules hooks-runtime --enable-hooks
```

## Profiles and runtime controls

Every profile-gated hook is invoked through [`run-with-flags.js`](../scripts/hooks/run-with-flags.js), whose arguments are the hook id, the script path relative to the plugin root, and a comma-separated list of profiles the hook runs under.

```text
node scripts/hooks/run-with-flags.js <hookId> <scriptRelativePath> [profilesCsv]
```

[`scripts/lib/hook-flags.js`](../scripts/lib/hook-flags.js) resolves whether the hook actually runs:

| Profile | Intent |
| --- | --- |
| `minimal` | Essential lifecycle and safety hooks only |
| `standard` | Default. Balanced quality and safety checks |
| `strict` | Additional reminders and stricter guardrails |

An invalid profile value silently falls back to `standard`. Resolution order for both the master switch and the profile is: the `FORGE_*` environment variable, then the Claude plugin option, then a managed `forge/setup.json` under the plugin root.

```bash
# Master switch
export FORGE_HOOKS_ENABLED=true

# minimal | standard | strict (default: standard)
export FORGE_HOOK_PROFILE=standard

# Turn off individual hooks by id
export FORGE_DISABLED_HOOKS="pre:bash:tmux-reminder,post:edit:typecheck"

# Disable only GateGuard during setup or recovery
export FORGE_GATEGUARD=off

# Preview what would run without running it
export FORGE_DRY_RUN=1
```

Context-related controls worth knowing: `FORGE_SESSION_START_MAX_CHARS` caps the additional context loaded at session start (8000 by default), `FORGE_SESSION_START_CONTEXT=off` disables it entirely, and `FORGE_CONTEXT_MONITOR_COST_WARNINGS=off` suppresses API-rate cost estimates while keeping context and scope warnings.

When declaring the profile list for a new hook: a hook that only warns belongs in `standard,strict`; a hook that blocks belongs in `strict` unless it is a genuine safety floor; a hook that must run for the system to function correctly takes no profile gate at all, like the `SessionStart` bootstrap and the dispatchers.

## Writing a hook script

Prefer the `run()` export. [`run-with-flags.js`](../scripts/hooks/run-with-flags.js) detects a module exporting `run` and calls it in-process, saving one Node spawn — roughly 50 to 100 milliseconds per hook. Scripts without that export are spawned as child processes with a 30-second cap.

```javascript
#!/usr/bin/env node
'use strict';

/**
 * Exit codes:
 *   0 = allow
 *   2 = block (PreToolUse only)
 */

function parseInput(inputOrRaw) {
  if (typeof inputOrRaw === 'string') {
    try {
      return inputOrRaw.trim() ? JSON.parse(inputOrRaw) : {};
    } catch {
      return {};
    }
  }
  return inputOrRaw && typeof inputOrRaw === 'object' ? inputOrRaw : {};
}

function run(rawInput) {
  const input = parseInput(rawInput);
  const filePath = input.tool_input?.file_path || '';

  if (!filePath.endsWith('.generated.ts')) {
    return { exitCode: 0 };
  }

  return {
    exitCode: 2,
    stderr: '[Hook] BLOCKED: generated files are not edited by hand. Change the generator instead.'
  };
}

module.exports = { run };
```

The object `run()` returns is interpreted by the wrapper: `exitCode` sets the process exit code, `stderr` is written to stderr, `stdout` replaces the pass-through payload, and `additionalContext` is converted into the harness's structured `PreToolUse` context format. Returning a bare string is treated as stdout with exit 0; returning nothing means "no opinion" and passes the input through. `run()` may be `async` — the wrapper awaits it.

The stdin payload has this shape:

```typescript
interface HookInput {
  tool_name: string;          // "Bash", "Edit", "Write", "Read", ...
  tool_input: {
    command?: string;         // Bash
    file_path?: string;       // Edit / Write / Read
    old_string?: string;      // Edit
    new_string?: string;      // Edit
    content?: string;         // Write
  };
  tool_output?: {             // PostToolUse only
    output?: string;
  };
}
```

If you write a legacy stdin-listening script instead of exporting `run()`, it must echo the original stdin to stdout on the allow path. [`config-protection.js`](../scripts/hooks/config-protection.js) is a good model: it exports `run()` for the fast path and keeps a stdin fallback for spawned execution.

## Exit codes and blocking behavior

| Exit code | Effect |
| --- | --- |
| `0` | Allow. Execution continues |
| `2` | Block the tool call. `PreToolUse` only |
| Any other non-zero | Treated as a hook error: logged, does not block |

Warnings go on stderr with exit 0. Blocking messages go on stderr with exit 2, and must say what to do instead — [`config-protection.js`](../scripts/hooks/config-protection.js) tells the agent to fix the source rather than weaken the config, and names the escape hatch.

The wrapper is deliberately fail-open. When stdin exceeds one megabyte it suppresses the pass-through rather than echoing a JSON document truncated mid-stream, because a malformed payload is read by the harness as a hook failure and blocks the tool call. A missing script, a rejected path traversal, or a thrown `run()` all produce a stderr diagnostic and exit 0. Failures in the plumbing must never block work; only a hook's deliberate decision may.

## Performance budget

Every `PreToolUse` hook sits on the critical path of every matching tool call. Budget accordingly:

- **Target under 100 milliseconds** for a synchronous `PreToolUse` hook. The shipped ones declare `timeout: 5` seconds as a ceiling, not a target.
- **Export `run()`** so the wrapper skips the child-process spawn.
- **Use a dispatcher rather than many entries.** [`pre-bash-dispatcher.js`](../scripts/hooks/pre-bash-dispatcher.js) and [`posttooluse-dispatcher.js`](../scripts/hooks/posttooluse-dispatcher.js) exist so the harness pays one spawn instead of six.
- **Mark background work `async`.** Observation capture and build analysis run asynchronously and cannot block.
- **Narrow the matcher.** `Edit` costs less than `.*` because it runs less often.
- **Do not shell out on the hot path.** Reading a file is cheap; running a type checker is not. Batch expensive checks onto `Stop`, where they run once per response, as [`stop-format-typecheck.js`](../scripts/hooks/stop-format-typecheck.js) does.

## Debugging a hook that does not fire

Work through these in order.

**1. Is the hook layer on?**

```bash
node scripts/hooks/check-hook-enabled.js pre:config-protection standard,strict
```

It prints `yes` or `no`. A `no` means `FORGE_HOOKS_ENABLED` is false, the id is in `FORGE_DISABLED_HOOKS`, or the active profile is not in the hook's list.

**2. Does the graph validate?**

```bash
node scripts/ci/validate-hooks.js hooks/hooks.json
```

Catches an invalid event name, a missing `id`, a missing or malformed `matcher`, an unsupported `type`, `async` on a non-command hook, and syntax errors in inline JavaScript.

**3. Does the matcher match?** The matcher is the tool name, not a file path. A hook meant to run on `.py` edits matches on `Edit` and then checks the path inside the script.

**4. Preview without executing.**

```bash
FORGE_DRY_RUN=1 <run the operation>
```

The wrapper prints `[DryRun] Hook "<id>" would execute: <script> (enabled=true, profiles=...) tool=... target=...`. If that line never appears, the harness is not invoking the entry at all — the problem is registration, not the script.

**5. Run the script by hand.**

```bash
echo '{"tool_name":"Edit","tool_input":{"file_path":"eslint.config.js"}}' \
  | node scripts/hooks/config-protection.js; echo "exit=$?"
```

**6. Check that the installed copy is the one you edited.** Editing the repo does not change an installed hook. Reinstall with `bash ./install.sh --target claude --modules hooks-runtime --enable-hooks`, or use `forge doctor` and `forge repair` to find and fix drift between FORGE-managed files and their sources.

**7. Look for a duplicate registration.** A hook copied into `~/.claude/settings.json` and also present in the plugin graph runs twice, and the manual copy will not have `CLAUDE_PLUGIN_ROOT` available. Remove the manual copy.

Known harness-level quirks are collected in [hook-bug-workarounds.md](./hook-bug-workarounds.md).

## Safety rules for hooks that can block

A blocking hook is the strongest instrument in FORGE. It is also the one that, when wrong, makes the tool unusable while looking like a model failure.

1. **Block invariants, not preferences.** If a reasonable engineer would sometimes want the opposite, warn instead.
2. **Never block on a heuristic that has false positives you cannot bound.** [`config-protection.js`](../scripts/hooks/config-protection.js) blocks on an explicit filename set and deliberately excludes `pyproject.toml` because that file carries project metadata alongside linter config.
3. **Say what to do instead.** A block with no remedy produces retry loops.
4. **Name the escape hatch.** Every blocking hook must be disableable by id through `FORGE_DISABLED_HOOKS`, and the message should say so.
5. **Fail open on internal errors.** Malformed input, a missing dependency, or an unreadable file must exit 0, not 2. The wrapper already does this for plumbing failures; the script must do it for its own.
6. **Allow the first creation, block the later weakening.** Config protection permits creating a config file and blocks edits to an existing one, which is the shape most "protect this file" hooks want.
7. **Gate aggressive hooks behind `strict`.** If it changes the shape of normal work, it does not belong in the default profile.
8. **Test the block and the allow.** A hook that blocks correctly but also blocks the legitimate case is worse than no hook.

## Review checklist

- [ ] Entry has a stable, namespaced `id` following the `event:target:name` convention.
- [ ] `matcher` is as specific as the job allows.
- [ ] `description` states the behavior and whether it blocks.
- [ ] Profile list is appropriate: warnings in `standard,strict`, aggressive checks in `strict`.
- [ ] Script exports `run()` for in-process execution.
- [ ] Exit codes are exactly 0 or 2; internal errors exit 0.
- [ ] Blocking messages name the remedy and the escape hatch.
- [ ] Synchronous `PreToolUse` work fits the performance budget; slow work is `async` or moved to `Stop`.
- [ ] Cross-platform: Node, no shell-only assumptions, no hardcoded path separators.
- [ ] A test exists under [`tests/hooks/`](../tests/hooks/).
- [ ] `node scripts/ci/validate-hooks.js hooks/hooks.json` passes.
- [ ] `node tests/run-all.js` passes.

## References

- [`hooks/README.md`](../hooks/README.md) — shipped hook inventory, installation, recipes
- [`hooks/memory-persistence/README.md`](../hooks/memory-persistence/README.md) — the memory lifecycle contract
- [`rules/common/hooks.md`](../rules/common/hooks.md) — hook architecture guidance in the rule layer
- [RULES.md](../RULES.md) — the hook format rules this page implements
- [hook-bug-workarounds.md](./hook-bug-workarounds.md) — known harness quirks
- [CONCEPTS.md](./CONCEPTS.md) — when a hook is the right surface
