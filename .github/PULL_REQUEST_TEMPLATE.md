# Pull request

## What this changes

<!-- One or two sentences. What is different after this merges? -->

## Why

<!-- The problem being solved, or the issue number. If the approach is not obvious, say what
     else you considered. -->

## Validator output

Paste the tail of `npm test`. A pasted result is checkable; a ticked box is not.

```text
npm test

```

If `npm test` does not pass, say so here and explain what is left.

Lint output for the files you changed (`npx markdownlint <files>`, `npx eslint <files>`). The
repository-wide `npm run lint` has pre-existing findings, so scope it to your diff:

```text

```

## What you verified by hand

<!-- The commands you actually ran and what they printed. For a behavior change, before and
     after. For a hook, the payload you fed it and the exit code. For an install change, the
     `--dry-run` plan. Delete this section only if the change is documentation with no
     executable claim. -->

## Regeneration

Applies if you added, renamed, or deleted anything in `agents/`, `skills/`, or `commands/`.

- Ran `npm run catalog:sync` and committed the result: <!-- yes / not applicable -->
- Ran `npm run command-registry:write` and committed the result: <!-- yes / not applicable -->
- New skills are listed in `manifests/install-modules.json` and in `files` in `package.json`:
  <!-- yes / not applicable -->
- Docs updated in this same change (`AGENTS.md`, `COMMANDS-QUICK-REF.md`, `docs/README.md`, or
  the relevant index): <!-- yes / not applicable -->

## Anything a reviewer should push back on

<!-- Widened tool allowlist, a new blocking hook, a model tier above sonnet, a new dependency,
     a behavior change for existing installs, an adapter file edited directly. Name it here
     rather than letting review find it. Write "nothing" if there is nothing. -->

---

Contribution contract: [CONTRIBUTING.md](../CONTRIBUTING.md).
Commits follow Conventional Commits with a lower-case subject, per `commitlint.config.js`.
