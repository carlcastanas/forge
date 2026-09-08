#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');
const { listAvailableLanguages } = require('./lib/install-executor');

const COMMANDS = {
  setup: {
    script: 'setup.js',
    description: 'Install or update the Claude plugin with guided scope and hook choices',
  },
  welcome: {
    script: 'welcome.js',
    description: 'Show the FORGE welcome artwork and community links',
  },
  install: {
    script: 'install-apply.js',
    description: 'Install FORGE content, including the guided multi-harness wizard',
  },
  plan: {
    script: 'install-plan.js',
    description: 'Inspect selective-install manifests and resolved plans',
  },
  catalog: {
    script: 'catalog.js',
    description: 'Discover install profiles and component IDs',
  },
  consult: {
    script: 'consult.js',
    description: 'Recommend FORGE components and profiles from a natural language query',
  },
  'control-pane': {
    script: 'control-pane.js',
    description: 'Run the local FORGE2 operator control pane',
  },
  nasiko: {
    script: 'nasiko.js',
    description: 'Install or inspect the optional pinned Nasiko CLI lifecycle bridge',
  },
  memory: {
    script: 'memory.js',
    description: 'Share durable context across Claude, Codex, Hermes, and other harnesses',
  },
  'install-plan': {
    script: 'install-plan.js',
    description: 'Alias for plan',
  },
  'list-installed': {
    script: 'list-installed.js',
    description: 'Inspect install-state files for the current context',
  },
  doctor: {
    script: 'doctor.js',
    description: 'Diagnose missing or drifted FORGE-managed files',
  },
  feedback: {
    script: 'feedback.js',
    description: 'Open the shortest path to report a problem, feedback, or an idea',
  },
  repair: {
    script: 'repair.js',
    description: 'Restore drifted or missing FORGE-managed files',
  },
  'auto-update': {
    script: 'auto-update.js',
    description: 'Pull latest FORGE changes and reinstall the current managed targets',
  },
  status: {
    script: 'status.js',
    description: 'Query the FORGE SQLite state store status summary',
  },
  'platform-audit': {
    script: 'platform-audit.js',
    description: 'Audit GitHub queues, discussions, roadmap, release, and security evidence',
  },
  'security-ioc-scan': {
    script: 'ci/scan-supply-chain-iocs.js',
    description: 'Scan dependency and AI-tool persistence surfaces for active supply-chain IOCs',
  },
  sessions: {
    script: 'sessions-cli.js',
    description: 'List or inspect FORGE sessions from the SQLite state store',
  },
  'work-items': {
    script: 'work-items.js',
    description: 'Track linked Linear, GitHub, handoff, and manual work items',
  },
  'session-inspect': {
    script: 'session-inspect.js',
    description: 'Emit canonical FORGE session snapshots from dmux or Claude history targets',
  },
  'loop-status': {
    script: 'loop-status.js',
    description: 'Inspect Claude transcripts for stale loop wakeups and pending tool results',
  },
  uninstall: {
    script: 'uninstall.js',
    description: 'Remove FORGE-managed files recorded in install-state',
  },
};

const PRIMARY_COMMANDS = [
  'setup',
  'welcome',
  'install',
  'plan',
  'catalog',
  'consult',
  'control-pane',
  'nasiko',
  'memory',
  'list-installed',
  'doctor',
  'feedback',
  'repair',
  'auto-update',
  'status',
  'platform-audit',
  'security-ioc-scan',
  'sessions',
  'work-items',
  'session-inspect',
  'loop-status',
  'uninstall',
];

