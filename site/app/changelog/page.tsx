import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import type { Metadata } from 'next';

import { ArrowRightIcon } from '@/components/icons';
import { Markdown, MissingContent } from '@/components/markdown';
import { Breadcrumbs } from '@/components/page-parts';
import { REPO_ROOT } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Changelog',
  description: 'Release history for FORGE, rendered from the repository CHANGELOG.',
};

const REPO_PATH = 'CHANGELOG.md';

/**
 * Keep a Changelog leaves an `Unreleased` block standing with its six category
 * headings and nothing under any of them. Rendered as-is that is six headings
 * announcing no content, which reads as a broken page rather than as a quiet
 * one. Any heading whose section holds no prose is dropped, and a release left
 * holding only headings goes with it.
 */
export function dropEmptySections(markdown: string): string {
  const lines = markdown.split('\n');
  type Block = { level: number; heading: string | null; body: string[] };
  const blocks: Block[] = [{ level: 0, heading: null, body: [] }];
  let inFence = false;

  for (const line of lines) {
    if (/^\s{0,3}(```|~~~)/.test(line)) inFence = !inFence;
    const heading = inFence ? null : line.match(/^(#{2,6})\s+\S/);
    if (heading) {
      blocks.push({ level: heading[1].length, heading: line, body: [] });
    } else {
      blocks[blocks.length - 1].body.push(line);
    }
  }

  const hasContent = (index: number): boolean => {
    const block = blocks[index];
    if (block.body.some((line) => line.trim().length > 0)) return true;
    // A parent section counts as having content if any child section does.
    for (let i = index + 1; i < blocks.length; i += 1) {
      if (blocks[i].level <= block.level) break;
      if (blocks[i].body.some((line) => line.trim().length > 0)) return true;
    }
    return false;
  };

  const kept: string[] = [];
  blocks.forEach((block, index) => {
    if (block.heading !== null && !hasContent(index)) return;
    if (block.heading !== null) kept.push(block.heading);
    kept.push(...block.body);
  });

  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function readChangelog(): string | null {
  try {
    const raw = fs.readFileSync(path.join(REPO_ROOT, REPO_PATH), 'utf8');
    // The page supplies its own heading; drop the file's leading H1.
    return dropEmptySections(raw.replace(/^#\s+.*\r?\n+/, ''));
  } catch {
    return null;
  }
}

/** The release headings, so the page can say how many releases are recorded. */
function countReleases(body: string): number {
  return (body.match(/^##\s+(?!#)/gm) ?? []).length;
}

export default async function ChangelogPage() {
  const body = readChangelog();
  const releases = body ? countReleases(body) : 0;

  return (
    <div className="container">
      <article className="docs-content docs-content--prose">
        <Breadcrumbs items={[{ href: '/', label: 'FORGE' }, { label: 'Changelog' }]} />

        <div className="page-head">
          <h1 className="t-h1">Release history</h1>
          <p className="t-lead">
            Rendered straight from the repository changelog at build time, so this page and the
            file cannot drift apart. A release block with no entries under it is not shown.
          </p>
          <div className="page-meta">
            {releases > 0 ? (
              <span>
                {releases} {releases === 1 ? 'release' : 'releases'} recorded
              </span>
            ) : null}
            <span className="t-mono u-wrap">{REPO_PATH}</span>
          </div>
        </div>

        {body ? <Markdown content={body} sourcePath={REPO_PATH} /> : <MissingContent repoPath={REPO_PATH} />}

        <nav className="prev-next" aria-label="Page navigation">
          <Link href="/docs" className="prev-next__link">
            <span className="prev-next__dir">Reference</span>
            <span className="prev-next__title">Documentation</span>
          </Link>
          <Link href="/install" className="prev-next__link prev-next__link--next">
            <span className="prev-next__dir">
              Next <ArrowRightIcon size={12} />
            </span>
            <span className="prev-next__title">Build your install</span>
          </Link>
        </nav>
      </article>
    </div>
  );
}
