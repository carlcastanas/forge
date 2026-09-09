import Link from 'next/link';
import type { Metadata } from 'next';

import { Breadcrumbs, EmptyState, TableScroll } from '@/components/page-parts';
import { getCommandGroups, getCommands } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Commands',
  description:
    'Every slash-command shim in the FORGE catalog, grouped by domain, each linking to the skill it fronts.',
};

export default function CommandsPage() {
  const commands = getCommands();
  const groups = getCommandGroups();
  const linked = commands.filter((command) => command.skill).length;

  return (
    <div className="container">
      <div className="docs-content">
        <Breadcrumbs items={[{ href: '/', label: 'FORGE' }, { label: 'Commands' }]} />

        <div className="page-head">
          <h1 className="t-h1">Commands</h1>
          <p className="t-lead">
            A command is a shim. It names an intent, takes an argument or two, and hands off to the
            skill that holds the durable behaviour. If a shim grows past a screen of orchestration,
            the behaviour belongs in a skill instead.
          </p>
          <div className="page-meta">
            <span>{commands.length} commands</span>
            <span>{linked} resolve to a skill in this catalog</span>
            <span className="t-mono">commands/&lt;name&gt;.md</span>
          </div>
        </div>

        {commands.length === 0 ? (
          <EmptyState
            title="No commands found"
            body="The site reads ../commands/*.md from the repository. That directory currently has no markdown in it."
            action={
              <Link className="btn btn--sm" href="/skills">
                Browse the skills they front
              </Link>
            }
          />
        ) : (
          groups.map((group) => (
            <section className="page-section" key={group.label}>
              <h2 className="t-h3 page-section__head">
                {group.label}
                <span className="page-section__count">{group.items.length}</span>
              </h2>

              <TableScroll label={`${group.label} commands`}>
                <table className="data-table">
                  <caption className="visually-hidden">
                    {group.label} commands, their arguments, and the skill each one fronts
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Command</th>
                      <th scope="col">Description</th>
                      <th scope="col">Arguments</th>
                      <th scope="col">Skill</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((command) => (
                      <tr key={command.name} id={command.name}>
                        <th scope="row" className="data-table__name">
                          /{command.name}
                        </th>
                        <td className="data-table__desc">
                          {command.description || 'No description.'}
                        </td>
                        <td className="t-mono u-muted data-table__col">
                          {command.argumentHint ?? 'none'}
                        </td>
                        <td className="data-table__col">
                          {command.skill ? (
                            <Link className="t-mono" href={`/skills/${command.skill}`}>
                              {command.skill}
                            </Link>
                          ) : (
                            <span className="u-muted">inline</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
