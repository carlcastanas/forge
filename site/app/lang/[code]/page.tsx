import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Markdown } from '@/components/markdown';
import { ArrowRightIcon, InfoIcon } from '@/components/icons';
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
function toBody(raw: string): string {
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
      <header className="page-head">
        <p className="page-meta">{locale.english}</p>
        <h1 lang={locale.code} dir={locale.rtl ? 'rtl' : undefined}>
          {locale.endonym}
        </h1>
      </header>

      <div className="callout callout--warn">
        <span className="callout__icon" aria-hidden="true">
          <InfoIcon size={16} />
        </span>
        <div className="callout__body">
          <p>
            <strong>English is authoritative.</strong> This translation is a
            community contribution rendered from <code>{repoPath}</code>. The English
            documentation is rewritten far more often than the translations are
            updated, so treat anything here that contradicts it as out of date.
          </p>
          <p>
            {locale.pages === 1
              ? 'This locale has one translated page: the overview below.'
              : `This locale has ${locale.pages} translated pages in the repository.`}{' '}
            The rest of this site is English only.
          </p>
          <p>
            <Link href="/docs">Read the English documentation</Link>
          </p>
        </div>
      </div>

      <article className="prose" lang={locale.code} dir={locale.rtl ? 'rtl' : undefined}>
        <Markdown content={toBody(raw)} sourcePath={repoPath} />
      </article>

      <section className="section">
        <h2 className="t-h2">Other languages</h2>
        <div className="pill-row">
          {others.map((entry) => (
            <Link key={entry.code} className="chip" href={entry.href} lang={entry.code}>
              {entry.endonym}
            </Link>
          ))}
        </div>
        <p className="t-small" style={{ marginTop: '1rem' }}>
          <Link href="/">
            English <ArrowRightIcon size={14} />
          </Link>
        </p>
      </section>
    </div>
  );
}
