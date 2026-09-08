# Changelog

All notable changes to this project are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

### Changed

### Deprecated

### Removed

### Fixed

### Security

## 1.0.0 - 2026-09-08

Initial release of FORGE as a harness-native agent engineering system.

### Added

- **Agent catalog** — 68 subagent definitions in `agents/`, each with a validated frontmatter
  contract of `name`, `description`, `tools`, and `model`. Coverage spans planning and
  architecture, general and language-specific review, build resolution across eleven
  toolchains, testing, security and compliance, data and machine learning, networking,
  autonomous loops, harness evaluation, docs, and product. Tiers: 4 `opus`, 58 `sonnet`, 6
  `haiku`.
- **Skill catalog** — 287 skills under `skills/<name>/SKILL.md`, covering language patterns and
  testing, framework conventions, orchestration pipelines, security review, context and memory,
  research, and domain workflows.
- **Command shims** — 94 slash commands in `commands/`, spanning planning, orchestration,
  review, build resolution, testing, git and epic workflow, session management, learning and
  memory, hooks, install, skill authoring, documentation, and integrations.
- **Rule layer** — 121 rule files across 22 stack directories plus an index, split into an
  always-loaded `rules/common/` set and per-stack sets selected at install or session time.
- **Lifecycle hooks** — matcher-driven registrations in `hooks/hooks.json` with cross-platform
  Node entrypoints in `scripts/hooks/`, covering shell preflight gating, verification-bypass
  blocking, configuration protection, governance capture, compaction prompts, formatting,
  type-checking, and session lifecycle.
- **Memory layer** — instinct capture, evaluation, promotion, and pruning through `/learn`,
  `/learn-eval`, `/evolve`, `/instinct-status`, `/instinct-export`, `/instinct-import`,
  `/promote`, `/prune`, `/projects`.
- **Forge Shield integration** — `/security-scan` drives the deterministic scanner across
  agent, hook, MCP, permission, and secret surfaces, with text, JSON, Markdown, and HTML output
  and a safe auto-fix mode.
- **Harness adapters** — projections of the canonical catalog into Claude Code, Codex,
  OpenCode, Cursor, Gemini, Zed, Qwen, and siblings; checked by `npm run harness:adapters`.
- **Selective install** — profiles, modules, and components in `manifests/`, with seven
  profiles: `minimal`, `core`, `developer`, `security`, `research`, `opencode`, `full`.
- **Validation gate** — `npm test` chains Unicode safety, agent, command, rule, skill, hook,
  and install-manifest validation, personal-path detection, catalog and command-registry
  checks, and the Node suite.
- **Root documentation set** — [SOUL.md](SOUL.md), [CLAUDE.md](CLAUDE.md),
  [AGENTS.md](AGENTS.md), [RULES.md](RULES.md), [COMMANDS-QUICK-REF.md](COMMANDS-QUICK-REF.md),
  [WORKING-CONTEXT.md](WORKING-CONTEXT.md), [CONTRIBUTING.md](CONTRIBUTING.md),
  [SECURITY.md](SECURITY.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md),
  [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
- **Reference documentation** — installation, configuration, CLI reference, concepts, glossary,
  FAQ, anti-patterns, skill and agent authoring, hooks, rules, memory, MCP, orchestration
  patterns, context engineering, evaluation, cost and model routing, threat model, harness
  matrix, team adoption, and recipes under `docs/`.
- **Long-form guides** under `guides/` — getting started, field, complete, security,
  orchestration, context, evaluation, and migration.

### Security

- Agent tool allowlists are explicit and minimal: reviewers hold no write tools, read-only
  agents hold no shell access, and MCP tools are granted individually rather than by server.
- Prompt-defense baseline injected for all work in the repository, treating fetched pages, tool
  output, and third-party file content as untrusted data.
- Unicode safety validation rejects homoglyphs and zero-width payloads across the tree.
- Personal-path validation prevents absolute home-directory paths from entering tracked files.
- Verification-bypass blocking prevents `--no-verify` commits.
- Supply-chain indicator scanning and advisory-source monitoring run in CI.
