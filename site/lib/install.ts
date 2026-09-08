/**
 * Build-time reader for the selective-install manifests.
 *
 * Everything on /install comes from the three files in ../manifests plus the
 * ../skills directory. Nothing is transcribed. The shapes exported here mirror
 * what scripts/lib/install-manifests.js loads at install time, including the
 * synthetic `skill:<id>` components that the real loader adds for every skill
 * directory, so the page can only ever offer flags the CLI already accepts.
 */
import fs from 'node:fs';
import path from 'node:path';

import { REPO_ROOT, getSkills, truncate } from '@/lib/content';

/* --- Types --------------------------------------------------------------- */

export type InstallModule = {
  id: string;
  kind: string;
  description: string;
  targets: string[];
  dependencies: string[];
  /** Number of `skills/<name>` paths this module materializes. */
  skillCount: number;
  /** Total number of source paths the module copies. */
  pathCount: number;
  cost: string;
  stability: string;
  synthetic: boolean;
};

export type InstallComponent = {
  id: string;
  family: string;
  description: string;
  modules: string[];
  synthetic: boolean;
};

export type InstallProfile = {
  id: string;
  description: string;
  modules: string[];
  /** Component IDs fully covered by the profile's resolved module set. */
  componentIds: string[];
  skillCount: number;
  moduleCount: number;
};

export type InstallTarget = {
  id: string;
  description: string;
  isDefault: boolean;
  /** Modules from the manifests that declare support for this target. */
  moduleCount: number;
};

export type InstallFamily = {
  id: string;
  label: string;
  prefix: string;
  count: number;
};

export type InstallData = {
  profiles: InstallProfile[];
  modules: InstallModule[];
  components: InstallComponent[];
  targets: InstallTarget[];
  families: InstallFamily[];
  hookProfiles: string[];
  hookRuntimeModuleId: string;
  defaultHookProfile: string;
  totals: {
    skills: number;
    components: number;
    modules: number;
    profiles: number;
    targets: number;
  };
};

/* --- Raw manifest shapes ------------------------------------------------- */

type RawModule = {
  id: string;
  kind?: string;
  description?: string;
  paths?: string[];
  targets?: string[];
  dependencies?: string[];
  cost?: string;
  stability?: string;
};

type RawComponent = {
  id: string;
  family?: string;
  description?: string;
  modules?: string[];
};

type RawProfile = { description?: string; modules?: string[] };

const MANIFEST_DIR = path.join(REPO_ROOT, 'manifests');

/** A manifest that fails to parse yields an empty catalog rather than a dead build. */
function readManifest<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(MANIFEST_DIR, file), 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function listSkillDirectoryIds(): string[] {
  try {
    return fs
      .readdirSync(path.join(REPO_ROOT, 'skills'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * The `Targets:` block of scripts/install-apply.js is the CLI's own description of
 * what `--target` accepts. Reading it keeps this page from drifting away from the
 * help text a reader would see in their terminal.
 */
function readTargetHelp(): { id: string; description: string; isDefault: boolean }[] {
  let source = '';
  try {
    source = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'install-apply.js'), 'utf8');
  } catch {
    return [];
  }

  const block = source.match(/Targets:\n([\s\S]*?)\n\nOptions:/);
  if (!block) return [];

  const out: { id: string; description: string; isDefault: boolean }[] = [];
  for (const line of block[1].split('\n')) {
    const match = line.match(/^\s{2}([a-z][a-z0-9-]*)\s+(\(default\)\s*)?-\s+(.*)$/);
    if (match) {
      out.push({ id: match[1], description: match[3].trim(), isDefault: Boolean(match[2]) });
    }
  }
  return out;
}

/** `FORGE_HOOK_PROFILE=minimal|standard|strict`, read from the module that validates it. */
function readHookProfiles(): string[] {
  try {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'lib', 'hook-flags.js'), 'utf8');
    const match = source.match(/VALID_PROFILES\s*=\s*new Set\(\[([^\]]*)\]\)/);
    if (match) {
      const found = [...match[1].matchAll(/'([a-z]+)'/g)].map((entry) => entry[1]);
      if (found.length > 0) return found;
    }
  } catch {
    // Fall through to the documented default set.
  }
  return ['minimal', 'standard', 'strict'];
}

const FAMILY_LABELS: Record<string, string> = {
  baseline: 'Baseline',
  language: 'Languages',
  framework: 'Frameworks',
  capability: 'Capabilities',
  agent: 'Agents',
  skill: 'Skills',
  locale: 'Translated docs',
};

const FAMILY_PREFIXES: Record<string, string> = {
  baseline: 'baseline:',
  language: 'lang:',
  framework: 'framework:',
  capability: 'capability:',
  agent: 'agent:',
  skill: 'skill:',
  locale: 'locale:',
};

const FAMILY_ORDER = ['baseline', 'language', 'framework', 'capability', 'agent', 'skill', 'locale'];

/* --- Assembly ------------------------------------------------------------ */

let cached: InstallData | null = null;

