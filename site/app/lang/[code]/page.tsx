import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Markdown } from '@/components/markdown';
import { ArrowRightIcon, InfoIcon } from '@/components/icons';
import { Breadcrumbs } from '@/components/page-parts';
import { getLocale, getLocales, getLocaleReadme, localeRepoPath } from '@/lib/i18n';

type Params = { params: Promise<{ code: string }> };

export function generateStaticParams() {
  return getLocales().map((locale) => ({ code: locale.code }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const locale = getLocale(code);
  if (!locale) return { title: 'Translation' };
  return {
    title: `${locale.endonym} — FORGE`,
    description: `The FORGE overview translated into ${locale.english}. English remains authoritative.`,
  };
}

/**
 * READMEs open with centred raw HTML — a wordmark, badges, and the language list
 * this page replaces. react-markdown does not process raw HTML, so left in place
 * it renders as literal angle brackets. Drop it, then drop the file's own H1
 * because this page supplies one.
 */
function stripLeadingHtml(raw: string): string {
  const lines = raw.split('\n');
  let cursor = 0;
  for (;;) {
    while (cursor < lines.length && lines[cursor].trim() === '') cursor += 1;
    const open = lines[cursor]?.match(/^\s{0,3}<(p|div|picture|table|center|img|a|br|h1)\b/i);
    if (!open) break;
    const tag = open[1].toLowerCase();
    if (/\/>\s*$/.test(lines[cursor]) || tag === 'br' || tag === 'img') {
      cursor += 1;
      continue;
    }
    const close = new RegExp(`</${tag}>`, 'i');
    let end = cursor;
    while (end < lines.length && !close.test(lines[end])) end += 1;
    if (end >= lines.length) break;
    cursor = end + 1;
  }
  const rest = lines.slice(cursor);
  while (rest.length > 0 && rest[0].trim() === '') rest.shift();
  // Markdown language nav line, and the file's own H1.
  if (/^\*\*(Language|语言|語言|言語|언어|Idioma|Sprache|Dil|Язык|Мова)/i.test(rest[0] ?? '')) {
    rest.shift();
    while (rest.length > 0 && rest[0].trim() === '') rest.shift();
  }
  if (/^\s{0,3}#\s+/.test(rest[0] ?? '')) {
    rest.shift();
    while (rest.length > 0 && rest[0].trim() === '') rest.shift();
  }
  return rest.join('\n');
}

/** A line that is nothing but images and links wrapping images. */
function isBadgeLine(line: string): boolean {
  const stripped = line
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<\/?a\b[^>]*>/gi, '')
    .trim();
  return line.trim().length > 0 && stripped.length === 0;
}

/**
 * Counts of stars, forks, contributors and downloads are claims this site does
 * not make: the repository has no canonical host, so every badge resolves to an
 * error graphic and every hand-written total is unverifiable. Both go.
 */
const SCALE_NOUN =
  /stars?|forks?|contributors?|downloads?|users?|贡献者|貢獻者|コントリビュ|기여자|contribuidores|mitwirkende|katkıda|участник|учасник|ผู้มีส่วนร่วม|người đóng góp/i;
const SCALE_NUMBER = /\d[\d.,]*\s*[KkMm]\s*\+/;

export function stripUnverifiableClaims(markdown: string): string {
  const out: string[] = [];
  let inFence = false;

  for (const line of markdown.split('\n')) {
    if (/^\s{0,3}(```|~~~)/.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (!inFence) {
      if (isBadgeLine(line)) continue;
      // A short line pairing a rounded-up figure with a popularity noun.
      if (line.length < 200 && SCALE_NUMBER.test(line) && SCALE_NOUN.test(line)) continue;
    }
    out.push(line);
  }

  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^(\s*---\s*\n)+/, '')
    .trim();
}

function toBody(raw: string): string {
  return stripUnverifiableClaims(stripLeadingHtml(raw));
}

export default async function LocalePage({ params }: Params) {
  const { code } = await params;
  const locale = getLocale(code);
  if (!locale) notFound();

  const raw = getLocaleReadme(locale);
  if (raw === null) notFound();

  const others = getLocales().filter((entry) => entry.code !== locale.code);
  const repoPath = localeRepoPath(locale);

  return (
    <div className="container">
      <article className="docs-content docs-content--prose">
        <Breadcrumbs
          items={[{ href: '/', label: 'FORGE' }, { label: 'Languages' }, { label: locale.english }]}
        />

        <div className="page-head">
          <h1 className="t-h1 u-wrap" lang={locale.code} dir={locale.rtl ? 'rtl' : undefined}>
            {locale.endonym}
          </h1>
          <p className="t-lead">
            The FORGE overview in {locale.english}. Everything else on this site is English.
          </p>
          <div className="page-meta">
            <span>{locale.english}</span>
            <span>
              {locale.pages === 1
                ? '1 translated file'
                : `${locale.pages.toLocaleString('en-US')} translated files`}
            </span>
            <span className="t-mono u-wrap">{repoPath}</span>
          </div>
          <Link className="btn btn--sm" href="/docs">
            Read the English documentation
            <ArrowRightIcon size={14} />
          </Link>
        </div>

        <div className="callout callout--warn">
          <span className="callout__icon" aria-hidden="true">
            <InfoIcon size={18} />
          </span>
          <div className="callout__body">
            <strong>English is authoritative.</strong> This translation is a community
            contribution rendered from <code>{repoPath}</code>. The English documentation is
            rewritten far more often than the translations are updated, so treat anything here
            that contradicts it as out of date.
          </div>
        </div>

        <div className="mt-6" lang={locale.code} dir={locale.rtl ? 'rtl' : undefined}>
          <Markdown content={toBody(raw)} sourcePath={repoPath} />
        </div>

        <section className="page-section mt-6" aria-labelledby="other-languages">
          <h2 className="t-h3 page-section__head" id="other-languages">
            Other languages
            <span className="page-section__count">{others.length}</span>
          </h2>
          <div className="pill-row">
            {others.map((entry) => (
              <Link key={entry.code} className="chip" href={entry.href} lang={entry.code}>
                {entry.endonym}
              </Link>
            ))}
          </div>
        </section>
      </article>
    </div>
  );
}
