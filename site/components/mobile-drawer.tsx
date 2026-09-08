'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { CloseIcon, MenuIcon } from '@/components/icons';
import { isActivePath } from '@/components/nav-links';
import { NAV_LINKS } from '@/lib/site';

export type DrawerSection = {
  label: string;
  items: { href: string; title: string }[];
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * The single-column navigation. Below 1024px this replaces both the primary nav
 * and the docs sidebar. It traps focus, closes on Escape, on backdrop click, and
 * whenever the route changes, and restores focus to the trigger on close.
 *
 * The panel is portalled onto document.body: the header sets backdrop-filter,
 * which makes it the containing block for fixed-position descendants and would
 * otherwise clip the drawer to the height of the header.
 */
export function MobileDrawer({ sections }: { sections: DrawerSection[] }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock the page behind the drawer, trap Tab, and restore focus on close.
  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const raf = requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusable.length === 0) return;

      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === firstEl) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  const currentPath = pathname.replace(/\/+$/, '') || '/';

  const panel = (
    <>
      <button
        type="button"
        className="drawer-backdrop"
        aria-label="Close navigation"
        tabIndex={-1}
        onClick={close}
      />
      <div
        id={panelId}
        ref={panelRef}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Site navigation"
      >
        <div className="drawer__head">
          <span className="t-eyebrow">Navigation</span>
          <button type="button" className="icon-button" aria-label="Close navigation" onClick={close}>
            <CloseIcon size={20} />
          </button>
        </div>

        <div className="drawer__body">
          <div className="drawer__group">
            <p className="drawer__label">Sections</p>
            <Link
              href="/"
              className="drawer__link"
              aria-current={currentPath === '/' ? 'page' : undefined}
            >
              Overview
            </Link>
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="drawer__link"
                aria-current={isActivePath(pathname, link.href) ? 'page' : undefined}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {sections.map((section) => (
            <div className="drawer__group" key={section.label}>
              <p className="drawer__label">{section.label}</p>
              {section.items.length === 0 ? (
                <p className="t-small u-muted">Nothing here yet.</p>
              ) : (
                section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="drawer__link"
                    aria-current={currentPath === item.href ? 'page' : undefined}
                  >
                    {item.title}
                  </Link>
                ))
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        className="icon-button menu-button"
        aria-label="Open navigation"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(true)}
      >
        <MenuIcon size={20} />
      </button>
      {open && mounted ? createPortal(panel, document.body) : null}
    </>
  );
}
