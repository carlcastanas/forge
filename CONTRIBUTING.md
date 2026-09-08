# Contributing

This page takes you from a fresh clone to a pull request that passes CI: the exact tool
versions, the commands that must succeed before you commit, a routing table from "what I want
to add" to "the files that change and the validator that judges them", and what a reviewer
looks at.

Prerequisites:

- Node 20.19.0 and Python 3.12.8, pinned in [`.tool-versions`](.tool-versions) for asdf and
  mise. `engines.node` in [`package.json`](package.json) is `>=18`, and CI exercises 18, 20,
  and 22, so a change must not depend on anything newer than Node 18.
- Yarn 4.9.2, declared by `packageManager` in `package.json`. Activate it through Corepack
  rather than a global install so the resolved version matches CI.
- Git, and the coding agent you intend to test against if the change affects a harness surface.

## What a change looks like here

`forge-universal` ships a catalog and the adapters that project it into different coding
agents. There is no server and no application runtime. Nearly every change is a Markdown
contract, a Node script that validates one, or a manifest entry that decides where a file gets
installed. The shape of your contribution is therefore machine-checked: if `npm test` passes,
the structure is correct, and review is about whether the content is right, whether it
duplicates something already in the catalog, and whether it widens a security boundary.

## Get to a green checkout

Run these in order. Every command below was executed against this repository; the output shown
is the real shape, trimmed.

1. Clone your fork and enter it.

   ```bash
   git clone <your-fork-url> forge
   cd forge
   ```

2. Install dependencies. CI uses npm with lifecycle scripts disabled, so this is the closest
   match to what the build machine does:

   ```bash
   npm ci --ignore-scripts
   ```

   ```text
   added 212 packages, and audited 213 packages in 4s
   82 packages are looking for funding
     run `npm fund` for details
   found 0 vulnerabilities
   ```

   Yarn is the declared package manager and works equally well:

   ```bash
   corepack enable
   yarn install
   ```

   Script names are quoted as `npm run <name>` throughout this page because that is how
   `package.json` spells them. `yarn <name>` resolves to the same script.

3. Run the full gate.

   ```bash
   npm test
   ```

   It chains eleven steps and stops at the first failure. On a clean checkout each validator
   prints a one-line summary:

   ```text
   Unicode safety check passed.
   Validated 68 agent files
   Validated 94 command files
   Validated 122 rule files
   Validated 837 skill directories
   Validated 24 hook matchers
   Validated 35 install modules, 82 install components, and 7 profiles
   Validated: no personal absolute paths in shipped docs/skills/commands
   Link check passed: no broken relative links in the English doc surface.
   ```

   The catalog and registry checks follow, then the Node suite runs every
   `tests/**/*.test.js` file and prints a final box:

   ```text
   ╔══════════════════════════════════════════════════════════╗
   ║                     Final Results                        ║
   ╠══════════════════════════════════════════════════════════╣
   ║  Total Tests: 4307                                       ║
   ║  Passed:      4307  ✓                                    ║
   ║  Failed:         0                                       ║
   ╚══════════════════════════════════════════════════════════╝
   ```

   The total moves as tests are added. What matters is `Failed: 0` and an exit status of `0`.

4. Record the lint baseline before you edit anything.

   ```bash
   npm run lint
   ```

   `npm run lint` is `eslint .` followed by markdownlint over every Markdown file, and it does
   not currently reach zero findings on a clean checkout — markdownlint reports pre-existing
   issues in the translated `docs/<locale>/` trees and a few catalog files. Capture the baseline
   now, then lint your own diff while you work with `npx markdownlint <files>` and
   `npx eslint <files>`.

Steps 1 through 3 must be green on a clean checkout. If they are not, fix that first —
otherwise you cannot tell which failure is yours.

## What do you want to add?

Find your row, create the files in the middle column, then run the regeneration commands in the
right column before committing. Details for each row follow the table.

