import Link from 'next/link';

import { GitHubIcon, LogoMark } from '@/components/icons';
import { MobileDrawer, type DrawerSection } from '@/components/mobile-drawer';
import { NavLinks } from '@/components/nav-links';
import { ThemeToggle } from '@/components/theme-toggle';
import { getDocGroups, getGuides, getRepoVersion } from '@/lib/content';
import { SITE } from '@/lib/site';

export function Header() {
  const version = getRepoVersion(SITE.version);

  const sections: DrawerSection[] = [
    ...getDocGroups().map((group) => ({
      label: group.label,
      items: group.items.map((item) => ({ href: item.href, title: item.title })),
    })),
  ];

  const guides = getGuides();
  if (guides.length > 0) {
    sections.push({
      label: 'Guides',
      items: guides.map((guide) => ({ href: guide.href, title: guide.title })),
    });
  }

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <MobileDrawer sections={sections} />

        <Link href="/" className="wordmark" aria-label="FORGE home">
          <LogoMark size={18} className="wordmark__mark" />
          <span>FORGE</span>
          <span className="wordmark__version">v{version}</span>
        </Link>

        <NavLinks />

        <div className="site-header__actions">
          <ThemeToggle />
          <a
            className="icon-button"
            href={SITE.repo}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="FORGE on GitHub"
            title="FORGE on GitHub"
          >
            <GitHubIcon size={18} />
          </a>
        </div>
      </div>
    </header>
  );
}
