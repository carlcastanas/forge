/**
 * Eight skills, chosen at build time from the real catalog.
 *
 * Nothing here is transcribed. Each slot names a domain and an ordered list of
 * candidate skill directories; the first candidate that exists in ../skills wins
 * and brings its own frontmatter description with it. A slot whose candidates
 * have all been renamed or removed falls back to a keyword search over the
 * catalog, and failing that renders nothing rather than a stale entry.
 */
import Link from 'next/link';

import { ArrowRightIcon } from '@/components/icons';
import { getSkills, truncate, type SkillEntry } from '@/lib/content';

type Slot = {
  /** Domain label shown on the card. */
  domain: string;
  /** Preferred skill directory names, best first. */
  candidates: string[];
  /** Last resort: any skill whose name contains one of these fragments. */
  fallback: string[];
};

const SLOTS: Slot[] = [
  {
    domain: 'Testing',
    candidates: ['tdd-workflow', 'python-testing', 'e2e-testing'],
    fallback: ['tdd', 'testing'],
  },
  {
    domain: 'Testing',
    candidates: ['flaky-test-triage', 'ai-regression-testing', 'e2e-testing'],
    fallback: ['flaky', 'regression'],
  },
  {
    domain: 'Security',
    candidates: ['prompt-injection-defense', 'threat-modeling', 'security-review'],
    fallback: ['injection', 'threat'],
  },
  {
    domain: 'Security',
    candidates: ['secrets-management', 'dependency-supply-chain', 'security-headers-hardening'],
    fallback: ['secrets', 'supply-chain'],
  },
  {
    domain: 'Frontend',
    candidates: ['frontend-a11y', 'accessibility', 'react-patterns'],
    fallback: ['a11y', 'accessibility'],
  },
  {
    domain: 'Frontend',
    candidates: ['react-patterns', 'frontend-patterns', 'react-performance'],
    fallback: ['react', 'frontend'],
  },
  {
    domain: 'Data',
    candidates: ['database-migrations', 'postgres-patterns', 'data-quality-validation'],
    fallback: ['migration', 'postgres'],
  },
  {
    domain: 'Operations',
    candidates: ['incident-response', 'observability-instrumentation', 'sre-slo-error-budgets'],
    fallback: ['incident', 'observability'],
  },
];

function resolve(slots: Slot[], catalog: SkillEntry[]): { slot: Slot; skill: SkillEntry }[] {
  const byName = new Map(catalog.map((skill) => [skill.name, skill]));
  const taken = new Set<string>();
  const resolved: { slot: Slot; skill: SkillEntry }[] = [];

  for (const slot of slots) {
    let match: SkillEntry | undefined;

    for (const candidate of slot.candidates) {
      const found = byName.get(candidate);
      if (found && !taken.has(found.name)) {
        match = found;
        break;
      }
    }

    if (!match) {
      for (const fragment of slot.fallback) {
        match = catalog.find((skill) => skill.name.includes(fragment) && !taken.has(skill.name));
        if (match) break;
      }
    }

    if (!match) continue;
    taken.add(match.name);
    resolved.push({ slot, skill: match });
  }

  return resolved;
}

export function SkillsSampler() {
  const catalog = getSkills();
  const picks = resolve(SLOTS, catalog);

  if (picks.length === 0) return null;

  return (
    <div className="grid grid--3">
      {picks.map(({ slot, skill }) => (
        <Link className="card" href={`/skills/${skill.name}`} key={skill.name}>
          <div className="pill-row">
            <span className="badge">{slot.domain}</span>
          </div>
          <h3 className="card__title u-mono u-wrap">{skill.name}</h3>
          <p className="card__body">{truncate(skill.description, 210)}</p>
          <span className="card__foot">
            Read the skill
            <ArrowRightIcon size={14} />
          </span>
        </Link>
      ))}
    </div>
  );
}
