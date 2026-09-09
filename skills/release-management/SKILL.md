---
name: release-management
description: Decide version numbers, keep a changelog consumers can act on, choose between trunk-based development and release branches, and ship through a staged rollout with a tested rollback. Use when cutting a release, deciding whether a change is a major, writing release notes, setting up tagging and versioning, or establishing a release checklist and freeze policy.
metadata:
  origin: FORGE
---

# Release Management

A release is a promise to consumers about what changed and what will keep working. The mechanics — a tag, a build, a deploy — are the easy part; the difficulty is deciding what the version number claims, describing the change in terms the consumer can act on, and staying able to undo it. Done looks like: an immutable artifact, a version that correctly signals compatibility, a changelog entry that tells a consumer whether they must do anything, and a rollback path that has actually been exercised.

## When to activate

- Cutting a release of a library, service, CLI, or mobile app.
- Deciding whether a change is patch, minor, or major.
- Setting up tagging, changelog generation, or automated release tooling.
- Choosing between trunk-based development and long-lived release branches.
- Writing release notes, or defining what goes in them versus the changelog.
- Establishing a code-freeze policy, or arguing about one.
- User says "cut a release", "bump the version", "is this a breaking change", "write the changelog", "release checklist".

## When NOT to use

- The question is how the deploy mechanism works (blue/green, canary infrastructure, rollout controllers). See `../deployment-patterns/SKILL.md`.
- The question is how to hide unfinished work behind a toggle or ramp traffic to it. See `../feature-flags-rollout/SKILL.md`.
- A release is currently broken in production. Stop and go to `../incident-response/SKILL.md`; do the release retrospective afterwards.
- The schema change is the risky part. Sequence it with `../database-migrations/SKILL.md` before choosing a version number.
- Branch naming, commit hygiene, and merge mechanics belong to `../git-workflow/SKILL.md`.

## Prerequisites

- A CI pipeline that produces a single, immutable, reproducible artifact per commit (see `../ci-pipeline-design/SKILL.md`).
- Write access to tags on the default branch, and a signing key if tags are signed.
- A registry or artifact store that retains at least the previous release.
- Agreement on who may approve a release and who may halt one.

## Process

### 1. Classify the change against Semantic Versioning

The version communicates compatibility, not effort. Under Semantic Versioning 2.0.0, `MAJOR.MINOR.PATCH` increments mean: major for incompatible API changes, minor for backwards-compatible additions, patch for backwards-compatible fixes.

The rule that resolves most arguments: **any observable behavior a consumer could reasonably depend on is part of the contract.** That includes more than function signatures.

| Change | Version bump | Reason |
| --- | --- | --- |
| Remove or rename a public function, field, or flag | major | Consumers break at compile or call time |
| Change an error type, code, or message consumers match on | major | Error handling is an interface |
| Tighten input validation that previously accepted a value | major | Working calls start failing |
| Change a default value or default behavior | major | Silent behavior change is worse than a loud one |
| Change output ordering that was previously stable | major | Consumers depend on observed behavior, not documented behavior |
| Add an optional parameter or a new endpoint | minor | Existing calls keep working |
| Add a new field to a response | minor, unless consumers use strict schema validation | Verify how consumers parse first |
| Performance improvement with identical semantics | patch | No contract change |
| Fix a bug consumers have coded around | judgment call | If the buggy behavior is widely relied on, treat as major |

Two conventions worth stating explicitly. **0.x**: the spec grants no compatibility guarantee below 1.0.0, so state your own — commonly, bump `y` for breaking changes and `z` for everything else — in the README rather than leaving consumers to guess. **Pre-releases**: `2.0.0-rc.1` sorts below `2.0.0` and is excluded from default range resolution; use one when a change needs real-world exposure before the compatibility promise is made.

### 2. Handle unavoidable breaking changes as a sequence, not an event

Never remove something in the same release that first warns about it. Spread the break over two majors: **deprecate** in `N.x` (old path works, docs name the replacement, changelog states the removal target), **warn** in `N+1.0.0` (old path works but emits a runtime deprecation warning carrying the migration instruction, and the compatibility layer is tested), **remove** in `N+2.0.0` (old path gone, changelog links the migration note).

```text
feat(auth): return structured error objects from verifyToken

verifyToken now rejects with an AuthError carrying `code` and `retryable`
instead of a bare string. The string form is still returned on
AuthError.message.

BREAKING CHANGE: callers that compared the rejection value with === against
a string literal must switch to comparing err.code. See MIGRATION.md.
```

