/**
 * The most recent releases, parsed out of ../CHANGELOG.md at build time.
 *
 * The file follows Keep a Changelog, so the structure is predictable: `##` opens
 * a release, `###` opens a category inside it, and a category holds bullets that
 * usually lead with a bold term. A release with no bullets anywhere in it — the
 * empty `Unreleased` block at the top of the file, for instance — is dropped. If
 * nothing parses, the component renders nothing at all rather than an empty
 * frame.
 */
import Link from 'next/link';

import { truncate } from '@/lib/content';
import { readRepoFile } from '@/components/repo-read';

/**
 * Flattens changelog markdown to plain text. Deliberately narrower than the
 * shared `plainText` helper, which also strips `>` and would turn a placeholder
 * like `skills/<name>/SKILL.md` into something that no longer reads as a path.
 */
function flatten(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`+([^`]*)`+/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

type Entry = {
  group: string;
  term?: string;
  body: string;
};

type Release = {
  heading: string;
  version: string;
  date?: string;
  summary?: string;
  entries: Entry[];
};

const RELEASES_SHOWN = 2;
const ENTRIES_SHOWN = 6;

/** Splits `**Term** — the rest of it` into its two halves. */
function splitTerm(raw: string): { term?: string; body: string } {
  const match = raw.match(/^\*\*(.+?)\*\*\s*(?:[—–-]\s*)?([\s\S]*)$/);
  if (!match) return { body: flatten(raw) };

  const term = flatten(match[1]);
  const body = flatten(match[2]);
  if (!term) return { body: flatten(raw) };
  return { term, body };
}

export function parseChangelog(source: string): Release[] {
  const lines = source.split('\n');
  const releases: Release[] = [];

  let release: Release | null = null;
  let group = '';
  let bullet: string[] | null = null;
  let summary: string[] = [];

  const flushBullet = (): void => {
    if (!release || !bullet) return;
    const raw = bullet.join(' ').replace(/\s+/g, ' ').trim();
    bullet = null;
    if (!raw) return;
    const { term, body } = splitTerm(raw);
    if (!term && !body) return;
    release.entries.push({ group, term, body });
  };

  const flushRelease = (): void => {
    flushBullet();
    if (release) {
      const text = summary.join(' ').replace(/\s+/g, ' ').trim();
      if (text) release.summary = truncate(flatten(text), 220);
      if (release.entries.length > 0) releases.push(release);
    }
    summary = [];
  };

  for (const line of lines) {
    const releaseHeading = line.match(/^##\s+(?!#)(.+?)\s*$/);
    if (releaseHeading) {
      flushRelease();
      const heading = flatten(releaseHeading[1]);
      const dated = heading.match(/^(.+?)\s+[-–—]\s+(\d{4}-\d{2}-\d{2})\s*$/);
      release = {
        heading,
        version: dated ? dated[1].trim() : heading,
        date: dated ? dated[2] : undefined,
        entries: [],
      };
      group = '';
      continue;
    }

    if (!release) continue;

    const groupHeading = line.match(/^###\s+(.+?)\s*$/);
    if (groupHeading) {
      flushBullet();
      group = flatten(groupHeading[1]);
      continue;
    }

    const bulletStart = line.match(/^[-*]\s+(.*)$/);
    if (bulletStart) {
      flushBullet();
      bullet = [bulletStart[1]];
      continue;
    }

    if (bullet) {
      // A continuation line is indented; a blank line ends the bullet.
      if (/^\s+\S/.test(line)) bullet.push(line.trim());
      else flushBullet();
      continue;
    }

    if (group === '' && line.trim()) summary.push(line.trim());
  }

  flushRelease();
  return releases;
}

export function RecentChanges() {
  const source = readRepoFile('CHANGELOG.md');
  if (!source) return null;

  const releases = parseChangelog(source).slice(0, RELEASES_SHOWN);
  if (releases.length === 0) return null;

  return (
    <div className="stack stack--loose">
      {releases.map((release) => {
        const shown = release.entries.slice(0, ENTRIES_SHOWN);
        const remaining = release.entries.length - shown.length;

        return (
          <div className="panel stack" key={release.heading}>
            <div className="pill-row">
              <span className="chip">{release.version}</span>
              {release.date ? <span className="chip">{release.date}</span> : null}
              <span className="chip">
                {release.entries.length} {release.entries.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>

            {release.summary ? (
              <p className="t-body u-muted measure">{release.summary}</p>
            ) : null}

            <ul className="change-list">
              {shown.map((entry, index) => (
                <li className="change-list__item" key={`${entry.term ?? 'entry'}-${index}`}>
                  {index === 0 || shown[index - 1].group !== entry.group ? (
                    <span className="change-list__group">{entry.group || 'Changed'}</span>
                  ) : null}
                  {entry.term ? <p className="change-list__term">{entry.term}</p> : null}
                  <p className="change-list__body">{truncate(entry.body, 190)}</p>
                </li>
              ))}
            </ul>

            {remaining > 0 ? (
              <p className="t-small">
                {remaining} more {remaining === 1 ? 'entry' : 'entries'} in this release.
              </p>
            ) : null}
          </div>
        );
      })}

      <p className="t-small measure">
        Parsed from <span className="t-mono">CHANGELOG.md</span> when this page was built, so it
        cannot drift from the file.{' '}
        <Link href="/changelog">Read the full release history</Link>.
      </p>
    </div>
  );
}
