# Testing

How testing works in this repository: where the suites live, what the runner does and does not
do, the coverage contract, what a good test looks like for each catalog surface, and the one
rule about deleting tests that keeps the suite honest.

Prerequisites: a green checkout as described in [../CONTRIBUTING.md](../CONTRIBUTING.md), and
[DEVELOPMENT.md](DEVELOPMENT.md) for the validator chain that runs before the suite.

## Suite layout

252 Node test files and a small Python suite live under `tests/`.

| Directory | Files | Covers |
| --- | --- | --- |
| `tests/lib/` | 80 | `scripts/lib/` — the install engine, state store, session adapters, memory, path safety, utilities |
| `tests/scripts/` | 62 | Top-level scripts in `scripts/` — the CLI, installers, doctor, repair, audits, release tooling |
| `tests/hooks/` | 53 | Every hook in `scripts/hooks/`, including the dispatchers and the flag gate |
| `tests/ci/` | 25 | The validators in `scripts/ci/`, catalog and registry generation, workflow and supply-chain checks |
| `tests/docs/` | 13 | Documentation contracts — pages that must keep specific content because a surface depends on it |
| `tests/commands/` | 3 | Command frontmatter and command-to-skill wiring |
| `tests/skills/` | 3 | Individual skills whose content is load-bearing |
| `tests/pi/` | 3 | The Pi extension adapter, hook runtime, and package manifest |
| `tests/integration/` | 2 | Cross-component flows: hook integration, plan-canvas end to end |
| `tests/docker/` | 1 | The plugin-setup container harness |
| `tests/` (root) | 7 | Adapter surfaces that do not belong to one subdirectory: OpenCode config, tools and plugin hooks, Codex config and native hooks, plugin manifest, GAN harness |
| `tests/fixtures/` | — | Shared fixtures. Not discovered as tests |

Python tests sit at `tests/test_*.py` with `tests/conftest.py`, and cover the
`llm-abstraction` package in `src/`. They are not run by the Node runner.

## The runner

`tests/run-all.js` is the whole harness. There is no framework, no `describe`, and no
`node:test` integration.

What it does, read out of the source:

1. Walks `tests/` and keeps every file matching the glob `tests/**/*.test.js`, sorted. Discovery
   is by filename, not by a manifest — a new `*.test.js` file is picked up with no registration.
2. Runs each file as its own `node` child process with piped stdio, so one file cannot leak
   module state into another.
3. Strips `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_COMMON_DIR`, and `GIT_PREFIX` from
   the child environment. Without this, running the suite from inside a git hook would make
   tests that shell out to `git -C <fixture>` operate on the host repository instead.
4. Prints the child's stdout and stderr, then parses `Passed: <n>` and `Failed: <n>` out of the
   combined output.
5. Treats a non-zero exit or a spawn error as at least one failure, even when the file reported
   `Failed: 0`.
6. Emits a GitHub Actions `::error file=...` annotation for each failing file when
   `GITHUB_ACTIONS=true`.
7. Exits 1 if any test failed.

Two consequences follow from step 4. Your test file must print `Passed: <n>` — and, when
anything failed, `Failed: <n>` — or its results are invisible to the totals. And it must exit
non-zero on failure, because the runner trusts the exit code over the parsed numbers.

Run everything:

```bash
node tests/run-all.js
```

Run one file, which is the normal inner loop:

```bash
node tests/hooks/check-hook-enabled.test.js
```

```text
=== Testing check-hook-enabled.js ===

No arguments:
  ✓ returns yes when no hookId provided
...
Results: Passed: 9, Failed: 0
```

There is no `--grep`. To narrow inside a file, comment cases out locally.

## Coverage

```bash
npm run coverage
```

`c8` instruments `scripts/**/*.js` and `scripts/**/*.mjs` with `--all`, so files with no test at
all count against the totals, and runs `tests/run-all.js` underneath. The thresholds are
declared in `package.json` and enforced with `--check-coverage`:

| Metric | Threshold |
| --- | --- |
| Lines | 80 |
| Functions | 80 |
| Branches | 79 |
| Statements | 80 |

Reporters are `text` and `lcov`; the CI coverage job uploads the `coverage/` directory as an
artifact. Coverage is not part of `npm test` — it is a separate CI job, and slower. Run it
locally whenever you add a branch under `scripts/`.

Nothing enforces coverage on `tests/`, `hooks/`, or the catalog Markdown. Those are guarded by
the validators instead.

## What a good test looks like

The house style is a local `test(name, fn)` helper, `require('assert')`, a pass/fail counter, a
printed `Passed: <n>, Failed: <n>` summary, and a non-zero exit when anything failed. Copy the
shape from a neighbouring file rather than introducing a framework.

### A command test: assert the contract across every file

`tests/commands/command-frontmatter.test.js` is the smallest complete example in the
repository. It tests the parser once, then loops the real `commands/` directory so a new command
is covered the moment it lands:

```js
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return match ? match[1] : null;
}

test('frontmatter parser accepts LF and CRLF line endings', () => {
  assert.strictEqual(parseFrontmatter('---\ndescription: ok\n---\n# Title'), 'description: ok');
  assert.strictEqual(parseFrontmatter('---\r\ndescription: ok\r\n---\r\n# Title'), 'description: ok');
});

for (const fileName of getCommandFiles()) {
  test(`${fileName} declares command metadata frontmatter`, () => {
    const content = fs.readFileSync(path.join(commandsDir, fileName), 'utf8');
    const frontmatter = parseFrontmatter(content);

    assert.ok(frontmatter, 'Expected command file to start with YAML frontmatter');
    assert.ok(
      /^description:\s*\S/m.test(frontmatter),
      'Expected command frontmatter to include a non-empty description'
    );
  });
}
```

