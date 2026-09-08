'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { isWithinRoot, realpathNearestExisting } = require('../path-safety');

const CURRENT_PLUGIN_ID = 'forge@forge';

// FORGE has never shipped under another plugin id, so there is no legacy id to
// retire yet. The detection mechanism stays in place for the first rename: set
// FORGE_LEGACY_PLUGIN_IDS (comma or whitespace separated) to have setup and the
// scope migration refuse to run while a retired plugin id is still installed.
const LEGACY_PLUGIN_IDS = new Set();
const LEGACY_PLUGIN_IDS_ENV = 'FORGE_LEGACY_PLUGIN_IDS';

function resolveLegacyPluginIds(options = {}) {
  if (options.legacyPluginIds) {
    return new Set(
      [...options.legacyPluginIds]
        .map(id => String(id).trim())
        .filter(id => id.length > 0)
    );
  }

  const configured = options.env?.[LEGACY_PLUGIN_IDS_ENV]
    ?? process.env[LEGACY_PLUGIN_IDS_ENV];
  if (typeof configured !== 'string' || configured.trim() === '') {
    return new Set(LEGACY_PLUGIN_IDS);
  }

  return new Set(
    configured
      .split(/[\s,]+/)
      .map(id => id.trim())
      .filter(id => id.length > 0 && id !== CURRENT_PLUGIN_ID)
  );
}

function resolveClaudePaths(options = {}) {
  const homeDir = options.homeDir
    || process.env.HOME
    || process.env.USERPROFILE
    || os.homedir();
  const configDir = options.configDir
    || process.env.CLAUDE_CONFIG_DIR
    || path.join(homeDir, '.claude');
  const projectRoot = options.projectRoot || process.cwd();

  return {
    homeDir: path.resolve(homeDir),
    configDir: path.resolve(configDir),
    projectRoot: path.resolve(projectRoot),
  };
}

function readJsonObject(filePath, label) {
  let value;
  try {
    value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is invalid at ${filePath}: ${error.message}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is invalid at ${filePath}: expected a JSON object`);
  }
  return value;
}

function findManualClaudePlugin(options = {}) {
  const { configDir } = resolveClaudePaths(options);
  const pluginsDir = path.join(configDir, 'plugins');
  const candidates = [
    ['forge', '.claude-plugin', 'plugin.json'],
    ['forge', 'plugin.json'],
    ['forge@forge', '.claude-plugin', 'plugin.json'],
    ['forge@forge', 'plugin.json'],
  ];

  for (const segments of candidates) {
    const manifestPath = path.join(pluginsDir, ...segments);
    if (fs.existsSync(manifestPath)) {
      return {
        manifestPath,
        installPath: path.dirname(path.dirname(manifestPath)),
      };
    }
  }
  return null;
}

function validateManagedState(state, statePath, expectedRoot) {
  const selectedModules = state?.resolution?.selectedModules;
  const operations = state?.operations;
  if (
    state?.schemaVersion !== 'forge.install.v1'
    || !state.target
    || typeof state.target !== 'object'
    || Array.isArray(state.target)
    || !Array.isArray(selectedModules)
    || !selectedModules.every(moduleId => typeof moduleId === 'string' && moduleId.length > 0)
    || !Array.isArray(operations)
  ) {
    throw new Error(`Managed Claude install-state is invalid at ${statePath}`);
  }

  for (const operation of operations) {
    if (
      !operation
      || typeof operation !== 'object'
      || typeof operation.destinationPath !== 'string'
      || !path.isAbsolute(operation.destinationPath)
      || !isWithinRoot(operation.destinationPath, expectedRoot)
    ) {
      throw new Error(`Managed Claude install-state is invalid at ${statePath}`);
    }
  }

  return { selectedModules, operations };
}

function operationOverlapsPlugin(operation, expectedRoot) {
  const canonicalRoot = realpathNearestExisting(expectedRoot);
  const canonicalDestination = realpathNearestExisting(operation.destinationPath);
  const relativePath = path.relative(canonicalRoot, canonicalDestination);
  const firstSegment = relativePath.split(path.sep)[0];
  return ['agents', 'commands', 'hooks', 'skills'].includes(firstSegment);
}

function findManagedClaudeInstalls(options = {}) {
  const { configDir, projectRoot } = resolveClaudePaths(options);
  const candidates = [
    {
      statePath: path.join(configDir, 'forge', 'install-state.json'),
      expectedRoot: configDir,
    },
    {
      statePath: path.join(projectRoot, '.claude', 'forge', 'install-state.json'),
      expectedRoot: path.join(projectRoot, '.claude'),
    },
  ];
  const findings = [];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate.statePath)) continue;
    const state = readJsonObject(candidate.statePath, 'Managed Claude install-state');
    const { selectedModules, operations } = validateManagedState(
      state,
      candidate.statePath,
      candidate.expectedRoot
    );
    const modulesOverlap = selectedModules.some(moduleId => moduleId !== 'rules-core');
    const operationsOverlap = operations.some(operation => (
      operationOverlapsPlugin(operation, candidate.expectedRoot)
    ));
    findings.push({
      statePath: candidate.statePath,
      selectedModules: [...selectedModules],
      overlapsPlugin: modulesOverlap || operationsOverlap,
    });
  }

  return findings;
}

module.exports = {
  CURRENT_PLUGIN_ID,
  LEGACY_PLUGIN_IDS,
  LEGACY_PLUGIN_IDS_ENV,
  resolveLegacyPluginIds,
  findManagedClaudeInstalls,
  findManualClaudePlugin,
  resolveClaudePaths,
};
