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
 * A README opens with furniture written for a repository host: a wordmark, a
 * badge row, a translation notice, a language switcher, and the file's own H1.
 * This page already supplies all five — a title, a lead, a callout saying the
 * English is authoritative, and the language menu in the header — so leaving
 * them in renders each one twice.
 *
 * The blocks do not arrive in a fixed order, and a translated file often puts
 * its notice above the switcher or the switcher below the H1, so this scans the
 * whole preamble rather than peeling from the top: it stops at the first real
 * section heading and drops every piece of chrome it passes on the way.
 */
const PREAMBLE_LIMIT = 60;

/**
 * A line that is nothing but a row of language links, with or without a short
 * bold label in front of it: `**Language:** [English](…) | [日本語](…) | …`.
 * Four links is the threshold — no sentence in these documents carries that
 * many and nothing else.
 */
function isLanguageSwitcher(line: string): boolean {
  const links = line.match(/\[[^\]]+\]\([^)]*\)/g) ?? [];
  if (links.length < 4) return false;
  // From the first link onward a switcher is links and separators, nothing else.
  const tail = line
    .slice(line.indexOf('['))
    .replace(/\[[^\]]+\]\([^)]*\)/g, '')
    .replace(/[|\u00b7\u2022,/\s*_-]/g, '');
  return tail.length === 0;
}

/** The file's own "this is a translation, English wins" note. */
function isTranslationNotice(line: string): boolean {
  return /^\s{0,3}>/.test(line) && /README\.md/i.test(line);
}

function isHorizontalRule(line: string): boolean {
  return /^\s{0,3}(-{3,}|_{3,}|\*{3,})\s*$/.test(line);
}

function stripLeadingHtml(raw: string): string {
  const lines = raw.split('\n');
  const out: string[] = [];
  let seenHeading = false;
  let droppedH1 = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const inPreamble = !seenHeading && i < PREAMBLE_LIMIT;

    if (/^\s{0,3}#{2,}\s+/.test(line)) seenHeading = true;

    if (inPreamble) {
      // A block-level HTML element: consume through its closing tag.
      const open = line.match(/^\s{0,3}<(p|div|picture|table|center|h1)\b/i);
      if (open) {
        const close = new RegExp(`</${open[1]}>`, 'i');
        let end = i;
        while (end < lines.length && !close.test(lines[end])) end += 1;
        if (end < lines.length) {
          i = end;
          continue;
        }
      }
      if (/^\s{0,3}<(img|br|a|source)\b/i.test(line)) continue;
      if (isLanguageSwitcher(line)) continue;
      if (isTranslationNotice(line)) continue;
      if (/^\s{0,3}#\s+/.test(line) && !droppedH1) {
        droppedH1 = true;
        continue;
      }
      // A rule only earns its place between two things that both survived.
      // Removing the block a pair of rules bracketed leaves the pair touching.
      if (isHorizontalRule(line)) {
        const lastKept = [...out].reverse().find((kept) => kept.trim() !== '');
        if (lastKept === undefined || isHorizontalRule(lastKept)) continue;
      }
    }

    out.push(line);
  }

  while (out.length > 0 && (out[0].trim() === '' || isHorizontalRule(out[0]))) out.shift();
  return out.join('\n');
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
