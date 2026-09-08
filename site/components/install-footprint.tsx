/**
 * "What does this actually put on my machine?"
 *
 * Every figure here is read at build time: directory sizes come from walking the
 * repository, the profile list comes from manifests/install-profiles.json. The
 * destinations and the state files are documented in docs/INSTALLATION.md; the
 * per-session context costs are documented in docs/CONFIGURATION.md.
 */
import Link from 'next/link';

import { TableScroll } from '@/components/page-parts';
import { dirStats, formatBytes, readRepoFile } from '@/components/repo-read';

type Surface = {
  path: string;
  count: string;
  size: string;
  cost: string;
};

type Profile = {
  id: string;
  modules: number;
  description: string;
};

/** Reads the seven install profiles and their module counts from the manifest. */
function readProfiles(): Profile[] {
  const raw = readRepoFile('manifests/install-profiles.json');
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as {
      profiles?: Record<string, { description?: unknown; modules?: unknown }>;
    };
    const profiles = parsed.profiles;
    if (!profiles || typeof profiles !== 'object') return [];

    return Object.entries(profiles)
      .map(([id, value]) => ({
        id,
        modules: Array.isArray(value?.modules) ? value.modules.length : 0,
        description: typeof value?.description === 'string' ? value.description : '',
      }))
      .filter((profile) => profile.modules > 0)
      .sort((a, b) => a.modules - b.modules || a.id.localeCompare(b.id));
  } catch {
    return [];
  }
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function InstallFootprint() {
  const skills = dirStats('skills', /\.md$/i);
  const agents = dirStats('agents', /\.md$/i);
  const commands = dirStats('commands', /\.md$/i);
  const rules = dirStats('rules', /\.md$/i);
  const common = dirStats('rules/common', /\.md$/i);
  const hookScripts = dirStats('scripts/hooks');
  const hookConfig = dirStats('hooks');

  const surfaces: Surface[] = [
    {
      path: 'skills/',
      count: plural(skills.dirs, 'directory', 'directories'),
      size: formatBytes(skills.bytes),
      cost: 'Nothing, until a trigger matches. Then one SKILL.md.',
    },
    {
      path: 'agents/',
      count: plural(agents.files, 'definition', 'definitions'),
      size: formatBytes(agents.bytes),
      cost: 'Nothing in the parent window. A delegated agent gets its own.',
    },
    {
      path: 'commands/',
      count: plural(commands.files, 'shim', 'shims'),
      size: formatBytes(commands.bytes),
      cost: 'One line when you type it, plus the skill it fronts.',
    },
    {
      path: 'rules/',
      count: plural(rules.files, 'file', 'files'),
      size: formatBytes(rules.bytes),
      cost: `Injected whole on a match. rules/common — ${plural(common.files, 'file', 'files')}, ${formatBytes(common.bytes)} — is the always-loaded set.`,
    },
    {
      path: 'hooks/ + scripts/hooks/',
      count: plural(hookConfig.files + hookScripts.files, 'file', 'files'),
      size: formatBytes(hookConfig.bytes + hookScripts.bytes),
      cost: 'No tokens. Wall-clock time, plus whatever a hook prints.',
    },
  ];

  const profiles = readProfiles();
  const smallest = profiles[0];
  const largest = profiles[profiles.length - 1];

  return (
    <div className="stack stack--loose">
      {/* Two channels */}
      <div className="grid grid--2">
        <div className="card">
          <h3 className="card__title">The package is not the install</h3>
          <p className="card__body">
            <code className="t-mono u-wrap">npm install -g forge-universal</code> puts six binaries
            on your PATH — <span className="t-mono">forge</span>,{' '}
            <span className="t-mono">forge-universal</span>,{' '}
            <span className="t-mono">forge-install</span>,{' '}
            <span className="t-mono">forge-control-pane</span>,{' '}
            <span className="t-mono">forge-memory-mcp</span> and{' '}
            <span className="t-mono">forge-plan-canvas</span> — and writes nothing into any harness
            directory.
          </p>
          <p className="card__body">
            Content lands only when you run <span className="t-mono">forge setup</span>,{' '}
            <span className="t-mono">forge install</span>, or one of the adapter installers.
          </p>
        </div>

        <div className="card">
          <h3 className="card__title">One channel per harness</h3>
          <p className="card__body">
            <span className="t-mono">forge setup</span> hands Claude Code the plugin and lets the
            harness manage it. <span className="t-mono">{'forge install --target <id>'}</span>{' '}
            copies files into a directory you control. Both reach the same harness, and neither
            knows about the other.
          </p>
          <p className="card__body">
            Running both against one harness gives you duplicated slash commands, hooks that fire
            twice, and drift <span className="t-mono">forge doctor</span> cannot repair, because the
            plugin cache is not tracked in install-state.
          </p>
        </div>
      </div>

      {/* On disk, and what it costs per session */}
      <div>
        <h3 className="t-h3 mb-2">On disk against in context</h3>
        <p className="t-body u-muted measure mb-4">
          The whole catalog is small enough that its size on disk is not the interesting number.
          The interesting number is the third column: almost none of it is in the window at any
          given moment.
        </p>

        <TableScroll label="Each catalog surface, its size on disk, and when it consumes context">
          <table className="data-table">
            <caption className="visually-hidden">
              Each catalog surface, how large it is on disk, and when it consumes context
            </caption>
            <thead>
              <tr>
                <th scope="col">Surface</th>
                <th scope="col">Entries</th>
                <th scope="col">On disk</th>
                <th scope="col">In the context window</th>
              </tr>
            </thead>
            <tbody>
              {surfaces.map((surface) => (
                <tr key={surface.path}>
                  <th scope="row" className="data-table__name">
                    {surface.path}
                  </th>
                  <td>{surface.count}</td>
                  <td className="u-mono">{surface.size}</td>
                  <td className="data-table__desc">{surface.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>

        <p className="t-small measure mt-3">
          Sizes are measured from the repository when this page is built, so they move when the
          catalog moves. Session start adds one more cost that is not in the table: the previous
          session&rsquo;s carried-over context, capped at 8,000 characters by default and
          adjustable with <span className="t-mono u-wrap">FORGE_SESSION_START_MAX_CHARS</span>, or
          switched off entirely with{' '}
          <span className="t-mono u-wrap">FORGE_SESSION_START_CONTEXT=0</span>.
        </p>
      </div>

      {/* Where it lands */}
      <div>
        <h3 className="t-h3 mb-2">Where it lands</h3>
        <p className="t-body u-muted measure mb-4">
          Fifteen install targets resolve to a root the adapter picks. Four of them, for orientation:
        </p>

        <div className="kv">
          <div className="kv__row">
            <div className="kv__key u-mono">claude, claude-project</div>
            <p className="kv__val">
              <span className="t-mono u-wrap">~/.claude</span> (or{' '}
              <span className="t-mono u-wrap">$CLAUDE_CONFIG_DIR</span>) and{' '}
              <span className="t-mono u-wrap">./.claude</span>. Managed rules land under{' '}
              <span className="t-mono u-wrap">rules/forge</span>; skills land flat under{' '}
              <span className="t-mono u-wrap">skills/</span>.
            </p>
          </div>
          <div className="kv__row">
            <div className="kv__key u-mono">cursor</div>
            <p className="kv__val">
              <span className="t-mono u-wrap">./.cursor</span>. Rules are flattened and
              re-extensioned from <span className="t-mono">.md</span> to{' '}
              <span className="t-mono">.mdc</span>; the root{' '}
              <span className="t-mono u-wrap">.mcp.json</span> is merged into{' '}
              <span className="t-mono u-wrap">.cursor/mcp.json</span>.
            </p>
          </div>
          <div className="kv__row">
            <div className="kv__key u-mono">codex</div>
            <p className="kv__val">
              <span className="t-mono u-wrap">~/.codex</span>. Instruction-backed: agents,
              AGENTS.md, the skill catalog and the platform configs, plus the operating posture in{' '}
              <span className="t-mono u-wrap">config.toml</span>.
            </p>
          </div>
          <div className="kv__row">
            <div className="kv__key u-mono">opencode</div>
            <p className="kv__val">
              <span className="t-mono u-wrap">$OPENCODE_CONFIG_DIR</span>, else{' '}
              <span className="t-mono u-wrap">$XDG_CONFIG_HOME/opencode</span>, else{' '}
              <span className="t-mono u-wrap">~/.config/opencode</span>. Skills are read from the
              canonical directory rather than copied.
            </p>
          </div>
        </div>

        <p className="t-small measure mt-3">
          The remaining ten, and what each adapter remaps on the way in, are on the{' '}
          <Link href="/platforms">platforms page</Link>.
        </p>
      </div>

      {/* Profiles */}
      {profiles.length > 0 ? (
        <div>
          <h3 className="t-h3 mb-2">You choose how much of it lands</h3>
          <p className="t-body u-muted measure mb-4">
            {profiles.length} profiles are defined in{' '}
            <span className="t-mono u-wrap">manifests/install-profiles.json</span>, from{' '}
            <span className="t-mono">{smallest?.id}</span> at{' '}
            {plural(smallest?.modules ?? 0, 'module', 'modules')} to{' '}
            <span className="t-mono">{largest?.id}</span> at{' '}
            {plural(largest?.modules ?? 0, 'module', 'modules')}. Installing everything is the
            usual way to make FORGE worse rather than better: more surface to match against, more
            chance of the wrong playbook loading.
          </p>

          <div className="pill-row">
            {profiles.map((profile) => (
              <span className="chip" key={profile.id} title={profile.description}>
                {profile.id} · {profile.modules}
              </span>
            ))}
          </div>

          <p className="t-small measure mt-3">
            Nothing has to be guessed at.{' '}
            <span className="t-mono u-wrap">
              {'forge plan --profile <name> --target <target> --json'}
            </span>{' '}
            resolves a profile against a target and writes nothing, and{' '}
            <span className="t-mono u-wrap">--dry-run</span> prints every planned source to
            destination pair before a byte moves. If a selection would materialise the hook
            runtime, the installer refuses to proceed without an explicit{' '}
            <span className="t-mono">--enable-hooks</span>.
          </p>
        </div>
      ) : null}

      {/* State that is not content */}
      <div>
        <h3 className="t-h3 mb-2">Four things that are state, not catalog</h3>
        <p className="t-body u-muted measure mb-4">
          These accumulate as you use it, and no uninstall path removes them. Delete them yourself
          if you want the machine clean.
        </p>

        <div className="grid grid--2">
          <div className="card">
            <h4 className="card__title u-mono u-wrap">{'<root>/forge/install-state.json'}</h4>
            <p className="card__body">
              Written by every non-guided install. It records the request, the resolved modules and
              every file operation. <span className="t-mono">forge list-installed</span>,{' '}
              <span className="t-mono">doctor</span>, <span className="t-mono">repair</span> and{' '}
              <span className="t-mono">uninstall</span> all read it — a hand copy that skipped the
              installer is invisible to all four.
            </p>
          </div>
          <div className="card">
            <h4 className="card__title u-mono u-wrap">~/.claude/forge/state.db</h4>
            <p className="card__body">
              The SQLite state store behind <span className="t-mono">forge status</span>,{' '}
              <span className="t-mono">forge sessions</span> and{' '}
              <span className="t-mono">forge work-items</span>. Relocatable with{' '}
              <span className="t-mono u-wrap">FORGE_STATE_DB_PATH</span>.
            </p>
          </div>
          <div className="card">
            <h4 className="card__title u-mono u-wrap">
              {'<project>/.forge/memory/'} and ~/.forge/memory/
            </h4>
            <p className="card__body">
              The project, team and user memory vaults. Writes are create-only and reject known
              credential shapes; default recall covers project and team, and user scope has to be
              asked for.
            </p>
          </div>
          <div className="card">
            <h4 className="card__title">Plan Canvas state</h4>
            <p className="card__body">
              Review-session state for the plan review server, in a directory you can move with{' '}
              <span className="t-mono u-wrap">FORGE_PLAN_CANVAS_STATE_DIR</span>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
