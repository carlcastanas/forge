# Anti-patterns

The ways teams reliably make an agent harness worse. Each entry describes what the failure looks like in a real repository, why it degrades output rather than merely being untidy, and the specific fix. Most of these are not exotic — they are the default outcome of adding things without a pruning discipline.

Prerequisites:

- You know what skills, agents, commands, rules, hooks, and memory are. See [CONCEPTS.md](CONCEPTS.md).
- You have FORGE installed and have used it on at least one real task.

## Quick index

| Anti-pattern | Core symptom | Fix in one line |
|---|---|---|
| [Skill sprawl](#skill-sprawl) | Hundreds of skills, most never load | Install by profile, prune quarterly |
| [Loading everything at once](#loading-everything-at-once) | Context full before work begins | Move always-on content into skills; cap injection |
| [Rules as a dumping ground](#rules-as-a-dumping-ground) | Rule files grow past a screen | Rules are invariants, playbooks are skills |
| [Agents with unrestricted tools](#agents-with-unrestricted-tools) | Every agent has full tool access | Minimum allowlist per agent |
| [Hooks that block on slow work](#hooks-that-block-on-slow-work) | Every tool call feels laggy | Blocking hooks stay local and fast; everything else is async |
| [Prompts as documentation](#prompts-as-documentation) | Skills read like manuals | Write for activation, not for reading |
| [Unverified generated tests](#unverified-generated-tests) | Green suite, broken feature | No test counts until it has failed once |
| [Memory as a junk drawer](#memory-as-a-junk-drawer) | Recall returns noise | Kinds, scopes, and a deletion habit |
| [Over-orchestration](#over-orchestration) | Five agents for a one-file change | Default to one session; escalate on evidence |
| [Treating review output as truth](#treating-review-output-as-truth) | Findings merged without checking | Every finding needs a reproduction |
| [Stacking install paths](#stacking-install-paths) | Duplicated commands, doubled hooks | One channel per harness |
| [Disabling the gate instead of fixing the cause](#disabling-the-gate-instead-of-fixing-the-cause) | Growing list of disabled hooks | Fix the trigger; narrow the exception |
| [Counting output as progress](#counting-output-as-progress) | Lots of diffs, no shipped change | Measure merged, verified work |

---

## Skill sprawl

### What it looks like

The team installs the full catalog, then adds a skill every time someone hits a new problem. Nobody deletes one. Six months later there are dozens of local skills alongside the shipped ones, several of which describe the same workflow with different words, and at least two of which contradict each other about how the project does migrations.

The tell: you cannot answer "which skill covers X" without grepping.

### Why it degrades results

Skill selection is a matching problem. The model picks a skill from its description and activation cues. Every near-duplicate makes that match worse, because two plausible candidates for the same task means a coin flip, and a wrong pick means the wrong playbook executes end to end. Contradictory skills are worse than no skill: the model will follow whichever one loaded, confidently.

There is also a slower failure. A large catalog nobody prunes stops being read by humans, and a skill nobody reads stops being corrected when the codebase moves under it. Stale skills describe a system that no longer exists and steer work toward it.

### The fix

Install by profile, not by default. `--profile developer` is the intended starting point; add capability components when a task actually needs one.

```bash
forge plan --profile developer --target claude --json
forge install --target claude --profile developer --with capability:security
```

Before writing a skill, search for the one that already exists and extend it. This is a hard rule in the FORGE repository itself: no skill duplicates an existing skill.

```bash
rg -n "When to use|Use when|Trigger" skills -g 'SKILL.md'
```

Run a stocktake on a schedule. The `skill-stocktake`, `skill-scout`, and `skill-comply` skills exist for this, and `/skill-health` and `forge session-inspect skills:health` report which skills actually run and which ones fail. Delete anything with no activations in a quarter.

Depth: [SKILL-AUTHORING.md](SKILL-AUTHORING.md), [SKILL-PLACEMENT-POLICY.md](SKILL-PLACEMENT-POLICY.md).

---

## Loading everything at once

### What it looks like

Every session opens with a large injected block: full previous-session context, a dozen instincts, several rule files, a project brief. The first real message lands with a meaningful fraction of the window already consumed. Compaction hits mid-task.

### Why it degrades results

Context is the scarce resource, and injected context is spent before the model knows what the task is. That trade is almost always bad: you pay a fixed cost for content that is relevant to some sessions and irrelevant to most. Worse, front-loaded content competes with the working set. When compaction fires, the material that survives is not chosen by importance to the current task — you lose live reasoning and keep boilerplate.

The core FORGE claim is "optimize the context window, persist everything else." Always-on injection is the direct violation.

### The fix

Cap what SessionStart injects and let skills carry the rest on demand.

```bash
FORGE_SESSION_START_MAX_CHARS=4000 \
FORGE_MAX_INJECTED_INSTINCTS=3 \
FORGE_INSTINCT_CONFIDENCE_THRESHOLD=0.85 \
  claude
```

To turn injection off entirely while you diagnose:

```bash
FORGE_SESSION_START_CONTEXT=0 claude
```

Then audit what remains. The `context-budget` and `token-budget-advisor` skills quantify it; `strategic-compact` handles compaction deliberately rather than letting it happen at a random point. Set `FORGE_CONTEXT_WINDOW_TOKENS` if FORGE is misreporting your window size, which otherwise makes every usage number wrong.

Depth: [CONTEXT-ENGINEERING.md](CONTEXT-ENGINEERING.md), [../guides/the-context-guide.md](../guides/the-context-guide.md).

---

## Rules as a dumping ground

### What it looks like

`rules/<stack>/patterns.md` is nine hundred lines. It contains the team's coding style, three architecture decisions, a migration checklist, an explanation of why the previous ORM was abandoned, and a section on how to write commit messages.

### Why it degrades results

Rules are injected wholesale on every match. Their length is a recurring cost paid on every single turn that touches a matching path, and it is paid whether or not the content is relevant to what you are doing right now. A nine-hundred-line rule file that is right 5% of the time still costs 100% of the time.

There is a second, subtler cost: long rule files dilute their own imperatives. A model reading five hard constraints follows five hard constraints. A model reading five hard constraints buried in nine hundred lines of context follows some of them.

### The fix

Apply the routing test. If it must apply every time a path or event matches, with no model judgment, it is a rule. If it is a playbook that should load only when relevant, it is a skill. If it is history, it is an architecture decision record.

Keep each rule file short enough to load without crowding the window. Write imperatives with a rationale, not aspirations.

Move the rest:

- Playbooks to `skills/`
- Decisions to `skills/architecture-decision-records/` output
- Deterministic enforcement to a hook

The `rules-distill` skill exists to compress an overgrown rule set. `config-gc` finds configuration that no longer earns its place.

Depth: [RULES-GUIDE.md](RULES-GUIDE.md), [capability-surface-selection.md](capability-surface-selection.md).

---

## Agents with unrestricted tools

### What it looks like

Every custom agent frontmatter reads `tools: Read, Write, Edit, Bash, Glob, Grep, WebFetch` because that was easiest and nobody wanted to debug a missing tool mid-run. The code reviewer can write files. The docs agent can run shell commands.

### Why it degrades results

Two distinct harms.

The safety harm is obvious: a reviewer that can write will, eventually, decide the fastest way to report a problem is to fix it — unreviewed, unrequested, in the middle of your working tree. A prompt-injected page read by an agent with `Bash` is a different severity of incident than the same page read by an agent with `Read` and `Grep`.

The quality harm is less obvious and more common. Tool breadth changes behavior. An agent that can only read produces analysis. An agent that can also write produces patches, and then reasons backward from the patch it already wrote. If you wanted a second opinion, you got an implementer instead.

### The fix

Minimum grant, stated explicitly in frontmatter. A read-only reviewer gets exactly this:

```yaml
---
name: my-reviewer
description: Reviews changes in <area>. Use after edits to <paths>.
tools: Read, Grep, Glob
model: sonnet
---
```

The shipped reviewers follow this: `code-reviewer` and `security-reviewer` both carry `tools: Read, Grep, Glob, Bash` and nothing more, on `model: sonnet`. Justify anything above `sonnet` and justify every added tool.

Review your own agents:

```bash
rg -n '^tools:' agents/ .claude/agents/ 2>/dev/null
```

Anything with `Write` or `Edit` that is not an implementer is a bug.

Depth: [AGENT-AUTHORING.md](AGENT-AUTHORING.md), [THREAT-MODEL.md](THREAT-MODEL.md).

---

## Hooks that block on slow work

### What it looks like

A `PreToolUse` hook calls a remote policy service. A `Stop` hook runs the full test suite. A quality gate shells out to a linter that cold-starts a language server. Every tool call now has a pause in front of it, and occasionally the session hangs because a network call is retrying.

### Why it degrades results

A blocking hook is in the critical path of every matching tool call. The cost is not the hook's runtime once — it is the runtime multiplied by every tool call in every session, paid by everyone. A 400 ms hook on a matcher that fires forty times a turn is sixteen seconds of pure latency per turn.

Network calls make it worse than slow: they make it nondeterministic. A hook that usually takes 80 ms and occasionally takes 30 seconds trains people to disable hooks entirely, which loses you the fast ones too.

### The fix

The convention in this repository is explicit: blocking hooks (`PreToolUse`, `Stop`) stay fast, under about 200 ms, with no network calls. Anything that can exceed a second declares a `timeout` or runs async, with async timeouts kept at or under 30 seconds. Hooks exit `0` on non-critical errors and never block tool execution unexpectedly.

Practical shape:

- Deterministic local checks in the blocking path — pattern matches, file reads, path checks.
- Anything expensive in the async PostToolUse path, or out of hooks entirely and into a command the person runs deliberately.
- A declared `timeout` on anything that touches a subprocess.

FORGE already batches: `post:dispatcher:sync` and `post:dispatcher:async` run many PostToolUse hooks in one process rather than spawning per hook. Follow that pattern rather than registering a new top-level hook for each idea.

If a hook is slow today, disable that one rather than the runtime:

```bash
FORGE_DISABLED_HOOKS=post:quality-gate claude
```

Depth: [HOOKS-GUIDE.md](HOOKS-GUIDE.md), [hook-bug-workarounds.md](hook-bug-workarounds.md).

---

## Prompts as documentation

### What it looks like

A `SKILL.md` opens with three paragraphs of background, explains the history of the subsystem, defines its terms, and gets to the actual procedure on page two. It reads well. A person could learn from it. Its `description` frontmatter says "Guidance for working with the payments system."

### Why it degrades results

A skill has two jobs and the document above does neither.

Job one is activation: the `description` and the "when to use" section are what the model matches against. "Guidance for working with the payments system" matches everything and nothing. The skill either never fires or fires on every mention of money.

Job two is execution: once loaded, the skill spends context. Background prose is context spent on material that does not change what the model does. The procedure is what changes behavior, and it is now competing with the essay in front of it.

Documentation and prompts have opposite optimization targets. Documentation optimizes for a reader with time who needs to understand. A prompt optimizes for a model with a full context window that needs to act.

### The fix

Frontmatter first, and make the description a trigger, not a topic:

```yaml
---
name: payments-refunds
description: Use when issuing, reversing, or reconciling a refund, or when touching refund state transitions in the payments service. Covers idempotency keys, partial refunds, and the reconciliation window.
metadata:
  origin: FORGE
---
```

`name` and `description` are the fields the validator requires. Provenance goes in the nested `metadata` block. A `description` containing a colon followed by a space must be quoted, or the YAML parse fails.

Then a body that is a procedure: when to use, the mechanics, examples that were actually run. Cut anything that does not change what the model does. If the background genuinely matters, put it in a reference file next to `SKILL.md` and link it, so it loads only when the skill decides it is needed.

Test activation, do not assume it. `/skill-health` and `forge session-inspect skills:health` report whether a skill is firing; `skills:amendify` proposes patches from failure evidence.

Depth: [SKILL-AUTHORING.md](SKILL-AUTHORING.md), [EVALUATION-GUIDE.md](EVALUATION-GUIDE.md).

---

## Unverified generated tests

### What it looks like

The agent implements a feature and writes twelve tests. All twelve pass. The PR is approved on the strength of the test count. Nobody notices that four of them assert against the mock rather than the code, three would pass with the function body deleted, and one is `expect(true).toBe(true)` with a descriptive name.

### Why it degrades results

This is the highest-severity item on this page, because it inverts your safety net into a false signal. Unverified tests do not merely fail to catch bugs — they actively certify broken code, and they do it at a volume no human review process was designed to absorb.

Models are good at producing test-shaped text. Test-shaped text that passes is not evidence of anything unless you know it can fail.

### The fix

The discipline is red before green, and it applies to generated tests exactly as it applies to hand-written ones. A test that has never failed has not been verified to test anything.

Concretely, in review:

1. Does each test have a failing state? Revert the implementation, or break one line of it, and confirm the suite goes red on the tests that should care.
2. Is the assertion against behavior, or against a mock the same change introduced?
3. Would this test pass with the function body removed?

Use the workflow that enforces ordering rather than checking after the fact. `/feature-dev` and the `tdd-workflow` skill write the test first; `tdd-guide` is the agent for it; `verification-loop` and `delivery-gate` close the loop. `/test-coverage` reports coverage, which is a different and weaker question than whether the tests can fail.

Repository practice worth copying: coverage thresholds are enforced in CI (`npm run coverage`), and new hooks require an integration test in `tests/hooks/`.

Depth: [../guides/the-evaluation-guide.md](../guides/the-evaluation-guide.md), [EVALUATION-GUIDE.md](EVALUATION-GUIDE.md).

---

## Memory as a junk drawer

### What it looks like

Every session ends with a memory save. Titles are things like "notes" and "session context." Everything is `kind: note` at `project` scope, untagged. A year in, `forge memory search` returns nine results for any query, none of them the one you wanted.

### Why it degrades results

Recall is the whole value of a memory vault, and recall degrades superlinearly with undifferentiated volume. Ten well-kinded memories beat two hundred notes, because the two hundred notes cannot be filtered — every search returns a slice of everything.

There is a correctness risk on top of the retrieval one. Memories are unreviewed context by design. A stale decision recorded eighteen months ago reads identically to one recorded yesterday, and an agent given both will act on whichever it retrieved. A junk drawer guarantees the wrong one surfaces eventually.

### The fix

Use the structure the vault already gives you. Every write takes a kind, a scope, tags, and target harnesses:

```bash
echo "Refund idempotency keys are scoped per merchant, not per transaction. Reversing this broke reconciliation in the Q2 incident." \
  | forge memory save \
      --title "Refund idempotency key scope" \
      --kind decision \
      --scope team \
      --tag payments --tag reconciliation \
      --stdin
```

Rules of thumb:

- `project` for repository facts, `team` for reviewed decisions, `user` for personal preference. User scope is excluded from default recall for a reason — respect the boundary.
- A memory that is not worth a specific title is not worth saving.
- Prefer `decision`, `lesson`, `runbook`, and `handoff` over `note`. `note` is the drawer.
- Handoffs are addressed: `--from` and `--target` exist so the other harness can find them with `--target-harness`.

Audit it:

```bash
forge memory doctor --json
forge memory search "" --scope team --limit 50
```

Read memory content as data, never as instruction. Writes are create-only and reject known credential shapes, but that is a floor, not a review process.

Depth: [MEMORY-GUIDE.md](MEMORY-GUIDE.md).

---

## Over-orchestration

### What it looks like

A one-file bug fix gets a planner, two implementers in separate worktrees, a reviewer, and a synthesizer. Twenty minutes and five context windows later, the merge conflict between the two implementers takes longer to resolve than the original fix would have.

### Why it degrades results

Parallelism buys throughput and costs coherence. Every additional agent is a separate context window that does not know what the others learned, a separate place for a wrong assumption to take root, and a handoff where information is lost. The coordination overhead is real and it is paid up front, before any evidence that the task needed it.

Sub-agents also start clean. A subagent begins with none of the current session's context and will invent its own conventions unless you supply them — which means every additional agent is another prompt you have to get right.

The honest failure mode is not that orchestration does not work. It is that it works well enough to look busy while producing less than one focused session would have.

### The fix

Default to one session. Escalate on evidence, and the evidence is specific:

| Escalate to | When |
|---|---|
| A single sub-agent | The sub-task is bounded, its output is a report, and you want it out of the main context |
| Parallel agents | The work splits into genuinely independent units that touch disjoint files |
| A full wave | Multiple independent units, each large enough that serial execution is the bottleneck, with a defined merge strategy agreed in advance |

If two workers would touch the same files, it is one worker.

When you do orchestrate, pass conventions explicitly into each subagent prompt, use the shipped orchestration commands rather than improvising (`/multi-plan`, `/multi-execute`, `/multi-workflow`, the `orch-*` family), and watch it: `npm run orchestrate:status` and `forge loop-status --watch` exist so a stalled worker is visible rather than silently costing money.

Depth: [ORCHESTRATION-PATTERNS.md](ORCHESTRATION-PATTERNS.md), [../guides/the-orchestration-guide.md](../guides/the-orchestration-guide.md).

---

## Treating review output as truth

### What it looks like

`/code-review` returns eleven findings. All eleven become tickets. Three of them describe behavior the code does not have, two are style preferences stated as defects, and one is a genuine security issue that gets the same priority as the rest.

Or the inverse, which is worse: the review comes back clean, and the PR merges on that basis.

### Why it degrades results

A review is a hypothesis generator, not an oracle. It has no execution feedback — it did not run the code, it inferred. Inference produces plausible findings, and plausible is not the same as real.

Treating findings as facts costs you twice. You spend engineering time on non-problems, which is expensive but recoverable. And you learn to trust the output, which is how a clean review becomes a merge signal. A clean review means the reviewer did not find anything, which is a statement about the reviewer.

### The fix

Every finding needs a reproduction before it becomes work.

1. Can you point at the line and describe the input that triggers it?
2. Can you write a failing test for it?
3. If not, it is a question for the author, not a defect.

Rank by severity yourself. A review that returns eleven findings has not ranked them; it has listed them.

Use review as one input among several. `/code-review` and `/review-pr` for the model pass, `security-reviewer` for the security lane, `/security-scan` for the scanner pass over agent, hook, MCP, permission, and secret surfaces, and a human for the judgment. The shipped review lanes — scope, tests, security, install surface, cross-harness, docs — exist because a single undifferentiated review is where findings go to be ignored.

Never treat a clean review as sufficient to merge. Treat a passing, verified test suite plus a human reader as sufficient to merge.

Depth: [../guides/the-security-guide.md](../guides/the-security-guide.md), [TEAM-ADOPTION.md](TEAM-ADOPTION.md#code-review-when-agents-write-code).

---

## Stacking install paths

### What it looks like

FORGE was installed as a Claude Code plugin in January. In March, someone following a different set of notes ran `forge install --target claude`. Now `/plan` appears twice, hooks fire twice per event, and `forge doctor` reports drift it cannot repair.

### Why it degrades results

The two channels do not know about each other. The plugin cache is managed by the harness and is not recorded in install-state, so FORGE's own lifecycle commands can see one copy and not the other. Duplicated hook registrations mean every gate runs twice, doubling latency and occasionally producing contradictory blocks.

### The fix

One channel per harness. Decide which, then verify:

```bash
forge list-installed
claude plugin list
```

Exactly one of those should show FORGE content for the harness. If both do, uninstall both and reinstall through one:

```bash
forge uninstall --target claude --dry-run
claude plugin uninstall forge@forge --scope user
```

Depth: [INSTALLATION.md](INSTALLATION.md#pick-one-path-not-two).

---

## Disabling the gate instead of fixing the cause

### What it looks like

`FORGE_DISABLED_HOOKS` has grown to nine entries. `FORGE_GATEGUARD=off` is in someone's shell profile. `--no-verify` shows up in commit instructions. Each disable was individually reasonable at the time.

### Why it degrades results

Gates encode a failure someone already had. Disabling one is a decision to accept that failure class again, made without the context that produced the gate. The list only grows, because nobody ever re-enables anything — there is no trigger to.

The specific danger with FORGE: `pre:bash:block-no-verify` runs in every profile including `minimal`. It is in the hard floor deliberately. Working around the hard floor means the remaining gates are all that is left, and they are the ones you have not yet found annoying.

### The fix

When a gate fires, fix the trigger. When the gate is genuinely wrong, narrow it rather than removing it — GateGuard ships `GATEGUARD_BASH_ROUTINE_DISABLED=1` precisely so you can relax routine checks while keeping destructive-command checks active.

If you must disable, make it scoped and temporary:

```bash
# One command, not a shell profile
FORGE_DISABLED_HOOKS=post:quality-gate npm run build
```

Then treat the disable list as debt. Review it on the same cadence you review the rule set, and require a reason per entry. An entry nobody can justify gets removed.

Depth: [HOOKS-GUIDE.md](HOOKS-GUIDE.md), [CONFIGURATION.md](CONFIGURATION.md#hook-profiles).

---

## Counting output as progress

### What it looks like

The weekly update reports 4,000 lines changed, 30 files touched, 12 skills added. It does not report what shipped, what was verified, or what a customer can now do that they could not before.

### Why it degrades results

Agents make output cheap. When output is cheap, output stops being evidence of work. A team that measures diffs will get diffs — refactors nobody asked for, tests that assert nothing, documentation regenerated for the third time.

It also hides the real failure. A stalled agent loop can produce activity for hours. Without a merged-and-verified measure, that reads as productivity.

### The fix

Measure what survives.

| Do not measure | Measure |
|---|---|
| Lines changed | Changes merged and released |
| Tests written | Tests that have failed at least once, and coverage that moved |
| Skills added | Skills with recorded activations |
| Sessions run | Time from task start to verified change |
| Findings raised | Findings reproduced and fixed |

The instrumentation is already there: `forge status` reports skill runs and install health, `/cost-report` reports spend, `forge work-items` tracks linked items to a status, and `forge loop-status --exit-code` surfaces stalls instead of letting them look like activity.

Depth: [TEAM-ADOPTION.md](TEAM-ADOPTION.md#measuring-whether-it-helped), [EVALUATION-GUIDE.md](EVALUATION-GUIDE.md).

---

## Related pages

- [CONCEPTS.md](CONCEPTS.md) — the surfaces these anti-patterns misuse
- [capability-surface-selection.md](capability-surface-selection.md) — where a capability actually belongs
- [RECIPES.md](RECIPES.md) — the correct sequences, task by task
- [TEAM-ADOPTION.md](TEAM-ADOPTION.md) — the organizational versions of these failures
- [../guides/the-field-guide.md](../guides/the-field-guide.md) — day-to-day practice
