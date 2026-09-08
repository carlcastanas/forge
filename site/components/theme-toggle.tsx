'use client';

import { useCallback } from 'react';
import { MoonIcon, SunIcon } from '@/components/icons';

const STORAGE_KEY = 'forge-theme';

/**
 * Explicit light/dark toggle. The choice is written to the root element as
 * data-theme, which overrides the prefers-color-scheme rules in both directions,
 * and persisted so the pre-paint script in the document head can replay it.
 *
 * Both icons are rendered and CSS decides which one shows, so the button is
 * correct in the static HTML — before any JavaScript has run — for a visitor on
 * either system preference.
 */
export function ThemeToggle() {
  const toggle = useCallback(() => {
    const root = document.documentElement;
    const explicit = root.getAttribute('data-theme');
    // The init script stamps data-theme on first paint, so `explicit` is
    // normally set. Dark is the fallback when it somehow is not.
    const current = explicit === 'light' ? 'light' : 'dark';

    const next = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable; the attribute still applies to this page.
    }
  }, []);

  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      onClick={toggle}
      aria-label="Switch between the light and dark theme"
      title="Switch theme"
    >
      <MoonIcon size={18} className="theme-toggle__moon" />
      <SunIcon size={18} className="theme-toggle__sun" />
    </button>
  );
}

/**
 * Runs before first paint so the stored theme is applied without a flash.
 * Inline by necessity; it makes no network request and reads only localStorage.
 */
export const themeInitScript = `(function(){var d=document.documentElement;try{var t=localStorage.getItem('${STORAGE_KEY}');if(t==='light'||t==='dark'){d.setAttribute('data-theme',t);return;}}catch(e){}d.setAttribute('data-theme','dark');})();`;
