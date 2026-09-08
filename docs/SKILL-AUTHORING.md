# Skill authoring

This page is the reference for writing a FORGE skill that actually fires. It covers the description-as-router principle, naming, scoping one job per skill, the file template, progressive disclosure through reference files, how to test that a skill triggers, the recurring reasons a skill never activates, and a review checklist to run before opening a pull request. It replaces the older skill development guide.

Prerequisites: read [CONCEPTS.md](./CONCEPTS.md) for the difference between a skill, a rule, and a command. Know where a skill belongs before you write it — [SKILL-PLACEMENT-POLICY.md](./SKILL-PLACEMENT-POLICY.md) distinguishes curated skills in [`skills/`](../skills/) from learned, imported, and evolved skills that live under the user's home directory and are never shipped.

## What a skill is for

A skill encodes a procedure the model should recognize and follow without being told. It is the canonical workflow surface in this repo: per [AGENTS.md](../AGENTS.md), new workflow contributions land in `skills/` first, and `commands/` exists only as a slash-entry compatibility layer.

Before writing one, confirm a skill is the right surface:

| The thing you want | Surface |
| --- | --- |
| A procedure the model should apply when it recognizes the situation | Skill |
| A constraint that must hold on every matching file, whether or not the model thinks it is relevant | Rule — see [RULES-GUIDE.md](./RULES-GUIDE.md) |
| A large read that should not consume the main context | Agent — see [AGENT-AUTHORING.md](./AGENT-AUTHORING.md) |
| An enforcement that must be impossible to skip | Hook — see [HOOKS-GUIDE.md](./HOOKS-GUIDE.md) |

[capability-surface-selection.md](./capability-surface-selection.md) is the in-repo routing guide if the answer is not obvious.

## The description is the router

Only two things about a skill are visible to the model before it activates: the name and the description. Everything else — the process, the checklists, the failure table — is invisible until the description has already won. A skill with an excellent body and a vague description is dead weight in the catalog.

Write the description as two parts: what the skill does, then the trigger phrasing in the words a user would actually use.

```yaml
description: Audits Claude Code context window consumption across agents, skills, MCP servers, and rules. Identifies bloat, redundant components, and produces prioritized token-savings recommendations. Use when the context window is filling up too fast and the agents, skills, MCP servers, or rules consuming it need to be identified.
```

That is the shipped description for [`skills/context-budget/`](../skills/context-budget/). It names the artifacts it touches, the output it produces, and the situation that should summon it.

Compare description patterns:

| Pattern | Example | Fires |
| --- | --- | --- |
| Capability only, no trigger | `Helps with database work.` | Rarely — nothing tells the model when |
| Trigger stated in author vocabulary | `Use during schema normalization sweeps.` | Rarely — users do not say that |
| Capability plus user-vocabulary trigger | `Reviews Postgres schemas and migrations for unsafe changes. Use when the user asks to add a column, write a migration, or change an index.` | Reliably |
| Trigger so broad it collides | `Use for any code task.` | Too often, crowding out better matches |

Three concrete rules follow.

**Name the nouns the user will type.** If the skill is about Prisma, the word `Prisma` must appear. Models route on surface overlap between the request and the description; synonyms you did not write do not help.

**State the trigger, not the audience.** "Use when the user asks to ..." beats "For backend engineers working on ...".

**Bound the scope explicitly when a sibling exists.** [`skills/product-lens/`](../skills/product-lens/) and [`skills/product-capability/`](../skills/product-capability/) sit next to each other in the catalog; each says what it owns so the model can tell them apart. Do the same whenever you add a skill near an existing one.

The description must also be a single-line YAML scalar. [`scripts/ci/validate-skills.js`](../scripts/ci/validate-skills.js) flags block scalars (`|`, `|-`, `>`) because the embedded newlines break flat-table renderers that key off `description`, and it flags unquoted values containing `: ` or starting with a reserved character.

## Naming

- The directory name is kebab-case and the `name` field must equal it.
- Name by job, not by technology, unless the technology is the job: `database-migrations` and `prisma-patterns` are both correct for different reasons.
- Reuse the vocabulary already in the catalog. `*-patterns` is idiomatic guidance for a stack, `*-testing` is test practice, `*-security` is threat-specific review, `orch-*` is orchestration, `*-ops` is an operator workflow over a connected surface.
- When adapting an idea from outside this repo, [skill-adaptation-policy.md](./skill-adaptation-policy.md) governs whether the original name survives. Keep it when the port is close and the name is neutral and descriptive; rename when FORGE meaningfully expands or repackages the work.