| Goal | Files you create or edit | Validator that judges it | Regenerate |
| --- | --- | --- | --- |
| Add a skill | `skills/<name>/SKILL.md`, a `paths` entry in `manifests/install-modules.json`, a `files` entry in `package.json` | `validate-skills.js`, `validate-install-manifests.js`, `tests/scripts/npm-publish-surface.test.js` | `npm run catalog:sync` |
| Add an agent | `agents/<name>.md`, a row in `AGENTS.md` | `validate-agents.js` | `npm run catalog:sync` |
| Add a command | `commands/<name>.md`, a row in `COMMANDS-QUICK-REF.md` | `validate-commands.js` | `npm run command-registry:write`, `npm run catalog:sync` |
| Add a rule | `rules/<stack>/<topic>.md` | `validate-rules.js` | none |
| Add a hook | `scripts/hooks/<name>.js`, a registration in `hooks/hooks.json`, a test in `tests/hooks/` | `validate-hooks.js` | none |
| Fix a validator | `scripts/ci/<validator>.js`, its test in `tests/ci/` | the validator's own test plus `npm run coverage` | none |
| Improve docs | the page under `docs/` or `guides/`, plus its row in `docs/README.md` or `guides/README.md` | `validate-links.js`, `check-unicode-safety.js`, `markdownlint` | none |
| Translate a page | `docs/<locale>/<page>.md` | `validate-skills.js` covers translated skill mirrors; `validate-links.js` skips locale trees | none |

### Add a skill

Skills are the durable unit of the system. Prefer extending a skill over adding a command.

```text
skills/<name>/
  SKILL.md          required
  references/       optional supporting material
  examples/         optional worked examples
```

`SKILL.md` needs YAML frontmatter with `name` and `description`. Both are enforced by
`scripts/ci/validate-skills.js`. A `description` containing a colon followed by a space must be
quoted or the YAML parse fails, and a literal block scalar (`|`, `|-`, `|+`) is rejected because
it breaks the flat renderers keyed off `description`. Provenance goes in a nested `metadata`
block:

```yaml
---
name: my-skill
description: What it does. Use when the caller needs X.
metadata:
  origin: FORGE
---
```

Two registrations are mandatory and easy to forget. `validate-install-manifests.js` fails if a
curated skill directory is not referenced by any install module, and
`tests/scripts/npm-publish-surface.test.js` fails if the module path is missing from the
`files` array in `package.json`. Add both in the same commit as the skill.

There are 318 curated skills. Search `skills/` before writing a new one; a near-duplicate is
more likely than a genuine gap. Curated skills live here; generated or personally imported
skills belong in your own skills directory — see
[docs/SKILL-PLACEMENT-POLICY.md](docs/SKILL-PLACEMENT-POLICY.md). Full contract:
[docs/SKILL-AUTHORING.md](docs/SKILL-AUTHORING.md).

### Add an agent

One file at `agents/<name>.md`, lowercase with hyphens.

```yaml
---
name: example-reviewer
description: What this agent does and when to invoke it, stated in the third person.
tools: Read, Grep, Glob
model: sonnet
---
```

`scripts/ci/validate-agents.js` hard-fails on a missing or invalid `model` (one of `haiku`,
`sonnet`, `opus`) and on a missing `tools`. `name` and `description` are enforced in review
rather than by the validator, so a passing validator is not proof the frontmatter is complete.
Grant the smallest usable `tools` allowlist. A reviewer never receives `Write` or `Edit`. An
agent that only reads receives no `Bash`. MCP tools are named individually. Anything above
`sonnet` needs a sentence of justification in the pull request. The body states scope, an
explicit out-of-scope list, and the output format the caller should expect. The `agents/`
directory is installed wholesale by the `agents-core` module, so no manifest edit is required.
Add the routing row to [AGENTS.md](AGENTS.md). Full contract:
[docs/AGENT-AUTHORING.md](docs/AGENT-AUTHORING.md).

### Add a command

One file at `commands/<name>.md`; the filename is the slash name. Frontmatter requires
`description`. Optional keys already in use: `argument-hint`, `name`, `command`,
`allowed-tools`, `agent`, `subtask`, `disable-model-invocation`. `validate-commands.js` also
resolves cross-references, so a command that names an agent or skill that does not exist fails
the build.

A command is a shim that loads a skill or names an agent. If the body grows past a screen of
orchestration, extract the procedure into a skill and shrink the command back down. Add the row
to [COMMANDS-QUICK-REF.md](COMMANDS-QUICK-REF.md), then run `npm run command-registry:write`.

### Add a rule

Rules go at `rules/<stack>/<topic>.md`, or `rules/common/<topic>.md` when they apply to every
stack. Reuse the standard topic filenames — `coding-style.md`, `patterns.md`, `security.md`,
`testing.md`, `hooks.md` — so pack selection stays predictable across the 22 stack directories.

Rules are injected on every turn, so length is a per-turn cost forever. Write one imperative
plus one clause of rationale. If it needs an example longer than three lines, it is skill
material. See [RULES.md](RULES.md) and [docs/RULES-GUIDE.md](docs/RULES-GUIDE.md).

