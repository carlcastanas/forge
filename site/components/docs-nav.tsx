'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavGroup = {
  label: string;
  items: { href: string; title: string }[];
};

/** The docs sidebar tree. Visible from 1024px up; below that it lives in the drawer. */
export function DocsNav({ groups, ariaLabel }: { groups: NavGroup[]; ariaLabel: string }) {
  const pathname = usePathname().replace(/\/+$/, '') || '/';

  if (groups.length === 0) {
    return (
      <nav className="nav-tree" aria-label={ariaLabel}>
        <p className="t-small u-muted">No pages yet.</p>
      </nav>
    );
  }

  return (
    <nav className="nav-tree" aria-label={ariaLabel}>
      {groups.map((group) => (
        <div className="nav-tree__group" key={group.label}>
          <p className="nav-tree__label">{group.label}</p>
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="nav-tree__link"
              aria-current={pathname === item.href ? 'page' : undefined}
            >
              {item.title}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
