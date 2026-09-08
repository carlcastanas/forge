'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_LINKS } from '@/lib/site';

export function isActivePath(pathname: string, href: string): boolean {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (href === '/') return clean === '/';
  return clean === href || clean.startsWith(`${href}/`);
}

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="site-nav" aria-label="Primary">
      {NAV_LINKS.map((link) => {
        const active = isActivePath(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className="site-nav__link"
            aria-current={active ? 'page' : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
