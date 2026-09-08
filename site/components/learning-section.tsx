/**
 * How a correction becomes an instinct, and the three knobs over how many of
 * them reach a session.
 *
 * Sources: skills/continuous-learning-v2/SKILL.md for the observation and
 * scoring pipeline, scripts/hooks/session-start.js for the injection rules, and
 * docs/CONFIGURATION.md for the defaults and the parsing behaviour of each
 * variable.
 */
import Link from 'next/link';

type Stage = {
  title: string;
  body: string;
};

const STAGES: Stage[] = [
  {
    title: 'Observation is a hook, not a judgement call',
    body: 'PreToolUse and PostToolUse hooks append prompts, tool calls and outcomes to a per-project observation log. This is the part that used to be a skill and was moved: a skill fires when the model judges it relevant, a hook fires every time. Nothing depends on the run deciding that the moment you corrected it was worth writing down.',
  },
  {
    title: 'A background pass turns observations into instincts',
    body: 'An observer reads a bounded slice of the log and looks for three shapes: a correction you made, an error that got resolved, and a workflow that repeated. Each becomes an atomic instinct — one trigger, one action, a confidence between 0.3 and 0.9, and the evidence that produced it. The observer defaults to haiku, times out at 120 seconds, waits 60 seconds between analyses, and reads at most 500 transcript lines. It is off until you enable it, and it needs WSL2, Linux or macOS.',
  },
  {
    title: 'Instincts are project-scoped by default',
    body: 'The project is identified by hashing the git remote, so the same repository resolves to the same identity on any machine. A React convention learned in one project does not follow you into a Django one. An instinct that shows up in two or more projects with an average confidence of 0.8 or better becomes a candidate for promotion to global scope, which you apply rather than have applied to you.',
  },
  {
    title: 'Session start reads them back, filtered and capped',
    body: 'At the start of the next session the instinct set is deduplicated with project scope winning over global, filtered to those at or above the confidence floor, ranked, and cut to the cap. Only the action line of each surviving instinct is injected. Ranking is confidence plus a small boost for project scope and for a stack that matches the repository you are in.',
  },
];

type Control = {
  name: string;
  fallback: string;
  body: string;
};

const CONTROLS: Control[] = [
  {
    name: 'FORGE_INSTINCT_CONFIDENCE_THRESHOLD',
    fallback: '0.7',
    body: 'The confidence floor for injection. Must be a plain decimal in the range 0 to 1; trailing junk, hex and exponent syntax are rejected whole rather than half-parsed, and the default stands. Raise it when injected instincts are noisy, lower it when a correction you made twice is still not showing up.',
  },
  {
    name: 'FORGE_MAX_INJECTED_INSTINCTS',
    fallback: '6',
    body: 'The hard cap per session, applied after ranking. Must be a plain positive integer. This is the variable to reach for when session start has become slow or the injected block has grown longer than the task description.',
  },
  {
    name: 'FORGE_INSTINCT_RELEVANCE_RANKING',
    fallback: 'on',
    body: 'Set it to off, false, 0 or no to inject unranked, ordering on confidence alone. At session start there is no task yet, so relevance can only mean location and stack — if that heuristic is picking wrong for your repository, turning it off is the cheaper fix than tuning it.',
  },
];

const COMMANDS = [
  '/instinct-status',
  '/evolve',
  '/promote',
  '/projects',
  '/instinct-export',
  '/instinct-import',
];

export function LearningSection({ skillHref }: { skillHref?: string }) {
  return (
    <div className="stack--loose stack">
      <ol className="step-list">
        {STAGES.map((stage, index) => (
          <li className="step-list__item" key={stage.title}>
            <span className="step-list__num">{String(index + 1).padStart(2, '0')}</span>
            <h3 className="step-list__title">{stage.title}</h3>
            <p className="step-list__body">{stage.body}</p>
          </li>
        ))}
      </ol>

      <div>
        <h3 className="t-h3" style={{ marginBottom: '0.5rem' }}>
          Three controls over how much of it reaches you
        </h3>
        <p className="t-body u-muted measure" style={{ marginBottom: '1.25rem' }}>
          All three are read from the environment at session start. Every one of them falls back to
          its default on an unparseable value rather than erroring, so a typo degrades quietly
          instead of breaking the session.
        </p>

        <div className="kv">
          {CONTROLS.map((control) => (
            <div className="kv__row" key={control.name}>
              <div className="kv__key u-mono u-wrap">
                {control.name}
                <span className="badge" style={{ marginInlineStart: '0.4rem' }}>
                  {control.fallback}
                </span>
              </div>
              <p className="kv__val">{control.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="split split--sidebar">
        <div className="stack">
          <h3 className="t-h3">Inspecting it, and turning it off</h3>
          <p className="t-body u-muted measure">
            Learning that you cannot read is not learning you can trust. Six command shims cover the
            lifecycle: what has been learned, what should be clustered into a skill, what deserves
            promotion, and what moves between machines.
          </p>
          <div className="pill-row">
            {COMMANDS.map((command) => (
              <span className="chip" key={command}>
                {command}
              </span>
            ))}
          </div>
          <p className="t-small measure">
            The observation hook costs no tokens; the observer pass does, because it invokes a
            model. Stop the observation with{' '}
            <span className="t-mono u-wrap">FORGE_SKIP_OBSERVE=1</span>, or drop to{' '}
            <span className="t-mono u-wrap">FORGE_HOOK_PROFILE=minimal</span>, which excludes it
            along with the rest of the standard-profile hooks.
          </p>
        </div>

        <div className="callout">
          <div className="callout__body">
            <strong>Observations stay on the machine that made them.</strong> Only instincts — the
            trigger and the action, never the transcript or the code that produced them — can be
            exported, and only when you run the export. Memories the vault holds are treated as
            unreviewed context on the way back in, never as executable policy.
            {skillHref ? (
              <>
                {' '}
                The mechanics, including the storage layout and the promotion criteria, are in{' '}
                <Link href={skillHref}>the continuous-learning skill</Link>.
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
