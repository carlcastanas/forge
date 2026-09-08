---
name: ci-pipeline-design
description: Design a CI pipeline around a feedback-time budget: stage ordering that fails fast, caching and sharding that hold up under change, required versus advisory checks, build-once artifact promotion, and least-privilege CI credentials. Use when CI is slow or untrusted, when adding or reordering pipeline stages, when setting up caching or test sharding, or when deciding which checks may block a merge.
metadata:
  origin: FORGE
---

# CI Pipeline Design

A CI pipeline exists to answer one question quickly: is this change safe to merge. Everything else — coverage reports, security scans, preview environments — is secondary to answering that question fast enough that engineers wait for the answer instead of context-switching away from it. Done looks like: a stated feedback-time budget the pipeline is designed against, a merge gate containing only deterministic checks, one artifact built once and promoted by digest, and credentials that cannot be exfiltrated by a fork PR.

## When to activate

- PR feedback is slow enough that engineers stop waiting for it.
- Adding, removing, or reordering pipeline stages.
- Setting up dependency caching, Docker layer caching, or a remote build cache.
- Deciding which checks are required for merge and which are informational.
- Introducing a merge queue, test sharding, or affected-only builds in a monorepo.
- Reviewing CI credentials, third-party action usage, or fork-PR exposure.
- User says "CI is too slow", "the pipeline is flaky", "set up caching", "should this check be required".

## When NOT to use

- Individual tests are non-deterministic. Fix the tests first via `../flaky-test-triage/SKILL.md`; pipeline changes will not make a flaky suite trustworthy.
- The question is how to version and ship the artifact once CI produces it. See `../release-management/SKILL.md`.
- The application itself is slow. That is `../performance-profiling/SKILL.md`, not pipeline work.
- Test strategy and coverage design belong to `../tdd-workflow/SKILL.md`.
- A deep review of secret handling and supply-chain risk belongs to `../security-review/SKILL.md`; this skill covers only the CI-specific surface.

## Prerequisites

- A reproducible build that runs from a clean checkout with a committed lockfile.
- Historical per-job timing data, or the willingness to collect it before optimizing.
- Permission to change branch protection and required status checks.
- Agreement on the feedback-time budget before any restructuring starts.

## Process

### 1. Set the time budget first

Choose a budget as policy, then design backwards from it. A common choice is "PR feedback in under ten minutes"; the number matters less than that it is written down and that jobs exceeding it get moved off the critical path rather than tolerated.

Two numbers drive every later decision, and they are distinct:

- **Queue time** — how long a job waits for a runner. Fixed by capacity, concurrency limits, and runner size, not by making tests faster.
- **Run time** — how long the job executes once started. Fixed by caching, parallelism, and doing less work.

Measure both at p50 and p95 before changing anything. Optimizing run time when the p95 problem is queue time wastes the effort entirely.

### 2. Order stages by cost and by probability of failure

Run the cheapest, highest-signal, most-likely-to-fail checks first, and let the pipeline fail fast. A typecheck that fails in thirty seconds is worth more than an e2e suite that finds the same error twenty minutes later.

| Stage | Typical placement | Gates merge |
| --- | --- | --- |
| Format, lint, typecheck | Every PR, first | Yes |
| Unit tests | Every PR, parallel with lint | Yes |
| Build / compile | Every PR, after unit | Yes |
| Integration tests | Every PR | Yes, if deterministic |
| End-to-end tests | Every PR for critical paths; full suite on main | Critical subset only |
| Preview environment | Every PR | No |
| Dependency and secret scanning | Every PR, non-blocking except on new critical findings | Partly |
| Full security scan, license audit | Nightly on main | No |
| Long-running soak, cross-version matrix | Nightly or weekly | No |

The rule underneath the table: the merge gate contains what must be true to merge safely. Everything else reports and does not block.

### 3. Separate required from advisory checks

Only deterministic checks may block a merge. A required check that fails randomly teaches engineers to press re-run until green, which trains away the reflex of reading failures — the exact behavior CI exists to create.

- Required: deterministic, fast, and directly about correctness of this change.
- Advisory: flaky, slow, informational, or subject to external services. These report status and feed a dashboard.
- A check may be promoted to required only after it has run advisory for long enough to demonstrate stability.
- A required check that begins flaking is demoted the same day, with a ticket, not left to erode trust.

