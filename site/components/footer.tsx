import Link from 'next/link';

import { getCounts, getDocEntries, getGuides } from '@/lib/content';
import { PRODUCT_LINKS, SITE } from '@/lib/site';

type FooterLink = { href: string; label: string; external?: boolean };

function docHref(slugFragment: string, fallback: string): string {
  const match = getDocEntries().find((entry) => entry.slug.join('/') === slugFragment);
  return match ? match.href : fallback;
}

export function Footer() {
  const counts = getCounts();
  const guides = getGuides();

  const columns: { label: string; links: FooterLink[] }[] = [
    {
      label: 'Product',
      links: PRODUCT_LINKS.map((link) => ({ href: link.href, label: link.label })),
    },
    {
      label: 'Start',
      links: [
        { href: '/docs/getting-started', label: 'Getting started' },
        { href: docHref('installation', '/docs'), label: 'Installation' },
        { href: docHref('configuration', '/docs'), label: 'Configuration' },
        { href: docHref('concepts', '/docs'), label: 'Concepts' },
      ],
    },
    {
      label: 'Catalog',
      links: [
        { href: '/skills', label: `Skills (${counts.skills})` },
        { href: '/agents', label: `Agents (${counts.agents})` },
        { href: '/commands', label: `Commands (${counts.commands})` },
        { href: docHref('rules-guide', '/docs'), label: `Rules (${counts.rules})` },
      ],
    },
    {
      label: 'Guides',
      links:
        guides.length > 0
          ? guides.slice(0, 4).map((guide) => ({ href: guide.href, label: guide.title }))
          : [{ href: '/guides', label: 'All guides' }],
    },
    {
      label: 'Project',
      links: [
        { href: docHref('project/contributing', '/docs'), label: 'Contributing' },
        { href: docHref('project/security', '/docs'), label: 'Security policy' },
        { href: docHref('project/troubleshooting', '/docs'), label: 'Troubleshooting' },
        { href: SITE.repo, label: 'Source', external: true },
      ],
    },
  ];

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          {columns.map((column) => (
            <div className="footer-col" key={column.label}>
              <p className="footer-col__label">{column.label}</p>
              {column.links.map((link) =>
                link.external ? (
                  <a
                    key={`${column.label}-${link.href}`}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link key={`${column.label}-${link.href}`} href={link.href}>
                    {link.label}
                  </Link>
                ),
              )}
            </div>
          ))}
        </div>

        <div className="footer-bottom">
          <p>MIT licensed. No tracking, no analytics, no cookies.</p>
          <p className="t-mono u-subtle">{SITE.claim}</p>
        </div>
      </div>
    </footer>
  );
}
