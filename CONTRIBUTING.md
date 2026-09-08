# Contributing

How to make a change to FORGE that will pass CI and be easy to review. This page covers the
repository layout, local setup, the validation gate, the authoring contracts for each catalog
type, commit conventions, and what a reviewer will check.

Prerequisites: Node 20.19.0 and Python 3.12.8 as pinned in `.tool-versions`, Git, and a working
install of the coding agent you intend to test against.

## What a contribution looks like here

FORGE ships a catalog, not an application. The overwhelming majority of changes are one of:

- A new or improved skill in `skills/`.
- A new or improved agent in `agents/`.
- A rule refinement in `rules/`.
- A hook in `scripts/hooks/` plus its registration in `hooks/hooks.json`.
- A validator, script, or test under `scripts/` and `tests/`.
- Documentation in `docs/` or `guides/`.

Every one of those is governed by a machine-checked contract. `npm test` runs the validators;
if they pass, the shape is right. Review then focuses on whether the content is correct and
whether it duplicates something that already exists.

## Repository layout

| Path | Contents |
| --- | --- |
| `agents/` | 68 subagent definitions, one Markdown file each |
| `skills/` | 287 skills, each a directory containing `SKILL.md` |
| `commands/` | 94 slash-command shims |
| `rules/` | 121 rule files across 22 stack directories, plus an index README |
| `hooks/` | Hook registration JSON |
| `scripts/hooks/` | Hook entrypoints |
| `scripts/ci/` | Validators executed by `npm test` |
| `scripts/lib/` | Shared helpers |
| `manifests/` | Selective-install profiles, modules, components |
| `mcp-configs/` | MCP server configuration templates |
| `schemas/` | JSON Schemas enforced by the validators |
| `workflows/` | Native workflow scripts |
| `contexts/` | Context presets: `dev`, `review`, `research` |
| `tests/` | Node and Python test suites |
| `docs/` | Reference documentation |
| `guides/` | Long-form narrative guides |
| `examples/` | Worked examples |

Harness adapters live in root dotfile directories — `.claude-plugin/`, `.codex/`, `.cursor/`,
`.gemini/`, `.opencode/`, `.zed/`, `.qwen/`, `.agents/`, and siblings. They are projections of
the canonical catalog. Do not add behavior to an adapter that the catalog does not have; add it
to the catalog and let the adapter carry it.

## Local setup

```bash
git clone <your fork> forge
cd forge
corepack enable
yarn install
```

The repository declares `yarn@4.9.2` in `packageManager`. Use Corepack rather than a globally
installed Yarn so the version matches CI. Scripts are invoked with `npm run` throughout this
page because that is how `package.json` names them; `yarn <script>` works identically.

Verify the checkout before changing anything:

```bash
npm test
```

A clean checkout must pass. If it does not, fix that before layering your change on top —
otherwise you cannot tell which failure is yours.

## The validation gate

```bash
npm test
```

runs, in order:

1. `check-unicode-safety.js` — rejects homoglyphs, zero-width characters, and other
   invisible-payload vectors anywhere in the tree.
2. `validate-agents.js` — frontmatter completeness, name/filename agreement, model tier.
3. `validate-commands.js` — required `description`, filename conventions.
4. `validate-rules.js` — rule file structure and placement.
5. `validate-skills.js` — `SKILL.md` presence, frontmatter, required sections.
6. `validate-hooks.js` — registration schema, matcher validity, entrypoint existence.
7. `validate-install-manifests.js` — profile, module, and component consistency.
8. `validate-no-personal-paths.js` — no absolute home-directory paths in tracked files.
9. `catalog:check` — the generated catalog matches the directories.
10. `command-registry:check` — the command registry matches `commands/`.
11. `tests/run-all.js` — the Node test suite.

The chain stops at the first failure. Fix that one and re-run rather than reading past it.

Other commands you will need:

