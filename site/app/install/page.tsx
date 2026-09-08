import type { Metadata } from 'next';
import { Suspense } from 'react';

import { InstallBuilder, InstallBuilderSkeleton } from '@/components/install-builder';
import { Breadcrumbs, TableScroll } from '@/components/page-parts';
import { getInstallData } from '@/lib/install';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Build your install',
  description:
    'Assemble a FORGE install from the real selective-install manifests: a profile, a harness target, and the components you actually want. Copy the command the CLI accepts.',
};

/** Flags the parser accepts that this builder deliberately leaves to the terminal. */
const UNUSED_FLAGS = [
  {
    flag: '--modules <id,id>',
    note: 'Request module IDs directly instead of the components that map onto them.',
  },
  {
    flag: '--config <path>',
    note: 'Read the same intent from a checked-in forge-install.json.',
  },
  {
    flag: '--json',
    note: 'Emit the plan or the result as JSON. Pair it with --dry-run in CI.',
  },
  {
    flag: '--locale <code>',
    note: 'Shorthand for the locale components below. Only valid on claude and claude-project.',
  },
  {
    flag: '--guided',
    note: 'Run the interactive multi-harness wizard instead of a flag-driven install.',
  },
];

export default function InstallPage() {
  const data = getInstallData();

  return (
    <div className="container">
      <div className="docs-content">
        <Breadcrumbs items={[{ href: '/', label: SITE.name }, { label: 'Build your install' }]} />

        <div className="page-head">
          <h1 className="t-h1">Build your install</h1>
          <p className="t-lead">
            The catalog is {data.totals.skills} skills. Almost nobody wants all of them. This page
            reads the same three manifests the installer reads, so anything you assemble here is a
            command the CLI already accepts. Run it with --dry-run first and read the plan.
          </p>
          <div className="page-meta">
            <span>{data.totals.profiles} profiles</span>
            <span>{data.totals.targets} harness targets</span>
            <span>{data.totals.components} components</span>
            <span className="t-mono u-wrap">manifests/install-*.json</span>
          </div>
        </div>

        <Suspense fallback={<InstallBuilderSkeleton />}>
          <InstallBuilder data={data} />
        </Suspense>

        <section className="ib-reference" aria-labelledby="ib-reference-head">
          <h2 className="t-h3" id="ib-reference-head">
            Flags this page does not emit
          </h2>
          <p className="t-small u-muted">
            The parser in scripts/lib/install/request.js accepts more than the builder produces.
            These are the rest, verbatim from the help text.
          </p>
          <TableScroll label="Flags the parser accepts that this page does not emit">
            <table className="data-table">
              <caption className="visually-hidden">
                Install flags the CLI accepts that this builder does not produce
              </caption>
              <thead>
                <tr>
                  <th scope="col">Flag</th>
                  <th scope="col">What it does</th>
                </tr>
              </thead>
              <tbody>
                {UNUSED_FLAGS.map((entry) => (
                  <tr key={entry.flag}>
                    <td className="data-table__name u-mono u-wrap">{entry.flag}</td>
                    <td className="data-table__desc">{entry.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </section>
      </div>
    </div>
  );
}