Quarantined tests run in an advisory job so they keep producing history without gating merges. See `../flaky-test-triage/SKILL.md` for the quarantine policy this depends on.

### 4. Cache the right layer, and key it correctly

Cache anything that is deterministically derived from committed inputs. Do not cache anything whose staleness can produce a passing build that should have failed.

Key caches on a hash of the lockfile, and use restore-keys only as a partial-hit fallback:

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: npm-${{ runner.os }}-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      npm-${{ runner.os }}-
```

Cache the package manager's store (`~/.npm`, `~/.cache/pip`, `~/.m2`, the pnpm store), not `node_modules`. The store is content-addressed and safe to reuse across lockfile changes; `node_modules` is a resolved tree whose correctness depends on the exact lockfile, and a partial restore-key hit can leave stale or mismatched packages in place. If the tooling requires `node_modules` caching, key it on the exact lockfile hash with no restore-keys fallback.

For container builds, use BuildKit cache mounts so package downloads survive layer invalidation:

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
```

Remote build caches — Turborepo, Nx, Gradle build cache, Bazel — extend this across machines by caching task outputs keyed on input hashes. They pay off when the task graph is large and inputs are precisely declared. When inputs are under-declared, they produce stale outputs that look like passing builds, which is worse than no cache.

**Cache poisoning is a real threat on untrusted PRs.** A pull request from a fork can populate a cache that later jobs on the default branch restore. Scope caches so that fork PRs cannot write to keys the trusted branch reads, and never restore a cache into a job that holds deployment credentials.

### 5. Parallelize with data, not alphabetically

Split test suites by recorded timing so shards finish together. Splitting by filename produces one shard that takes twice as long as the rest, and the pipeline is only as fast as its slowest shard.

```yaml
test:
  runs-on: ubuntu-latest
  strategy:
    fail-fast: false
    matrix:
      shard: [1, 2, 3, 4]
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: '22', cache: 'npm' }
    - run: npm ci
    - run: npx jest --shard=${{ matrix.shard }}/4 --ci --reporters=default --reporters=jest-junit
      env:
        TZ: UTC
```

Cancel superseded runs so pushes to an active branch do not queue behind their own predecessors:

```yaml
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Do not set `cancel-in-progress: true` on the default branch or on deploy workflows; cancelling a half-finished deploy is worse than letting it complete.

A merge queue tests each change against the state it will actually merge into, which removes the class of failures where two independently green PRs break when combined. It costs additional CI capacity and is worth it once the merge rate makes semantic conflicts routine.

### 6. Use change detection carefully in monorepos

Affected-only builds cut run time substantially, and they are the most common source of a green build that should have been red. The hazard: a change to a shared configuration file, a lockfile, a base container image, or a generated type can affect packages the path filter did not select.

```yaml
changes:
  runs-on: ubuntu-latest
  outputs:
    api: ${{ steps.filter.outputs.api }}
    web: ${{ steps.filter.outputs.web }}
  steps:
    - uses: actions/checkout@v4
    - uses: dorny/paths-filter@v3
      id: filter
      with:
        filters: |
          api:
            - 'services/api/**'
            - 'packages/shared/**'
            - 'package-lock.json'
            - '.github/workflows/ci.yml'
          web:
            - 'apps/web/**'
            - 'packages/shared/**'
            - 'package-lock.json'
```

Rules that keep it correct: include shared packages and lockfiles in every filter; fall back to a full build when a root-level file changes; run the full suite on the default branch regardless of filters; and prefer a tool that derives the affected set from a real dependency graph over hand-maintained glob lists.

### 7. Build once, promote by digest

Build the artifact a single time, then move that exact artifact through environments. Rebuilding per environment produces a different artifact than the one that was tested, no matter how identical the inputs appear.

- Build produces an immutable artifact identified by content digest.
- Environment differences come from configuration injected at deploy time, never from build-time branching.
- Promotion is a retag or a pointer update against the same digest.
- The digest is recorded with the release, so an incident responder can map running code to a commit.

### 8. Lock down CI credentials

CI holds the credentials that make the supply chain attackable. Four controls carry most of the weight:

```yaml
permissions:
  contents: read          # default to the minimum at the workflow level

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    permissions:
      contents: read
      id-token: write     # OIDC only, granted to this job alone
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@010d0da01d0b5a38af31e9c3470dbfdabdecca3a
        with:
          role-to-assume: arn:aws:iam::123456789012:role/deploy-api
          aws-region: us-east-1
