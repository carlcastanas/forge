'use client';

import { useMemo, useState } from 'react';

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
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}
      >
        <div className="filter-bar" role="group" aria-label="Filter by model tier">
          <button
            type="button"
            className="filter-chip"
            aria-pressed={model === null}
            onClick={() => setModel(null)}
          >
            All <span className="u-subtle">{agents.length}</span>
          </button>
          {models.map((chip) => (
            <button
              key={chip.name}
              type="button"
              className="filter-chip"
              aria-pressed={model === chip.name}
              onClick={() => setModel(model === chip.name ? null : chip.name)}
            >
              {chip.name} <span className="u-subtle">{chip.count}</span>
            </button>
          ))}
        </div>

        <p className="result-count" role="status" aria-live="polite">
          {rows.length} of {agents.length} agents
          {model ? ` on ${model}` : ''}
        </p>
      </div>

      <div className="table-scroll" tabIndex={0} role="region" aria-label="Agent catalog">
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
                    <span className="u-subtle">none declared</span>
                  ) : (
                    <span className="t-mono u-subtle">{agent.tools.join(', ')}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state" style={{ marginTop: '1rem' }}>
          <p className="empty-state__title">No agent runs on that tier</p>
          <p className="t-small">Clear the filter to see the whole catalog.</p>
        </div>
      ) : null}
    </>
  );
}