export function getInstallData(): InstallData {
  if (cached) return cached;

  const rawModules = readManifest<{ modules?: RawModule[] }>('install-modules.json', {}).modules ?? [];
  const rawComponents =
    readManifest<{ components?: RawComponent[] }>('install-components.json', {}).components ?? [];
  const rawProfiles = readManifest<{ profiles?: Record<string, RawProfile> }>(
    'install-profiles.json',
    {},
  ).profiles ?? {};

  const skillDirs = listSkillDirectoryIds();
  const skillDirSet = new Set(skillDirs);
  const allTargetIds = [...new Set(rawModules.flatMap((module) => module.targets ?? []))];

  const modules: InstallModule[] = rawModules.map((module) => {
    const paths = module.paths ?? [];
    return {
      id: module.id,
      kind: module.kind ?? 'unknown',
      description: module.description ?? '',
      targets: module.targets ?? [],
      dependencies: module.dependencies ?? [],
      skillCount: paths.filter(
        (entry) => entry.startsWith('skills/') && skillDirSet.has(entry.slice('skills/'.length)),
      ).length,
      pathCount: paths.length,
      cost: module.cost ?? 'unknown',
      stability: module.stability ?? 'unknown',
      synthetic: false,
    };
  });

  const components: InstallComponent[] = rawComponents.map((component) => ({
    id: component.id,
    family: component.family ?? 'other',
    description: component.description ?? '',
    modules: component.modules ?? [],
    synthetic: false,
  }));

  // Mirror addSyntheticSkillComponents(): one module and one component per skill
  // directory that the hand-written manifests do not already cover.
  const moduleIds = new Set(modules.map((module) => module.id));
  const componentIds = new Set(components.map((component) => component.id));
  const skillDescriptions = new Map(
    getSkills().map((skill) => [skill.name, truncate(skill.description, 120)] as const),
  );

  for (const skillId of skillDirs) {
    const componentId = `skill:${skillId}`;
    if (componentIds.has(componentId)) continue;

    const moduleId = `skill-${skillId}`;
    if (!moduleIds.has(moduleId)) {
      modules.push({
        id: moduleId,
        kind: 'skills',
        description: `Single-skill install surface for ${skillId}.`,
        targets: allTargetIds.slice(),
        dependencies: [],
        skillCount: 1,
        pathCount: 1,
        cost: 'light',
        stability: 'stable',
        synthetic: true,
      });
      moduleIds.add(moduleId);
    }

    components.push({
      id: componentId,
      family: 'skill',
      description: skillDescriptions.get(skillId) ?? `Install only the ${skillId} skill directory.`,
      modules: [moduleId],
      synthetic: true,
    });
    componentIds.add(componentId);
  }

  const moduleById = new Map(modules.map((module) => [module.id, module] as const));

  /** Dependency closure, target-unfiltered. Profiles are described before a target is picked. */
  function closure(requested: string[]): Set<string> {
    const selected = new Set<string>();
    const walk = (id: string) => {
      if (selected.has(id)) return;
      const entry = moduleById.get(id);
      if (!entry) return;
      selected.add(id);
      entry.dependencies.forEach(walk);
    };
    requested.forEach(walk);
    return selected;
  }

  const profiles: InstallProfile[] = Object.entries(rawProfiles).map(([id, profile]) => {
    const requested = profile.modules ?? [];
    const resolved = closure(requested);
    return {
      id,
      description: profile.description ?? '',
      modules: requested,
      componentIds: components
        .filter(
          (component) =>
            component.modules.length > 0 &&
            component.modules.every((moduleId) => resolved.has(moduleId)),
        )
        .map((component) => component.id),
      skillCount: [...resolved].reduce(
        (total, moduleId) => total + (moduleById.get(moduleId)?.skillCount ?? 0),
        0,
      ),
      moduleCount: resolved.size,
    };
  });

  const targetHelp = readTargetHelp();
  const targets: InstallTarget[] = targetHelp
    .filter((entry) => allTargetIds.includes(entry.id))
    .map((entry) => ({
      ...entry,
      moduleCount: modules.filter((module) => !module.synthetic && module.targets.includes(entry.id))
        .length,
    }));

  const familyCounts = new Map<string, number>();
  for (const component of components) {
    familyCounts.set(component.family, (familyCounts.get(component.family) ?? 0) + 1);
  }

  const families: InstallFamily[] = [...familyCounts.entries()]
    .map(([id, count]) => ({
      id,
      label: FAMILY_LABELS[id] ?? id,
      prefix: FAMILY_PREFIXES[id] ?? `${id}:`,
      count,
    }))
    .sort((a, b) => {
      const ai = FAMILY_ORDER.indexOf(a.id);
      const bi = FAMILY_ORDER.indexOf(b.id);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

  cached = {
    profiles,
    modules,
    components,
    targets,
    families,
    hookProfiles: readHookProfiles(),
    hookRuntimeModuleId: 'hooks-runtime',
    defaultHookProfile: 'standard',
    totals: {
      skills: skillDirs.length,
      components: components.length,
      modules: modules.length,
      profiles: profiles.length,
      targets: targets.length,
    },
  };

  return cached;
}
