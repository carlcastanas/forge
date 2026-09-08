/**
 * Build-time content pipeline.
 *
 * Everything here reads the parent repository directly. Nothing is copied into
 * site/. Sibling agents write into ../docs, ../guides, ../skills and ../README.md
 * while this builds, so every filesystem call is guarded: a missing directory or a
 * file that vanishes mid-read yields an empty result, never a thrown build.
 */
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

export const REPO_ROOT = path.resolve(process.cwd(), '..');

/** Translated doc trees are excluded from the English site. */
const EXCLUDED_DOC_DIRS = new Set([
  'pt-BR',
  'zh-CN',
  'zh-TW',
  'ja-JP',
  'ko-KR',
  'tr',
  'ru',
  'vi-VN',
  'th',
  'de-DE',
  'es',
  'uk-UA',
  'ur',
  'node_modules',
  '.git',
]);

/** Root-level markdown that belongs in the docs tree as "Project". */
const ROOT_PROJECT_PAGES = [
  'README.md',
  'AGENTS.md',
  'CLAUDE.md',
  'SOUL.md',
  'RULES.md',
  'COMMANDS-QUICK-REF.md',
  'WORKING-CONTEXT.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'CODE_OF_CONDUCT.md',
  'TROUBLESHOOTING.md',
  'CHANGELOG.md',
];

/** Preferred ordering inside the docs/ reference group. Unlisted files sort after. */
const DOCS_ORDER = [
  'INSTALLATION.md',
  'CONFIGURATION.md',
  'CLI-REFERENCE.md',
  'CONCEPTS.md',
  'GLOSSARY.md',
  'FAQ.md',
  'ANTI-PATTERNS.md',
  'SKILL-AUTHORING.md',
  'AGENT-AUTHORING.md',
  'HOOKS-GUIDE.md',
  'RULES-GUIDE.md',
  'MEMORY-GUIDE.md',
  'MCP-GUIDE.md',
  'ORCHESTRATION-PATTERNS.md',
  'CONTEXT-ENGINEERING.md',
  'EVALUATION-GUIDE.md',
  'COST-AND-MODEL-ROUTING.md',
  'THREAT-MODEL.md',
  'HARNESS-MATRIX.md',
  'TEAM-ADOPTION.md',
  'RECIPES.md',
];

/** Preferred ordering for the guides reading order. Unlisted guides sort after. */
const GUIDES_ORDER = [
  'getting-started.md',
  'the-field-guide.md',
  'the-complete-guide.md',
  'the-orchestration-guide.md',
  'the-context-guide.md',
  'the-evaluation-guide.md',
  'the-security-guide.md',
  'the-migration-guide.md',
];

/* -------------------------------------------------------------------------- */
/* Defensive filesystem helpers                                               */
/* -------------------------------------------------------------------------- */

