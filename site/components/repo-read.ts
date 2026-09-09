/**
 * Build-time helpers for the landing page sections that need to look at the
 * repository itself rather than at the catalog indexes in `lib/content.ts`.
 *
 * Every call is guarded the same way the content pipeline is: sibling agents
 * write into the parent repository while this builds, so a missing file or a
 * directory that disappears mid-walk yields an empty result instead of a
 * thrown build.
 */
import fs from 'node:fs';
import path from 'node:path';

import { REPO_ROOT } from '@/lib/content';

/** Reads a repo-relative file, or null when it is absent or unreadable. */
export function readRepoFile(relativePath: string): string | null {
  try {
    const target = path.join(REPO_ROOT, relativePath);
    if (!fs.statSync(target).isFile()) return null;
    return fs.readFileSync(target, 'utf8');
  } catch {
    return null;
  }
}

export type DirStats = {
  /** Number of files counted. */
  files: number;
  /** Number of immediate subdirectories. */
  dirs: number;
  /** Total bytes of the counted files. */
  bytes: number;
};

const EMPTY: DirStats = { files: 0, dirs: 0, bytes: 0 };

/**
 * Walks a repo-relative directory and totals its files. Dot-entries are skipped
 * so an adapter directory nested under a counted tree cannot inflate the figure.
 */
export function dirStats(relativePath: string, match?: RegExp): DirStats {
  const root = path.join(REPO_ROOT, relativePath);

  let files = 0;
  let dirs = 0;
  let bytes = 0;

  const walk = (dir: string, depth: number): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (depth === 0) dirs += 1;
        walk(full, depth + 1);
        continue;
      }

      if (!entry.isFile()) continue;
      if (match && !match.test(entry.name)) continue;

      files += 1;
      try {
        bytes += fs.statSync(full).size;
      } catch {
        // A file that vanished between readdir and stat contributes nothing.
      }
    }
  };

  try {
    if (!fs.statSync(root).isDirectory()) return EMPTY;
  } catch {
    return EMPTY;
  }

  walk(root, 0);
  return { files, dirs, bytes };
}

/** Human-readable size. Kept to whole KB / one decimal MB so it reads as an estimate. */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1000) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