The `BREAKING CHANGE:` footer is the Conventional Commits marker that automated tooling reads to force a major bump. Put the migration instruction in the footer, not only in a ticket.

### 3. Write the changelog for the consumer

Keep a Changelog gives the structure: a reverse-chronological file with `Unreleased` at the top and `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security` groups per version. The discipline that matters is the audience — an entry answers "does this affect me, and what must I do", not "what did the committer touch".

```markdown
## [2.3.0] - 2026-03-14

### Added
- `retryPolicy` option on `createClient`, defaulting to three attempts with
  exponential backoff. Pass `retryPolicy: 'none'` to keep single-attempt behavior.

### Changed
- Request timeouts now count total elapsed time rather than per-attempt time.
  Callers relying on the old semantics should raise `timeoutMs` accordingly.

### Fixed
- Connection pool no longer leaks sockets when the server closes mid-handshake.
```

Generating the changelog from commit messages is only safe when commit discipline is enforced in CI. Otherwise the file fills with `fix: pr feedback` and stops being read.

```bash
# Generate from Conventional Commits history
git cliff --tag v2.3.0 --output CHANGELOG.md

# Or, per-PR changeset files reviewed alongside the code
npx changeset            # authors write the entry with the change
npx changeset version    # applies bumps and rewrites CHANGELOG.md
```

Release notes are not the changelog. The changelog is exhaustive and mechanical; release notes are curated prose for humans, leading with the two or three things a reader cares about and linking the changelog for the rest.

### 4. Choose trunk or release branches deliberately

| Dimension | Trunk-based | Release branches |
| --- | --- | --- |
| Branch model | Short-lived branches merged to `main`; releases are tags on `main` | `release/2.3` cut from `main`, maintained independently |
| Correct when | One live version, continuous deploy, single deployment target | Multiple versions live at once: on-prem, SDKs, mobile with slow adoption, LTS commitments |
| Cost | Requires feature flags to hide incomplete work | Cherry-pick overhead grows with the number of live branches |
| Divergence risk | Low | High; fixes land on one branch and not another |
| Hotfix path | Fix on `main`, tag, deploy | Fix on the release branch, tag, then back-merge to `main` |

Two rules keep release branches survivable. Cherry-pick only fixes, never features — a feature that must ship on an old branch means the branch has become a fork. And back-merge every hotfix to trunk before the incident closes, or the fix regresses the moment the next minor ships.

```bash
git switch -c release/2.3 v2.3.0
git cherry-pick -x 9f1c2ab          # -x records the source commit
git tag -s v2.3.1 -m "Fix socket leak on mid-handshake close"
git push origin release/2.3 --follow-tags
git switch main && git merge --no-ff release/2.3
```

### 5. Version every artifact from one source of truth

The tag, the package version, the container tag, and the build embedded in the binary must agree. Drift between them makes an incident unanswerable, because nobody can say what is running.

```bash
npm version minor -m "chore(release): %s"      # bumps package.json and creates a tag
git tag -s v2.3.0 -m "Release 2.3.0"           # signed, annotated
git push origin main --follow-tags
```

```dockerfile
ARG VERSION=dev
ARG GIT_SHA=unknown
ENV APP_VERSION=$VERSION APP_GIT_SHA=$GIT_SHA
```

Serve those values from a `/version` endpoint as `{"version","gitSha","builtAt"}` so an incident responder can identify running code in one request. Promote by retagging the exact digest that was tested; never rebuild for a new environment, since a rebuild is a different artifact regardless of the inputs.

```bash
docker buildx imagetools create \
  --tag registry.example.internal/api:2.3.0 \
  --tag registry.example.internal/api:stable \
  registry.example.internal/api@sha256:8b1c...e94
```

