import Link from 'next/link';
import type { Metadata } from 'next';

import { Breadcrumbs, EmptyState } from '@/components/page-parts';
import { SkillsBrowser } from '@/components/skills-browser';
import { getSkillCategories, getSkills, truncate } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Skills',
  description:
    'Every skill in the FORGE catalog. A skill is a directory with a SKILL.md that describes a procedure and the conditions under which the agent should reach for it.',
};

export default function SkillsPage() {
  const skills = getSkills();
  const categories = getSkillCategories();

  const list = skills.map((skill) => ({
    name: skill.name,
    description: truncate(skill.description, 170),
    category: skill.category,
  }));

  return (
    <div className="container">
      <div className="docs-content">
        <Breadcrumbs items={[{ href: '/', label: 'FORGE' }, { label: 'Skills' }]} />

        <div className="page-head">
          <h1 className="t-h1">Skills</h1>
          <p className="t-lead">
            A skill is a directory containing a SKILL.md: what the procedure is, when to reach for
            it, and the mechanics of running it. Nothing here is loaded until its trigger matches,
            which is why a catalog this size costs nothing to have installed.
          </p>
          <div className="page-meta">
            <span>{skills.length} skills</span>
            <span>{categories.length} categories, derived from the names</span>
            <span className="t-mono">skills/&lt;name&gt;/SKILL.md</span>
          </div>
        </div>

        {skills.length === 0 ? (
          <EmptyState
            title="No skills found"
            body="The site reads ../skills/*/SKILL.md from the repository. No skill directory currently contains one."
            action={
              <Link className="btn btn--sm" href="/docs">
                Read what a skill is
              </Link>
            }
          />
        ) : (
          <SkillsBrowser skills={list} categories={categories} />
        )}
      </div>
    </div>
  );
}
