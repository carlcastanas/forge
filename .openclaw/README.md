# FORGE for OpenClaw

This directory contains the FORGE (FORGE) configuration for the OpenClaw harness.

## What is installed

- `rules/forge/` — shared coding rules and guidelines
- `skills/forge/` — reusable skills
- `commands/` — slash commands
- `AGENTS.md` — agent instructions

## Manual install

```bash
bash ./install.sh --target openclaw --profile minimal
```

## Notes

- OpenClaw config files (`openclaw.json`, `config.toml`, `.env`, etc.) are **not** touched by FORGE install.
- Use `npx forge-universal doctor --target openclaw` to check install health.
