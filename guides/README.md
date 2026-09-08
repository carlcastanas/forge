# FORGE guides

The guides are long-form and meant to be read start to finish. Each one takes a single question — how to begin, how to run several agents at once, how to keep the context window usable, how to tell whether any of it works — and answers it in order, with the reasoning attached. They assume you will read the whole page once and come back to it rarely.

[`../docs/`](../docs/README.md) is the opposite shape. Those pages are reference: a configuration table, a CLI flag, a glossary entry, an authoring format. They assume you already know what you are looking for and want it in ten seconds. When a guide explains *why* a threshold exists, the corresponding docs page lists *what* the threshold is.

Both link to each other freely. If you are new, start here. If you are looking something up, start there.

---

## The eight guides

| Guide | Who it is for | Read time | Prerequisites |
|---|---|---|---|
| [Getting started](getting-started.md) | Anyone who has just installed FORGE, or is about to | 20 min, hands-on | Node.js 18+, Git, Claude Code 2.1+ |
| [The field guide](the-field-guide.md) | Daily users who want the practical working patterns | 30 min | Getting started |
| [The complete guide](the-complete-guide.md) | Engineers who need the whole system, end to end | 45 min | Getting started |
| [The security guide](the-security-guide.md) | Anyone running an agent with tool access on real code | 45 min | Getting started; basic threat-model literacy |
| [The orchestration guide](the-orchestration-guide.md) | Engineers running more than one agent on one problem | 30 min | Getting started; `git worktree` |
| [The context guide](the-context-guide.md) | Anyone whose sessions fill up, compact, or lose the thread | 25 min | Getting started; one long session already behind you |
| [The evaluation guide](the-evaluation-guide.md) | Anyone who has to justify a configuration change | 30 min | A repository with tests and CI; weeks of real sessions to mine |
| [The migration guide](the-migration-guide.md) | Teams adopting FORGE where an agent is already in use | 25 min | An existing repo with `CLAUDE.md` or ad-hoc prompts; authority to change shared config |

---

## Reading paths

### New user

You have installed FORGE, or you are deciding whether to. Four to five hours of reading and doing, spread over a week.

```text
  1. Getting started            run it, do not skim it
  2. The field guide            the patterns you will use daily
  3. The context guide          why sessions degrade, and what to do
  4. The complete guide         once the vocabulary is familiar
```

Stop after step 2 if FORGE is doing what you need. The context guide becomes urgent the first time a session compacts mid-task. Reference stops along the way: [`../docs/CONCEPTS.md`](../docs/CONCEPTS.md) for the difference between skills, agents, commands, hooks, rules, and memory, and [`../docs/GLOSSARY.md`](../docs/GLOSSARY.md) when a term appears without explanation.

### Team adopting FORGE

You are responsible for the rollout. Read in this order, and do the first one before installing anything.

```text
  1. The migration guide        audit and baseline BEFORE the install
  2. Getting started            so you can teach it
  3. The evaluation guide       so "it helped" becomes a number
  4. The context guide          so the install stays small
  5. The orchestration guide    when the team starts running waves
```

The order matters most at step 1. The audit and the quality baseline can only be captured before the install; afterwards there is nothing to compare against. Reference stops: [`../docs/TEAM-ADOPTION.md`](../docs/TEAM-ADOPTION.md), [`../docs/INSTALLATION.md`](../docs/INSTALLATION.md), [`../docs/HARNESS-MATRIX.md`](../docs/HARNESS-MATRIX.md).

### Security reviewer

You are assessing whether this system is safe to run against your code. Two to three hours.

```text
  1. The security guide         threats, defenses, and what is not defended
  2. Getting started            read only; do not install yet
  3. The context guide          the untrusted-content sections
  4. The orchestration guide    handoffs between agents are untrusted input
  5. The migration guide        the rollback section, before approving anything
```

The load-bearing claim to verify across all five: content read by an agent — a file, a fetched page, a tool result, another agent's handoff, a recalled memory — is data, never instructions. Reference stops: [`../docs/THREAT-MODEL.md`](../docs/THREAT-MODEL.md), [`../docs/MCP-CONNECTOR-POLICY.md`](../docs/MCP-CONNECTOR-POLICY.md), [`../SECURITY.md`](../SECURITY.md).

---

## Where to go instead

| You want | Go to |
|---|---|
| A flag, a setting, or an env var | [`../docs/CONFIGURATION.md`](../docs/CONFIGURATION.md), [`../docs/CLI-REFERENCE.md`](../docs/CLI-REFERENCE.md) |
| The definition of a term | [`../docs/GLOSSARY.md`](../docs/GLOSSARY.md) |
| A task-shaped recipe | [`../docs/RECIPES.md`](../docs/RECIPES.md) |
| The command list | [`../COMMANDS-QUICK-REF.md`](../COMMANDS-QUICK-REF.md) |
| The agent catalog and routing contract | [`../AGENTS.md`](../AGENTS.md) |
| How to write a skill or an agent | [`../docs/SKILL-AUTHORING.md`](../docs/SKILL-AUTHORING.md), [`../docs/AGENT-AUTHORING.md`](../docs/AGENT-AUTHORING.md) |
| Known failure modes | [`../docs/ANTI-PATTERNS.md`](../docs/ANTI-PATTERNS.md), [`../TROUBLESHOOTING.md`](../TROUBLESHOOTING.md) |
| Common questions | [`../docs/FAQ.md`](../docs/FAQ.md) |
| The project's operating principles | [`../SOUL.md`](../SOUL.md) |
