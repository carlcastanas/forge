# FORGE documentation website

The static site that renders this repository as documentation. It is a self-contained Next.js
app: it reads markdown from the parent directory at build time and copies none of it.

Prerequisites: Node 20.19 or newer, and npm. The site has no database, no API, and makes no
network request at runtime beyond the Geist webfont.

## Run it

```bash
cd site
npm install
npm run dev
```

The development server listens on `http://localhost:3000`. Edits to markdown anywhere in the
parent repository are picked up on the next request, because every page reads the filesystem
at render time.

## Build it

```bash
npm run build
```

`next.config.ts` sets `output: 'export'`, so the build writes a fully static site to `out/`.
Serve that directory with any static file server. There is no Node process to run in
production.

Other scripts:

| Command | Does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type check, lint, prerender every page, export to `out/` |
| `npm run start` | Serve a non-exported build (rarely needed here) |
| `npm run lint` | ESLint via `next lint` |

Both `dev` and `build` run `scripts/sync-assets.mjs` first. That script mirrors
`../assets/images` into `public/assets/images` so images referenced from repository markdown
resolve. It is the only thing the site writes outside of `.next` and `out`, it writes only
inside `site/`, and `public/assets/` is gitignored.

## Where the content comes from

Every page is generated from files in the parent repository. Nothing is duplicated into
`site/`.

| Route | Source |
| --- | --- |
| `/` | Hand-written. Catalog numbers are counted from the directories below. |
| `/docs` | Index of everything below, plus `../docs/README.md` as the intro |
| `/docs/project/<name>` | Root-level markdown: `../README.md`, `../AGENTS.md`, `../CLAUDE.md`, `../SOUL.md`, `../RULES.md`, `../COMMANDS-QUICK-REF.md`, `../WORKING-CONTEXT.md`, `../CONTRIBUTING.md`, `../SECURITY.md`, `../CODE_OF_CONDUCT.md`, `../TROUBLESHOOTING.md`, `../CHANGELOG.md` |
| `/docs/<path>` | `../docs/**/*.md`, recursively |
| `/guides` and `/guides/<slug>` | `../guides/*.md` |
| `/skills` and `/skills/<name>` | `../skills/*/SKILL.md` |
| `/agents` | `../agents/*.md` frontmatter |
| `/commands` | `../commands/*.md` frontmatter |

Translated documentation trees are excluded from the English site: `pt-BR`, `zh-CN`, `zh-TW`,
`ja-JP`, `ko-KR`, `tr`, `ru`, `vi-VN`, `th`, `de-DE`, `es`, `uk-UA`, `ur`.

Catalog counts on the landing page, in the footer, and on each catalog page are computed by
counting real files at build time. No number is written down anywhere in this app. Add a skill
and the count moves on the next build.

Links written for the repository are rewritten to site routes. A link to `../docs/CONCEPTS.md`
becomes `/docs/concepts`; a link to `skills/agent-eval/SKILL.md` becomes `/skills/agent-eval`.
Anything the site does not serve falls back to a link into the repository.

## Resilience

The content pipeline assumes files are being written while it runs. Every filesystem call is
guarded: a missing directory yields an empty list, an unreadable file yields an empty page with
a visible "no content yet" state, and malformed YAML frontmatter falls back to the raw body.
The build does not fail because a source file is absent or half-written.

If `../docs/getting-started.md` does not exist, the site supplies its own page at
`/docs/getting-started` so the landing page's primary call to action never lands on a 404. A
real file at that path takes precedence as soon as one appears.

## Layout of this app

```text
site/
  app/            routes; globals.css holds the whole design system
  components/     chrome, markdown renderer, catalog browsers, inline SVG icons
  lib/            content pipeline, shiki highlighter, project constants
  scripts/        sync-assets.mjs
  public/         mirrored images (generated, gitignored)
```

## Conventions this app follows

- Tailwind CSS v4 with a CSS-first `@theme` block. There is no `tailwind.config.js`.
- Every heading uses `clamp()`. There are no fixed pixel heading sizes.
- Every icon is hand-written inline SVG on a 24x24 grid, stroked at 1.5 with `currentColor`.
  There is no icon package, and there are no emoji anywhere in this app.
- Both themes are defined twice: once under `prefers-color-scheme` and once under
  `[data-theme]`, so the toggle overrides the system preference in both directions.
- No horizontal page scroll at any width from 320px to 2560px. Wide tables and code blocks
  scroll inside their own container.
- No analytics, no tracking, no cookies, and no external request other than the Geist font.