function showHelp(exitCode = 0) {
  process.stdout.write(`
FORGE selective-install CLI

Usage:
  forge <command> [args...]
  forge [install args...]
  forge --dry-run <command> [args...]

Commands:
${PRIMARY_COMMANDS.map(command => `  ${command.padEnd(15)} ${COMMANDS[command].description}`).join('\n')}

Compatibility:
  forge-install        Legacy install entrypoint retained for existing flows
  forge [args...]      Without a command, args are routed to "install"
  forge help <command> Show help for a specific command

Global Flags:
  --dry-run          Preview actions without executing (sets FORGE_DRY_RUN=1)


Examples:
  forge setup
  forge setup --mode claude-plugin --scope user --hooks standard --yes
  forge welcome
  forge install --guided
  forge install --guided --harness claude --harness codex --harness kimi
  forge typescript
  forge install --profile developer --target claude
  forge plan --profile core --target cursor
  forge catalog profiles
  forge catalog components --family language
  forge catalog show framework:nextjs
  forge consult "security reviews"
  forge control-pane --port 8765
  forge nasiko status --json
  forge nasiko install --version v0.1.0 --dry-run --json
  forge nasiko install --version v0.1.0 --yes --json
  forge memory init
  forge memory handoff --from codex --target claude --title "Continue migration" --stdin
  forge memory search "migration blockers" --target-harness hermes
  forge list-installed --json
  forge doctor --target cursor
  forge feedback
  forge repair --dry-run
  forge auto-update --dry-run
  forge status --json
  forge status --exit-code
  forge status --markdown --write status.md
  forge platform-audit --json --allow-untracked docs/drafts/
  forge security-ioc-scan --home
  forge sessions
  forge sessions session-active --json
  forge work-items upsert linear-forge-20 --source linear --source-id FORGE-20 --title "Review control-plane contract" --status blocked
  forge work-items sync-github --repo your-org/FORGE
  forge session-inspect claude:latest
  forge loop-status --json
  forge uninstall --target antigravity --dry-run
`);

  process.exit(exitCode);
}

function resolveCommand(argv) {
  const args = argv.slice(2);

  if (args.length === 0) {
    return { mode: 'help' };
  }

  if (args.includes('--dry-run')) {
    process.env.FORGE_DRY_RUN = '1';
  }

  let cmdStart = 0;
  while (cmdStart < args.length && args[cmdStart] === '--dry-run') {
    cmdStart++;
  }

  if (cmdStart >= args.length) {
    return { mode: 'help' };
  }

  const firstArg = args[cmdStart];
  const restArgs = args.slice(cmdStart + 1);

  if (firstArg === '--help' || firstArg === '-h') {
    return { mode: 'help' };
  }

  if (firstArg === 'help') {
    return {
      mode: 'help-command',
      command: restArgs[0] || null,
    };
  }

  if (COMMANDS[firstArg]) {
    return {
      mode: 'command',
      command: firstArg,
      args: restArgs,
    };
  }

  const knownLegacyLanguages = listAvailableLanguages();
  const shouldTreatAsImplicitInstall = (
    firstArg.startsWith('-')
    || knownLegacyLanguages.includes(firstArg)
  );

  if (!shouldTreatAsImplicitInstall) {
    throw new Error(`Unknown command: ${firstArg}`);
  }

  return {
    mode: 'command',
    command: 'install',
    args,
  };
}

function runCommand(commandName, args) {
  const command = COMMANDS[commandName];
  if (!command) {
    throw new Error(`Unknown command: ${commandName}`);
  }
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, command.script), ...args],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: commandName === 'setup' || commandName === 'install'
        ? 'inherit'
        : commandName === 'memory'
          ? ['inherit', 'pipe', 'pipe']
          : ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    }
  );

  if (result.error) {
    throw result.error;
  }

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (typeof result.status === 'number') {
    return result.status;
  }

  if (result.signal) {
    throw new Error(`Command "${commandName}" terminated by signal ${result.signal}`);
  }

  return 1;
}

function main() {
  try {
    const resolution = resolveCommand(process.argv);

    if (resolution.mode === 'help') {
      showHelp(0);
    }

    if (resolution.mode === 'help-command') {
      if (!resolution.command) {
        showHelp(0);
      }

      if (!COMMANDS[resolution.command]) {
        throw new Error(`Unknown command: ${resolution.command}`);
      }

      process.exitCode = runCommand(resolution.command, ['--help']);
      return;
    }

    process.exitCode = runCommand(resolution.command, resolution.args);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
