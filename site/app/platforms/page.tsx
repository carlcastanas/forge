import Link from 'next/link';
import type { Metadata } from 'next';

import { CopyCommand } from '@/components/copy-command';
import {
  AlertIcon,
  ArrowRightIcon,
  BookIcon,
  HookIcon,
  InfoIcon,
  LayersIcon,
  MemoryIcon,
  PlugIcon,
} from '@/components/icons';
import { SectionHead } from '@/components/page-parts';
import { getCounts, getDocEntries } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Platforms',
  description:
    'What FORGE actually delivers to every coding agent it has an adapter for: the support matrix, the install target and destination for each harness, and what is missing from each one.',
};

/* -------------------------------------------------------------------------- */
/* Data — every fact below comes from docs/HARNESS-MATRIX.md                   */
/* -------------------------------------------------------------------------- */

type Level = 'full' | 'partial' | 'none' | 'na' | 'unverified';

type Coverage = {
  skills: Level;
  agents: Level;
  commands: Level;
  hooks: Level;
  rules: Level;
  memory: Level;
  mcp: Level;
};

type BandId = 'reference' | 'catalog' | 'instruction' | 'outside' | 'recorded';

type Harness = {
  name: string;
  band: BandId;
  coverage: Coverage;
  install?: {
    target: string;
    destination: string;
    channel: string;
    guided: boolean;
  };
  hook?: { mode: string; configured: boolean; note: string };
  /** Present when the harness gets its own card. */
  arrives?: string;
  missing?: string;
};

const LEVEL_LABEL: Record<Level, string> = {
  full: 'Full',
  partial: 'Partial',
  none: 'None',
  na: 'N-A',
  unverified: 'unverified',
};

const LEVEL_MEANING: { level: Level; meaning: string }[] = [
  { level: 'full', meaning: 'The surface installs and the harness consumes it without help.' },
  {
    level: 'partial',
    meaning:
      'Some of the surface installs, or all of it installs and the harness still needs wiring by hand.',
  },
  { level: 'none', meaning: 'The surface does not install for this target.' },
  { level: 'na', meaning: 'The harness has no equivalent concept, so there is nothing to install.' },
  {
    level: 'unverified',
    meaning:
      'The repository does not settle the question. Confirm it against the version you have installed.',
  },
];

const COLUMNS: { key: keyof Coverage; label: string }[] = [
  { key: 'skills', label: 'Skills' },
  { key: 'agents', label: 'Agents' },
  { key: 'commands', label: 'Commands' },
  { key: 'hooks', label: 'Hooks' },
  { key: 'rules', label: 'Rules' },
  { key: 'memory', label: 'Memory' },
  { key: 'mcp', label: 'MCP' },
];

const BANDS: { id: BandId; title: string; lead: string }[] = [
  {
    id: 'reference',
    title: 'The reference implementation',
    lead: 'The catalog is authored against this harness and every module resolves for it. Read every other band as distance from this one.',
  },
  {
    id: 'catalog',
    title: 'Full-catalog adapters',
    lead: 'These targets receive the whole skill catalog. What separates them from each other is hooks, and whether the adapter writes a live MCP config or leaves you a template to copy.',
  },
  {
    id: 'instruction',
    title: 'Instruction-backed adapters',
    lead: 'Skills reach these five as a subset. The workflow and memory modules resolve; the language, framework and capability modules do not. That is a deliberate narrowing in the manifests, not a defect in the harness.',
  },
  {
    id: 'outside',
    title: 'Outside the install system',
    lead: 'Four surfaces the installer does not manage. Two carry their own shell scripts, one is loaded by the harness itself, and one is a set of files committed to the repository. None of them is recorded in install-state.',
  },
  {
    id: 'recorded',
    title: 'Recorded but not resolved',
    lead: 'These appear in the adapter compliance scorecard and nowhere in the install system. Terminal-only belongs here too, recorded as native: FORGE driven straight through the CLI and the skill files, with no harness integration in the loop.',
  },
];