### Add a hook

1. Write the entrypoint at `scripts/hooks/<name>.js`. Export `run(rawInput, context)` — the
   dispatcher calls that export in-process and saves a Node process spawn. A module without a
   `run` export falls back to being spawned as a child process.
2. Register it in `hooks/hooks.json` with a specific `matcher`, a stable `id`, and a
   `description` that says what it does and whether it blocks.
3. Exit `1` (or `2`, for a PreToolUse block) only when blocking is intentional. Warnings exit
   `0` with an actionable message on stderr.
4. Declare a `timeout`, or mark the hook `async`, if it can exceed a second.
5. Add coverage in `tests/hooks/`.

A blocking hook changes behavior for everyone who installs FORGE, so justify it in the pull
request. Dispatch, profiles, and local debugging are covered in
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#debug-a-hook-locally) and
[docs/HOOKS-GUIDE.md](docs/HOOKS-GUIDE.md).

### Fix a validator

Validators live in `scripts/ci/` and their tests in `tests/ci/`. The pattern used throughout is
a success path run against the real repository plus error paths run against temporary fixture
directories — see `tests/ci/validators.test.js` for the established shape. Coverage thresholds
apply to everything under `scripts/`, so a new branch in a validator needs a test that reaches
it. Run `npm run coverage` before pushing.

### Improve docs or translate

English is the source of truth. Every link you add must resolve under
`node scripts/ci/validate-links.js`, which checks relative links across root pages, `docs/`,
and `guides/`, and deliberately skips the per-locale trees because they lag the English source.

Conventions: one H1 per file, sentence-case headings, a language tag on every fenced block,
relative links between repository documents, no emoji. `check-unicode-safety.js` rejects emoji,
zero-width characters, bidirectional overrides, and the Unicode Tag block anywhere in tracked
text files. New pages get a row in [docs/README.md](docs/README.md) or
[guides/README.md](guides/README.md).

## Regeneration

Run both of these after any addition, rename, or deletion in `agents/`, `skills/`, or
`commands/`, and commit whatever they change:

```bash
npm run catalog:sync              # rewrites the counts in README.md, AGENTS.md, plugin manifests
npm run command-registry:write    # rewrites docs/COMMAND-REGISTRY.json from commands/
```

The matching `catalog:check` and `command-registry:check` scripts run inside `npm test` and in
CI, so skipping the write step fails the build rather than shipping a stale count.

## Commit convention

Commits follow Conventional Commits as configured in
[`commitlint.config.js`](commitlint.config.js):

```text
<type>(<scope>): <subject>
```

