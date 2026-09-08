# Rules guide

This page is the reference for FORGE's rule layer: what a rule is and is not, the difference between always-loaded common rules and path-selected language rules, how to choose which rule packs to install, how to author a new one, how to keep the layer inside the context budget, and what happens when two rules disagree.

Prerequisites: read [CONCEPTS.md](./CONCEPTS.md) for the rule-versus-skill distinction. [`rules/README.md`](../rules/README.md) covers installation mechanics; this page covers selection, authoring, and budget.

## What the rule layer is

A rule is a standing constraint injected into the model's context rather than a procedure the model chooses to load. Rules say what must hold. Skills say how to do something. [`rules/README.md`](../rules/README.md) puts it in one line: rules tell you what to do, skills tell you how to do it.

The distinction has a cost consequence. A skill body enters context only after its description wins a routing decision; an installed rule is present whether or not the current task has anything to do with it. That makes the rule layer the right home for a small number of invariants and the wrong home for a large body of guidance.

FORGE ships 122 rule files across a common layer and 21 language or domain directories.

| Layer | Path | Files | Scope |
| --- | --- | --- | --- |
| Common | [`rules/common/`](../rules/common/) | 10 | Everything, once installed |
| Language and domain | `rules/<name>/` | 5 to 8 each | Files matching the pack's `paths` globs |

The language and domain packs are `angular`, `arkts`, `cpp`, `csharp`, `dart`, `fsharp`, `golang`, `java`, `kotlin`, `nuxt`, `perl`, `php`, `python`, `react`, `react-native`, `ruby`, `rust`, `swift`, `typescript`, `vue`, and `web`. Most carry the same five files — `coding-style.md`, `testing.md`, `patterns.md`, `hooks.md`, `security.md` — with extras where the domain warrants one, such as `python/fastapi.md`, `web/design-quality.md`, and `web/performance.md`.

## Always loaded versus selected

Selection happens twice: once at install time, once per file.

**At install time**, you choose which packs land on disk. Nothing you do not install can ever consume context.

```bash
# Common rules plus one or more language packs
./install.sh typescript
./install.sh typescript python
```

Manual installs copy whole directories into a FORGE-owned namespace. Do not flatten them with `/*`: common and language directories contain files with identical names, so flattening lets language files overwrite common ones and breaks the relative `../common/` references the language files depend on.

```bash
mkdir -p ~/.claude/rules/forge
cp -r rules/common ~/.claude/rules/forge/
cp -r rules/typescript ~/.claude/rules/forge/
```

Project-local rules use the same namespace under the project root:

```bash
mkdir -p .claude/rules/forge
cp -r rules/common .claude/rules/forge/
cp -r rules/typescript .claude/rules/forge/
```

**Per file**, the `paths` frontmatter decides. Files in `rules/common/` have no frontmatter at all, which is what makes them unconditional. Every language file declares globs:

```markdown
---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Testing

> This file extends [common/testing.md](../common/testing.md) with Python specific content.
```

111 of the 122 rule files carry `paths`. The 11 that do not are the ten common rules plus [`rules/README.md`](../rules/README.md).

The practical consequence: a Python rule pack installed in a TypeScript repo costs disk and nothing else, because no file matches its globs. A common rule costs context in every repo it is installed into. Put a constraint in `common/` only when it is genuinely universal.

## Choosing rules for a project

Install the common layer always, then exactly the packs whose languages are present. Two additional considerations:

**Domain packs are not language packs.** `web/` applies to CSS, SCSS, HTML, and TSX and layers on top of a framework pack rather than replacing it. A Next.js repo typically wants `typescript`, `react`, and `web`.

**Frameworks with their own pack should get it.** `nuxt` and `angular` exist separately from `vue` and `typescript` because their idioms differ enough to warrant it. Installing the framework pack without the base language pack loses the base; installing the base without the framework pack loses the idioms.

For selective installs driven by the manifests rather than by hand, `rules-core` is the module that carries the rule tree:

```bash
forge plan --modules rules-core
forge install --modules rules-core
```

[`skills/agent-sort/`](../skills/agent-sort/) classifies installed surfaces into daily-use and library buckets using repo evidence, and hands the resulting install change to [`skills/configure-forge/`](../skills/configure-forge/). Use it when the layer has grown past what you can audit by reading.

## Authoring a rule

Add a language pack by creating `rules/<language>/` and writing files that extend their common counterparts. [`rules/README.md`](../rules/README.md) specifies the file set and the header convention; this is the shape a single file takes.

````markdown
---
paths:
  - "**/*.rs"
---
# Rust Testing

> This file extends [common/testing.md](../common/testing.md) with Rust specific content.

## Test organization

- Unit tests live in a `#[cfg(test)] mod tests` block beside the code under test.
- Integration tests live in `tests/`, one binary per file.

## Running tests

```bash
cargo test --all-features
```

## Coverage

Use `cargo llvm-cov` and hold the 80 percent floor from [common/testing.md](../common/testing.md).
````

Rules for rules:

- **Declare `paths` unless the rule is genuinely universal.** An undeclared rule is an always-on rule.
- **Extend, do not restate.** The header line pointing back at the common counterpart is a convention across the whole tree; follow it and reference the common file instead of copying its content.
- **Write constraints, not tutorials.** "Parameterize every query" is a rule. "How to design a query layer" is a skill.
- **Give the wrong and the right form when the rule is about code.** The TypeScript pack uses a `// WRONG:` / `// CORRECT:` pair, which is compact and unambiguous.
- **Be checkable.** A rule a reviewer cannot verify is advice.
- **Name the skill that carries the depth.** Language rules reference skills where the detailed guidance lives; that is how the layer stays short.

Validate before committing:

```bash
node scripts/ci/validate-rules.js
node scripts/ci/check-unicode-safety.js
```

To add a new language, create the directory, add the five standard files, add the extension header to each, wire the paths into the relevant install module in [`manifests/install-modules.json`](../manifests/install-modules.json), and reference or create the matching skills under [`skills/`](../skills/).

## Keeping rules inside the context budget

The common layer is deliberately small: ten files totalling roughly 550 lines, with individual files between 24 and 124 lines. Language files run longer — the largest in the tree are around 260 lines — but they only load against matching files.

Budget guidance:

- **Target under 100 lines per rule file.** [`skills/context-budget/`](../skills/context-budget/) flags rule files above that threshold and detects content overlap between files in the same pack.
- **Keep `common/` under roughly 600 lines in total.** Every line is resident in every session on every project.
- **Push examples down.** A common rule states the principle; the language file carries the code.
- **Prefer a table to prose.** A four-column table is denser than the paragraphs that would say the same thing.
- **Delete rather than qualify.** A rule hedged into inapplicability still costs its tokens.
- **Audit periodically.**

```bash
node scripts/skills-health.js --dashboard
```

That dashboard covers skills; for the rule side, run [`skills/context-budget/`](../skills/context-budget/) or `/context-budget`, which inventories agents, skills, rules, and MCP servers together and produces prioritized savings.

The reason to hold this line is that the rule layer competes with the working set. [AGENTS.md](../AGENTS.md) advises avoiding the last 20 percent of the context window for large multi-file work; every kilobyte of always-on rules moves that boundary closer.

## Conflicts

**Language beats common.** [`rules/README.md`](../rules/README.md) states the precedence explicitly: specific overrides general, in the same way CSS specificity or `.gitignore` precedence works. `common/coding-style.md` recommends immutability as a default; `golang/coding-style.md` may prefer pointer receivers for struct mutation and say so, referencing the common file it is overriding.

Common rules that anticipate an override carry a marker:

```markdown
> **Language note**: This rule may be overridden by language-specific rules for languages where this pattern is not idiomatic.
```

**Two language packs both match.** A `.tsx` file matches `typescript`, `react`, and `web`. Precedence between sibling packs is not defined by the layer, so the packs must not contradict each other. When they would, the narrower pack states the exception and names the pack it is overriding, in the same form the common override uses.

**A rule contradicts a project convention.** The project wins, and the fix is to stop installing that rule pack rather than to argue with it in prose. Selective install is the conflict-resolution mechanism.

**A rule contradicts a skill.** The rule is the constraint and the skill is the procedure, so the skill must be corrected to satisfy the rule. If the skill is right, the rule was too strong.

**A rule is being ignored.** Do not escalate by rewriting it louder. Measure first with [`skills/skill-comply/`](../skills/skill-comply/), which accepts `rules/common/*.md` as a target and reports whether the rule is followed at three levels of prompt strictness. If it is genuinely ignored and it matters, it is not a rule — it is a hook. See [HOOKS-GUIDE.md](./HOOKS-GUIDE.md).

## Review checklist

- [ ] File lives under the right pack: `common/` only if it applies to every project and language.
- [ ] `paths` frontmatter is declared for any non-universal rule and the globs are correct.
- [ ] The extension header names and links the common counterpart.
- [ ] Content is constraints, not a tutorial; depth is delegated to a named skill.
- [ ] File is under roughly 100 lines.
- [ ] No content duplicated from the common counterpart or a sibling file.
- [ ] Overridden common rules carry the language-note marker.
- [ ] Code examples show the wrong and the right form, with language tags.
- [ ] Paths are wired into an install module if the rule should ship.
- [ ] `node scripts/ci/validate-rules.js` passes.
- [ ] No emoji, no first person, no named individuals, no invented URLs.

## References

- [`rules/README.md`](../rules/README.md) — structure, installation, precedence
- [RULES.md](../RULES.md) — the repo-wide must-always and must-never list
- [CONCEPTS.md](./CONCEPTS.md) — rule versus skill versus hook
- [capability-surface-selection.md](./capability-surface-selection.md) — the routing guide for choosing a surface
- [`skills/context-budget/`](../skills/context-budget/) — measuring what the layer costs
- [`skills/rules-distill/`](../skills/rules-distill/) — condensing an existing rule set
- [token-optimization.md](./token-optimization.md) — session-level context economics