## One job per skill

A skill that covers three jobs has one description, so it can only route on one of them. Split when any of these is true:

- The triggers are disjoint. "Write a migration" and "diagnose a slow query" are different moments.
- Half the body is irrelevant to any given activation, which wastes context every time it fires.
- Two sections have different failure modes and different checklists.

Keep them together when the steps are strictly sequential and no one would ever want just the second half.

The repo has worked this seam repeatedly. [`skills/social-graph-ranker/`](../skills/social-graph-ranker/) was extracted from a larger lead workflow because its ranking model is reusable on its own; [`skills/brand-voice/`](../skills/brand-voice/) became the single voice system that the content skills reference instead of each carrying a partial copy. Extraction beats duplication in both directions.

## File template

Path: `skills/<kebab-name>/SKILL.md`. Target 120 to 260 lines. Every code block carries a language tag and must be runnable as written.

```markdown
---
name: <kebab-name>
description: <What it does. Then: "Use when the user ...">
metadata:
  origin: FORGE
---

# <Title Case Name>

<One paragraph: the problem this solves and what "done" looks like.>

## When to activate

- <concrete trigger>
- <concrete trigger>
- User says "<phrase>", "<phrase>"

## When NOT to use

- <the adjacent skill that is a better fit, named explicitly>

## Prerequisites

- <tools, MCP servers, files, or knowledge assumed>

## Process

### 1. <Step>
<What to do, with a runnable command where one applies.>

### 2. <Step>

## Checklist

- [ ] <verifiable outcome>

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |

## References

- <doc path or well-known spec; no invented URLs>
```

Notes on the fields:

- `name` must match the directory name. `description` must be present and inline. Both are checked by the skill validator.
- `metadata.origin` is `FORGE` for first-party skills and `community` for imported ones, per [RULES.md](../RULES.md).
- Some shipped skills also declare `tools:` or `argument-hint:`; both are optional and neither is validated.
- If the skill depends on a fast-moving external API, add a drift callout directly under the H1 so the reader verifies current documentation before following the steps:

```markdown
> **Drift-prone skill.** Verify current API documentation before following these steps.
```

## Progressive disclosure

A skill body is loaded in full once it activates. Keep `SKILL.md` to the decision layer — when to act, the sequence, the gates — and push depth into sibling files the model opens only when the task reaches them.

```text
skills/continuous-learning-v2/
├── SKILL.md                 # triggers, model, quick start, command list
├── config.json
├── agents/
│   ├── observer.md
│   └── observer-loop.sh
├── hooks/observe.sh
└── scripts/
    ├── instinct-cli.py
    ├── detect-project.sh
    └── lib/homunculus-dir.sh
```

What belongs outside `SKILL.md`:

- Executable helpers. A script the skill invokes is smaller as a file than as a fenced block.
- Long reference tables, API surface listings, and per-framework variants.
- Templates and scaffolds the skill writes into a project.

What must stay inside `SKILL.md`:

- Everything the model needs to decide whether to continue.
- The paths of the sibling files, stated explicitly. A file the body never names will not be read.

Reference each sibling with a relative path and a sentence saying when to open it. "See `scripts/instinct-cli.py`" is weaker than "Run `scripts/instinct-cli.py status` to list current instincts before deciding whether to promote one."

## Testing that a skill triggers

Authoring is not finished until the skill has fired without being named.

**1. Validate the file.**

```bash
node scripts/ci/validate-skills.js --strict
```

Structural problems (missing or empty `SKILL.md`) always fail. Frontmatter problems warn by default and become errors under `--strict` or `CI_STRICT_SKILLS=1`.

**2. Prompt in user vocabulary, never in skill vocabulary.** Open a fresh session in a repo the skill applies to and describe the problem the way a user would, without naming the skill. If it does not activate, the description is the defect — not the model.

**3. Prompt the near-miss cases.** Try three phrasings that should activate it and two that should activate a neighbouring skill instead. A skill that fires on both is scoped too broadly and will crowd the catalog.