function safeReadDir(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function safeReadFile(file: string): string | null {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) return null;
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function isDir(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function isFile(target: string): boolean {
  try {
    return fs.statSync(target).isFile();
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Parsing helpers                                                            */
/* -------------------------------------------------------------------------- */

export type ParsedFile = {
  data: Record<string, unknown>;
  content: string;
};

function parse(raw: string): ParsedFile {
  try {
    const parsed = matter(raw);
    return { data: (parsed.data ?? {}) as Record<string, unknown>, content: parsed.content };
  } catch {
    // Malformed YAML frontmatter must not stop the build; fall back to raw body.
    return { data: {}, content: raw };
  }
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

/** Strips inline markdown so a description reads cleanly in a card. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
    .replace(/[*_~>#]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstHeading(content: string): string | undefined {
  const match = content.match(/^\s{0,3}#\s+(.+?)\s*$/m);
  return match ? plainText(match[1]) : undefined;
}

/** First real paragraph, skipping headings, badges, images and blockquotes. */
function firstParagraph(content: string): string | undefined {
  const body = content.replace(/^```[\s\S]*?```$/gm, '');
  const blocks = body.split(/\n\s*\n/);
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (/^#{1,6}\s/.test(trimmed)) continue;
    if (/^[>|]/.test(trimmed)) continue;
    if (/^[-*+]\s/.test(trimmed)) continue;
    if (/^\d+\.\s/.test(trimmed)) continue;
    if (/^!\[/.test(trimmed)) continue;
    if (/^<!--/.test(trimmed)) continue;
    if (/^-{3,}$/.test(trimmed)) continue;
    const text = plainText(trimmed);
    if (text.length < 12) continue;
    return text;
  }
  return undefined;
}

export function truncate(text: string, max = 180): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 60 ? lastSpace : max).trimEnd()}...`;
}

function humanize(basename: string): string {
  const cleaned = basename.replace(/\.md$/i, '').replace(/[-_]+/g, ' ').trim();
  if (!cleaned) return 'Untitled';
  if (cleaned === cleaned.toUpperCase() && cleaned.length <= 5) return cleaned;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

export function slugSegment(value: string): string {
  return value
    .replace(/\.md$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function readingMinutes(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

/* -------------------------------------------------------------------------- */
/* Headings / table of contents                                               */
/* -------------------------------------------------------------------------- */

export type Heading = { depth: 2 | 3; text: string; id: string };

/**
 * Extracts h2/h3 headings, skipping fenced code. Ids match rehype-slug, which uses
 * github-slugger, so the same slugger instance order is reproduced here.
 */
export function extractHeadings(content: string): Heading[] {
  const lines = content.split('\n');
  const headings: Heading[] = [];
  const seen = new Map<string, number>();
  let inFence = false;
  let fenceMarker = '';

  for (const line of lines) {
    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[1][0];
      } else if (fence[1][0] === fenceMarker) {
        inFence = false;
      }
      continue;
    }
    if (inFence) continue;

    const match = line.match(/^\s{0,3}(#{2,3})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;

    const depth = match[1].length === 2 ? 2 : 3;
    const text = plainText(match[2]);
    if (!text) continue;

    const base =
      text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .trim()
        .replace(/\s+/g, '-') || 'section';

    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count}`;

    headings.push({ depth: depth as 2 | 3, text, id });
  }

  return headings;
}

/* -------------------------------------------------------------------------- */
/* Docs                                                                       */
/* -------------------------------------------------------------------------- */

export type DocEntry = {
  slug: string[];
  href: string;
  title: string;
  description: string;
  /** Path relative to the repo root, e.g. "docs/CONCEPTS.md". Empty for synthetic pages. */
  repoPath: string;
  group: string;
  order: number;
  /** Inline body for pages the site generates itself when the repo has none. */
  synthetic?: string;
};

function walkMarkdown(dir: string, relative = ''): string[] {
  const results: string[] = [];
  for (const entry of safeReadDir(dir)) {
    if (entry.name.startsWith('.')) continue;
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (EXCLUDED_DOC_DIRS.has(entry.name)) continue;
      results.push(...walkMarkdown(path.join(dir, entry.name), rel));
    } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
      results.push(rel);
    }
  }
  return results;
}

function groupLabel(dirParts: string[]): string {
  if (dirParts.length === 0) return 'Reference';
  return dirParts
    .map((part) => part.replace(/[-_]+/g, ' '))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' / ');
}

const GROUP_ORDER = ['Project', 'Reference'];

let docsCache: DocEntry[] | null = null;

