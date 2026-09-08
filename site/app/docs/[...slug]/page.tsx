import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { Markdown, MissingContent } from '@/components/markdown';
import { Breadcrumbs, PrevNext, TableOfContents } from '@/components/page-parts';
import {
  extractHeadings,
  getDocBody,
  getDocBySlug,
  getDocEntries,
  getDocNeighbors,
} from '@/lib/content';

export const dynamicParams = false;

export function generateStaticParams() {
  return getDocEntries().map((entry) => ({ slug: entry.slug }));
}

type Props = { params: Promise<{ slug: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = getDocBySlug(slug);
  if (!entry) return { title: 'Not found' };
  return {
    title: entry.title,
    description: entry.description || undefined,
  };
}

export default async function DocPage({ params }: Props) {
  const { slug } = await params;
  const entry = getDocBySlug(slug);
  if (!entry) notFound();

  const { content, missing } = getDocBody(entry);
  const headings = extractHeadings(content);
  const { prev, next } = getDocNeighbors(slug);

  const crumbs = [
    { href: '/', label: 'FORGE' },
    { href: '/docs', label: 'Docs' },
    ...(entry.group !== 'Reference' ? [{ label: entry.group }] : []),
    { label: entry.title },
  ];

  return (
    <>
      <article className="docs-content">
        <Breadcrumbs items={crumbs} />

        <div className="page-head">
          <h1 className="t-h1 u-wrap">{entry.title}</h1>
          {entry.description ? <p className="t-lead">{entry.description}</p> : null}
          <div className="page-meta">
            {entry.repoPath ? (
              <span className="t-mono u-wrap">{entry.repoPath}</span>
            ) : (
              <span className="t-mono">written by the site</span>
            )}
            <span>{entry.group}</span>
          </div>
        </div>

        {missing || content.trim().length === 0 ? (
          <MissingContent repoPath={entry.repoPath} />
        ) : (
          <Markdown content={content} sourcePath={entry.repoPath} />
        )}

        <PrevNext
          prev={prev ? { href: prev.href, title: prev.title } : undefined}
          next={next ? { href: next.href, title: next.title } : undefined}
        />
      </article>

      <TableOfContents headings={headings} />
    </>
  );
}
