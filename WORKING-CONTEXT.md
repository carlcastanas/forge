# Working context

Operating notes for long agent sessions: what to keep in the window, what to push to disk,
when to checkpoint, when to compact, when to abandon a session and start fresh, and how to
hand work to the next session. These are the mechanics behind the principle in
[SOUL.md](SOUL.md) — optimize the context window, persist everything else.

Prerequisites: FORGE installed, and familiarity with the session commands in
[COMMANDS-QUICK-REF.md](COMMANDS-QUICK-REF.md). The theory is in
[docs/CONTEXT-ENGINEERING.md](docs/CONTEXT-ENGINEERING.md) and
[guides/the-context-guide.md](guides/the-context-guide.md).

## The economics

A context window is a fixed budget spent on three things: instructions that shape behavior,
evidence gathered from the codebase, and the reasoning built on top. Only the third produces
work. The first two are overhead you pay to make it possible.

Two properties make this harder than a simple budget.

**Cost is cumulative, not per-turn.** Everything read in turn 3 is still being paid for in
turn 40. A file read once and never referenced again is rent charged for the rest of the
session.

**Quality degrades before capacity runs out.** A window at 80% full does not behave like a
window at 30% full with the same information. Recall of mid-session detail drops, instructions
from early turns lose force, and the model starts re-deriving conclusions it already reached.
The failure is gradual and easy to mistake for the task being hard.

The practical consequence: manage the window actively from the start of a session, not
reactively when a warning appears.

## What belongs in context

Keep in the window only what the next few turns will actually use.

**Keep:**

- The current objective, stated once, in a form you could hand to a stranger.
- The plan, with completed steps marked done.
- Interfaces you are coding against — signatures, schemas, type definitions.
- Constraints discovered the hard way: the API that rejects empty arrays, the test that only
  passes with the fixture reset.
- The last failing output you are working from.

**Push to disk:**

- Full file contents you read for orientation. Keep the path and the conclusion.
- Search results. Keep the two hits that mattered.
- Completed work. A finished module is a path and a one-line summary, not a transcript.
- Long tool output — build logs, test runs, dependency trees. Write to a file, grep it.
- Design deliberation that reached a conclusion. Record the decision and the reason; drop the
  alternatives you rejected.

**Never load:**

- A whole file when a function will do. Read by range.
- Generated artifacts, lockfiles, or minified bundles.
- Every rule set in the repository. Load the stacks in play — see [RULES.md](RULES.md).
- The output of an exploratory search you have not yet decided is relevant. Delegate the
  search instead.

### Delegate to keep the window clean

The strongest single lever is subagent delegation. A subagent reads forty files in its own
window and returns a paragraph. The parent session pays for the paragraph.

Delegate when the work reads much and returns little: broad searches, cross-file audits,
"where is X implemented", multi-language review. Do it inline when the answer is already in
context or the reading is one file.

Fan out reads in parallel, serialize writes. Two agents editing the same file conflict
silently.

## Checkpointing

A checkpoint is a written record of where the work stands, on disk, verified. It is what lets
you compact or restart without losing ground.

Checkpoint when:

- A logical unit of work is complete and its tests are green.
- Before a change large enough that you would want to undo it as a unit.
- Before compacting, always.
- Before switching to an unrelated sub-task.
- After discovering a non-obvious constraint that cost effort to find.
- On a rough cadence of every 30 to 45 minutes of active work, even mid-task.

`/checkpoint` creates, verifies, or lists checkpoints and runs the verification checks first.
A checkpoint that has not been verified is a guess about state, which is exactly what you were
trying to avoid.

A good checkpoint answers four questions:

1. What is done, and what proves it — the test, the command, the output.
2. What is next, concretely enough to start without re-reading anything.
3. What is blocked, and on what.
4. What was learned that is not obvious from the code.

Write it as prose or a short list, not as a transcript excerpt. The next reader is a session
with none of your context.

## Compacting

Compaction replaces the transcript with a summary and continues in the same session. It buys
room without losing the thread.

Compact when:

- The window crosses roughly two-thirds full and the task is not nearly finished.
- The current phase is done and the next phase needs different information — after
  exploration, before implementation.
- The transcript is dominated by tool output you no longer need.
- You notice the session re-reading a file it already read.

Do not compact when:

- You are mid-edit on a file. Finish the edit first.
- The next step depends on details still only in the transcript. Checkpoint them first.
- The session is already confused. Compaction preserves confusion in compressed form; start
  fresh instead.

FORGE nudges here rather than deciding for you. `scripts/hooks/suggest-compact.js` fires on
Write and Edit at logical intervals; `scripts/hooks/pre-compact.js` runs before a compaction so
state can be preserved. The `strategic-compact`, `context-budget`, and `token-budget-advisor`
skills cover the judgment in more depth.

**Always checkpoint before compacting.** Compaction is lossy in ways you cannot predict, and
disk is not.

### What a compaction summary must carry

Write the summary deliberately rather than accepting a generic one:

- The objective, restated in full. Never as "continue the previous task".
- The plan with progress marked.
- Every constraint discovered this session.
- Exact paths for files in flight.
- The exact command to reproduce the current state.
- Open questions, stated as questions.