```bash
npm run lint                     # eslint . && markdownlint over all Markdown
npm run coverage                 # thresholds: 80 lines / 80 functions / 79 branches / 80 statements
node tests/run-all.js            # suite only, skipping validators
npm run catalog:sync             # regenerate the catalog after adding entries
npm run command-registry:write   # regenerate the command registry
npm run harness:adapters         # adapter compliance across harnesses
npm run harness:audit            # repository harness audit
npm run platform:audit           # platform support audit
npm run security:ioc-scan        # supply-chain indicator scan
```

Run `npm run catalog:sync` and `npm run command-registry:write` after any addition, rename, or
deletion in `agents/`, `skills/`, or `commands/`. The corresponding `:check` scripts will fail
CI otherwise.

## Adding a skill

Skills are the durable unit of the system. Prefer adding a skill over adding a command.

```text
skills/<name>/
  SKILL.md          required
  references/       optional supporting material
  examples/         optional worked examples
```

`SKILL.md` frontmatter requires `name`, `description`, and `origin`. Use `origin: FORGE` for
first-party skills and `origin: community` for imported ones. The body needs a clear "when to
use" section, the mechanics, and examples that were actually run.

Before writing one, search `skills/` for overlap. With 287 skills present, a near-duplicate is
more likely than a genuine gap. Extending an existing skill is almost always the better change.

Curated skills belong in `skills/`. Generated or personally imported skills belong in the
user's own skills directory, not in this repository — see
[docs/SKILL-PLACEMENT-POLICY.md](docs/SKILL-PLACEMENT-POLICY.md).

Full contract: [docs/SKILL-AUTHORING.md](docs/SKILL-AUTHORING.md).

## Adding an agent

One file at `agents/<name>.md`, lowercase with hyphens, with frontmatter:

```yaml
---
name: example-reviewer
description: What this agent does and when to invoke it, in the third person.
tools: Read, Grep, Glob
model: sonnet
---
```

Rules:

- `name` must equal the filename without `.md`.
- `tools` is the minimum viable allowlist. A reviewer never receives `Write` or `Edit`. An
  agent that only reads receives no `Bash`. MCP tools are named individually.
- `model` defaults to `sonnet`. Anything above it needs a justification in the pull request.
- The body states scope, an explicit out-of-scope list, and the output format the caller
  should expect.

Full contract: [docs/AGENT-AUTHORING.md](docs/AGENT-AUTHORING.md). Routing conventions are in
[AGENTS.md](AGENTS.md), which also needs a row for the new agent.

## Adding a command

One file at `commands/<name>.md`; the filename is the slash name. Only `description` is
required. Optional keys in use: `argument-hint`, `name`, `command`, `allowed-tools`, `agent`,
`subtask`, `disable-model-invocation`.

Keep the body short. A command is a shim that loads a skill or names an agent; if the body
grows past a screen of orchestration, extract the procedure into a skill and shrink the command
back down. Add the row to [COMMANDS-QUICK-REF.md](COMMANDS-QUICK-REF.md), then run
`npm run command-registry:write`.

## Adding a rule

Rules go at `rules/<stack>/<topic>.md`, or `rules/common/<topic>.md` when they apply to every
stack. Reuse the standard topic filenames — `coding-style.md`, `patterns.md`, `security.md`,
`testing.md`, `hooks.md` — so selection stays predictable.

Rules are injected on every turn, so length is a per-turn cost forever. Write one imperative
plus one clause of rationale. If it needs an example longer than three lines, it is skill
material. See [RULES.md](RULES.md) for the selection model and
[docs/RULES-GUIDE.md](docs/RULES-GUIDE.md) for the mechanics.

## Adding a hook

1. Write the entrypoint in `scripts/hooks/<name>.js`. Cross-platform Node, no shell-only
   assumptions.
2. Register it in `hooks/hooks.json` with a specific `matcher`, a stable `id`, and a
   `description` that says what it does and whether it blocks.
3. Exit `1` only when blocking is intentional. Warnings exit `0` with an actionable message.
4. Declare a `timeout`, or mark the hook `async`, if it can take more than a second.
5. Add coverage in `tests/hooks/`.