```yaml
# .github/workflows/release.yml
name: release
on:
  push:
    tags: ['v*.*.*']
permissions:
  contents: write
  id-token: write
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci && npm run build && npm test
      - run: npm publish --provenance --access public
      - run: gh release create "${GITHUB_REF_NAME}" --notes-file RELEASE_NOTES.md
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 6. Roll out in stages with a bake time

A release is not done when it is deployed; it is done when it has survived exposure. Define the ladder — internal, then canary on a small traffic share, then partial, then full — before you start, so nobody negotiates it mid-rollout.

Each rung has an explicit bake time and an explicit set of signals that must hold: error rate, latency at the tail, and the business metric the change was meant to move. Bake long enough to cover at least one full traffic cycle for the rung. A rung that nobody watched did not bake.

For anything user-visible, separate deploy from release: ship the code dark and ramp it with a flag (`../feature-flags-rollout/SKILL.md`). That makes the undo a config change rather than a redeploy.

### 7. Verify rollback readiness before you need it

Rollback readiness is a precondition of the release, checked before the cut, not a plan improvised during an incident:

- The N-1 artifact still exists in the registry and can be pulled right now. Confirm it; retention policies delete things quietly.
- The rollback procedure has been executed, in a lower environment, against this release's artifact.
- Every migration in this release is backwards compatible with the previous release's code, so rolling back application code does not require rolling back the schema. If it is not, the release can only be rolled forward — say so in the release notes.
- New behavior is behind a flag that defaults off, so the fast undo does not require a deploy.
- The rollback decision owner is named, and the threshold that triggers the decision is written down.

### 8. Run the checklists

**Pre-release**: version bump matches the change classification; changelog updated with migration notes; breaking changes documented; migrations reviewed for backwards compatibility; the artifact under test is the artifact that will ship.

**Cut**: tag is signed and annotated; tag points at the tested commit; artifact digest recorded; release notes written.

**Deploy**: rollout ladder started at the lowest rung; dashboards open; rollback owner present; bake timer running.

**Post-release**: version endpoint reports the expected version and sha; error and latency signals compared against the pre-release baseline; deprecations announced to consumers; changelog published; `Unreleased` section reset.

### 9. Set a freeze policy tied to error budget, not to the calendar

Blanket calendar freezes push risk into a single large release after the freeze ends, which is the opposite of the intent. Prefer a policy keyed to reliability signals: while the error budget is exhausted, only fixes that restore reliability ship. When the budget is healthy, normal releases continue. Keep a narrow, explicit exception path for security fixes, and require the same rollback readiness for them.

## Checklist

- [ ] The version bump was chosen against the observable-contract rule, not by effort.
- [ ] Breaking changes carry a `BREAKING CHANGE:` footer and a migration note.
- [ ] Nothing was removed in the same major that first deprecated it.
- [ ] The changelog entry says what a consumer must do, not what the committer changed.
- [ ] Tag, package version, image tag, and the runtime `/version` response all agree.
- [ ] The tag is annotated and points at the exact tested commit.
- [ ] The artifact being promoted is the artifact that was tested, by digest.
- [ ] The N-1 artifact is confirmed pullable.
- [ ] Migrations in this release are backwards compatible with the previous release's code.
- [ ] The rollback procedure has been executed at least once, not just written.
- [ ] The rollout ladder, bake times, and rollback owner are agreed before the cut.
- [ ] Hotfixes on a release branch are back-merged to trunk before the incident closes.

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Consumers break on a "minor" release | Behavior change treated as non-breaking because the signature did not change | Apply the observable-contract rule; ship a compatibility patch and re-release as a major |
| Nobody reads the changelog | Entries generated from unstructured commit messages | Enforce Conventional Commits in CI, or move to per-PR changesets reviewed with the code |
| Cannot tell what is running in production | Version not embedded in the artifact | Bake version and git sha at build time; expose a `/version` endpoint |
| Rollback fails during an incident | N-1 artifact expired from the registry, or the migration is not backwards compatible | Extend retention for release artifacts; require expand-then-contract migrations |
| Hotfix regresses on the next release | Fix landed only on the release branch | Require back-merge to trunk as part of closing the incident |
| Release branches diverge until they are forks | Features cherry-picked, not just fixes | Restrict cherry-picks to fixes; sunset old branches on a published schedule |
| Big-bang release after a freeze causes an incident | Calendar freeze batched a quarter of change into one deploy | Replace calendar freezes with an error-budget policy |
| Rollout "completed" but the regression appeared later | Bake time shorter than one traffic cycle | Set bake times per rung to cover a full cycle; require a named watcher |
| Two builds of "the same" version behave differently | Rebuilt per environment instead of promoting one artifact | Build once; promote by digest |

## References

- `../feature-flags-rollout/SKILL.md` — separating deploy from release, kill switches, ramp mechanics
- `../ci-pipeline-design/SKILL.md` — producing one immutable artifact and promoting it
- `../database-migrations/SKILL.md` — expand/contract sequencing that keeps rollback possible
- `../incident-response/SKILL.md` — when the release is the incident
- `../git-workflow/SKILL.md` — branch, commit, and merge conventions
- `../deployment-patterns/SKILL.md` — blue/green, canary, and progressive delivery mechanics
- Semantic Versioning 2.0.0 specification
- Keep a Changelog format
- Conventional Commits specification
- Documentation for `changesets`, `semantic-release`, and `git cliff`