Drop: file contents, search results, resolved errors, and reasoning that reached a conclusion
you have already recorded.

## When to start fresh

Compaction is not always the right move. Some sessions are better ended.

Start a new session when:

- **The objective changed.** A session that began as a bug fix and became a refactor carries
  investigation that is now noise.
- **The session is looping.** Three attempts at the same fix, each undoing the last, means the
  understanding is wrong. More context will not repair it.
- **Early instructions stopped binding.** If the session is ignoring rules it followed at the
  start, the window is saturated.
- **A wrong premise is embedded.** A misread of the architecture in turn 5 poisons everything
  after it, and compaction will faithfully carry it forward.
- **Two unrelated pieces of work are interleaved.** Split them into two sessions.

The move is the same in every case: checkpoint what is real, note what turned out to be wrong,
end the session, start a new one from the checkpoint. Starting fresh is cheap. Debugging a
saturated session is not.

## Save and resume

Checkpoints capture work state. Session save captures the session.

```bash
/save-session      # writes a dated state file under ~/.claude/session-data/
/resume-session    # loads the most recent one and continues with full context
/sessions          # list, alias, and inspect saved sessions
```

Save at the end of any session whose work is not finished, before a long break, before a risky
operation, and whenever a session has produced understanding that took real effort to build.

Resume reconstructs the objective, the plan, and the constraints — not the transcript. Treat a
resumed session as informed, not identical: re-verify the working tree before trusting the
saved state, because the repository may have moved.

Session lifecycle hooks (`scripts/hooks/session-start.js`, `session-end.js`,
`session-activity-tracker.js`) handle bootstrap and teardown around this.

## Handing off between sessions

A handoff is a checkpoint written for someone who was not there — a later session, a parallel
agent, or a person. The reader has zero context. Assume nothing.

A handoff document contains:

**Objective.** What outcome counts as done. Stated as a result, not an activity.

**State.** Branch, working-tree cleanliness, what is committed, what is not, and the last
command whose output you trust.

**Done.** Each completed item with the evidence — the test name, the command, the output.

**Next.** The immediate next action, specific enough to begin without investigation. "Add the
retry wrapper in `src/client.ts` around line 140, matching the pattern in `src/upload.ts`" —
not "continue the retry work".

**Constraints.** Everything discovered that is not visible in the code. The flaky test and its
workaround. The environment variable that must be set. The API quirk.

**Traps.** Approaches already tried that failed, and why. This is the highest-value section
and the one most often skipped; without it the next session repeats your dead ends.

**Open questions.** Decisions you deferred, stated as questions with the options you saw.

Write it as a file in the repository or under the session directory. A handoff pasted into a
chat is a handoff that will be lost.

### Parallel sessions

When two sessions work at once, the handoff rules tighten:

- Partition by file, not by feature. Overlapping file sets produce conflicts that neither
  session can see.
- Each session gets its own branch or worktree.
- Shared interfaces are agreed and written down before either session starts.
- Merge on a cadence. Two days of parallel work merged at the end is a rewrite.

[docs/ORCHESTRATION-PATTERNS.md](docs/ORCHESTRATION-PATTERNS.md) and
[guides/the-orchestration-guide.md](guides/the-orchestration-guide.md) go further.

## Memory versus context

Context is what the session holds. Memory is what survives it. Do not use one for the other.

| Signal | Put it in |
| --- | --- |
| Relevant to this task only | Context |
| A constraint of this codebase | A rule or a project memory file |
| A repeatable procedure | A skill |
| A correction you have made more than twice | A hook, via `/hookify` |
| A decision with consequences | An ADR in the repository |
| A pattern worth reusing across projects | A skill, promoted globally |

`/learn` extracts a lesson from the current session. `/evolve` consolidates accumulated
lessons. `/promote` moves a project instinct to global scope. `/prune` drops candidates that
were never promoted. The lifecycle exists so memory does not become another unbounded context
cost — see [docs/MEMORY-GUIDE.md](docs/MEMORY-GUIDE.md).

## Warning signs

Symptoms that the window, not the task, is the problem:

| Symptom | Reading | Response |
| --- | --- | --- |
| A file is read that was already read | Early context is out of reach | Checkpoint and compact |
| Rules followed at the start are ignored | Instructions saturated | Compact, or start fresh |
| The same fix is attempted repeatedly | Wrong premise embedded | Start fresh from a checkpoint |
| Answers get vaguer as the session runs | Degradation, not difficulty | Compact |
| The plan is restated slightly differently each time | The objective is drifting | Rewrite the objective, checkpoint |
| Confident claims about files not in context | Reconstruction from priors | Re-read before acting; verify |

The last one is the dangerous one. A session low on context does not announce it — it
interpolates. Any claim about a file's contents late in a session should be re-verified before
it becomes an edit.

## Working defaults

1. Open with the objective written down, not implied.
2. Load only the rule sets for the stacks in play.
3. Read by range; delegate broad reads to a subagent.
4. Checkpoint every 30 to 45 minutes and at every green test.
5. Compact at roughly two-thirds full, and never without checkpointing first.
6. End the session when the objective changes, rather than stretching it.
7. Save before any break longer than the session.
8. Write the handoff for a reader who was not there.
9. Anything corrected twice becomes a rule, a skill, or a hook.