A blocking hook changes behavior for everyone who installs FORGE. Justify it in the pull
request. See [docs/HOOKS-GUIDE.md](docs/HOOKS-GUIDE.md).

## Commit conventions

Commits follow Conventional Commits, enforced by `commitlint.config.js`.

```text
<type>(<scope>): <subject>
```

Allowed types:

`feat` · `fix` · `docs` · `style` · `refactor` · `perf` · `test` · `chore` · `ci` · `build` ·
`revert`

Constraints the linter enforces:

- Header maximum 100 characters.
- Subject must not be sentence-case, start-case, pascal-case, or upper-case. Write it in lower
  case: `feat(agents): add fastapi reviewer`, not `feat(agents): Add FastAPI Reviewer`.

Use the directory as the scope where one applies: `agents`, `skills`, `commands`, `rules`,
`hooks`, `scripts`, `docs`, `tests`, or an adapter name.

Examples:

```text
feat(skills): add postgres partition maintenance skill
fix(hooks): stop suggest-compact firing on generated files
docs(rules): document react-native rule set selection
chore(ci): pin markdownlint to the tested minor
refactor(scripts): extract shared frontmatter parser
```

Keep each commit to one logical change. A commit that adds an agent and rewrites a validator
is two commits.

## Pull requests

Fill in `.github/PULL_REQUEST_TEMPLATE.md`. A reviewable pull request has:

**A title that reads as a change.** "Add a Rust reviewer for unsafe-block auditing", not
"updates".

**A description that answers three questions.** What problem this solves. What approach was
taken. What was verified, with the commands you ran and their result.

**A bounded diff.** One concern. A pull request that adds a skill, refactors a script, and
reformats three documents is three pull requests, and will be reviewed as slowly as its
slowest part.

**Evidence.** Paste the relevant `npm test` output, not a claim that it passed. For a behavior
change, show the before and after.

**Documentation in the same change.** A new agent updates `AGENTS.md`. A new command updates
`COMMANDS-QUICK-REF.md`. A new rule directory updates `RULES.md`. Documentation that lands in a
follow-up does not land.

Branch from the default branch, keep the branch rebased, and do not force-push after review has
started unless you say so in a comment.

Do not use `--no-verify`. A pre-commit hook exists to block it.

## Review checklist

Run this against your own change before requesting review, and against someone else's when
reviewing.

**Correctness**

- [ ] `npm test` passes on a clean checkout with the change applied.
- [ ] `npm run lint` passes.
- [ ] New scripts have tests; changed scripts have their tests updated.
- [ ] Coverage thresholds still hold if `scripts/` changed.

**Catalog hygiene**

- [ ] The addition does not duplicate an existing skill, agent, command, or rule.
- [ ] `npm run catalog:sync` and `npm run command-registry:write` were run and their output
      committed.
- [ ] Names are lowercase with hyphens and agree with their frontmatter.
- [ ] Counts quoted in documentation were verified against the directory, not copied.

**Security**

- [ ] No secrets, tokens, or credentials in any file, including examples and tests.
- [ ] No absolute home-directory paths.
- [ ] Agent tool allowlists are the minimum needed; any widening is called out explicitly.
- [ ] New hooks that block are justified and tested.
- [ ] Anything that reads external content treats it as data, not instruction.

**Documentation**

- [ ] Every claim is checkable against the repository.
- [ ] Links are relative and resolve.
- [ ] One H1, sentence-case headings, language tag on every fenced block.
- [ ] No emoji, no marketing adjectives, no first person.

**Scope**

- [ ] One concern per pull request.
- [ ] No unrelated formatting churn.
- [ ] Adapter directories were not edited to hold behavior missing from the catalog.

## Reporting problems

Open an issue using the templates in `.github/ISSUE_TEMPLATE/`. Include the harness and its
version, the FORGE version, the exact command, the full output, and what you expected instead.
A reproduction from a clean checkout is worth more than a description.

Security issues do not go in the issue tracker. Follow [SECURITY.md](SECURITY.md).

## License

Contributions are made under the MIT license in [LICENSE](LICENSE). There is no separate
contributor agreement to sign.
