import Link from 'next/link';
import type { Metadata } from 'next';

import { ArrowRightIcon, ClockIcon } from '@/components/icons';
import { Markdown } from '@/components/markdown';
import { Breadcrumbs, EmptyState } from '@/components/page-parts';
import { getGuides, getGuidesIndexIntro } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Guides',
  description:
    'Long-form guides for FORGE, written to be read start to finish: getting started, day-to-day practice, orchestration, context economics, evaluation, security, and migration.',
};

export default async function GuidesIndexPage() {
  const guides = getGuides();
  const intro = getGuidesIndexIntro();
  const totalMinutes = guides.reduce((sum, guide) => sum + guide.minutes, 0);

  return (
    <div className="container">
      <div className="docs-content">
        <Breadcrumbs items={[{ href: '/', label: 'FORGE' }, { label: 'Guides' }]} />

        <div className="page-head">
          <h1 className="t-h1">Guides</h1>
          <p className="t-lead">
            Narrative documentation, ordered as a reading list. Each guide assumes the one before
            it but does not repeat it. Reference material lives in the{' '}
            <Link href="/docs">docs</Link>.
          </p>
          {guides.length > 0 ? (
            <div className="page-meta">
              <span>
                {guides.length} {guides.length === 1 ? 'guide' : 'guides'}
              </span>
              <span>about {totalMinutes} minutes end to end</span>
              <span className="t-mono u-wrap">guides/&lt;name&gt;.md</span>
            </div>
          ) : null}
        </div>

        {/* The list first. A page called Guides answers "what is this" with the
            guides, not with two thousand pixels of reading advice about them;
            the repository's own notes on reading order follow underneath. */}
        {guides.length === 0 ? (
          <EmptyState
            title="No guides yet"
            body="The site reads ../guides/*.md from the repository. That directory currently has no markdown in it."
            action={
              <Link className="btn btn--sm" href="/docs">
                Read the reference docs
              </Link>
            }
          />
        ) : (
          <div className="grid grid--2">
            {guides.map((guide, index) => (
              <Link className="card" href={guide.href} key={guide.slug}>
                <span className="card__index">{String(index + 1).padStart(2, '0')}</span>
                <h2 className="card__title">{guide.title}</h2>
                <p className="card__body u-clamp-3">
                  {guide.description || 'No summary yet.'}
                </p>
                <span className="card__foot">
                  <ClockIcon size={14} />
                  {guide.minutes} min read
                  <ArrowRightIcon size={14} />
                </span>
              </Link>
            ))}
          </div>
        )}

        {intro ? (
          <div className="mt-6">
            <Markdown content={intro} sourcePath="guides/README.md" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