```

- **Least-privilege `permissions:`** set at the workflow level and widened only per job.
- **OIDC federation instead of long-lived keys.** A short-lived token scoped to one role cannot be reused from a leaked log.
- **Pin third-party actions to a full commit sha**, not a tag. Tags are mutable; a compromised upstream repository can move `v3` to malicious code.
- **Treat `pull_request_target` as dangerous.** It runs with repository secrets and write permissions in the context of the base repository, and checking out the PR head under that trigger executes untrusted code with those secrets. If it is unavoidable, never check out or run PR code in that job.

Secrets should not be available to jobs that execute untrusted code, which includes any job running a fork PR's tests, build scripts, or dependency install hooks.

### 9. Measure the pipeline as a product

Track, per stage: p50 and p95 duration, queue time separately from run time, failure rate, and how often a failure was later found to be spurious. Track cost per run if runners are billed. Review the numbers on a schedule.

The trend that matters most is the fraction of default-branch runs that are green on first attempt. When that falls, the pipeline has stopped being a signal, and no amount of speed work fixes it.

## Checklist

- [ ] A feedback-time budget is written down and the pipeline is designed against it.
- [ ] Queue time and run time are measured separately, at p50 and p95.
- [ ] Cheapest and most-likely-to-fail checks run first.
- [ ] Every required check is deterministic; flaky checks are advisory with a ticket.
- [ ] Caches are keyed on lockfile hashes; restore-keys are used only where a partial hit is safe.
- [ ] The package-manager store is cached rather than `node_modules`, or the exact-key rule is applied.
- [ ] Fork PRs cannot write caches that trusted branches restore.
- [ ] Test shards are split by recorded timing, not alphabetically.
- [ ] `concurrency` cancels superseded PR runs but not deploys.
- [ ] Path filters include shared packages, lockfiles, and CI config; the default branch runs everything.
- [ ] The artifact is built once and promoted by digest.
- [ ] Workflow-level `permissions` default to read; `id-token: write` is scoped to the deploy job.
- [ ] Third-party actions are pinned to commit shas.
- [ ] No job that runs untrusted code has access to secrets.

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Pipeline is slow despite fast tests | Queue time, not run time | Raise concurrency or runner capacity; measure the two separately before optimizing |
| Engineers re-run jobs until green | Flaky checks are required | Demote to advisory, quarantine the tests, restore the gate only when stable |
| Cache hits but the build still installs everything | Cache key changes on every run | Key on `hashFiles` of the lockfile, not on a timestamp or run id |
| Stale dependencies produce a passing build | `node_modules` restored from a partial restore-key hit | Cache the package-manager store, or key `node_modules` exactly with no fallback |
| One shard takes far longer than the others | Split by filename instead of timing | Shard using recorded per-test durations |
| Two green PRs break main when merged | No merge queue; each was tested against a stale base | Enable a merge queue, or require branch-up-to-date before merge |
| Affected-only build misses a regression | Path filters omit shared packages or lockfiles | Add shared paths to every filter; full build on the default branch |
| Production behaves differently from staging | Artifact rebuilt per environment | Build once; promote the same digest; inject config at deploy time |
| Secret appears in a fork PR's job | `pull_request_target` checking out PR code | Use `pull_request`; never run untrusted code in a job holding secrets |
| A third-party action changed behavior overnight | Action referenced by mutable tag | Pin to a full commit sha and update deliberately |
| Deploy left half-applied | `cancel-in-progress` enabled on the deploy workflow | Restrict cancellation to PR workflows |

## References

- `../flaky-test-triage/SKILL.md` — quarantine policy and the flaky-gate rule this pipeline depends on
- `../release-management/SKILL.md` — tagging, versioning, and promoting the artifact CI produces
- `../tdd-workflow/SKILL.md` — the test strategy the pipeline stages execute
- `../security-review/SKILL.md` — broader secret handling and supply-chain review
- `../performance-profiling/SKILL.md` — when the application, not the pipeline, is the bottleneck
- GitHub Actions documentation: workflow syntax, `concurrency`, `permissions`, OIDC hardening, caching
- Docker BuildKit documentation: cache mounts and multi-stage builds
- Turborepo, Nx, Gradle build cache, and Bazel documentation for remote caching and affected-target selection
