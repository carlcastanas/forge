'use client';

import Link from 'next/link';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';

import { SearchIcon } from '@/components/icons';

export type SkillListItem = {
  name: string;
  description: string;
  category: string;
};

export type CategoryChip = { name: string; count: number };

const PAGE_SIZE = 60;

/** Subsequence match, the cheap half of a fuzzy search. */
function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j += 1) {
    if (haystack[j] === needle[i]) i += 1;
  }
  return i === needle.length;
}

/** Higher is better. Zero means no match. */
function score(query: string, item: SkillListItem): number {
  const name = item.name;
  const description = item.description.toLowerCase();

  if (name === query) return 1000;
  if (name.startsWith(query)) return 800 - name.length;

  const nameIndex = name.indexOf(query);
  if (nameIndex !== -1) return 600 - nameIndex;

  // Word-boundary hit inside the hyphenated name.
  if (name.split('-').some((token) => token.startsWith(query))) return 500;

  const descIndex = description.indexOf(query);
  if (descIndex !== -1) return 300 - Math.min(descIndex, 200) / 10;

  if (query.length >= 3 && isSubsequence(query, name)) return 100;

  return 0;
}

export function SkillsBrowser({
  skills,
  categories,
}: {
  skills: SkillListItem[];
  categories: CategoryChip[];
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const deferredQuery = useDeferredValue(query);

  const results = useMemo(() => {
    const trimmed = deferredQuery.trim().toLowerCase();
    const pool = category ? skills.filter((skill) => skill.category === category) : skills;

    if (!trimmed) return pool;

    return pool
      .map((skill) => ({ skill, rank: score(trimmed, skill) }))
      .filter((entry) => entry.rank > 0)
      .sort((a, b) => (b.rank !== a.rank ? b.rank - a.rank : a.skill.name.localeCompare(b.skill.name)))
      .map((entry) => entry.skill);
  }, [skills, category, deferredQuery]);

  // Any change to the query or the filter starts the list over.
  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [deferredQuery, category]);

  const visible = results.slice(0, limit);
  const stale = query !== deferredQuery;

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', marginBottom: '1.5rem' }}>
        <div className="search-field">
          <SearchIcon size={16} className="search-field__icon" />
          <input
            id="skill-search"
            type="search"
            className="search-field__input"
            placeholder="Filter by name or description"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <label htmlFor="skill-search" className="visually-hidden">
            Filter skills
          </label>
        </div>

        {categories.length > 1 ? (
          <div className="filter-bar" role="group" aria-label="Filter by category">
            <button
              type="button"
              className="filter-chip"
              aria-pressed={category === null}
              onClick={() => setCategory(null)}
            >
              All <span className="u-subtle">{skills.length}</span>
            </button>
            {categories.map((chip) => (
              <button
                key={chip.name}
                type="button"
                className="filter-chip"
                aria-pressed={category === chip.name}
                onClick={() => setCategory(category === chip.name ? null : chip.name)}
              >
                {chip.name} <span className="u-subtle">{chip.count}</span>
              </button>
            ))}
          </div>
        ) : null}

        <p className="result-count" role="status" aria-live="polite">
          {results.length} of {skills.length} skills
          {category ? ` in ${category}` : ''}
        </p>
      </div>

      {results.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__title">No skill matches that filter</p>
          <p className="t-small">
            Try a shorter query, or clear the category chip to search the whole catalog.
          </p>
        </div>
      ) : (
        <div className="grid grid--3" style={{ opacity: stale ? 0.6 : 1 }}>
          {visible.map((skill) => (
            <Link className="card" href={`/skills/${skill.name}`} key={skill.name}>
              <h2 className="card__title u-mono u-wrap">{skill.name}</h2>
              <p className="card__body u-clamp-3">{skill.description}</p>
              <span className="badge" style={{ alignSelf: 'flex-start', marginTop: 'auto' }}>
                {skill.category}
              </span>
            </Link>
          ))}
        </div>
      )}

      {visible.length < results.length ? (
        <div className="load-more">
          <button type="button" className="btn" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
            Show {Math.min(PAGE_SIZE, results.length - visible.length)} more
          </button>
        </div>
      ) : null}
    </>
  );
}
