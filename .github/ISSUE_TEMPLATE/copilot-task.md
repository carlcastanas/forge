---
name: Copilot task
about: Hand a scoped, verifiable change to the GitHub Copilot coding agent
title: "[Copilot] "
labels: copilot
assignees: copilot
---

## Task

<!-- One change, stated as an outcome. If it needs more than one commit, split it. -->

## Files in scope

<!-- Exact repository paths. The agent should not touch anything outside this list.
     Adapter directories (.claude-plugin/, .cursor/, .codex/, ...) are projections of the
     catalog and must not be edited directly. -->

## Acceptance criteria

- [ ] `npm test` passes and the output is pasted in the pull request
- [ ] `npm run lint` passes
- [ ] <!-- the behavior this change must produce -->

## Constraints

- Follow `CLAUDE.md` and `CONTRIBUTING.md`.
- Run `npm run catalog:sync` and `npm run command-registry:write` if `agents/`, `skills/`, or
  `commands/` changed, and commit the result.
- Conventional Commits with a lower-case subject.
- No new dependencies without saying why in the pull request.

## Context

<!-- Prior art in the repository, the validator that judges this surface, and anything that
     will otherwise be guessed wrong. -->