The configured rules are the allowed type list, a 100-character header maximum, and a
`subject-case` rule that forbids sentence-case, start-case, pascal-case, and upper-case
subjects. Write the subject in lower case: `feat(agents): add fastapi reviewer`, not
`feat(agents): Add FastAPI Reviewer`.

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`,
`build`, `revert`.

Use the directory as the scope where one applies: `agents`, `skills`, `commands`, `rules`,
`hooks`, `scripts`, `docs`, `tests`, or an adapter name.

```text
feat(skills): add postgres partition maintenance skill
fix(hooks): stop suggest-compact firing on generated files
docs(rules): document react-native rule set selection
chore(ci): pin markdownlint to the tested minor
```

Note the current state honestly: `@commitlint` is not in `devDependencies`, and no workflow in
`.github/workflows/` invokes it. The convention is real and reviewers apply it, but nothing in
this repository fails your build over a malformed subject line today.

Keep each commit to one logical change. A commit that adds an agent and rewrites a validator is
two commits.

The repository also ships git hooks at `scripts/codex-git-hooks/` — a `pre-commit` secret scan
and a `pre-push` lint/test run. They are not installed automatically; opt in with
`scripts/codex/install-global-git-hooks.sh`, which sets `core.hooksPath`. Separately,
`scripts/hooks/block-no-verify.js` blocks `--no-verify` and `-c core.hooksPath=` from inside an
agent session. Do not work around either.

## What CI runs

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) defines eight jobs. A pull request must
pass all of them.

| Job | What it does |
| --- | --- |
| Test | `node tests/run-all.js` across a matrix of ubuntu, windows, and macOS, Node 18/20/22, and npm, pnpm, yarn, and bun. Bun is excluded on Windows |
| Pack Installer | `npm pack`, asserting exactly one `forge-universal-<version>.tgz` and recording its SHA-256 |
| Packed Install | `tests/ci/packed-artifact-lifecycle.js` against that tarball on all three operating systems |
| Validate Components | every validator in `scripts/ci/`, plus `validate-workflow-security.js`, the catalog check, and the command-registry check |
| Python | `ruff check src tests`, `mypy src`, and `pytest tests/test_*.py -m "not integration"` on Python 3.11 |
| Security Scan | `npm audit signatures`, `npm audit --omit=dev --audit-level=high`, and `npm run security:ioc-scan` |
| Coverage | `npm run coverage` with thresholds of 80 lines, 80 functions, 79 branches, 80 statements |
| Lint | `npm run lint` — ESLint over the tree plus markdownlint over every Markdown file |

The cross-package-manager matrix is why dependency changes need care. Both `package-lock.json`
and `yarn.lock` are committed, and CI installs with npm, pnpm, yarn, and bun. After touching
`dependencies`, `devDependencies`, `overrides`, or `resolutions`, refresh both lockfiles and
commit them:

```bash
npm install --package-lock-only --ignore-scripts
yarn install --mode=update-lockfile
```

The yarn lane in CI runs `yarn install --mode=skip-build` after `corepack prepare yarn@stable`.
Yarn Berry treats installs as immutable when it detects CI, so a `yarn.lock` that would change
during install fails that lane even when nothing else is wrong — unverified against your Yarn
version; confirm locally with `yarn install --immutable` before pushing a dependency change.

`validate-workflow-security.js` runs in CI but not in `npm test`. Run it by hand if you edit
anything under `.github/workflows/`.

## Pull requests

Fill in [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md). It asks you to
paste the tail of `npm test` rather than tick a box, because a pasted result is checkable and a
ticked box is not.

Four things make a pull request reviewable. A title that reads as a change — "Add a Rust
reviewer for unsafe-block auditing", not "updates". A description saying what problem this
solves, what approach was taken, and what was verified. A diff with one concern in it; a pull
request that adds a skill, refactors a script, and reformats three documents is three pull
requests and gets reviewed as slowly as its slowest part. And the documentation in the same
change — a new agent updates `AGENTS.md`, a new command updates `COMMANDS-QUICK-REF.md`, a new
page updates `docs/README.md`. Documentation that lands in a follow-up does not land.

Branch from the default branch, keep the branch rebased, and avoid force-pushing after review
has started unless you say so in a comment.

## Review expectations

Run this against your own change before requesting review.

**Correctness.** `npm test` passes on a clean checkout with the change applied, and the output
is in the pull request. Lint reports nothing new on the files you touched. New scripts have
tests, changed scripts have their tests updated, and coverage thresholds still hold if anything
under `scripts/` changed.

**Catalog hygiene.** The addition does not duplicate an existing entry. `catalog:sync` and
`command-registry:write` were run and their output committed. New skills are registered in
`manifests/install-modules.json` and in `files` in `package.json`. Names are lowercase with
hyphens and agree with their frontmatter. Counts quoted in documentation were verified against
the directory rather than copied from an older page.

**Security.** No secrets or credentials anywhere, including fixtures. No absolute
home-directory paths — `validate-no-personal-paths.js` catches the common shapes, not all of
them. Agent tool allowlists are the minimum needed. New blocking hooks are justified and
tested. Anything that reads external content treats it as data, never as instruction.

**Scope.** One concern. No unrelated formatting churn. No adapter directory edited to hold
behavior the canonical catalog does not have — adapters are projections, and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains what breaks when one drifts.

Expect a reviewer to ask for a test when a change adds a branch, and to ask why when a change
widens a tool allowlist, adds a blocking hook, or introduces a dependency.

## Reporting problems

Open an issue with a template from [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/), and
include the harness and its version, the FORGE version, the exact command, the output, and what
you expected instead. A reproduction from a clean checkout beats a description. Security
vulnerabilities do not go in the issue tracker — follow [SECURITY.md](SECURITY.md).

## Where to go next

[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the local loop — layout, every script, the
validator chain, hook debugging, sandboxed installs.
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit — catalog versus adapters,
the install pipeline, hook dispatch, session lifecycle, on-disk state.
[docs/TESTING.md](docs/TESTING.md) for the suite, the runner, and what a good test looks like.
[CLAUDE.md](CLAUDE.md) for the instructions FORGE injects when an agent works in this
repository.

## License

Contributions are made under the MIT license in [LICENSE](LICENSE). There is no separate
contributor agreement.