export function getDocEntries(): DocEntry[] {
  if (docsCache) return docsCache;

  const entries: DocEntry[] = [];
  const usedSlugs = new Set<string>();

  const claim = (parts: string[]): string[] => {
    const base = parts.filter(Boolean);
    let candidate = base.join('/');
    let n = 2;
    while (usedSlugs.has(candidate)) {
      candidate = [...base.slice(0, -1), `${base[base.length - 1]}-${n}`].join('/');
      n += 1;
    }
    usedSlugs.add(candidate);
    return candidate.split('/');
  };

  // 1. Root project pages.
  for (const [index, name] of ROOT_PROJECT_PAGES.entries()) {
    const abs = path.join(REPO_ROOT, name);
    const raw = safeReadFile(abs);
    if (raw === null) continue;
    const { data, content } = parse(raw);
    const slug = claim(['project', slugSegment(name)]);
    entries.push({
      slug,
      href: `/docs/${slug.join('/')}`,
      title: asString(data.title) ?? firstHeading(content) ?? humanize(name),
      description: truncate(asString(data.description) ?? firstParagraph(content) ?? ''),
      repoPath: name,
      group: 'Project',
      order: index,
    });
  }

  // 2. Everything under docs/, minus translations and the index.
  const docsDir = path.join(REPO_ROOT, 'docs');
  const files = walkMarkdown(docsDir).sort((a, b) => a.localeCompare(b));

  for (const rel of files) {
    if (rel.toLowerCase() === 'readme.md') continue; // rendered as the /docs intro
    const abs = path.join(docsDir, rel);
    const raw = safeReadFile(abs);
    if (raw === null) continue;
    const { data, content } = parse(raw);

    const parts = rel.split('/');
    const filename = parts[parts.length - 1];
    const dirParts = parts.slice(0, -1);
    const slug = claim([...dirParts.map(slugSegment), slugSegment(filename)]);
    const orderIndex = dirParts.length === 0 ? DOCS_ORDER.indexOf(filename) : -1;

    entries.push({
      slug,
      href: `/docs/${slug.join('/')}`,
      title: asString(data.title) ?? firstHeading(content) ?? humanize(filename),
      description: truncate(asString(data.description) ?? firstParagraph(content) ?? ''),
      repoPath: `docs/${rel}`,
      group: groupLabel(dirParts),
      order: orderIndex === -1 ? 1000 : orderIndex,
    });
  }

  // 3. The landing page links to /docs/getting-started. If the repository has not
  //    (yet) produced that file, the site supplies its own so the CTA never 404s.
  if (!usedSlugs.has('getting-started')) {
    entries.push({
      slug: ['getting-started'],
      href: '/docs/getting-started',
      title: 'Getting started',
      description: 'Install FORGE, confirm the catalog loaded, and run the loop once end to end.',
      repoPath: '',
      group: 'Reference',
      order: -1,
      synthetic: GETTING_STARTED_FALLBACK,
    });
  }

  entries.sort((a, b) => {
    const ga = GROUP_ORDER.indexOf(a.group);
    const gb = GROUP_ORDER.indexOf(b.group);
    const rankA = ga === -1 ? GROUP_ORDER.length : ga;
    const rankB = gb === -1 ? GROUP_ORDER.length : gb;
    if (rankA !== rankB) return rankA - rankB;
    if (a.group !== b.group) return a.group.localeCompare(b.group);
    if (a.order !== b.order) return a.order - b.order;
    return a.title.localeCompare(b.title);
  });

  docsCache = entries;
  return entries;
}

export type DocGroup = { label: string; items: DocEntry[] };

export function getDocGroups(): DocGroup[] {
  const groups: DocGroup[] = [];
  for (const entry of getDocEntries()) {
    const existing = groups.find((group) => group.label === entry.group);
    if (existing) existing.items.push(entry);
    else groups.push({ label: entry.group, items: [entry] });
  }
  return groups;
}

export function getDocBySlug(slug: string[]): DocEntry | undefined {
  const key = slug.join('/');
  return getDocEntries().find((entry) => entry.slug.join('/') === key);
}

export function getDocNeighbors(slug: string[]): { prev?: DocEntry; next?: DocEntry } {
  const entries = getDocEntries();
  const key = slug.join('/');
  const index = entries.findIndex((entry) => entry.slug.join('/') === key);
  if (index === -1) return {};
  return { prev: entries[index - 1], next: entries[index + 1] };
}

