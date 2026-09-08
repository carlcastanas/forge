import Link from 'next/link';
import type { Metadata } from 'next';

import { ArrowRightIcon, CompassIcon } from '@/components/icons';

export const metadata: Metadata = {
  title: 'Page not found',
  description: 'That page does not exist on this site.',
};

export default function NotFound() {
  return (
    <div className="container">
      <div className="status-page">
        <span className="status-page__code">404</span>
        <h1 className="t-h1">That page is not here</h1>
        <p className="t-lead">
          The link may be stale, or the page it pointed at may have been renamed in the
          repository. Every page on this site is generated from markdown in the repo, so a
          renamed file changes its URL.
        </p>
        <div className="status-page__actions">
          <Link className="btn btn--primary" href="/docs">
            <CompassIcon size={16} />
            Browse the docs
          </Link>
          <Link className="btn" href="/skills">
            Search the skills catalog
            <ArrowRightIcon size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}
