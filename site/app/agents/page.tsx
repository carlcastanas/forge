import type { Metadata } from 'next';

import { AgentsTable } from '@/components/agents-table';
import { Breadcrumbs, EmptyState } from '@/components/page-parts';
import { getAgentModels, getAgents } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Agents',
  description:
    'Every subagent in the FORGE catalog with its description, model tier, and tool allowlist. Reviewers are read-only; resolvers may write.',
};

export default function AgentsPage() {
  const agents = getAgents();
  const models = getAgentModels();

  const rows = agents.map((agent) => ({
    name: agent.name,
    description: agent.description,
    model: agent.model,
    tools: agent.tools,
  }));

  return (
    <div className="container">
      <div className="docs-content">
        <Breadcrumbs items={[{ href: '/', label: 'FORGE' }, { label: 'Agents' }]} />

        <div className="page-head">
          <h1 className="t-h1">Agents</h1>
          <p className="t-lead">
            An agent is a subagent with its own context window, its own tool allowlist, and its own
            model tier. Delegating to one costs nothing in the parent window, which is the whole
            reason to do it. Routing is decided by the files a change touches.
          </p>
          <div className="page-meta">
            <span>{agents.length} agents</span>
            <span className="t-mono">agents/&lt;name&gt;.md</span>
          </div>
        </div>

        {agents.length === 0 ? (
          <EmptyState
            title="No agents found"
            body="The site reads ../agents/*.md from the repository. That directory currently has no markdown in it."
          />
        ) : (
          <>
            <AgentsTable agents={rows} models={models} />

            <div className="panel" style={{ marginTop: '2.5rem' }}>
              <h2 className="t-h3" style={{ marginBottom: '0.6rem' }}>
                Reading the table
              </h2>
              <p className="t-small" style={{ marginBottom: '0.6rem' }}>
                A tool allowlist of <span className="t-mono">Read, Grep, Glob</span> marks a
                read-only reviewer: it can inspect a diff and report, but it cannot change a file.
                An allowlist that includes <span className="t-mono">Edit</span>,{' '}
                <span className="t-mono">Write</span>, or <span className="t-mono">Bash</span>{' '}
                marks a resolver, which is expected to act.
              </p>
              <p className="t-small">
                Model tier is a cost decision, not a status. Anything above{' '}
                <span className="t-mono">sonnet</span> has to justify itself; planning and
                architecture usually can, and a single-language style review usually cannot.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
