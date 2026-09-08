import Link from 'next/link';
import type { Metadata } from 'next';

import { CopyCommand } from '@/components/copy-command';
import {
  AlertIcon,
  ArrowRightIcon,
  CheckIcon,
  ChevronRightIcon,
  DashIcon,
  InfoIcon,
} from '@/components/icons';
import { ContrastTerminals } from '@/components/contrast-terminal';
import { SectionHead } from '@/components/page-parts';
import { getCounts, getDocEntries, getGuides } from '@/lib/content';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Why FORGE exists',
  description:
    'The argument for putting an engineering process around a coding agent: the failure modes a capable model has without one, what changes on day one against month three, what FORGE cannot do, and how to tell whether it is working for you.',
};

function docHref(slug: string, fallback: string): string {
  const match = getDocEntries().find((entry) => entry.slug.join('/') === slug);
  return match ? match.href : fallback;
}

function guideHref(slug: string, fallback: string): string {
  const match = getGuides().find((guide) => guide.slug === slug);
  return match ? match.href : fallback;
}

type Mode = {
  id: string;
  title: string;
  summary: string;
  example: { label: string; lines: string[] };
  fix: string;
  owner: string;
};

export default function WhyPage() {
  const counts = getCounts();

  const modes: Mode[] = [
    {
      id: 'edits-first',
      title: 'It edits before the shape of the change is settled',
      summary:
        'A model asked for a feature starts producing the feature. That is the correct behaviour for a small, well-specified change and the wrong behaviour for anything whose boundary is still open. By the time the question "where should this live" gets asked, several files already contain an answer, and the cheapest path is to keep going rather than unwind it. The decision was made by whichever file happened to be edited first.',
      example: {
        label: 'A session that skipped planning',
        lines: [
          'you   the signup endpoint needs rate limiting',
          'edit  src/routes/signup.ts        +34 −2',
          'edit  src/lib/redis.ts            +18 −0',
          'edit  src/config/index.ts         +7  −1',
          'you   wait, we do not run redis in staging',
        ],
      },
      fix: 'Planning becomes a stage with an artefact and a stopping point. The plan is written to a file — which files change, what is added, what stays untouched — and the run pauses for approval before the first write. Because the plan is on disk rather than in the transcript, the finished diff can be compared against it, and a change that quietly grew a schema migration is visible as a change that quietly grew a schema migration.',
      owner: 'Planning agents and the plan-and-PRD pattern.',
    },
    {
      id: 'tests-agree',
      title: 'It writes tests that agree with the code it just wrote',
      summary:
        'When the implementation lands first, the test is written by reading the implementation. It asserts what the function currently returns rather than what the requirement asked for, and it passes on the bug as readily as on the fix. The suite grows, coverage rises, and nothing has been demonstrated — a test that has never been observed failing has not been shown capable of failing.',
      example: {
        label: 'The same requirement, two orders of work',
        lines: [
          'after   expect(limiter(req)).toEqual(limiter(req))   // passes on anything',
          'before  expect(res.status).toBe(429)                 // after the 6th request',
          '        FAIL  expected 429, got 200',
          '        ^ the test can detect the absence of the change',
        ],
      },
      fix: 'The failing test lands first and is phrased in the requirement’s terms, not the implementation’s. Watching it fail for the stated reason is the evidence that it is wired to the behaviour under discussion. Only then does implementation start, and the definition of done is the test turning green rather than the diff looking plausible.',
      owner: 'The test stage, the TDD skills, and the testing rule files.',
    },
    {
      id: 'self-review',
      title: 'It reviews its own work in the context that produced it',
      summary:
        'Asking the window that argued for an approach to find the flaw in that approach is not review. Everything that made the approach look right is still loaded: the reasoning, the discarded alternatives, the assumption that was never stated out loud. What comes back is a summary of the diff written in an approving voice. The failure is structural rather than a shortcoming of the model — a human author reading their own patch an hour after writing it has the same problem, which is why teams route review elsewhere.',
      example: {
        label: 'What a scoped reviewer has that the author does not',
        lines: [
          'author    full history · the argument · the rejected options',
          'reviewer  the diff · the rules for this stack · Read, Grep, Glob',
          '',
          'review    per-process limiter will not hold behind the LB',
          '          finding raised · not a blocker · noted for deploy',
        ],
      },
      fix: `Review is delegated to a subagent with its own context window, a read-only tool allowlist, and no access to the conversation that produced the code. Routing is by the files the change touched, so a TypeScript diff reaches the TypeScript reviewer and a change under the hook scripts reaches the security reviewer. There are ${counts.agents} of them, and the read-only ones are read-only in the tool grant, not merely by instruction.`,
      owner: 'The reviewer agents and the routing table.',
    },
    {
      id: 'reports-from-diff',
      title: 'It reports success from the diff rather than from a run',
      summary:
        'The most common false statement a coding agent makes is that something works. It is rarely a lie and almost always a prediction: the change looks like the kind of change that works, so the summary says it works. No build was invoked. The suite was not run, or was run and the output was skimmed for the word "pass". This is the failure mode that survives longest, because the report is confident and the reader has no cheap way to check it.',
      example: {
        label: 'A claim, and the same claim with evidence',
        lines: [
          'claim     Done. The endpoint is now rate limited.',
          '',
          'evidence  $ npm run build     ok',
          '          $ npm test          12 passed, 0 failed',
          '          $ npx forge-shield scan   0 high, 1 low',
          '          verify: 3 checks ran, 3 read',
        ],
      },
      fix: 'Verification is a stage, not a sentence. It runs the build, the suite, and the security scan, and it reads each result rather than pattern-matching the exit line. A stage that produced no output did not run, and the run says so instead of rounding up. Where the harness supports hooks, this is enforced by code on a lifecycle event rather than requested in a prompt.',
      owner: 'The verify stage, lifecycle hooks, and Forge Shield.',
    },
    {
      id: 'forgets',
      title: 'It forgets a correction an hour later',
      summary:
        'You explain something the repository does not say out loud — that the limiter is per-process, that this service is deployed twice, that the migration tool cannot do a rename. The model absorbs it and proceeds correctly. Then the window compacts, or the session ends, and the correction goes with it. Two days later the same assumption is back, and it is back with confidence, because nothing in the repository contradicts it.',
      example: {
        label: 'What a session leaves behind',
        lines: [
          'monday    you: the limiter is per-process, we run 3 instances',
          '          ...context compacted...',
          'wednesday agent: added an in-memory limiter, 100 req/min',
          '',
          'with forge',
          'monday    remember  limiter is per-process; 3 instances -> saved',
          'wednesday session start  1 memory loaded for this repository',
        ],
      },
      fix: 'What was learned is written to disk at the end of a session and read at the start of the next. Not the transcript — a summary of what changed, what broke, and what was corrected. The next run begins already holding the correction, and the correction survives the window that received it.',
      owner: 'The remember stage and the memory vault.',
    },
    {
      id: 're-derives',
      title: 'It re-derives your workflow from your prompt, every session',
      summary:
        'Without a process installed, the process is whatever your prompt implied that day. Ask precisely on a good morning and you get plan-then-test-then-implement. Ask in three words at the end of a long afternoon and you get an edit. The engineering standard of the output becomes a function of how carefully the request was phrased, which is a strange property for an engineering standard to have.',
      example: {
        label: 'Where the process lives',
        lines: [
          'in the prompt   re-typed each session · varies with your energy',
          '                lost on compaction · not reviewable · not shared',
          '',
          'on disk         rules injected at session start',
          '                skills loaded when their trigger matches',
          '                hooks fire on the event, model cooperation optional',
        ],
      },
      fix: `The process is installed rather than requested. Rule files for the stack are injected at session start, ${counts.skills} skills wait behind their triggers and cost nothing until one matches, ${counts.commands} command shims name an intent in one line, and hooks execute deterministic code on lifecycle events whether or not the model would have chosen to. It is the same process on Monday morning and Friday evening, and it is the same process for everyone on the team, because it is a directory rather than a habit.`,
      owner: 'Rules, skills, command shims, and hooks.',
    },
  ];

  const forYou = [
    'You already have an engineering process you would defend in a review, and you want the agent to follow it without being told each time.',
    'Your repository is large enough that what the model loads matters more than what the model knows.',
    'You read agent output critically and have been caught out by work that looked finished.',
    'More than one person, or more than one harness, touches the same codebase and you want them held to the same standard.',
    'You are willing to write down the conventions you already enforce verbally.',
  ];

  const notForYou = [
    'You want the model to be better. FORGE does not change the model. It changes the order of operations and what has to exist before a stage is allowed to end.',
    'The work is a throwaway script or a one-file prototype. The overhead of planning, testing, and reviewing a twelve-line file is larger than the file.',
    'You want zero configuration. The rule layer is the part you own, and an uncurated rule directory is a cost paid every session.',
    'You want the agent to merge unattended. FORGE opens work for review; deciding what lands remains a person’s job.',
    'Your team has not agreed on its conventions. Rules encode decisions. Where there is no decision, there is nothing to encode, and writing one down will start the argument rather than settle it.',
  ];

  const dayOne = [
    'A plan file exists before the first edit, and you can disagree with it while disagreeing is still cheap.',
    'A failing test precedes the implementation, and you can see it fail for the stated reason.',
    'The diff is reviewed by something that was not in the room when it was written.',
    'The build, the suite, and the scan actually run, and their output is in the transcript rather than summarised out of it.',
    'A memory file appears for the repository, holding what the session learned.',
    'The first run is slower and costs more tokens than the same request without FORGE. This is real and you should expect it.',
    'Some rules that arrived with the install do not apply to your project and are noise until you remove them.',
  ];

  const monthThree = [
    'Memory holds the corrections specific to this codebase, so you stop re-explaining the same three facts.',
    'The rule directory is smaller than it was on day one and every file in it reflects a decision the team actually made.',
    'Review findings shift from generic to specific — the reviewer starts catching the class of mistake your team cares about, because the rules now describe it.',
    'A new person’s agent starts with the team’s standards rather than with none, on their first session.',
    'The token cost per completed change is lower than it was in week one, because the catalog has been pruned and the context loaded per task is narrower.',
    'You notice the loop only when it is missing — a session on a machine without FORGE feels like it skipped several steps, because it did.',
  ];

  const limits = [
    {
      title: 'It does not make a weak model strong',
      body: 'The loop constrains order and demands evidence. It does not add reasoning. A model that cannot write the middleware will not write it because a plan file exists; it will write a plan and then fail at the same point, more legibly. Choose the model on capability and use FORGE to stop a capable model from skipping steps.',
    },
    {
      title: 'It costs context',
      body: `Rules are injected wholesale at session start, so every rule file is a tax on every session in that stack. Skills are cheaper — they load only when a trigger matches — but a stage that fires a hook still spends the hook's output. This is why rule files are kept short, why install profiles exist, and why the claim is "${SITE.claim}" rather than "load everything".`,
    },
    {
      title: 'The rule layer has to be curated',
      body: 'The catalog arrives with rules for stacks you do not use and conventions you do not hold. Left alone, they are a per-session cost for constraints that do not apply, and worse, they dilute the ones that do. Rules that state aspirations instead of imperatives are actively harmful: they cannot be checked, so they teach the model that rules are advisory.',
    },
    {
      title: 'More agents is not automatically better',
      body: 'Every delegation costs a round trip and a fresh window that has to be primed before it is useful. Two subagents that need the same context are slower and more expensive than one pass, and a fan-out over work that is not actually independent produces conflicting output you then have to reconcile. Delegate when the work is separable or when isolation is the point, as it is for review.',
    },
    {
      title: 'It cannot enforce what the harness does not expose',
      body: 'Hooks are the only part of the system that does not depend on the model cooperating, and the hook runtime resolves on a handful of targets. Everywhere else the process arrives as instruction text, which a model can decline. Read the support matrix before assuming the guarantee you want is a guarantee on your harness.',
    },
    {
      title: 'The reviewer is a model too',
      body: 'A scoped reviewer with a clean context and a read-only tool grant is structurally better positioned than the author. It is not an auditor. It will miss things, and it will occasionally raise findings that are wrong. FORGE improves the odds that a second opinion exists; it does not remove your responsibility to read the diff.',
    },
    {
      title: 'Memory can be confidently wrong',
      body: 'A correction saved from a mistaken premise is reloaded every session until someone removes it. Persisted memory is an asset with a maintenance cost, not a free accumulation of wisdom. Prune it the way you prune a rule file.',
    },
  ];

  const workingSignals = [
    'You have stopped repeating the same correction across sessions.',
    'Test failures appear in the transcript before the implementations that fix them.',
    'Review findings are things you would have flagged yourself.',
    'A claim that something works arrives attached to output you can read.',
    'Your rule directory is getting smaller and more specific, not larger.',
    'A change you shipped three weeks ago has not come back.',
  ];

  const notWorkingSignals = [
    'Every session opens with you turning something off.',
    'Review returns findings you always dismiss — the rules encode a standard the team does not hold.',
    'Memory recalls facts that stopped being true two refactors ago.',
    'Runs got slower with no change in how often work has to be redone.',
    'You are writing a rule for something a hook should be enforcing.',
    'The plan file is written and then ignored, which means nothing is comparing the diff to it.',
  ];

  return (
    <>
      {/* Hero */}
      <section className="container hero">
        <div className="hero__inner">
          <span className="chip">The argument</span>
          <h1 className="t-display">Why this exists</h1>
          <p className="t-lead hero__subhead">
            A capable model with no engineering process fails in predictable ways. FORGE is the
            process, installed as files rather than re-specified in every prompt.
          </p>
          <div className="hero__ctas">
            <Link className="btn btn--primary" href="/docs/getting-started">
              Get started
              <ArrowRightIcon size={16} />
            </Link>
            <Link className="btn" href="#failure-modes">
              The failure modes
            </Link>
          </div>
        </div>
      </section>

      {/* The same request, run twice */}
      <section className="container section" aria-labelledby="same-request">
        <SectionHead
          id="same-request"
          eyebrow="The same request, twice"
          title="One prompt, two outcomes"
          lead="Nothing on the left is a strawman. Every line of it is something a capable model does when nothing tells it otherwise."
        />
        <ContrastTerminals />
      </section>

      {/* The argument */}
      <section className="container section">
        <div className="split split--sidebar">
          <div className="stack">
            <h2 className="t-h2">The argument in one paragraph</h2>
            <p className="t-body u-muted">
              A model that writes good code is not the same thing as a system that ships good
              changes. Left to itself, a capable model edits before the shape of the change is
              settled, writes tests that agree with the code it just wrote, reviews its own work
              in the context that produced it, reports success from the diff rather than from a
              run, forgets a correction an hour later, and re-derives your workflow from your
              prompt every session. None of that is exotic. It is the exact set of failures a
              competent team already has practices for — planning before implementation,
              test-first where it pays, review by someone else, verification against output,
              written decisions, and a shared standard. FORGE installs those practices as the
              default rather than leaving them to be requested. The scarce resource in this
              system is the context window, so it loads a narrow slice per task and persists
              everything else to disk.
            </p>
            <p className="t-body u-muted">
              Nothing below requires a better model. Every improvement described on this page
              comes from changing what has to exist before a stage is allowed to end.
            </p>
          </div>

          <div className="panel">
            <p className="t-eyebrow" style={{ marginBottom: '0.75rem' }}>
              On this page
            </p>
            <ul className="tick-list">
              {[
                { href: '#who', label: 'Who this is for, and who it is not for' },
                { href: '#failure-modes', label: 'The six failure modes, with examples' },
                { href: '#timeline', label: 'Day one against month three' },
                { href: '#limits', label: 'What FORGE cannot do' },
                { href: '#signals', label: 'How to tell whether it is working' },
              ].map((item) => (
                <li className="tick-list__item tick-list__item--muted" key={item.href}>
                  <ChevronRightIcon size={14} />
                  <a href={item.href}>{item.label}</a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Who */}
      <section className="container section" aria-labelledby="who">
        <SectionHead
          eyebrow="Fit"
          id="who"
          title="Who this is for, and who it is not for"
          lead="The honest version. FORGE is a process layer with real overhead, and there are projects where the overhead is larger than the problem."
        />

        <div className="compare">
          <div className="compare__col compare__col--with">
            <h3 className="t-h3">Reach for it when</h3>
            <ul className="tick-list">
              {forYou.map((item) => (
                <li className="tick-list__item" key={item}>
                  <CheckIcon size={16} strokeWidth={2} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="compare__col">
            <h3 className="t-h3">Skip it when</h3>
            <ul className="tick-list">
              {notForYou.map((item) => (
                <li className="tick-list__item tick-list__item--muted" key={item}>
                  <DashIcon size={16} strokeWidth={2} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Failure modes */}
      <section className="container section" aria-labelledby="failure-modes">
        <SectionHead
          eyebrow="The problem"
          id="failure-modes"
          title="Six failure modes, and what replaces each one"
          lead="Each of these is ordinary. Each has a well-understood remedy that teams already apply to human work. The only question FORGE answers is whether the remedy is the default or something you remember to ask for."
        />

        <div className="stack stack--loose">
          {modes.map((mode, index) => (
            <article className="panel" key={mode.id} id={mode.id}>
              <p className="t-eyebrow" style={{ marginBottom: '0.5rem' }}>
                Failure mode {String(index + 1).padStart(2, '0')}
              </p>
              <h3 className="t-h3" style={{ marginBottom: '0.75rem' }}>
                {mode.title}
              </h3>
              <p className="t-body u-muted measure">{mode.summary}</p>

              <div className="terminal" style={{ marginTop: '1.25rem' }}>
                <div className="terminal__bar">
                  <span className="terminal__dots" aria-hidden="true">
                    <span className="terminal__dot" />
                    <span className="terminal__dot" />
                    <span className="terminal__dot" />
                  </span>
                  <span className="terminal__label">{mode.example.label}</span>
                </div>
                <div className="terminal__body" style={{ height: 'auto' }}>
                  <pre className="terminal__lines">{mode.example.lines.join('\n')}</pre>
                </div>
              </div>

              <h4 className="t-h4" style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>
                What FORGE does instead
              </h4>
              <p className="t-body u-muted measure">{mode.fix}</p>
              <p className="t-small" style={{ marginTop: '0.75rem' }}>
                Owned by: {mode.owner}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Timeline */}
      <section className="container section" aria-labelledby="timeline">
        <SectionHead
          eyebrow="Adoption"
          id="timeline"
          title="Day one against month three"
          lead="The first session shows you the loop. The compounding takes longer, and it comes from the two layers you own: memory and rules."
        />

        <div className="split">
          <div className="compare__col">
            <h3 className="t-h3">Day one</h3>
            <p className="t-small" style={{ marginBottom: '0.5rem' }}>
              Visible in the first session, including the parts that cost you something.
            </p>
            <ul className="tick-list">
              {dayOne.map((item) => (
                <li className="tick-list__item" key={item}>
                  <ChevronRightIcon size={14} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="compare__col compare__col--with">
            <h3 className="t-h3">Month three</h3>
            <p className="t-small" style={{ marginBottom: '0.5rem' }}>
              Only reachable if you prune. An untouched install does not get here on its own.
            </p>
            <ul className="tick-list">
              {monthThree.map((item) => (
                <li className="tick-list__item" key={item}>
                  <ChevronRightIcon size={14} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="callout" style={{ marginTop: '1.5rem' }}>
          <span className="callout__icon">
            <InfoIcon size={18} />
          </span>
          <p className="callout__body">
            <strong>The work between the two columns is deletion.</strong> Month three looks
            different from day one mainly because rules that did not apply were removed, memory
            entries that stopped being true were pruned, and the install profile was narrowed to
            the stacks the repository actually uses. See{' '}
            <Link href={docHref('rules-guide', '/docs')}>the rules guide</Link> and{' '}
            <Link href={docHref('memory-guide', '/docs')}>the memory guide</Link> for the
            mechanics.
          </p>
        </div>
      </section>

      {/* Limits */}
      <section className="container section" aria-labelledby="limits">
        <SectionHead
          eyebrow="Limits"
          id="limits"
          title="What FORGE cannot do"
          lead="Stated plainly, because a process layer that oversells itself teaches you to ignore its output. If one of these is a blocker for you, it is a blocker, and no amount of configuration removes it."
        />

        <div className="grid grid--2">
          {limits.map((limit) => (
            <div className="card" key={limit.title}>
              <span className="card__icon">
                <AlertIcon size={18} />
              </span>
              <h3 className="card__title">{limit.title}</h3>
              <p className="card__body">{limit.body}</p>
            </div>
          ))}
        </div>

        <p className="t-small measure" style={{ marginTop: '1.5rem' }}>
          The harness-by-harness detail behind the fifth item is on{' '}
          <Link href="/platforms">the platforms page</Link>. The threat model behind the sixth is
          in <Link href={docHref('threat-model', '/docs')}>the threat model</Link>.
        </p>
      </section>

      {/* Signals */}
      <section className="container section" aria-labelledby="signals">
        <SectionHead
          eyebrow="Evaluation"
          id="signals"
          title="How to tell whether it is working for you"
          lead="Not by whether the output feels better. Feeling better is what a confident summary produces, and a confident summary is one of the things this system exists to distrust."
        />

        <div className="compare">
          <div className="compare__col compare__col--with">
            <h3 className="t-h3">Signals that it is</h3>
            <ul className="tick-list">
              {workingSignals.map((item) => (
                <li className="tick-list__item" key={item}>
                  <CheckIcon size={16} strokeWidth={2} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="compare__col">
            <h3 className="t-h3">Signals that it is not</h3>
            <ul className="tick-list">
              {notWorkingSignals.map((item) => (
                <li className="tick-list__item tick-list__item--muted" key={item}>
                  <DashIcon size={16} strokeWidth={2} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <h3 className="t-h3" style={{ marginTop: '2.5rem', marginBottom: '0.5rem' }}>
          Four things worth counting
        </h3>
        <p className="t-body u-muted measure" style={{ marginBottom: '1.25rem' }}>
          None of these needs a dashboard. A note in a file at the end of each week is enough to
          see a trend, and a trend is the only thing that answers the question.
        </p>

        <div className="kv">
          <div className="kv__row">
            <div className="kv__key">Rework rate</div>
            <div className="kv__val">
              How many changes you had to revisit within a week of shipping them. This is the
              number the whole loop is aimed at. If it does not move, nothing else on this page
              matters.
            </div>
          </div>
          <div className="kv__row">
            <div className="kv__key">Repeated corrections</div>
            <div className="kv__val">
              How many times you explained the same project fact to the agent. A count that stays
              flat means memory is being written but not read, or is being read and ignored
              because it is buried in entries that should have been pruned.
            </div>
          </div>
          <div className="kv__row">
            <div className="kv__key">Silent stages</div>
            <div className="kv__val">
              How often a stage produced no output. A verify stage with nothing in the transcript
              is a verify stage that did not run, and it is the single most useful thing to grep
              your session logs for.
            </div>
          </div>
          <div className="kv__row">
            <div className="kv__key">Tokens per completed change</div>
            <div className="kv__val">
              Expect this to rise on adoption and fall as you prune. If it rises and stays risen,
              the rule layer or the delegation pattern is carrying weight it does not need to.
            </div>
          </div>
        </div>

        <p className="t-small measure" style={{ marginTop: '1.5rem' }}>
          A fuller treatment, including how to build an evaluation set for your own repository, is
          in <Link href={guideHref('the-evaluation-guide', '/guides')}>the evaluation guide</Link>.
        </p>
      </section>

      {/* Close */}
      <section className="container section">
        <div className="cta-band">
          <p className="t-eyebrow">Next</p>
          <h2 className="t-h2">Run it once and watch the stages fire</h2>
          <p className="t-lead" style={{ maxWidth: '54ch' }}>
            Pick a change small enough to hold in your head and real enough to matter. The first
            run is not about the output. It is about whether the plan, the failing test, the
            scoped review, and the verified build each actually happened.
          </p>
          <div style={{ width: '100%', maxWidth: '34rem' }}>
            <CopyCommand command={SITE.installCommand} />
          </div>
          <div className="hero__ctas">
            <Link className="btn btn--primary" href="/docs/getting-started">
              Get started
              <ArrowRightIcon size={16} />
            </Link>
            <Link className="btn" href={guideHref('the-field-guide', '/guides')}>
              Read the field guide
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