/** Body of a doc page: either the repo file or the site's own fallback. */
export function getDocBody(entry: DocEntry): { content: string; missing: boolean } {
  if (entry.synthetic) return { content: entry.synthetic, missing: false };
  const raw = safeReadFile(path.join(REPO_ROOT, entry.repoPath));
  if (raw === null) return { content: '', missing: true };
  return { content: parse(raw).content, missing: false };
}

/** The docs index intro, taken from docs/README.md when it exists. */
export function getDocsIndexIntro(): string | null {
  const raw = safeReadFile(path.join(REPO_ROOT, 'docs', 'README.md'));
  if (raw === null) return null;
  const body = parse(raw).content.trim();
  return body.length > 0 ? body : null;
}

/* -------------------------------------------------------------------------- */
/* Guides                                                                     */
/* -------------------------------------------------------------------------- */

export type GuideEntry = {
  slug: string;
  href: string;
  title: string;
  description: string;
  repoPath: string;
  minutes: number;
  words: number;
  order: number;
};

let guidesCache: GuideEntry[] | null = null;

export function getGuides(): GuideEntry[] {
  if (guidesCache) return guidesCache;

  const dir = path.join(REPO_ROOT, 'guides');
  const entries: GuideEntry[] = [];
  const used = new Set<string>();

  for (const dirent of safeReadDir(dir)) {
    if (!dirent.isFile() || !/\.md$/i.test(dirent.name)) continue;
    if (dirent.name.toLowerCase() === 'readme.md') continue;

    const raw = safeReadFile(path.join(dir, dirent.name));
    if (raw === null) continue;
    const { data, content } = parse(raw);

    let slug = slugSegment(dirent.name);
    let n = 2;
    while (used.has(slug)) {
      slug = `${slugSegment(dirent.name)}-${n}`;
      n += 1;
    }
    used.add(slug);

    const words = content.trim().split(/\s+/).filter(Boolean).length;
    const orderIndex = GUIDES_ORDER.indexOf(dirent.name);

    entries.push({
      slug,
      href: `/guides/${slug}`,
      title: asString(data.title) ?? firstHeading(content) ?? humanize(dirent.name),
      description: truncate(asString(data.description) ?? firstParagraph(content) ?? '', 200),
      repoPath: `guides/${dirent.name}`,
      minutes: Math.max(1, Math.round(words / 220)),
      words,
      order: orderIndex === -1 ? 1000 : orderIndex,
    });
  }

  entries.sort((a, b) => (a.order !== b.order ? a.order - b.order : a.title.localeCompare(b.title)));
  guidesCache = entries;
  return entries;
}

export function getGuideBySlug(slug: string): GuideEntry | undefined {
  return getGuides().find((guide) => guide.slug === slug);
}

export function getGuideBody(entry: GuideEntry): { content: string; missing: boolean } {
  const raw = safeReadFile(path.join(REPO_ROOT, entry.repoPath));
  if (raw === null) return { content: '', missing: true };
  return { content: parse(raw).content, missing: false };
}

export function getGuideNeighbors(slug: string): { prev?: GuideEntry; next?: GuideEntry } {
  const guides = getGuides();
  const index = guides.findIndex((guide) => guide.slug === slug);
  if (index === -1) return {};
  return { prev: guides[index - 1], next: guides[index + 1] };
}

export function getGuidesIndexIntro(): string | null {
  const raw = safeReadFile(path.join(REPO_ROOT, 'guides', 'README.md'));
  if (raw === null) return null;
  const body = parse(raw).content.trim();
  return body.length > 0 ? body : null;
}

/* -------------------------------------------------------------------------- */
/* Skills                                                                     */
/* -------------------------------------------------------------------------- */

export type SkillEntry = {
  name: string;
  title: string;
  description: string;
  category: string;
  origin: string;
  tools: string[];
  repoPath: string;
  extraFiles: number;
};

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

let skillsCache: SkillEntry[] | null = null;

