# Rules

This page explains the rule layer: what a rule is, which rules load on every turn versus which
you select, what lives in `rules/`, and what each loaded rule costs you in context. Read it
before adding a rule file or before wondering why a session is behaving a certain way.

Prerequisites: familiarity with skills and agents — see [docs/CONCEPTS.md](docs/CONCEPTS.md).
The deeper mechanics of injection and precedence are in
[docs/RULES-GUIDE.md](docs/RULES-GUIDE.md).

## What a rule is

A rule is a short Markdown file of standing constraints. Rules are injected into the session
prompt and stay there. They are not procedures and not knowledge bases — those are skills.

The distinction matters because the cost model differs:

| Layer | Loaded | Shape | Cost |
| --- | --- | --- | --- |
| Rule | Always, once injected | Imperative constraints | Paid on every turn |
| Skill | On demand | Procedure and examples | Paid once when loaded |
| Agent | On delegation | Isolated worker | Paid as a summary |

A rule earns its place only if violating it would be a defect. "Prefer descriptive variable
names" is a preference and belongs in a skill. "Never log a bearer token" is a rule.

## Always-loaded versus selected

Two tiers.

**Always loaded.** `rules/common/` applies to every project regardless of stack — ten files
covering agent usage, code review, coding style, development workflow, git workflow, hooks,
patterns, performance, security, and testing. They encode the operating principles from
[SOUL.md](SOUL.md) as enforceable statements.

**Selected.** A stack directory loads only when that stack is in play. A Python service loads
`rules/python/` and `rules/common/`; carrying Swift rules on every turn is waste.

Selection happens two ways:

- **At install.** The profiles in `manifests/install-profiles.json` (`minimal`, `core`,
  `developer`, `security`, `research`, `opencode`, `full`) decide which rule sets are written
  into the target harness. Most users want `developer`.
- **At session time.** A harness that supports conditional injection loads a stack's rules
  when a matching file is opened or edited.

If your harness supports neither, install `minimal` or `core` and add stack directories by
hand. Installing `full` into a small context window is the most common self-inflicted context
problem.

## Directory map

`rules/` holds 121 rule files across 22 stack directories, plus `rules/README.md` as the index.

Most stack directories carry the same five topics, which makes the layout predictable:

| File | Covers |
| --- | --- |
| `coding-style.md` | Naming, formatting, structure, idioms the linter cannot express |
| `patterns.md` | Architectural conventions and the shapes to reach for |
| `security.md` | Stack-specific injection, deserialization, secret, and boundary risks |
| `testing.md` | Framework, coverage expectations, what must be tested |
| `hooks.md` | Which lifecycle hooks apply to this stack |

The full map:

| Directory | Files | Contents |
| --- | --- | --- |
| `rules/common/` | 10 | `agents`, `code-review`, `coding-style`, `development-workflow`, `git-workflow`, `hooks`, `patterns`, `performance`, `security`, `testing` |
| `rules/typescript/` | 5 | The standard five |
| `rules/react/` | 5 | The standard five |
| `rules/react-native/` | 8 | The standard five plus `accessibility`, `performance`, `production-readiness` |
| `rules/vue/` | 5 | The standard five |
| `rules/nuxt/` | 5 | The standard five |
| `rules/web/` | 7 | The standard five plus `design-quality`, `performance` |
| `rules/python/` | 6 | The standard five plus `fastapi` |
| `rules/golang/` | 5 | The standard five |
| `rules/rust/` | 5 | The standard five |
| `rules/java/` | 5 | The standard five |
| `rules/kotlin/` | 5 | The standard five |
| `rules/swift/` | 5 | The standard five |
| `rules/dart/` | 5 | The standard five |
| `rules/cpp/` | 5 | The standard five |
| `rules/csharp/` | 5 | The standard five |
| `rules/fsharp/` | 5 | The standard five |
| `rules/php/` | 5 | The standard five |
| `rules/ruby/` | 5 | The standard five |
| `rules/perl/` | 5 | The standard five |
| `rules/angular/` | 5 | The standard five |
| `rules/arkts/` | 5 | The standard five |