const HARNESSES: Harness[] = [
  {
    name: 'Claude Code',
    band: 'reference',
    coverage: { skills: 'full', agents: 'full', commands: 'full', hooks: 'full', rules: 'full', memory: 'full', mcp: 'partial' },
    install: { target: 'claude, claude-project', destination: '~/.claude or ./.claude', channel: 'native plugin', guided: true },
    hook: { mode: 'profile-selection', configured: true, note: 'Selected through the off, minimal, standard or strict profile.' },
    arrives:
      'The harness owns the plugin path, so every module in the full profile lands without extra wiring. Hook registration comes from hooks/hooks.json and spans PreToolUse, PostToolUse, PostToolUseFailure, PreCompact, SessionStart, Stop and SessionEnd. Rules are written under <root>/rules/forge; skills sit flat under <root>/skills/.',
    missing:
      'Nothing structural. MCP reads Partial for one reason: plugin.json declares no servers, so the server list is yours to supply.',
  },
  {
    name: 'Cursor',
    band: 'catalog',
    coverage: { skills: 'full', agents: 'full', commands: 'full', hooks: 'full', rules: 'full', memory: 'full', mcp: 'full' },
    install: { target: 'cursor', destination: './.cursor', channel: 'managed project', guided: false },
    hook: { mode: 'adapter-configured', configured: true, note: 'Driven by the Cursor project adapter using Cursor event names.' },
    arrives:
      'The deepest adapter outside Claude Code. Seventeen hook scripts land in .cursor/hooks/ and are registered in .cursor/hooks.json, covering session start and end, shell execution before and after, file edits, MCP execution, prompt submission, subagent start and stop, tab reads and edits, pre-compact and stop. Rules are flattened into .cursor/rules/ and re-extensioned from .md to .mdc. Agents are flattened into .cursor/agents/ under Cursor-safe filenames. The root .mcp.json is merged into .cursor/mcp.json.',
    missing:
      'AGENTS.md is skipped on purpose, because Cursor reads a nested AGENTS.md as directory context. Running FORGE in Cursor alongside Claude Code means pointing FORGE_AGENT_DATA_HOME at a separate root.',
  },
  {
    name: 'CodeBuddy',
    band: 'catalog',
    coverage: { skills: 'full', agents: 'full', commands: 'full', hooks: 'full', rules: 'full', memory: 'full', mcp: 'partial' },
    install: { target: 'codebuddy', destination: './.codebuddy', channel: 'managed project', guided: false },
    hook: { mode: 'managed-files', configured: true, note: 'Hook runtime files are written by the project adapter.' },
    arrives:
      'Every content module plus the hook runtime, delivered as managed files beneath ./.codebuddy/. Rules are flattened into <root>/rules/. Beyond forge install --target codebuddy the adapter also ships install.sh, install.js, uninstall.sh and uninstall.js.',
    missing: 'No live MCP merge. The templates arrive; the harness config stays yours to edit.',
  },
  {
    name: 'JoyCode',
    band: 'catalog',
    coverage: { skills: 'full', agents: 'full', commands: 'full', hooks: 'none', rules: 'full', memory: 'full', mcp: 'partial' },
    install: { target: 'joycode', destination: './.joycode', channel: 'managed project', guided: false },
    hook: { mode: 'not-configured', configured: false, note: 'No FORGE hooks are configured by this adapter.' },
    arrives:
      'The CodeBuddy shape without the hook runtime: commands, agents, skills and flattened rules under ./.joycode/.',
    missing: 'Hooks, and a live MCP merge.',
  },
  {
    name: 'Zed',
    band: 'catalog',
    coverage: { skills: 'full', agents: 'full', commands: 'full', hooks: 'none', rules: 'full', memory: 'full', mcp: 'partial' },
    install: { target: 'zed', destination: './.zed', channel: 'managed project', guided: false },
    hook: { mode: 'not-configured', configured: false, note: 'No FORGE hooks are configured by this adapter.' },
    arrives:
      'Commands, agents, skills and flattened rules under ./.zed/, plus project settings. The committed .zed/settings.json is a security posture rather than content: agent.tool_permissions starts at confirm, always_deny covers rm -rf / and reads of .env, .pem and .key files, always_confirm covers sudo, package installs and gh subcommands, and edit_file.always_deny blocks writes to .env, .pem, .key, .p12 and .pfx.',
    missing: 'Hooks, and a live MCP merge.',
  },
  {
    name: 'Qwen Code',
    band: 'catalog',
    coverage: { skills: 'full', agents: 'full', commands: 'full', hooks: 'none', rules: 'full', memory: 'full', mcp: 'partial' },
    install: { target: 'qwen', destination: '~/.qwen', channel: 'managed home', guided: false },
    hook: { mode: 'not-configured', configured: false, note: 'No FORGE hooks are configured by this adapter.' },
    arrives:
      'Commands, agents, skills, rules and the Qwen configuration into ~/.qwen/. Rule directories keep their structure here rather than being flattened.',
    missing:
      'Hooks, held back until the Qwen hook and event contract is confirmed rather than guessed at, and a live MCP merge.',
  },
  {
    name: 'Antigravity',
    band: 'catalog',
    coverage: { skills: 'full', agents: 'full', commands: 'full', hooks: 'none', rules: 'full', memory: 'full', mcp: 'partial' },
    install: { target: 'antigravity', destination: './.agents', channel: 'managed project', guided: false },
    hook: { mode: 'not-configured', configured: false, note: 'No FORGE hooks are configured by this adapter.' },
    arrives:
      'A remapping rather than a copy. rules/ flattens into .agents/rules/, commands/ becomes .agents/workflows/, skills/<name>/ maps to .agents/skills/<name>/, and each agents/*.md moves to .agents/agents/ with its frontmatter rewritten: Claude model tiers become flash or pro, Claude tool names become their Antigravity equivalents, and any unsupported tool identifier is dropped, because an invalid name can hang custom-agent execution. The repository .agents/ tree is not copied wholesale — it is Codex-facing skill packaging with its own marketplace metadata. Native install needs FORGE 2.2.0 or newer; earlier versions used the legacy .agent/ adapter. Do not rename .agent/ to .agents/ by hand, because install-state holds absolute paths. Rerun the installer instead.',
    missing: 'Hooks, and a live MCP merge.',
  },
  {
    name: 'Codex',
    band: 'catalog',
    coverage: { skills: 'full', agents: 'full', commands: 'none', hooks: 'partial', rules: 'none', memory: 'full', mcp: 'full' },
    install: { target: 'codex', destination: '~/.codex', channel: 'native plugin', guided: true },
    hook: { mode: 'native-trust', configured: true, note: 'Uses Codex native plugin discovery, and remains subject to Codex review and trust.' },
    arrives:
      'Instruction-backed rather than hook-backed. Agents, AGENTS.md, the skill catalog and the platform configs install. .codex/config.toml carries the operating posture — approval_policy set to on-request, sandbox_mode set to workspace-write, live web search — and declares MCP servers inline, which is why MCP reads Full. Three role layers sit in .codex/agents/: an explorer that gathers evidence read-only, a reviewer for correctness, security and absent tests, and a docs researcher that checks APIs and release notes.',
    missing:
      'rules-core and commands-core do not resolve for the codex target. Codex may not execute slash commands natively; the navigation guide has you open the command file and carry out the steps yourself. Hook parity is not established.',
  },
  {
    name: 'OpenCode',
    band: 'catalog',
    coverage: { skills: 'full', agents: 'full', commands: 'full', hooks: 'partial', rules: 'none', memory: 'full', mcp: 'partial' },
    install: { target: 'opencode', destination: '$OPENCODE_CONFIG_DIR, else $XDG_CONFIG_HOME/opencode, else ~/.config/opencode', channel: 'managed home', guided: false },
    hook: { mode: 'adapter-opt-in', configured: false, note: 'The adapter carries a runtime, but nothing is installed unless you ask for it.' },
    arrives:
      'A built adapter package rather than a file copy. .opencode/ holds opencode.json, 33 command files, 26 agent prompt files, 9 TypeScript tools and a forge-hooks.ts plugin. Skills are not duplicated: opencode.json reads them from the canonical skills/ directory. Instructions live in .opencode/instructions/INSTRUCTIONS.md. The installer refuses to run until the plugin payload is compiled under .opencode/dist, so build it first with node scripts/build-opencode.js, or npm run build:opencode, from the repository root.',
    missing:
      'Rules: rules-core does not resolve for this target. Hooks are excluded from the opencode profile by design; opt in with --modules hooks-runtime.',
  },
  {
    name: 'Kimi Code',
    band: 'instruction',
    coverage: { skills: 'partial', agents: 'full', commands: 'full', hooks: 'none', rules: 'full', memory: 'full', mcp: 'full' },
    install: { target: 'kimi', destination: './.kimi-code', channel: 'managed project', guided: true },
    hook: { mode: 'not-configured', configured: false, note: 'No FORGE hooks are configured by this adapter.' },
    arrives:
      'A managed project install under ./.kimi-code/. That directory is not the .kimi/ documentation folder in this repository, and the adapter deliberately refuses to recreate the .kimi name. Discovery covers .kimi-code/AGENTS.md, .kimi-code/skills/, .agents/skills/ and .kimi-code/mcp.json. The root .mcp.json is merged into .kimi-code/mcp.json, which is why MCP reads Full here. Verified against Kimi Code 0.31.x.',
    missing:
      'The language, framework and capability skill modules do not resolve for this target, so the workflow and memory skills arrive and the rest of the catalog does not. No hook mapping exists.',
  },
  {
    name: 'Hermes',
    band: 'instruction',
    coverage: { skills: 'partial', agents: 'full', commands: 'full', hooks: 'none', rules: 'full', memory: 'full', mcp: 'partial' },
    install: { target: 'hermes', destination: '~/.hermes', channel: 'managed home', guided: false },
    hook: { mode: 'not-configured', configured: false, note: 'No FORGE hooks are configured by this adapter.' },
    arrives:
      'Rules, agents, commands, platform configs, the workflow-quality skill set and skills/unified-memory, written to ~/.hermes. The installer leaves config.yaml and .env untouched. Hermes also carries the most worked-through memory story in the repository: its setup guide covers initializing the vault, giving each harness its own FORGE_MEMORY_HARNESS identity, and handing work back and forth between Hermes and Codex.',
    missing: 'Hooks, the language and framework skill modules, and a live MCP merge.',
  },
  {
    name: 'OpenClaw',
    band: 'instruction',
    coverage: { skills: 'partial', agents: 'full', commands: 'full', hooks: 'none', rules: 'full', memory: 'full', mcp: 'partial' },
    install: { target: 'openclaw', destination: '~/.openclaw', channel: 'managed home', guided: false },
    hook: { mode: 'not-configured', configured: false, note: 'No FORGE hooks are configured by this adapter.' },
    arrives:
      'The same install shape as Hermes, written to ~/.openclaw: rules, agents, commands, platform configs, the workflow-quality skills and skills/unified-memory.',
    missing: 'Hooks, the language and framework skill modules, and a live MCP merge.',
  },
  {
    name: 'AdaL CLI',
    band: 'instruction',
    coverage: { skills: 'partial', agents: 'full', commands: 'full', hooks: 'none', rules: 'full', memory: 'full', mcp: 'partial' },
    install: { target: 'adal', destination: './.adal', channel: 'managed project', guided: false },
    hook: { mode: 'not-configured', configured: false, note: 'No FORGE hooks are configured by this adapter.' },
    arrives:
      'The same set again, scoped to the project at ./.adal rather than to a home directory: rules, agents, commands, platform configs, the workflow-quality skills and skills/unified-memory.',
    missing: 'Hooks, the language and framework skill modules, and a live MCP merge.',
  },
  {
    name: 'Gemini CLI',
    band: 'instruction',
    coverage: { skills: 'partial', agents: 'none', commands: 'none', hooks: 'none', rules: 'none', memory: 'full', mcp: 'partial' },
    install: { target: 'gemini', destination: './.gemini', channel: 'managed project', guided: false },
    hook: { mode: 'not-configured', configured: false, note: 'No FORGE hooks are configured by this adapter.' },
    arrives:
      'The thinnest target that is still supported. Resolving the full profile against gemini selects three modules: platform-configs, skill-unified-memory and the optional Nasiko bridge. What is committed is a single instruction file, .gemini/GEMINI.md.',
    missing:
      'Rules, agents, commands, hooks, and every skill except unified memory. To get more FORGE content into Gemini CLI, pack it by hand using the manual adaptation guide.',
  },
  {
    name: 'Kiro',
    band: 'outside',
    coverage: { skills: 'partial', agents: 'full', commands: 'none', hooks: 'partial', rules: 'full', memory: 'none', mcp: 'partial' },
    install: { target: 'no install target', destination: './.kiro or ~/.kiro', channel: 'own installer', guided: false },
    arrives:
      'kiro is absent from SUPPORTED_INSTALL_TARGETS and has no adapter, yet .kiro/ is the second-richest committed surface in the repository: 43 skill directories, 37 agents in paired .md and .json form, 13 *.kiro.hook files, and 22 steering documents doing the job rules do elsewhere. Install it with .kiro/install.sh [dir|~], which copies .kiro/ into a project or into ~/.kiro/.',
    missing:
      'No commands. MCP exists only as .kiro/settings/mcp.json.example. No FORGE memory surface, and no uninstaller — the copied directories come off by hand. Because none of this is recorded in install-state, forge doctor, forge repair and forge uninstall cannot see it.',
  },
  {
    name: 'Trae',
    band: 'outside',
    coverage: { skills: 'full', agents: 'full', commands: 'full', hooks: 'none', rules: 'full', memory: 'unverified', mcp: 'none' },
    install: { target: 'no install target', destination: './.trae or .trae-cn, or the home equivalent', channel: 'own installer', guided: false },
    arrives:
      '.trae/install.sh copies commands, agents, skills and rules from the repository root into .trae/, or into .trae-cn/ when TRAE_ENV=cn. It writes non-destructively and records what it wrote in a manifest that .trae/uninstall.sh reads back to reverse the install. Passing ~ installs to the home equivalent, once for every Trae project.',
    missing:
      'No hooks, no MCP surface, no install-state. Whether the memory vault works here is unverified.',
  },
  {
    name: 'Pi',
    band: 'outside',
    coverage: { skills: 'full', agents: 'unverified', commands: 'full', hooks: 'partial', rules: 'partial', memory: 'unverified', mcp: 'na' },
    install: { target: 'no install target', destination: 'reads the checkout in place', channel: 'adapter loaded by Pi', guided: false },
    arrives:
      'Pi loads the adapter itself; FORGE never installs into it. The pi key in package.json points Pi at ./.pi/extensions/index.ts, ./skills and ./commands, so skills and commands are read from the canonical directories and nothing is duplicated. The extension carries a hook runtime at .pi/extensions/hook-runtime.js that honours FORGE_HOOK_PROFILE and FORGE_DISABLED_HOOKS for SessionStart and SessionEnd, and rule injection can be switched off with FORGE_PI_RULES.',
    missing:
      'Pi core has no MCP surface at all, so that column is N-A rather than None. The pi target cannot be passed to forge install. Agent and memory coverage are unverified.',
  },
  {
    name: 'Copilot',
    band: 'outside',
    coverage: { skills: 'none', agents: 'none', commands: 'partial', hooks: 'none', rules: 'partial', memory: 'none', mcp: 'none' },
    install: { target: 'no install target', destination: '.github/ and .vscode/ in the repository', channel: 'committed files', guided: false },
    arrives:
      'Neither a target nor an adapter, just files committed to the repository. .github/copilot-instructions.md carries the FORGE baseline rules: research first, plan before coding, test-driven, review before committing, conventional commits. .github/prompts/ holds five prompt files — plan, tdd, build-fix, refactor and security-review. .vscode/settings.json enables chat.promptFiles and wires the instruction file into Copilot code generation, test generation and commit messages.',
    missing:
      'Everything else. No skills, no agents, no hooks, no MCP, no memory. The prompt files are the only command-shaped surface, and they are a hand-maintained subset of the command shims.',
  },
  {
    name: 'dmux',
    band: 'recorded',
    coverage: { skills: 'na', agents: 'na', commands: 'na', hooks: 'na', rules: 'na', memory: 'unverified', mcp: 'unverified' },
    install: { target: 'no install target', destination: 'not an install destination', channel: 'session inspection source', guided: false },
    arrives:
      'Adapter-backed, but a place FORGE reads from rather than writes to. forge session-inspect pulls dmux plans and emits forge.session.v1 snapshots.',
    missing:
      'No content destination, which is why every content column is N-A. Memory and MCP are unverified.',
  },
  {
    name: 'Orca',
    band: 'recorded',
    coverage: { skills: 'unverified', agents: 'unverified', commands: 'unverified', hooks: 'unverified', rules: 'unverified', memory: 'unverified', mcp: 'unverified' },
  },
  {
    name: 'Superset',
    band: 'recorded',
    coverage: { skills: 'unverified', agents: 'unverified', commands: 'unverified', hooks: 'unverified', rules: 'unverified', memory: 'unverified', mcp: 'unverified' },
  },
  {
    name: 'Ghast',
    band: 'recorded',
    coverage: { skills: 'unverified', agents: 'unverified', commands: 'unverified', hooks: 'unverified', rules: 'unverified', memory: 'unverified', mcp: 'unverified' },
  },
];