export function getSkills(): SkillEntry[] {
  if (skillsCache) return skillsCache;

  const dir = path.join(REPO_ROOT, 'skills');
  const raw: Omit<SkillEntry, 'category'>[] = [];

  for (const dirent of safeReadDir(dir)) {
    if (!dirent.isDirectory() || dirent.name.startsWith('.')) continue;
    const skillDir = path.join(dir, dirent.name);
    const file = path.join(skillDir, 'SKILL.md');
    const text = safeReadFile(file);
    if (text === null) continue;

    const { data, content } = parse(text);
    const metadata = (data.metadata ?? {}) as Record<string, unknown>;

    raw.push({
      name: dirent.name,
      title: asString(data.name) ?? dirent.name,
      description: truncate(
        asString(data.description) ?? firstParagraph(content) ?? 'No description provided.',
        260,
      ),
      origin: asString(data.origin) ?? asString(metadata.origin) ?? 'unknown',
      tools: toStringList(data.tools ?? data['allowed-tools']),
      repoPath: `skills/${dirent.name}/SKILL.md`,
      extraFiles: safeReadDir(skillDir).filter(
        (child) => child.isFile() && child.name !== 'SKILL.md',
      ).length,
    });
  }

  // Categories are derived from the skill names: the leading token becomes a
  // category once enough skills share it, everything else falls into "other".
  const tokenCounts = new Map<string, number>();
  for (const skill of raw) {
    const token = skill.name.split('-')[0];
    tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
  }

  const skills: SkillEntry[] = raw
    .map((skill) => {
      const token = skill.name.split('-')[0];
      const count = tokenCounts.get(token) ?? 0;
      return { ...skill, category: count >= 4 ? token : 'other' };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  skillsCache = skills;
  return skills;
}

export function getSkillByName(name: string): SkillEntry | undefined {
  return getSkills().find((skill) => skill.name === name);
}

export function getSkillBody(entry: SkillEntry): { content: string; missing: boolean } {
  const raw = safeReadFile(path.join(REPO_ROOT, entry.repoPath));
  if (raw === null) return { content: '', missing: true };
  return { content: parse(raw).content, missing: false };
}

export type CategoryCount = { name: string; count: number };

export function getSkillCategories(): CategoryCount[] {
  const counts = new Map<string, number>();
  for (const skill of getSkills()) {
    counts.set(skill.category, (counts.get(skill.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      if (a.name === 'other') return 1;
      if (b.name === 'other') return -1;
      if (a.count !== b.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    });
}

/* -------------------------------------------------------------------------- */
/* Agents                                                                     */
/* -------------------------------------------------------------------------- */

export type AgentEntry = {
  name: string;
  description: string;
  model: string;
  tools: string[];
  repoPath: string;
};

let agentsCache: AgentEntry[] | null = null;

export function getAgents(): AgentEntry[] {
  if (agentsCache) return agentsCache;

  const dir = path.join(REPO_ROOT, 'agents');
  const agents: AgentEntry[] = [];

  for (const dirent of safeReadDir(dir)) {
    if (!dirent.isFile() || !/\.md$/i.test(dirent.name)) continue;
    if (dirent.name.toLowerCase() === 'readme.md') continue;

    const raw = safeReadFile(path.join(dir, dirent.name));
    if (raw === null) continue;
    const { data, content } = parse(raw);

    agents.push({
      name: asString(data.name) ?? dirent.name.replace(/\.md$/i, ''),
      description: truncate(asString(data.description) ?? firstParagraph(content) ?? '', 240),
      model: (asString(data.model) ?? 'unspecified').toLowerCase(),
      tools: toStringList(data.tools),
      repoPath: `agents/${dirent.name}`,
    });
  }

  agents.sort((a, b) => a.name.localeCompare(b.name));
  agentsCache = agents;
  return agents;
}

export function getAgentModels(): CategoryCount[] {
  const counts = new Map<string, number>();
  for (const agent of getAgents()) counts.set(agent.model, (counts.get(agent.model) ?? 0) + 1);
  const rank = ['opus', 'sonnet', 'haiku'];
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      const ra = rank.indexOf(a.name);
      const rb = rank.indexOf(b.name);
      if (ra !== rb) return (ra === -1 ? rank.length : ra) - (rb === -1 ? rank.length : rb);
      return a.name.localeCompare(b.name);
    });
}

/* -------------------------------------------------------------------------- */
/* Commands                                                                   */
/* -------------------------------------------------------------------------- */

export type CommandEntry = {
  name: string;
  description: string;
  argumentHint?: string;
  agent?: string;
  /** Name of the skill this shim fronts, when one exists in ../skills. */
  skill?: string;
  domain: string;
  repoPath: string;
};

/** Domain buckets. First matching prefix wins; the rest fall into General. */
const COMMAND_DOMAINS: { label: string; test: (name: string) => boolean }[] = [
  { label: 'Epics and planning', test: (n) => n.startsWith('epic-') || n === 'plan' || n === 'spec' },
  { label: 'Review', test: (n) => n.includes('review') },
  { label: 'Build and fix', test: (n) => n.includes('build') || n.includes('fix') },
  { label: 'Testing', test: (n) => n.includes('test') || n.includes('tdd') || n.includes('e2e') },
  { label: 'Security', test: (n) => n.includes('security') || n.includes('shield') || n.includes('audit') },
  { label: 'Memory and context', test: (n) => n.includes('memory') || n.includes('context') || n.includes('checkpoint') || n.includes('session') },
  { label: 'Docs', test: (n) => n.includes('doc') || n.includes('readme') || n.includes('changelog') },
  { label: 'Git and releases', test: (n) => n.includes('commit') || n.includes('pr') || n.includes('release') || n.includes('git') },
  { label: 'Cost and models', test: (n) => n.includes('cost') || n.includes('model') || n.includes('token') },
  { label: 'Orchestration', test: (n) => n.includes('swarm') || n.includes('parallel') || n.includes('wave') || n.includes('loop') || n.includes('orchestr') },
];

let commandsCache: CommandEntry[] | null = null;

export function getCommands(): CommandEntry[] {
  if (commandsCache) return commandsCache;

  const dir = path.join(REPO_ROOT, 'commands');
  const skillNames = new Set(getSkills().map((skill) => skill.name));
  const commands: CommandEntry[] = [];

  for (const dirent of safeReadDir(dir)) {
    if (!dirent.isFile() || !/\.md$/i.test(dirent.name)) continue;
    if (dirent.name.toLowerCase() === 'readme.md') continue;

    const raw = safeReadFile(path.join(dir, dirent.name));
    if (raw === null) continue;
    const { data, content } = parse(raw);

    const name = asString(data.name) ?? dirent.name.replace(/\.md$/i, '');

    // A shim usually fronts the identically named skill. When it does not, the
    // body normally references the skill directory it delegates to.
    let skill: string | undefined = skillNames.has(name) ? name : undefined;
    if (!skill) {
      const referenced = content.match(/skills\/([a-z0-9][a-z0-9-]*)/i);
      if (referenced && skillNames.has(referenced[1].toLowerCase())) {
        skill = referenced[1].toLowerCase();
      }
    }

    const domain = COMMAND_DOMAINS.find((entry) => entry.test(name))?.label ?? 'General';

    commands.push({
      name,
      description: truncate(asString(data.description) ?? firstParagraph(content) ?? '', 220),
      argumentHint: asString(data['argument-hint']),
      agent: asString(data.agent),
      skill,
      domain,
      repoPath: `commands/${dirent.name}`,
    });
  }

  commands.sort((a, b) => a.name.localeCompare(b.name));
  commandsCache = commands;
  return commands;
}

export type CommandGroup = { label: string; items: CommandEntry[] };

export function getCommandGroups(): CommandGroup[] {
  const order = [...COMMAND_DOMAINS.map((entry) => entry.label), 'General'];
  const groups = new Map<string, CommandEntry[]>();
  for (const command of getCommands()) {
    const bucket = groups.get(command.domain) ?? [];
    bucket.push(command);
    groups.set(command.domain, bucket);
  }
  return order
    .filter((label) => groups.has(label))
    .map((label) => ({ label, items: groups.get(label)! }));
}

/* -------------------------------------------------------------------------- */
/* Catalog counts — always counted, never written down                        */
/* -------------------------------------------------------------------------- */

export type Counts = {
  agents: number;
  skills: number;
  commands: number;
  rules: number;
  docs: number;
  guides: number;
  hooks: number;
  harnesses: number;
};

function countMarkdownRecursive(dir: string): number {
  let total = 0;
  for (const entry of safeReadDir(dir)) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) total += countMarkdownRecursive(path.join(dir, entry.name));
    else if (entry.isFile() && /\.md$/i.test(entry.name)) total += 1;
  }
  return total;
}

function countHooks(): number {
  const file = path.join(REPO_ROOT, 'hooks', 'hooks.json');
  const raw = safeReadFile(file);
  if (raw === null) return 0;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const hooks = (parsed.hooks ?? parsed) as Record<string, unknown>;
    let total = 0;
    for (const value of Object.values(hooks)) {
      if (Array.isArray(value)) {
        for (const matcher of value) {
          const inner = (matcher as { hooks?: unknown[] })?.hooks;
          total += Array.isArray(inner) ? inner.length : 1;
        }
      }
    }
    return total;
  } catch {
    return 0;
  }
}

