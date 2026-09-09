/**
 * One task, carried through the seven loop phases.
 *
 * The loop strip higher up the landing page names the phases. This section does
 * the other job: it takes a single ordinary bug report and shows what the
 * operator sees at each phase, and what the same request produces when that
 * phase is missing. Server-rendered, no client JavaScript.
 *
 * The transcript fragments are an illustration of the shape a run takes, in the
 * same register as the hero terminal. The phases, their order, and the checks
 * each one owns are what the catalog defines.
 */
import type { ReactNode } from 'react';

type Phase = {
  name: string;
  /** The line the operator sees when the phase reports. */
  sees: ReactNode;
  /** What the phase did, in the operator's terms. */
  body: string;
  /** The same request with that phase absent. */
  without: string;
};

const PHASES: Phase[] = [
  {
    name: 'plan',
    sees: (
      <>
        <span className="walk__marker walk__marker--plan">plan</span>3 files · 1 query · no
        migration <span className="walk__dim">· waiting for approval</span>
      </>
    ),
    body: 'The run stops before the first write. The plan names the query it believes is at fault, the two files it expects to touch, and the migration it says is unnecessary. Every one of those is arguable while arguing is still cheap, and the diff can be checked against the plan afterwards.',
    without:
      'The first tool call is an edit to the exporter. By the time the real cause turns out to be the join rather than the filter, three files already assume otherwise, and the cheapest way forward is to keep going.',
  },
  {
    name: 'test',
    sees: (
      <>
        <span className="walk__marker walk__marker--test">test</span>
        <span className="walk__path">usage-export.test.ts</span>
        {'  '}
        <span className="walk__bad">FAIL</span>
        {'  '}expected 1,204 rows, received 1,198
      </>
    ),
    body: 'The failing test is written from the report rather than from the code: six named accounts, all of them with a null last_seen_at, have to appear in the file. Watching it fail for that stated reason is what proves the test can detect the absence of the fix.',
    without:
      'The implementation lands first and the test is written to describe it. It asserts the row count the current code happens to produce, so it passes on the bug exactly as readily as on the fix.',
  },
  {
    name: 'implement',
    sees: (
      <>
        <span className="walk__marker walk__marker--implement">implement</span>
        <span className="walk__path">export/query.ts</span>,{' '}
        <span className="walk__path">export/csv.ts</span>
      </>
    ),
    body: 'The smallest change that turns the test green: an inner join becomes a left join, and the formatter grows one branch for the null case. Nothing else in either file is tidied on the way past.',
    without:
      'The fix arrives inside a four-hundred-line reformat of the exporter, and whoever reviews it has to separate the change that matters from the change that came along with it.',
  },
  {
    name: 'review',
    sees: (
      <>
        <span className="walk__marker walk__marker--review">review</span>fresh context ·
        read-only · 2 findings
      </>
    ),
    body: 'The diff goes to a subagent with its own context window and a Read, Grep and Glob allowlist, routed by the file extensions the change touched. It cannot write, and it never saw the argument that produced the code, so it reads the diff instead of recalling it. Two findings: the left join no longer hits the covering index, and the null branch writes an empty string where the consumer expects an empty field.',
    without:
      'The window that argued for the approach is asked to find the flaw in it. Everything that made the approach look right is still loaded, so both findings ship.',
  },
  {
    name: 'verify',
    sees: (
      <>
        <span className="walk__marker walk__marker--verify">verify</span>build ok · lint ok ·{' '}
        <span className="walk__ok">214 passed</span>, 0 failed · scan clean
      </>
    ),
    body: 'Build, suite and security scan are invoked and their output is read. A stage that produced no output did not run, and the summary reports that rather than filling the gap in.',
    without:
      '"Done, the export is fixed" is a sentence generated from the shape of the diff. No command was run, so nothing in the session distinguishes a working fix from a plausible one.',
  },
  {
    name: 'remember',
    sees: (
      <>
        <span className="walk__marker walk__marker--remember">remember</span>exports read the
        replica; nulls are not filtered upstream <span className="walk__dim">-&gt; saved</span>
      </>
    ),
    body: 'What was learned is written to the memory vault as a project-scoped note and read back at the start of the next session. The correction outlives the window that received it.',
    without:
      'The correction lives only in a transcript. Two sessions later the same inner join is proposed again, for the same reason, and has to be corrected again.',
  },
  {
    name: 'improve',
    sees: (
      <>
        <span className="walk__marker walk__marker--improve">improve</span>instinct{' '}
        <span className="walk__path">left-join-when-the-relation-is-optional</span>{' '}
        <span className="walk__dim">0.55 -&gt; 0.7</span>
      </>
    ),
    body: 'The observation behind the correction is scored. Once its confidence clears the injection floor it is read back at session start in this project, so the last stage of the loop changes what the first stage proposes next time.',
    without:
      'Nothing accumulates. The engineering standard of any given session is whatever that afternoon’s prompt happened to ask for.',
  },
];

export function SessionWalkthrough() {
  return (
    <ol className="walk">
      {PHASES.map((phase, index) => (
        <li className="walk__step" key={phase.name}>
          <div className="walk__side">
            <span className="walk__index">{String(index + 1).padStart(2, '0')}</span>
            <span className="walk__name">{phase.name}</span>
          </div>

          <div className="walk__main">
            <div className="walk__see">
              <code className="walk__line">{phase.sees}</code>
            </div>
            <p className="walk__body">{phase.body}</p>
            <p className="walk__risk">
              <span className="walk__risk-label">Without it</span>
              {phase.without}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
