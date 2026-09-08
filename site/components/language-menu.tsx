'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

import { GlobeIcon } from '@/components/icons';

export type LanguageOption = {
  code: string;
  endonym: string;
  english: string;
  href: string;
  pages: number;
};

/**
 * Language menu.
 *
 * A disclosure rather than a `<select>`, so the endonyms render in their own
 * scripts and each option can carry a `lang` attribute for screen readers. It
 * closes on Escape, on outside click, and on selection, and returns focus to the
 * trigger on Escape.
 */
export function LanguageMenu({ options }: { options: LanguageOption[] }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    function onPointer(event: MouseEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  if (options.length === 0) return null;

  return (
    <div className="lang" ref={wrapper}>
      <button
        ref={trigger}
        type="button"
        className="icon-button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Choose a language"
        title="Language"
        onClick={() => setOpen((value) => !value)}
      >
        <GlobeIcon size={18} />
      </button>

      <div id={menuId} className="lang__menu" hidden={!open}>
        <p className="lang__note">
          Translations are community contributions and lag the English source.
        </p>
        <ul className="lang__list">
          <li>
            <Link className="lang__item lang__item--current" href="/" onClick={() => setOpen(false)}>
              <span>English</span>
              <span className="lang__meta">source</span>
            </Link>
          </li>
          {options.map((option) => (
            <li key={option.code}>
              <Link
                className="lang__item"
                href={option.href}
                lang={option.code}
                onClick={() => setOpen(false)}
              >
                <span>{option.endonym}</span>
                <span className="lang__meta">
                  {option.pages === 1 ? '1 page' : `${option.pages} pages`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
