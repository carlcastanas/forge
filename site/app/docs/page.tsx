import Link from 'next/link';
import type { Metadata } from 'next';

import { Markdown } from '@/components/markdown';
import { ArrowRightIcon } from '@/components/icons';
import { Breadcrumbs, EmptyState, TableOfContents } from '@/components/page-parts';
import { extractHeadings, getCounts, getDocGroups, getDocsIndexIntro } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Documentation',
  description:
    'Reference documentation for FORGE: installation, configuration, concepts, authoring contracts, and the platform support matrix.',
};

/** A stable anchor for each group, so the sidebar and the drawer can link to one. */
function groupId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default async function DocsIndexPage() {
  const groups = getDocGroups();
  const counts = getCounts();
  const intro = getDocsIndexIntro();
  const headings = intro ? extractHeadings(intro) : [];

  return (
    <>
      <div className="docs-content">
        <Breadcrumbs items={[{ href: '/', label: 'FORGE' }, { label: 'Docs' }]} />

        <div className="page-head">
          <h1 className="t-h1">Documentation</h1>
          <p className="t-lead">
            Look-up oriented reference for every part of the system. {counts.docs} pages, read
            straight from the repository at build time. For narrative, start-to-finish reading,
            use the <Link href="/guides">guides</Link> instead.
          </p>
        </div>

        {intro ? (
          <div className="mb-6">
            <Markdown content={intro} sourcePath="docs/README.md" />
          </div>
        ) : null}

        {groups.length === 0 ? (
          <EmptyState
            title="No documentation pages found"
            body="The site reads ../docs and the root project pages from the repository. Neither currently contains any markdown."
            action={
              <Link className="btn btn--sm" href="/guides">
                Read the guides instead
              </Link>
            }
          />
        ) : (
          groups.map((group) => (
            <section className="page-section" key={group.label} id={groupId(group.label)}>
              <h2 className="t-h3 page-section__head">
                {group.label}
                <span className="page-section__count">{group.items.length}</span>
              </h2>
              <div className="grid grid--2">
                {group.items.map((item) => (
                  <Link className="card" href={item.href} key={item.href}>
                    <h3 className="card__title">{item.title}</h3>
                    {item.description ? (
                      <p className="card__body u-clamp-3">{item.description}</p>
                    ) : (
                      <p className="card__body u-subtle">No summary yet.</p>
                    )}
                    <span className="card__foot">
                      Read
                      <ArrowRightIcon size={14} />
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <TableOfContents headings={headings} />
    </>
  );
}
