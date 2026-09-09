import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { ClockIcon } from '@/components/icons';
import { Markdown, MissingContent } from '@/components/markdown';
import { Breadcrumbs, PrevNext, TableOfContents } from '@/components/page-parts';
import {
  extractHeadings,
  getGuideBody,
  getGuideBySlug,
  getGuideNeighbors,
  getGuides,
} from '@/lib/content';

export const dynamicParams = false;

export function generateStaticParams() {
  return getGuides().map((guide) => ({ slug: guide.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);
  if (!guide) return { title: 'Not found' };
  return { title: guide.title, description: guide.description || undefined };
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);
  if (!guide) notFound();

  const { content, missing } = getGuideBody(guide);
  const headings = extractHeadings(content);
  const { prev, next } = getGuideNeighbors(slug);

  return (
    <div className="container">
      <div className="article-layout">
        <article className="docs-content">
          <Breadcrumbs
            items={[
              { href: '/', label: 'FORGE' },
              { href: '/guides', label: 'Guides' },
              { label: guide.title },
            ]}
          />

          <div className="page-head">
            <h1 className="t-h1 u-wrap">{guide.title}</h1>
            {guide.declaredDescription && guide.description ? (
              <p className="t-lead">{guide.description}</p>
            ) : null}
            <div className="page-meta">
              <span>
                <ClockIcon size={13} /> {guide.minutes} min read
              </span>
              <span>{guide.words.toLocaleString('en-US')} words</span>
              <span className="t-mono u-wrap">{guide.repoPath}</span>
            </div>
          </div>

          {missing || content.trim().length === 0 ? (
            <MissingContent repoPath={guide.repoPath} />
          ) : (
            <Markdown content={content} sourcePath={guide.repoPath} />
          )}

          <PrevNext
            prev={prev ? { href: prev.href, title: prev.title } : undefined}
            next={next ? { href: next.href, title: next.title } : undefined}
          />
        </article>

        <TableOfContents headings={headings} />
      </div>
    </div>
  );
}