Note the CRLF case. Contributors work on Windows and the CI matrix runs there; a frontmatter
regex that only handles `\n` passes locally and fails in CI.

### A skill test: assert the claims the skill makes

A skill is prose, so its test asserts that the load-bearing claims are still present.
`tests/skills/docker-patterns.test.js`:

```js
test('triggers for hardened installer and cross-platform harness work', () => {
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(frontmatter, 'SKILL.md frontmatter is missing');
  assert.match(frontmatter[1], /description:.*installer/i);
  assert.match(frontmatter[1], /description:.*macOS.*Windows/i);
});

test('requires hardened ephemeral installer execution', () => {
  for (const pattern of [
    /read[_ -]only/i,
    /tmpfs/i,
    /no-new-privileges/i,
    /cap_drop/i,
    /pids_limit/i,
    /non-root/i,
    /digest/i,
    /credential/i,
  ]) {
    assert.match(skill, pattern);
  }
});
```

Most skills do not need a test. Write one when the skill's content is a contract something else
depends on — a security boundary, a documented flag, a trigger phrase that routing relies on.
Do not write a test that merely restates the prose; it will be deleted the first time the skill
is rewritten, having caught nothing.

### An agent test: assert the safety boundary

Agents are validated structurally by `scripts/ci/validate-agents.js`. A dedicated test is for
the part a schema cannot express — that an instruction artifact still carries its guardrail
section. `tests/ci/agent-instruction-safety.test.js` drives a table:

```js
const guardrails = [
  {
    path: '.codex/AGENTS.md',
    heading: '## External Action Boundaries',
    requiredPatterns: [
      /read-only by default/i,
      /explicit user approval/i,
      /posting, publishing, pushing, merging/i,
    ],
  },
  // ...
];
```

Adding a row is how you make a new safety boundary permanent. For the frontmatter contract
itself, `tests/ci/validate-agents-tools.test.js` shows the other half of the pattern: run the
real validator against the real `agents/` directory for the success path, then against
`mkdtemp` fixture directories for each rejection path.

### A hook test: drive the real entrypoint

Hooks are processes with stdin, stdout, stderr, and an exit code, so test them as processes.
`tests/hooks/check-hook-enabled.test.js` spawns the script and controls the environment
explicitly:

```js
function runScript(args = [], envOverrides = {}) {
  const env = { ...process.env, ...envOverrides };
  // Remove potentially interfering env vars unless explicitly set
  if (!envOverrides.FORGE_HOOK_PROFILE) delete env.FORGE_HOOK_PROFILE;
  if (!envOverrides.FORGE_DISABLED_HOOKS) delete env.FORGE_DISABLED_HOOKS;

  const result = spawnSync('node', [script, ...args], {
    encoding: 'utf8',
    timeout: 10000,
    env,
  });
  return { code: result.status || 0, stdout: result.stdout || '', stderr: result.stderr || '' };
}
```

Deleting the inherited variables matters. A developer with `FORGE_HOOK_PROFILE=strict` in their
shell would otherwise get different results than CI. A hook test should cover: the enabled path,
the disabled-by-profile path, the disabled-by-`FORGE_DISABLED_HOOKS` path, the blocking exit
code when the hook blocks, and pass-through of stdin when it does not.

### A validator test: real repository plus fixture failures

`tests/ci/validators.test.js` is the reference. Its header states the pattern outright: "Tests
both success paths (against the real project) and error paths (against temporary fixture
directories via wrapper scripts)." The fixture side uses `fs.mkdtempSync` under `os.tmpdir()`,
writes a minimal manifest or catalog entry, executes the validator against it, and asserts the
exit code and the message. A validator change without an error-path fixture is a validator
change without a test.

## The rule about deleting tests

When content is deleted, the test that guarded it is deleted with it. It is never weakened.

The failure mode this prevents is familiar: a skill section is removed, its assertion starts
failing, and the assertion is relaxed from `assert.match(skill, /cap_drop/)` to a check that the
file is non-empty. The suite goes green, the test file survives, and it now guards nothing while
still costing a run on every CI job and reading like coverage to the next contributor. A deleted
test is honest. A hollowed-out test is a lie with a passing checkmark.

Practically:

- Removing a skill, agent, command, or hook removes its test file in the same commit.
- Removing one guarantee from a surface removes the assertion for that guarantee, not the whole
  file.
- Changing a guarantee updates the assertion to the new guarantee. If you cannot state the new
  guarantee, the change is not finished.
- Loosening an assertion to make a red suite green needs a sentence in the pull request saying
  which behavior is no longer guaranteed. A reviewer will ask.

The same applies to fixtures: a fixture nothing references is deleted.

## Before you push

```bash
npm test                        # validators, then the whole Node suite
npm run coverage                # only if you touched scripts/
npx markdownlint <your files>   # npm run lint has pre-existing findings; scope it to your diff
npx eslint <your files>
```

CI additionally runs the suite across ubuntu, windows, and macOS on Node 18, 20, and 22 with
npm, pnpm, yarn, and bun; runs the packed-artifact lifecycle test against a real `npm pack`
tarball; and runs the Python lint, type check, and pytest jobs. Details are in
[../CONTRIBUTING.md](../CONTRIBUTING.md#what-ci-runs).