function countHarnessAdapters(): number {
  const known = [
    '.claude-plugin',
    '.codex',
    '.codex-plugin',
    '.cursor',
    '.gemini',
    '.opencode',
    '.zed',
    '.qwen',
    '.agents',
    '.trae',
    '.kiro',
  ];
  return known.filter((dir) => isDir(path.join(REPO_ROOT, dir))).length;
}

let countsCache: Counts | null = null;

export function getCounts(): Counts {
  if (countsCache) return countsCache;

  const rulesDir = path.join(REPO_ROOT, 'rules');

  countsCache = {
    agents: getAgents().length,
    skills: getSkills().length,
    commands: getCommands().length,
    rules: countMarkdownRecursive(rulesDir),
    docs: getDocEntries().length,
    guides: getGuides().length,
    hooks: countHooks(),
    harnesses: countHarnessAdapters(),
  };
  return countsCache;
}

/** Reads VERSION when present so the header chip is not a hardcoded string. */
export function getRepoVersion(fallback: string): string {
  const raw = safeReadFile(path.join(REPO_ROOT, 'VERSION'));
  const value = raw?.trim();
  return value && /^[\w.+-]+$/.test(value) ? value : fallback;
}

/* -------------------------------------------------------------------------- */
/* Link resolution for rendered markdown                                      */
/* -------------------------------------------------------------------------- */

