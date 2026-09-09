'use client';

import { useMemo, useState } from 'react';

import { EmptyState, TableScroll } from '@/components/page-parts';

export type AgentRow = {
  name: string;
  description: string;
  model: string;
  tools: string[];
};

export type ModelChip = { name: string; count: number };

function badgeClass(model: string): string {
  if (model === 'opus') return 'badge badge--opus';
  if (model === 'sonnet') return 'badge badge--sonnet';
  if (model === 'haiku') return 'badge badge--haiku';
  return 'badge';
}

export function AgentsTable({ agents, models }: { agents: AgentRow[]; models: ModelChip[] }) {
  const [model, setModel] = useState<string | null>(null);

  const rows = useMemo(
    () => (model ? agents.filter((agent) => agent.model === model) : agents),
    [agents, model],
  );

  return (
    <>
      <div className="stack stack--tight mb-4">
        <div className="filter-bar" role="group" aria-label="Filter by model tier">
          <button
            type="button"
            className="filter-chip"
            aria-pressed={model === null}
            onClick={() => setModel(null)}
          >
            All <span className="u-muted">{agents.length}</span>
          </button>
          {models.map((chip) => (
            <button
              key={chip.name}
              type="button"
              className="filter-chip"
              aria-pressed={model === chip.name}
              onClick={() => setModel(model === chip.name ? null : chip.name)}
            >
              {chip.name} <span className="u-muted">{chip.count}</span>
            </button>
          ))}
        </div>

        <p className="result-count" role="status" aria-live="polite">
          {rows.length} of {agents.length} agents
          {model ? ` on ${model}` : ''}
        </p>
      </div>

      <TableScroll label="Agent catalog">
        <table className="data-table">
          <caption className="visually-hidden">
            Every agent with its description, model tier, and tool allowlist
          </caption>
          <thead>
            <tr>
              <th scope="col">Agent</th>
              <th scope="col">Description</th>
              <th scope="col">Model</th>
              <th scope="col">Tools</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((agent) => (
              <tr key={agent.name} id={agent.name}>
                <th scope="row" className="data-table__name">
                  {agent.name}
                </th>
                <td className="data-table__desc">{agent.description || 'No description.'}</td>
                <td>
                  <span className={badgeClass(agent.model)}>{agent.model}</span>
                </td>
                <td>
                  {agent.tools.length === 0 ? (
                    <span className="u-muted">none declared</span>
                  ) : (
                    <span className="t-mono u-muted">{agent.tools.join(', ')}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>

      {rows.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title="No agent runs on that tier"
            body="Nothing in the catalog is assigned to this model tier."
            action={
              <button type="button" className="btn btn--sm" onClick={() => setModel(null)}>
                Show every agent
              </button>
            }
          />
        </div>
      ) : null}
    </>
  );
}
