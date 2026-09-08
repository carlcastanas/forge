import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { Markdown, MissingContent } from '@/components/markdown';
import { Breadcrumbs, PrevNext, TableOfContents } from '@/components/page-parts';
import {
  extractHeadings,
  getCommands,
  getSkillBody,
  getSkillByName,
  getSkills,
} from '@/lib/content';

export const dynamicParams = false;

export function generateStaticParams() {
  return getSkills().map((skill) => ({ name: skill.name }));
}

type Props = { params: Promise<{ name: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  const skill = getSkillByName(name);
  if (!skill) return { title: 'Not found' };
  return { title: skill.name, description: skill.description || undefined };
}

export default async function SkillPage({ params }: Props) {
  const { name } = await params;
  const skill = getSkillByName(name);
  if (!skill) notFound();

  const { content, missing } = getSkillBody(skill);
  const headings = extractHeadings(content);

  const skills = getSkills();
  const index = skills.findIndex((entry) => entry.name === skill.name);
  const prev = index > 0 ? skills[index - 1] : undefined;
  const next = index >= 0 && index < skills.length - 1 ? skills[index + 1] : undefined;

  const fronting = getCommands().filter((command) => command.skill === skill.name);

  return (
    <div className="container">
      <div className="article-layout">
        <article className="docs-content">
          <Breadcrumbs
            items={[
              { href: '/', label: 'FORGE' },
              { href: '/skills', label: 'Skills' },
              { label: skill.name },
            ]}
          />

          <div className="page-head">
            <h1 className="t-h1 t-mono u-wrap">{skill.name}</h1>
            {skill.description ? <p className="t-lead">{skill.description}</p> : null}
            <div className="page-meta">
              <span className="badge">{skill.category}</span>
              <span className="badge">origin: {skill.origin}</span>
              {skill.extraFiles > 0 ? (
                <span>
                  {skill.extraFiles} supporting {skill.extraFiles === 1 ? 'file' : 'files'}
                </span>
              ) : null}
              <span className="t-mono u-wrap">{skill.repoPath}</span>
            </div>

            {skill.tools.length > 0 ? (
              <div className="filter-bar" aria-label="Tools this skill declares">
                {skill.tools.map((tool) => (
                  <span className="chip" key={tool}>
                    {tool}
                  </span>
                ))}
              </div>
            ) : null}

            {fronting.length > 0 ? (
              <p className="t-small">
                Fronted by{' '}
                {fronting.map((command, i) => (
                  <span key={command.name}>
                    {i > 0 ? ', ' : ''}
                    <Link href={`/commands#${command.name}`} className="t-mono">
                      /{command.name}
                    </Link>
                  </span>
                ))}
                .
              </p>
            ) : null}
          </div>

          {missing || content.trim().length === 0 ? (
            <MissingContent repoPath={skill.repoPath} />
          ) : (
            <Markdown content={content} sourcePath={skill.repoPath} />
          )}

          <PrevNext
            prev={prev ? { href: `/skills/${prev.name}`, title: prev.name } : undefined}
            next={next ? { href: `/skills/${next.name}`, title: next.name } : undefined}
          />
        </article>

        <TableOfContents headings={headings} />
      </div>
    </div>
  );
}
