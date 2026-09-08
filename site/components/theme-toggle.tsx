'use client';

import { useCallback, useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from '@/components/icons';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'forge-theme';

/**
 * Explicit light/dark toggle. The choice is written to the root element as
 * data-theme, which overrides the prefers-color-scheme rules in both directions,
 * and persisted so the pre-paint script in the document head can replay it.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = document.documentElement.getAttribute('data-theme');
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored);
      return;
    }
    setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Storage can be unavailable; the attribute still applies for this page.
      }
      return next;
    });
  }, []);

  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <button
      type="button"
      className="icon-button"
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
    </button>
  );
}

/**
 * Runs before first paint so the stored theme is applied without a flash.
 * Inline by necessity; it makes no network request and reads only localStorage.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;
