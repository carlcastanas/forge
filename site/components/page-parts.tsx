import type { ReactNode } from 'react';
import Link from 'next/link';

import { ArrowLeftIcon, ArrowRightIcon, SearchIcon } from '@/components/icons';
import type { Heading } from '@/lib/content';

/* --- Breadcrumbs --------------------------------------------------------- */

export type Crumb = { href?: string; label: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="breadcrumbs__item">
          {index > 0 ? (
            <span className="breadcrumbs__sep" aria-hidden="true">
              {' / '}
            </span>
          ) : null}
          {item.href ? <Link href={item.href}>{item.label}</Link> : <span>{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

/* --- On this page -------------------------------------------------------- */

export function TableOfContents({ headings }: { headings: Heading[] }) {
  if (headings.length < 2) return <div className="docs-toc" aria-hidden="true" />;

  return (
    <aside className="docs-toc">
      <nav aria-labelledby="toc-label">
        <p className="toc__label" id="toc-label">
          On this page
        </p>
        <ul className="toc__list">
          {headings.map((heading) => (
            <li key={heading.id}>
              <a
                href={`#${heading.id}`}
                className={heading.depth === 3 ? 'toc__link toc__link--3' : 'toc__link'}
              >
                {heading.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

/* --- Jump list ----------------------------------------------------------- */

export type JumpItem = { href: string; label: string };

/**
 * The hero aside on a long argument page. A hero that is copy on the left and
 * empty space on the right reads as an unfinished layout, and the most useful
 * thing to put in that space is the page's own contents: it answers where you
 * are and what to read next before the first scroll.
 */
export function JumpList({ items, label = 'On this page' }: { items: JumpItem[]; label?: string }) {
  if (items.length === 0) return null;

  return (
    <nav className="jump" aria-label={label}>
      <p className="jump__label">{label}</p>
      <ul className="jump__list">
        {items.map((item) => (
          <li key={item.href}>
            <a className="jump__link" href={item.href}>
              <span>{item.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* --- Prev / next --------------------------------------------------------- */

export type Neighbor = { href: string; title: string };

export function PrevNext({ prev, next }: { prev?: Neighbor; next?: Neighbor }) {
  if (!prev && !next) return null;

  return (
    <nav className="prev-next" aria-label="Page navigation">
      {prev ? (
        <Link href={prev.href} className="prev-next__link">
          <span className="prev-next__dir">
            <ArrowLeftIcon size={12} /> Previous
          </span>
          <span className="prev-next__title">{prev.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link href={next.href} className="prev-next__link prev-next__link--next">
          <span className="prev-next__dir">
            Next <ArrowRightIcon size={12} />
          </span>
          <span className="prev-next__title">{next.title}</span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

/* --- Section heading ----------------------------------------------------- */

export function SectionHead({
  eyebrow,
  title,
  lead,
  id,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  id?: string;
}) {
  return (
    <div className="section-head">
      {eyebrow ? <p className="t-eyebrow">{eyebrow}</p> : null}
      <h2 className="t-h2" id={id}>
        {title}
      </h2>
      {lead ? <p className="t-lead">{lead}</p> : null}
    </div>
  );
}

/* --- Wide table wrapper -------------------------------------------------- */

/**
 * Every wide table on the site goes through here, so every one of them scrolls
 * inside its own box rather than widening the page, is reachable from the
 * keyboard, and announces itself to a screen reader with the same wording.
 */
export function TableScroll({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label={label}>
      {children}
    </div>
  );
}

/* --- Empty state --------------------------------------------------------- */

/**
 * Nothing found is a state, not a failure. It reads as a quiet panel carrying
 * the reason and a way forward, never as an error banner.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon" aria-hidden="true">
        <SearchIcon size={20} />
      </span>
      <p className="empty-state__title">{title}</p>
      <p className="t-small">{body}</p>
      {action ? <div className="empty-state__actions">{action}</div> : null}
    </div>
  );
}