## Choosing a rule set for a stack

Pick the smallest set that covers what you actually write. A worked selection for common
project shapes:

| Project | Load |
| --- | --- |
| Next.js application | `common`, `typescript`, `react`, `web` |
| Nuxt application | `common`, `typescript`, `vue`, `nuxt`, `web` |
| Expo or bare React Native app | `common`, `typescript`, `react`, `react-native` |
| FastAPI service | `common`, `python` (includes `fastapi.md`) |
| Django service | `common`, `python` |
| Go service | `common`, `golang` |
| Rust service or CLI | `common`, `rust` |
| Spring Boot or Quarkus service | `common`, `java` |
| Android or Kotlin Multiplatform | `common`, `kotlin` |
| iOS or macOS app | `common`, `swift` |
| Flutter app | `common`, `dart` |
| HarmonyOS app | `common`, `arkts` |
| Polyglot monorepo | `common` plus one set per language actually edited |

Two mistakes to avoid: loading a framework set without its language set (`rules/react/` assumes
`rules/typescript/` is present and does not restate type-safety constraints), and loading every
set in a monorepo instead of only the packages you are touching this session.

## The context cost of rules

Rules are the only layer you pay for on every single turn. Treat the budget as fixed.

Rough shape of the cost:

| Selection | Files | Character of the cost |
| --- | --- | --- |
| `common` only | 10 | Baseline; assume it is always present |
| `common` plus one stack | 15–18 | The normal working configuration |
| `common` plus three stacks | 25–30 | Justifiable for a genuine polyglot session |
| Everything | 122 | Not a working configuration |

Three consequences follow:

1. **Length is a feature of the rule, not an accident.** A rule file past a screen is either
   doing a skill's job or has accumulated cases that belong in one line.
2. **Redundancy is expensive twice.** A constraint repeated in `common/security.md` and
   `python/security.md` costs tokens in both and diverges when one is edited.
3. **Removal is a legitimate optimization.** A rule that has never changed a decision should
   be deleted. An unenforced rule trains the model to skim.

Measure before tuning. [docs/CONTEXT-ENGINEERING.md](docs/CONTEXT-ENGINEERING.md) covers how to
see what your rule selection actually costs.

## Writing a rule

A rule is one imperative plus the reason it exists. The reason is what lets a model generalize
correctly to a case the rule did not anticipate.

```markdown
## Error handling

- Return errors; do not log and swallow them. A swallowed error produces a symptom far from
  its cause and defeats every downstream reviewer.
- Wrap errors with context at each boundary crossing, not at every call site.
```

Rules to follow when writing rules:

- **Imperative mood.** "Validate input at the boundary", not "input should be validated".
- **Testable and reasoned.** A reviewer must be able to point at a line and say whether it
  complies, and each constraint carries exactly one clause of rationale.
- **Non-overlapping.** Search `rules/` before adding; extend the existing file instead.
- **Stack-appropriate.** Anything true for all languages belongs in `rules/common/`, and no
  example runs longer than three lines — long examples are skill material.

Do not put procedures in rules. "Run the tests, then review, then commit" is a workflow, and
belongs in a skill or a command.

## Adding a rule

1. Decide the scope. Universal goes in `rules/common/<topic>.md`; stack-specific goes in
   `rules/<stack>/<topic>.md`.
2. Reuse an existing filename where one fits; new topics fragment the layout.
3. For a new stack directory, create at minimum `coding-style.md`, `patterns.md`,
   `security.md`, `testing.md`, and `hooks.md` so the shape stays predictable.
4. Register the stack in `manifests/install-profiles.json` if it should be installable.
5. Run `npm test`. `scripts/ci/validate-rules.js` checks structure, and the catalog check will
   fail until you run `npm run catalog:sync`.
6. Update the directory map on this page with the new count.

Before you finish, do the subtraction. The rule will load on every turn of every session on
that stack: name the class of defect it prevents. If you cannot, it is a skill.