**4. Measure compliance rather than assuming it.** [`skills/skill-comply/`](../skills/skill-comply/) generates expected behavioral sequences from a `.md` file, produces scenarios at three prompt strictness levels — supportive, neutral, competing — runs them, and classifies the resulting tool-call traces against the spec. Its central measurement is prompt independence: whether a skill is followed even when the prompt does not explicitly support it.

```bash
uv run python -m scripts.run --dry-run skills/<your-skill>/SKILL.md
```

The dry run produces the spec and scenarios without incurring model cost. Drop `--dry-run` for a full run.

**5. Watch it in production.** Once shipped, [`skill-run-tracker.js`](../scripts/hooks/skill-run-tracker.js) records skill id, version, and outcome (never prompt text) and the dashboard aggregates them:

```bash
node scripts/skills-health.js --dashboard
node scripts/skills-health.js --dashboard --panel failures
```

Zero runs after a week in a repo where the skill should apply is a description problem. A falling success rate is a body problem.

## Why a skill never activates

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Never fires under any phrasing | Description states capability without a trigger | Append "Use when the user asks to ..." with real user phrasings |
| Fires only when named explicitly | Description uses internal vocabulary the user never types | Rewrite using the nouns from the request, not from the implementation |
| A different skill wins every time | Two overlapping descriptions | Add a "When NOT to use" section to both and narrow the losing one |
| Fires on unrelated tasks | Trigger phrasing too broad | Delete generic clauses such as "any code task"; name the domain |
| Frontmatter looks fine, skill is invisible | `description` written as a block scalar, or `name` does not match the directory | Run `node scripts/ci/validate-skills.js --strict` |
| Fires, then the model ignores the body | Body is advisory prose with no verifiable steps | Convert to numbered steps with runnable commands and a checklist |
| Fires in one harness only | Skill assumed a tool or MCP server that harness lacks | Move the assumption into Prerequisites and give a fallback path |
| Works locally, absent after install | Skill directory not listed in an install module | Add the path to [`manifests/install-modules.json`](../manifests/install-modules.json) |
| Duplicate copy shadows the curated one | A stale copy under `~/.claude/skills/` | Remove it; see [SKILL-PLACEMENT-POLICY.md](./SKILL-PLACEMENT-POLICY.md) |

## Review checklist

- [ ] Directory is kebab-case and `name` equals it exactly.
- [ ] `description` is a single-line scalar, states the capability, and ends with explicit "Use when ..." trigger phrasing in user vocabulary.
- [ ] `metadata.origin` is set to `FORGE` or `community`.
- [ ] The skill does one job; adjacent skills are named in "When NOT to use".
- [ ] Body is between 120 and 260 lines, with no filler and no restated headers.
- [ ] Every fenced block carries a language tag and runs as written.
- [ ] A checklist of verifiable outcomes is present.
- [ ] A failure-modes table maps symptom to cause to fix.
- [ ] Reference files, if any, are named in the body with the reason to open them.
- [ ] A drift callout is present if the subject is a fast-moving external API.
- [ ] No emoji, no first person, no named individuals, no invented URLs, no unverifiable benchmark numbers.
- [ ] `node scripts/ci/validate-skills.js --strict` passes.
- [ ] The skill activated in a fresh session from a prompt that never named it.
- [ ] The skill path is registered in an install module if it should ship.
- [ ] `node scripts/ci/check-unicode-safety.js` passes.

## References

- [CONCEPTS.md](./CONCEPTS.md) — how skills relate to rules, agents, commands, and hooks
- [SKILL-PLACEMENT-POLICY.md](./SKILL-PLACEMENT-POLICY.md) — curated, learned, imported, and evolved placement
- [skill-adaptation-policy.md](./skill-adaptation-policy.md) — porting an idea from another project
- [capability-surface-selection.md](./capability-surface-selection.md) — rule, skill, MCP, or CLI
- [CONTRIBUTING.md](../CONTRIBUTING.md) — repo-wide contribution format
- [`skills/skill-comply/`](../skills/skill-comply/) — automated compliance measurement
- [`skills/skill-stocktake/`](../skills/skill-stocktake/) — catalog-level review of overlap and low-signal skills