const LISTS = [
  {
    constant: 'SUPPORTED_INSTALL_TARGETS',
    file: 'scripts/lib/install-manifests.js',
    body: 'Fifteen install targets. This is the list forge install accepts.',
  },
  {
    constant: 'HARNESS_CAPABILITIES',
    file: 'scripts/lib/harness-capabilities.js',
    body: 'Fourteen harnesses, checked against the target list when the module loads. This is where the hook mode per harness is recorded.',
  },
  {
    constant: 'ADAPTER_RECORDS',
    file: 'scripts/lib/harness-adapter-compliance.js',
    body: 'Twelve compliance entries, some of them reference-only harnesses with no installer behind them.',
  },
];

const VERIFY_COMMAND = 'forge plan --profile full --target <target> --json';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function docHref(slug: string, fallback: string): string {
  const match = getDocEntries().find((entry) => entry.slug.join('/') === slug);
  return match ? match.href : fallback;
}

function LevelPill({ level }: { level: Level }) {
  return <span className={`level level--${level}`}>{LEVEL_LABEL[level]}</span>;
}

function HarnessCard({ harness }: { harness: Harness }) {
  const install = harness.install;

  return (
    <article className="card">
      <h4 className="card__title">{harness.name}</h4>

      {install ? (
        <>
          <div className="pill-row">
            <span className="badge">{install.target}</span>
            <span className="badge">{install.channel}</span>
            {install.guided ? <span className="badge">guided</span> : null}
          </div>
          <p className="t-small u-mono u-wrap">{install.destination}</p>
        </>
      ) : null}

      {harness.arrives ? <p className="card__body">{harness.arrives}</p> : null}

      {harness.missing ? (
        <p className="card__body">
          <strong>Missing.</strong> {harness.missing}
        </p>
      ) : null}
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function PlatformsPage() {
  const counts = getCounts();
  const matrixHref = docHref('harness-matrix', '/docs');
  const installHref = docHref('installation', '/docs');

  const configuredHooks = HARNESSES.filter(
    (harness) => harness.hook && harness.hook.mode !== 'not-configured',
  );
  const unconfiguredHooks = HARNESSES.filter(
    (harness) => harness.hook && harness.hook.mode === 'not-configured',
  );
  const guided = HARNESSES.filter((harness) => harness.install?.guided).map(
    (harness) => harness.name,
  );

  return (
    <>
      {/* Hero */}
      <section className="container hero">
        <div className="hero__inner">
          <span className="chip">{HARNESSES.length} harnesses recorded</span>

          <h1 className="t-display">Platforms</h1>

          <p className="t-lead hero__subhead">
            An adapter is a projection of the canonical catalog, never a second source of truth.
            When an adapter and the catalog disagree, the catalog is right.
          </p>

          <p className="t-body measure">
            Claude Code is the reference implementation: the catalog is authored against it and
            every module resolves for it. Coverage everywhere else is bounded by what each harness
            exposes, not by how much effort went into the adapter. A harness with no hook contract
            gets no hooks, and the page says so rather than implying otherwise.
          </p>

          <div className="hero__ctas">
            <Link className="btn btn--primary" href={matrixHref}>
              Read the full matrix
              <ArrowRightIcon size={16} />
            </Link>
            <Link className="btn" href={installHref}>
              Installation paths
            </Link>
          </div>
        </div>
      </section>

      {/* How to read the page */}
      <section className="container section">
        <SectionHead
          eyebrow="How to read this"
          title="Five support levels"
          lead="Each level was derived by resolving the full install profile against a target and reading the adapter definitions. None of it is a marketing summary of what a harness could theoretically do."
        />

        <div className="kv">
          {LEVEL_MEANING.map((entry) => (
            <div className="kv__row" key={entry.level}>
              <div className="kv__key">
                <LevelPill level={entry.level} />
              </div>
              <p className="kv__val">{entry.meaning}</p>
            </div>
          ))}
        </div>

        <div className="callout" style={{ marginTop: '1.25rem' }}>
          <span className="callout__icon">
            <InfoIcon size={18} />
          </span>
          <div className="callout__body">
            <strong>unverified is not a hedge.</strong> It means the repository does not establish
            the answer. Rather than fill the cell in with something plausible, the page reports the
            gap and hands the question back to your installed version.
          </div>
        </div>
      </section>

      {/* The support matrix */}
      <section className="container section">
        <SectionHead
          eyebrow="Support matrix"
          title="Every harness, every surface"
          lead="Rows are ordered by how completely FORGE reaches each harness, from the reference implementation down to the entries the repository only records."
        />

        <div className="table-scroll">
          <table className="data-table">
            <caption className="visually-hidden">
              Support level for skills, agents, commands, hooks, rules, memory and MCP in every
              harness FORGE has a record of
            </caption>
            <thead>
              <tr>
                <th scope="col">Harness</th>
                {COLUMNS.map((column) => (
                  <th scope="col" key={column.key}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HARNESSES.map((harness) => (
                <tr key={harness.name}>
                  <th scope="row" className="data-table__name">
                    {harness.name}
                  </th>
                  {COLUMNS.map((column) => (
                    <td key={column.key}>
                      <LevelPill level={harness.coverage[column.key]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="stack" style={{ marginTop: '1.5rem' }}>
          <div className="callout">
            <span className="callout__icon">
              <MemoryIcon size={18} />
            </span>
            <div className="callout__body">
              <strong>The memory column needs a caveat.</strong> Every install target that resolves
              the full profile receives skills/unified-memory, and the vault behind it is
              harness-independent: forge memory is a CLI in the npm package and forge-memory-mcp is
              a standalone stdio MCP server, so any harness able to spawn a subprocess can use it.
              What differs per harness is whether FORGE registers that server for you, and it does
              not do that anywhere. mcpServers in .claude-plugin/plugin.json is empty, and the
              forge-memory-vault entry in mcp-configs/mcp-servers.json has to be copied into your
              harness config by hand. Run one server process per harness, each with its own
              FORGE_MEMORY_HARNESS value.
            </div>
          </div>

          <div className="callout">
            <span className="callout__icon">
              <PlugIcon size={18} />
            </span>
            <div className="callout__body">
              <strong>So does the MCP column.</strong> platform-configs installs mcp-configs/ for
              every target, so the templates always arrive. Full in that column means something
              narrower: the adapter also merges a live MCP config into the harness config file. Only
              Cursor and Kimi Code do that, plus Codex, whose config.toml declares mcp_servers
              directly. Everywhere else MCP is a template you wire up yourself.
            </div>
          </div>
        </div>

        <h3 className="t-h3" style={{ marginTop: '2.5rem' }}>
          Three lists, and they disagree
        </h3>
        <p className="t-small measure" style={{ marginTop: '0.6rem' }}>
          The set of harnesses this project knows about is not recorded in one place. The matrix
          above is the union of all three lists plus the surfaces that appear in none of them.
        </p>

        <ol className="step-list" style={{ marginTop: '1.25rem' }}>
          {LISTS.map((list, index) => (
            <li className="step-list__item" key={list.constant}>
              <span className="step-list__num">{String(index + 1).padStart(2, '0')}</span>
              <h4 className="step-list__title u-mono u-wrap">{list.constant}</h4>
              <p className="step-list__body">
                <span className="t-mono u-wrap">{list.file}</span> — {list.body}
              </p>
            </li>
          ))}
        </ol>

        <p className="t-small measure" style={{ marginTop: '1.25rem' }}>
          Kiro and Trae ship their own shell installers and appear in none of the three. Copilot has
          instruction and prompt files and no installer at all. All of it is on this page.
        </p>
      </section>

      {/* Per-harness detail */}
      <section className="container section">
        <SectionHead
          eyebrow="Per-harness detail"
          title="Where it installs, what arrives, what is missing"
          lead="A row in a table tells you a level. It does not tell you which directory the files land in, which of them were remapped on the way, or what you still have to wire up yourself."
        />

        <div className="stack--loose stack">
          {BANDS.map((band) => {
            const members = HARNESSES.filter((harness) => harness.band === band.id);
            const withCards = members.filter((harness) => harness.arrives);
            const withoutCards = members.filter((harness) => !harness.arrives);

            return (
              <div className="stack" key={band.id}>
                <div>
                  <h3 className="t-h3">{band.title}</h3>
                  <p className="t-small measure" style={{ marginTop: '0.5rem' }}>
                    {band.lead}
                  </p>
                  {band.id === 'instruction' ? (
                    <p className="t-small measure" style={{ marginTop: '0.5rem' }}>
                      For scale: the catalog Claude Code resolves holds {counts.skills} skills,{' '}
                      {counts.agents} agents and {counts.commands} command shims. These five see a
                      slice of the first number. The other two arrive whole, except in Gemini CLI.
                    </p>
                  ) : null}
                </div>

                <div className="grid grid--2">
                  {withCards.map((harness) => (
                    <HarnessCard harness={harness} key={harness.name} />
                  ))}

                  {withoutCards.length > 0 ? (
                    <article className="card">
                      <h4 className="card__title">
                        {withoutCards.map((harness) => harness.name).join(', ')}
                      </h4>
                      <div className="pill-row">
                        <span className="badge">no install target</span>
                        <span className="badge">reference only</span>
                      </div>
                      <p className="card__body">
                        Marked reference-only in the compliance scorecard: the repository records
                        the harness without shipping an adapter for it. There is no install target,
                        no destination, and nothing to describe as arriving.
                      </p>
                      <p className="card__body">
                        <strong>Missing.</strong> Everything, as far as the repository establishes.
                        Treat every content column as unverified and adapt by hand.
                      </p>
                    </article>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="callout" style={{ marginTop: '2rem' }}>
          <span className="callout__icon">
            <LayersIcon size={18} />
          </span>
          <div className="callout__body">
            <strong>Guided install reaches three harnesses.</strong> {guided.join(', ')} are
            guided-ready. Every other target has to be named:{' '}
            <span className="t-mono u-wrap">{'forge install --target <id>'}</span>.
          </div>
        </div>
      </section>

      {/* Hook posture */}
      <section className="container section">
        <SectionHead
          eyebrow="Hook posture"
          title="Hooks resolve for five targets"
          lead="The hooks-runtime module resolves for claude, claude-project, cursor, opencode and codebuddy, and for nothing else. Separately from that, the capability catalog records a hook mode per harness. The two are not the same statement, and they do not always agree."
        />

        <div className="table-scroll">
          <table className="data-table">
            <caption className="visually-hidden">
              Hook mode recorded per harness, whether FORGE configures hooks for it, and the
              qualification attached to each mode
            </caption>
            <thead>
              <tr>
                <th scope="col">Harness</th>
                <th scope="col">Hook mode</th>
                <th scope="col">Configured by FORGE</th>
                <th scope="col">Note</th>
              </tr>
            </thead>
            <tbody>
              {configuredHooks.map((harness) => (
                <tr key={harness.name}>
                  <th scope="row" className="data-table__name">
                    {harness.name}
                  </th>
                  <td className="data-table__name">{harness.hook?.mode}</td>
                  <td>{harness.hook?.configured ? 'yes' : 'no'}</td>
                  <td className="data-table__desc">{harness.hook?.note}</td>
                </tr>
              ))}
              <tr>
                <th scope="row" className="data-table__name">
                  {unconfiguredHooks.map((harness) => harness.name).join(', ')}
                </th>
                <td className="data-table__name">not-configured</td>
                <td>no</td>
                <td className="data-table__desc">
                  No FORGE hooks are configured by any of these adapters.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="callout callout--warn" style={{ marginTop: '1.5rem' }}>
          <span className="callout__icon">
            <AlertIcon size={18} />
          </span>
          <div className="callout__body">
            <strong>Codex is inconsistent, and it matters.</strong> hooks-runtime does not resolve
            for the codex target. Even so, .codex-plugin/plugin.json references
            hooks/codex-hooks.json, and the capability catalog marks Codex hooks as configured.
            Until you have confirmed otherwise on your own version, treat Codex hook enforcement as
            instruction text plus sandbox settings, and nothing stronger. The Codex navigation guide
            states it just as bluntly: do not assume hook parity with Claude Code.
          </div>
        </div>

        <div className="callout" style={{ marginTop: '1rem' }}>
          <span className="callout__icon">
            <HookIcon size={18} />
          </span>
          <div className="callout__body">
            OpenCode is the other place the two records diverge without contradicting each other.
            The adapter carries a working hook runtime; the opencode profile leaves it out. Nothing
            is broken, but nothing fires either until you pass{' '}
            <span className="t-mono">--modules hooks-runtime</span>.
          </div>
        </div>
      </section>

      {/* Verify + closing */}
      <section className="container section">
        <SectionHead
          eyebrow="Verify"
          title="Do not trust this page over your machine"
          lead="The matrix was read out of the repository at a point in time. Your installed version is the authority on what your install actually received."
        />

        <div className="split split--sidebar">
          <div className="stack">
            <div style={{ width: '100%', maxWidth: '34rem' }}>
              <CopyCommand command={VERIFY_COMMAND} />
            </div>
            <p className="t-small measure">
              This is the single most useful check. It writes nothing, and its selectedModuleIds
              list is the ground truth for what a target can receive. From there,{' '}
              <span className="t-mono">forge list-installed --json</span> reports what is on disk
              and where, <span className="t-mono">forge doctor --json</span> reports drift, and{' '}
              <span className="t-mono">forge session-inspect --list-adapters</span> reports which
              session adapters are available. The adapter compliance scorecard runs from the
              repository as <span className="t-mono">npm run harness:adapters</span> and{' '}
              <span className="t-mono">npm run harness:audit</span>.
            </p>
          </div>

          <div className="cta-band">
            <p className="t-eyebrow">Next</p>
            <h3 className="t-h3">The document behind this page</h3>
            <p className="t-small">
              Every fact above comes from one reference page in the repository, which also carries
              the checking commands, the per-harness depth guides, and the manual adaptation route
              for a harness with no adapter at all.
            </p>
            <div className="hero__ctas">
              <Link className="btn btn--primary" href={matrixHref}>
                Harness matrix
                <ArrowRightIcon size={16} />
              </Link>
              <Link className="btn" href={installHref}>
                Installation
              </Link>
              <Link className="btn btn--ghost" href="/docs">
                <BookIcon size={16} />
                All docs
              </Link>
            </div>
          </div>
        </div>

        <div className="note-band">
          <span className="note-band__label">Scope</span>
          This page describes the open-source install: the catalog projected into a coding agent you
          run yourself. It covers no hosted service, and nothing here depends on one.
        </div>
      </section>
    </>
  );
}
