/**
 * Eight questions lifted from ../docs/FAQ.md at build time.
 *
 * The accordion is a `<details>` list, so it opens and closes with JavaScript
 * switched off and every answer is present in the static HTML for a find-in-page
 * to hit. Questions are selected by matching the preference list below against
 * the real headings; anything that has been renamed simply drops out and the
 * next question in the file takes the slot.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';

import { ChevronRightIcon } from '@/components/icons';
import { readRepoFile } from '@/components/repo-read';
import { resolveRepoLink } from '@/lib/content';

const SOURCE = 'docs/FAQ.md';
const WANTED = 8;

/**
 * Questions worth answering before someone installs anything, in the order they
 * should be read. Matching is on a lowercase prefix of the heading.
 */
const PREFERRED = [
  'is claude code required',
  'what are the prerequisites',
  'can you install only part of it',
  'where does everything go',
  'why is the context window filling up',
  'does forge work offline',
  'does forge send your code anywhere',
  'does forge make sessions more expensive',
  'how do you uninstall cleanly',
];

type Question = {
  id: string;
  section: string;
  question: string;
  /** Raw markdown body of the answer. */
  answer: string;
};

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-') || 'question'
  );
}

export function parseFaq(source: string): Question[] {
  const lines = source.split('\n');
  const questions: Question[] = [];

  let section = '';
  let current: Question | null = null;
  let body: string[] = [];
  let inFence = false;

  const flush = (): void => {
    if (!current) return;
    current.answer = body.join('\n').trim();
    if (current.answer) questions.push(current);
    current = null;
    body = [];
  };

  for (const line of lines) {
    if (/^\s{0,3}(```|~~~)/.test(line)) {
      inFence = !inFence;
      if (current) body.push(line);
      continue;
    }

    if (!inFence) {
      const question = line.match(/^###\s+(.+?)\s*$/);
      if (question) {
        flush();
        const text = question[1].trim();
        current = { id: slugify(text), section, question: text, answer: '' };
        continue;
      }

      const heading = line.match(/^##\s+(?!#)(.+?)\s*$/);
      if (heading) {
        flush();
        section = heading[1].trim();
        continue;
      }
    }

    if (current) body.push(line);
  }

  flush();
  return questions;
}

/** Picks the preferred questions, then tops up from the front of the file. */
function select(questions: Question[]): Question[] {
  const picked: Question[] = [];
  const used = new Set<string>();

  for (const prefix of PREFERRED) {
    const match = questions.find(
      (entry) => !used.has(entry.id) && entry.question.toLowerCase().startsWith(prefix),
    );
    if (!match) continue;
    used.add(match.id);
    picked.push(match);
    if (picked.length === WANTED) return picked;
  }

  for (const entry of questions) {
    if (picked.length === WANTED) break;
    if (used.has(entry.id)) continue;
    used.add(entry.id);
    picked.push(entry);
  }

  return picked;
}

/** Inline markdown: code spans, bold, and repo-relative links. */
function inline(text: string, key: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

  let cursor = 0;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const id = `${key}-${index}`;
    index += 1;

    if (match[1] !== undefined) {
      nodes.push(<code key={id}>{match[1]}</code>);
    } else if (match[2] !== undefined) {
      nodes.push(<strong key={id}>{match[2]}</strong>);
    } else {
      const href = resolveRepoLink(match[4], SOURCE);
      nodes.push(
        href.startsWith('/') ? (
          <Link href={href} key={id}>
            {match[3]}
          </Link>
        ) : (
          <a href={href} key={id} rel="noreferrer">
            {match[3]}
          </a>
        ),
      );
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

/** Answer body: paragraphs, bullet lists, and fenced blocks that scroll. */
function Answer({ markdown, id }: { markdown: string; id: string }) {
  const blocks: ReactNode[] = [];
  const lines = markdown.split('\n');

  let paragraph: string[] = [];
  let list: string[] = [];
  let fence: string[] | null = null;
  let count = 0;

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(' ').replace(/\s+/g, ' ').trim();
    paragraph = [];
    if (!text) return;
    const key = `${id}-p-${count}`;
    count += 1;
    blocks.push(<p key={key}>{inline(text, key)}</p>);
  };

  const flushList = (): void => {
    if (list.length === 0) return;
    const items = list;
    list = [];
    const key = `${id}-ul-${count}`;
    count += 1;
    blocks.push(
      <ul className="faq__list" key={key}>
        {items.map((item, itemIndex) => (
          <li key={`${key}-${itemIndex}`}>{inline(item, `${key}-${itemIndex}`)}</li>
        ))}
      </ul>,
    );
  };

  for (const line of lines) {
    if (/^\s{0,3}(```|~~~)/.test(line)) {
      if (fence === null) {
        flushParagraph();
        flushList();
        fence = [];
      } else {
        const key = `${id}-pre-${count}`;
        count += 1;
        blocks.push(
          <pre className="faq__code" key={key}>
            <code>{fence.join('\n')}</code>
          </pre>,
        );
        fence = null;
      }
      continue;
    }

    if (fence !== null) {
      fence.push(line);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1].trim());
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  if (fence !== null && fence.length > 0) {
    blocks.push(
      <pre className="faq__code" key={`${id}-pre-tail`}>
        <code>{fence.join('\n')}</code>
      </pre>,
    );
  }

  return <>{blocks}</>;
}

export function FaqPreview({ faqHref }: { faqHref: string }) {
  const source = readRepoFile(SOURCE);
  if (!source) return null;

  const questions = select(parseFaq(source));
  if (questions.length === 0) return null;

  return (
    <>
      <div className="faq">
        {questions.map((entry) => (
          <details className="faq__item" key={entry.id}>
            <summary className="faq__summary">
              <span>{entry.question}</span>
              <ChevronRightIcon className="faq__chev" size={16} />
            </summary>
            <div className="faq__body">
              <Answer markdown={entry.answer} id={entry.id} />
            </div>
          </details>
        ))}
      </div>

      <p className="t-small measure" style={{ marginTop: '1.25rem' }}>
        These are read from <span className="t-mono">docs/FAQ.md</span> at build time.{' '}
        <Link href={faqHref}>The full FAQ</Link> covers install and setup, day-to-day use, skills
        and agents, cost, security, teams, and the errors that come up most.
      </p>
    </>
  );
}
