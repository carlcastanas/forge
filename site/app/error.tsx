'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Local only. Nothing is reported anywhere; this site sends no telemetry.
    console.error(error);
  }, [error]);

  return (
    <div className="container">
      <div className="status-page">
        <span className="status-page__code">Error</span>
        <h1 className="t-h1">Something failed while rendering this page</h1>
        <p className="t-lead">
          The failure is client side and was not reported anywhere. Reloading the view usually
          clears it; if it does not, the page below is a safe place to land.
        </p>
        {error.digest ? (
          <p className="t-small t-mono u-wrap">Digest: {error.digest}</p>
        ) : null}
        <div className="status-page__actions">
          <button type="button" className="btn btn--primary" onClick={reset}>
            Try again
          </button>
          <Link className="btn" href="/">
            Back to the overview
          </Link>
        </div>
      </div>
    </div>
  );
}
