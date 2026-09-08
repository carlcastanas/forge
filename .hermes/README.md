# FORGE for Hermes

This directory contains the FORGE (FORGE) configuration for the Hermes harness.

## What is installed

- `rules/forge/` — shared coding rules and guidelines
- `skills/forge/` — reusable skills
- `commands/` — slash commands
- `AGENTS.md` — agent instructions

## Manual install

```bash
bash ./install.sh --target hermes --profile minimal
```

## Notes

- Hermes config files (`config.yaml`, `.env`, etc.) are **not** touched by FORGE install.
- Use `npx forge-universal doctor --target hermes` to check install health.
