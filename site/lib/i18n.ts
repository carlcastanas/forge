/**
 * Translated documentation.
 *
 * The repository carries translated READMEs under `docs/<locale>/README.md`, with
 * wildly uneven depth behind them — some locales have a few hundred translated
 * skill and command pages, others have only the README. None of them are kept in
 * lockstep with the English source, which is rewritten far more often.
 *
 * So the language menu is deliberately honest rather than flattering: it offers
 * the translated README for each locale, states how much else exists behind it,
 * and says plainly that English is authoritative. It does not pretend the whole
 * site is localised, and it does not silently serve a stale page as if it were
 * current.
 */
import fs from 'node:fs';
import path from 'node:path';

import { REPO_ROOT } from './content';

export type Locale = {
  /** Directory name under docs/, and the URL segment. */
  code: string;
  /** The language's own name, as a reader of that language would write it. */
  endonym: string;
  /** English name, for the aria-label. */
  english: string;
  /** Written right to left. */
  rtl?: boolean;
  /**
   * Non-standard source path. Simplified Chinese predates the docs/<locale>
   * convention and lives at the repository root.
   */
  readmePath?: string;
};

export const LOCALES: Locale[] = [
  { code: 'zh-CN', endonym: '简体中文', english: 'Simplified Chinese', readmePath: 'README.zh-CN.md' },
  { code: 'zh-TW', endonym: '繁體中文', english: 'Traditional Chinese' },
  { code: 'ja-JP', endonym: '日本語', english: 'Japanese' },
  { code: 'ko-KR', endonym: '한국어', english: 'Korean' },
  { code: 'es', endonym: 'Español', english: 'Spanish' },
  { code: 'pt-BR', endonym: 'Português (Brasil)', english: 'Brazilian Portuguese' },
  { code: 'de-DE', endonym: 'Deutsch', english: 'German' },
  { code: 'tr', endonym: 'Türkçe', english: 'Turkish' },
  { code: 'ru', endonym: 'Русский', english: 'Russian' },
  { code: 'uk-UA', endonym: 'Українська', english: 'Ukrainian' },
  { code: 'vi-VN', endonym: 'Tiếng Việt', english: 'Vietnamese' },
  { code: 'th', endonym: 'ไทย', english: 'Thai' },
  { code: 'ur', endonym: 'اردو', english: 'Urdu', rtl: true },
];

function readmeRelPath(locale: Locale): string {
  return locale.readmePath ?? path.posix.join('docs', locale.code, 'README.md');
}

/** Count the translated markdown files behind a locale, README included. */
function countPages(locale: Locale): number {
  const dir = path.join(REPO_ROOT, 'docs', locale.code);
  let total = 0;
  const walk = (current: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) total += 1;
    }
  };
  walk(dir);
  // The root-level Simplified Chinese README is not inside docs/<locale>.
  if (locale.readmePath && fs.existsSync(path.join(REPO_ROOT, locale.readmePath))) total += 1;
  return total;
}

export type LocaleEntry = Locale & {
  /** URL of the locale's page on this site. */
  href: string;
  /** Translated markdown files in the repository for this locale. */
  pages: number;
  /** False when the README itself is missing, in which case it is not listed. */
  available: boolean;
};

export function getLocales(): LocaleEntry[] {
  return LOCALES.map((locale) => ({
    ...locale,
    href: `/lang/${locale.code}`,
    pages: countPages(locale),
    available: fs.existsSync(path.join(REPO_ROOT, readmeRelPath(locale))),
  })).filter((locale) => locale.available);
}

export function getLocale(code: string): LocaleEntry | null {
  return getLocales().find((locale) => locale.code === code) ?? null;
}

/** The translated README body, with its own leading H1 and HTML furniture removed. */
export function getLocaleReadme(locale: Locale): string | null {
  try {
    return fs.readFileSync(path.join(REPO_ROOT, readmeRelPath(locale)), 'utf8');
  } catch {
    return null;
  }
}

export function localeRepoPath(locale: Locale): string {
  return readmeRelPath(locale);
}
