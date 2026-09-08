/** Constants that describe the project. Keep names exactly as BRAND.md specifies. */

export const SITE = {
  name: 'FORGE',
  package: 'forge-universal',
  cli: 'forge',
  pluginSlug: 'forge@forge',
  installDir: '~/.forge',
  shield: 'Forge Shield',
  version: '1.0.0',
  repo: 'https://github.com/your-org/forge',
  tagline: 'The engineering system your coding agent is missing.',
  claim: 'Optimize the context window. Persist everything else.',
  description:
    'FORGE is an agent engineering system for coding agents. It supplies the plan, test, implement, review, verify, remember, improve loop as skills, subagents, command shims, rules, hooks, and memory.',
  installCommand: 'npx forge-universal install',
} as const;

export const NAV_LINKS = [
  { href: '/why', label: 'Why' },
  { href: '/docs', label: 'Docs' },
  { href: '/guides', label: 'Guides' },
  { href: '/skills', label: 'Skills' },
  { href: '/agents', label: 'Agents' },
  { href: '/commands', label: 'Commands' },
  { href: '/security', label: 'Security' },
] as const;

/** Pages that describe the product rather than document the catalog. */
export const PRODUCT_LINKS = [
  { href: '/why', label: 'Why FORGE' },
  { href: '/security', label: 'Forge Shield' },
  { href: '/platforms', label: 'Platforms' },
  { href: '/changelog', label: 'Changelog' },
] as const;

export const LOOP_STEPS = [
  { name: 'plan', note: 'Decompose the request into a written plan before any file is touched.' },
  { name: 'test', note: 'Write the failing test that describes the change you are about to make.' },
  { name: 'implement', note: 'Make the smallest change that turns the test green.' },
  { name: 'review', note: 'Route the diff to the reviewer that matches the stack.' },
  { name: 'verify', note: 'Run the build, the suite, and the security scan. Read the output.' },
  { name: 'remember', note: 'Write what was learned to memory so the next session starts informed.' },
  { name: 'improve', note: 'Feed the result back into the rules and skills that produced it.' },
] as const;

export const HARNESSES = [
  { name: 'Claude Code', note: 'Primary target. Plugin, skills, subagents, hooks, memory.' },
  { name: 'Codex', note: 'Adapter projects the catalog into the Codex configuration surface.' },
  { name: 'OpenCode', note: 'Adapter with command and agent projection.' },
  { name: 'Cursor', note: 'Rules and command projection.' },
  { name: 'Gemini', note: 'Adapter with catalog projection.' },
  { name: 'Zed', note: 'Adapter with catalog projection.' },
  { name: 'Copilot', note: 'Instruction-file projection.' },
  { name: 'Antigravity', note: 'Adapter with catalog projection.' },
  { name: 'Qwen', note: 'Adapter with catalog projection.' },
] as const;
