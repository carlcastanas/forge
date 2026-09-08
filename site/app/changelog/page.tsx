import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';

import { Markdown, MissingContent } from '@/components/markdown';
import { REPO_ROOT } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Changelog',
  description: 'Release history for FORGE, rendered from the repository CHANGELOG.'
};

const REPO_PATH = 'CHANGELOG.md';

function readChangelog(): string | null {
  try {
    const raw = fs.readFileSync(path.join(REPO_ROOT, REPO_PATH), 'utf8');
    // The page supplies its own heading; drop the file's leading H1.
    return raw.replace(/^#\s+.*\r?\n+/, '');
  } catch {
    return null;
  }
}

export default async function ChangelogPage() {
  const body = readChangelog();

  return (
    <div className="container">
      <header className="page-head">
        <p className="page-meta">Changelog</p>
        <h1>Release history</h1>
        <p className="measure">
          Rendered directly from <code>CHANGELOG.md</code> in the repository, so this page and the source cannot drift apart.
        </p>
      </header>

      {body ? (
        <article className="prose">
          <Markdown content={body} sourcePath={REPO_PATH} />
        </article>
      ) : (
        <MissingContent repoPath={REPO_PATH} />
      )}
    </div>
  );
}