const ROOT_PAGE_SLUGS = new Map(
  ROOT_PROJECT_PAGES.map((name) => [name.toLowerCase(), `/docs/project/${slugSegment(name)}`]),
);

/**
 * Turns a link written for the repository into a link that works on the site.
 * `fromRepoPath` is the repo-relative path of the file the link came from.
 */
export function resolveRepoLink(href: string, fromRepoPath: string): string {
  if (!href) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href; // absolute or mailto
  if (href.startsWith('//')) return href;
  if (href.startsWith('#')) return href;

  const [rawPath, hash] = href.split('#');
  const anchor = hash ? `#${hash}` : '';
  if (!rawPath) return href;

  const fromDir = fromRepoPath ? path.posix.dirname(fromRepoPath) : '.';
  const resolved = path.posix
    .normalize(path.posix.join(fromDir === '.' ? '' : fromDir, rawPath))
    .replace(/^\.\//, '');

  if (resolved.startsWith('..')) return href; // points outside the repo; leave it

  const lower = resolved.toLowerCase();

  if (lower.startsWith('assets/')) return `/${resolved}${anchor}`;

  if (lower.startsWith('skills/')) {
    const name = resolved.split('/')[1];
    if (name) return `/skills/${name}${anchor}`;
  }

  if (lower.startsWith('agents/') && lower.endsWith('.md')) {
    return `/agents${anchor || `#${slugSegment(path.posix.basename(resolved))}`}`;
  }

  if (lower.startsWith('commands/') && lower.endsWith('.md')) {
    return `/commands${anchor || `#${slugSegment(path.posix.basename(resolved))}`}`;
  }

  if (lower.startsWith('guides/') && lower.endsWith('.md')) {
    const slug = slugSegment(path.posix.basename(resolved));
    if (slug === 'readme') return `/guides${anchor}`;
    return `/guides/${slug}${anchor}`;
  }

  if (lower.startsWith('docs/') && lower.endsWith('.md')) {
    const rel = resolved.slice('docs/'.length);
    const parts = rel.split('/');
    if (parts[parts.length - 1].toLowerCase() === 'readme.md' && parts.length === 1) {
      return `/docs${anchor}`;
    }
    return `/docs/${parts.map(slugSegment).join('/')}${anchor}`;
  }

  if (!resolved.includes('/') && ROOT_PAGE_SLUGS.has(lower)) {
    return `${ROOT_PAGE_SLUGS.get(lower)!}${anchor}`;
  }

  // Anything else lives only in the repository.
  return `https://github.com/your-org/forge/blob/main/${resolved}${anchor}`;
}

/** Rewrites an image reference onto the mirrored public asset path. */
export function resolveRepoImage(src: string, fromRepoPath: string): string | null {
  if (!src) return null;
  if (/^https?:/i.test(src)) return src;
  if (src.startsWith('data:')) return src;

  const fromDir = fromRepoPath ? path.posix.dirname(fromRepoPath) : '.';
  const resolved = path.posix
    .normalize(path.posix.join(fromDir === '.' ? '' : fromDir, src))
    .replace(/^\.\//, '');

  if (!resolved.startsWith('assets/')) return null;
  // Only serve what the mirror actually produced.
  if (!isFile(path.join(process.cwd(), 'public', resolved))) return null;
  return `/${resolved}`;
}

/* -------------------------------------------------------------------------- */
/* Fallback content owned by the site                                         */
/* -------------------------------------------------------------------------- */

const GETTING_STARTED_FALLBACK = `# Getting started

This page covers the first twenty minutes with FORGE: installing it, confirming the
catalog loaded, and running the loop once from end to end. It is written by the site
and will be replaced automatically once the repository ships its own version.

Prerequisites: a supported coding agent (Claude Code is the primary target), Node 20
or newer, and a git repository you are willing to let an agent modify.

## Install

\`\`\`bash
npx forge-universal install
\`\`\`

The installer writes the catalog to \`~/.forge\` and registers the harness adapter for
whichever agents it detects. Nothing is installed globally into your project.

## Confirm the catalog loaded

\`\`\`bash
forge doctor
\`\`\`

The output lists how many skills, agents, commands, and rules the harness can see. If
a count reads zero, the adapter for that harness did not register; re-run the
installer with the harness named explicitly.

## Run the loop once

Ask your agent for a small, real change in a repository you control. The point is to
watch each stage fire, not to ship anything.

1. Plan. The planner writes the change down before touching a file.
2. Test. A failing test is added that describes the intended behaviour.
3. Implement. The smallest change that turns the test green.
4. Review. The diff is routed to the reviewer matching the stack.
5. Verify. Build, suite, and security scan run; the output is read, not skimmed.
6. Remember. What was learned is written to memory.
7. Improve. The result feeds back into the rules that produced it.

## Where to go next

- The concepts reference explains how skills, agents, commands, hooks, rules, and
  memory relate to each other.
- The skills catalog lists everything the agent can reach for.
- The agents table shows which reviewer owns which stack, and at which model tier.
`;
