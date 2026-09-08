import Link from 'next/link';
import type { Metadata } from 'next';

import { CopyCommand } from '@/components/copy-command';
import { FaqPreview } from '@/components/faq-preview';
import { HeroTerminal } from '@/components/hero-terminal';
import {
  AgentIcon,
  ArrowRightIcon,
  CommandIcon,
  HookIcon,
  LoopIcon,
  MemoryIcon,
  RuleIcon,
  ShieldIcon,
  SkillIcon,
} from '@/components/icons';
import { InstallFootprint } from '@/components/install-footprint';
import { LearningSection } from '@/components/learning-section';
import { SectionHead } from '@/components/page-parts';
import { RecentChanges } from '@/components/recent-changes';
import { SessionWalkthrough } from '@/components/session-walkthrough';
import { SkillsSampler } from '@/components/skills-sampler';
import { getCounts, getDocEntries, getSkillByName } from '@/lib/content';
import { HARNESSES, LOOP_STEPS, SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: `${SITE.name} — ${SITE.tagline}`,
  description: SITE.description,
};

function docHref(slug: string, fallback: string): string {
  const match = getDocEntries().find((entry) => entry.slug.join('/') === slug);
  return match ? match.href : fallback;
}

export default function HomePage() {
  const counts = getCounts();
  const learningSkill = getSkillByName('continuous-learning-v2') ?? getSkillByName('continuous-learning');
  const faqHref = docHref('faq', '/docs');

  /**
   * The six ways a capable model without a process fails. None of them is
   * exotic; each is something a competent team already guards against.
   */
  const failureModes = [
    {
      mode: 'It edits before the shape is settled',
      without:
        'The first tool call is a write. By the time anyone asks where the boundary should sit, four files already assume an answer, and the cheapest way forward is to keep going.',
      withoutExample: 'edit  src/cache.ts  ·  edit  src/db.ts  ·  edit  src/api.ts',
      with: 'Planning is a stage with an output. The plan is written to a file and the run pauses there, so the shape is arguable while it is still cheap to change and the diff can be checked against it afterwards.',
      withExample: 'plan  4 files · 1 new middleware · no schema change',
    },
    {
      mode: 'It writes tests that agree with the code',
      without:
        'The implementation lands first and the test is written to describe it. It asserts what the function returns rather than what the change was for, so it passes on the bug as readily as on the fix.',
      withoutExample: 'expect(limit(req)).toEqual(result)',
      with: 'The failing test lands first and states the expectation in the requirement’s terms. Watching it fail for the stated reason is what proves the test can detect the absence of the change.',
      withExample: 'FAIL  expected 429 after 6 requests, got 200',
    },
    {
      mode: 'It reviews its own work in its own context',
      without:
        'The window that argued for the approach is asked to find the flaw in it. Everything that made the approach look right is still loaded, so review becomes a summary of the diff instead of an audit of it.',
      withoutExample: 'same window · same reasoning · same blind spot',
      with: 'Review is delegated to a subagent with its own context window, a tool allowlist of Read, Grep and Glob, and no memory of the argument that produced the code. It routes by the files the change touched.',
      withExample: 'review  fresh context · read-only · 1 finding',
    },
    {
      mode: 'It reports success from the diff',
      without:
        'The change looks complete, so the run says it is complete. No build was invoked, no suite was run, and the sentence that reports the result is a prediction rather than an observation.',
      withoutExample: 'Done. The endpoint is now rate limited.',
      with: 'Verification is a stage that runs the build, the test suite, and the security scan, and reads each result. A stage that produced no output did not run, and the run says so.',
      withExample: 'verify  build ok · lint ok · 12 passed, 0 failed',
    },
    {
      mode: 'It forgets a correction an hour later',
      without:
        'You explain that the limiter is per-process and will not hold behind the load balancer. Two sessions on, the same assumption is back, because the correction lived only in a transcript that has since been compacted away.',
      withoutExample: 'context compacted · correction discarded',
      with: 'What was learned is written to disk at the end of a session and read at the start of the next. The correction outlives the window that received it, and the next run begins already knowing it.',
      withExample: 'remember  rate limits are per-process here -> saved',
    },
    {
      mode: 'It re-derives the workflow from your prompt',
      without:
        'The process exists only in how well you phrased the request. Ask carelessly on a tired afternoon and you get a different engineering standard than you got that morning.',
      withoutExample: 'quality of output = quality of that one prompt',
      with: `The process is installed, not requested. ${counts.rules} rule files for the stack are injected at session start, ${counts.skills} skills wait behind their triggers, and hooks fire on lifecycle events whether or not the model cooperates.`,
      withExample: `${counts.hooks} hooks · ${counts.rules} rules · session start`,
    },
  ];

  const costs = [
    {
      icon: <EyeOffIcon />,
      title: 'Review that never happened',
      body: 'A diff approved inside the context that wrote it has been summarised, not reviewed. The finding it would have caught surfaces later, in a place where it is expensive.',
    },
    {
      icon: <LoopIcon size={20} />,
      title: 'The same correction, repeatedly',
      body: 'Every lesson that is not written down is paid for again next session. The cost is not the minute of retyping; it is the change that shipped before you noticed the assumption had returned.',
    },
    {
      icon: <MemoryIcon size={20} />,
      title: 'A context window spent on setup',
      body: 'Conventions re-explained in every prompt occupy the one resource that is genuinely scarce. Tokens spent restating your standards are tokens not spent on the problem.',
    },
  ];

  const pillars = [
    {
      icon: <SkillIcon size={20} />,
      title: 'Skills',
      href: '/skills',
      lines: [
        `${counts.skills} procedures the agent loads on demand, each one a directory with a SKILL.md.`,
        'A skill is read only when its trigger matches, so the catalog costs nothing until it is needed.',
      ],
      cta: 'Browse the catalog',
    },
    {
      icon: <AgentIcon size={20} />,
      title: 'Agents',
      href: '/agents',
      lines: [
        `${counts.agents} subagents with their own context window, tool allowlist, and model tier.`,
        'Reviewers are read-only. Resolvers can write. Routing is by the files a change touches.',
      ],
      cta: 'See the routing table',
    },
    {
      icon: <CommandIcon size={20} />,
      title: 'Commands',
      href: '/commands',
      lines: [
        `${counts.commands} slash-command shims that name an intent and hand off to a skill.`,
        'A shim stays thin on purpose: the durable behaviour belongs in the skill it fronts.',
      ],
      cta: 'See every command',
    },
    {
      icon: <HookIcon size={20} />,
      title: 'Hooks',
      href: docHref('hooks-guide', '/docs'),
      lines: [
        'Deterministic code on the lifecycle: session start, pre-tool, post-edit, stop.',
        'Hooks enforce what a prompt can only request. They format, block, and record.',
      ],
      cta: 'Read the hooks guide',
    },
    {
      icon: <RuleIcon size={20} />,
      title: 'Rules',
      href: docHref('rules-guide', '/docs'),
      lines: [
        `${counts.rules} rule files covering coding style, patterns, security, and testing per stack.`,
        'Rules are injected wholesale, so each file is kept short. Length is a direct context cost.',
      ],
      cta: 'Read the rules guide',
    },
    {
      icon: <ShieldIcon size={20} />,
      title: SITE.shield,
      href: '/security',
      lines: [
        'A security scanner for the agent surface: prompt injection, exfiltration, unsafe tool use.',
        'It treats fetched pages, MCP responses, and package metadata as untrusted data.',
      ],
      cta: 'See what it scans',
    },
  ];

  return (
    <>
      {/* Hero */}
      <section className="container hero">
        <div className="hero__grid">
          <div className="hero__inner">
            <span className="chip chip--dot">Version {SITE.version} · MIT</span>

            <h1 className="t-display">The engineering system your coding agent is missing</h1>

            <p className="t-lead hero__subhead">
              A coding agent brings a model. FORGE brings the process around it: a written plan, a
              failing test, a scoped review, a verified build, and a memory that outlives the
              context window.
            </p>

            <div className="hero__ctas">
              <Link className="btn btn--primary" href="/docs/getting-started">
                Get started
                <ArrowRightIcon size={16} />
              </Link>
              <Link className="btn" href="/why">
                Why this exists
              </Link>
              <Link className="btn btn--ghost" href="/skills">
                Browse skills
              </Link>
            </div>

            <div style={{ width: '100%', maxWidth: '34rem' }}>
              <CopyCommand command={SITE.installCommand} />
              <p className="t-small" style={{ marginTop: '0.6rem' }}>
                Installs the catalog to <code className="t-mono">{SITE.installDir}</code> and
                registers an adapter for each coding agent it finds.
              </p>
            </div>
          </div>

          <HeroTerminal />
        </div>
      </section>

      {/* Why this exists */}
      <section className="container section" aria-labelledby="why-this-exists">
        <SectionHead
          eyebrow="Why this exists"
          id="why-this-exists"
          title="A capable model with no process fails in predictable ways"
          lead="Not exotic ways. The ordinary ones a competent team already guards against, arriving one at a time in a session that looks like it is going well. FORGE makes the guard the default instead of something you re-specify in every prompt."
        />

        <div className="swap">
          <div className="swap__head" aria-hidden="true">
            <div className="swap__heading">Failure mode</div>
            <div className="swap__heading">A model on its own</div>
            <div className="swap__heading">The same model under FORGE</div>
          </div>

          {failureModes.map((item) => (
            <div className="swap__row" key={item.mode}>
              <div className="swap__cell">
                <p className="swap__mode">{item.mode}</p>
              </div>
              <div className="swap__cell">
                <span className="swap__tag">On its own</span>
                <p className="swap__text">
                  {item.without}
                  <code className="swap__example u-wrap">{item.withoutExample}</code>
                </p>
              </div>
              <div className="swap__cell swap__cell--with">
                <span className="swap__tag">Under FORGE</span>
                <p className="swap__text">
                  {item.with}
                  <code className="swap__example u-wrap">{item.withExample}</code>
                </p>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'clamp(2.5rem, 2rem + 2vw, 3.5rem)' }}>
          <h3 className="t-h3" style={{ marginBottom: '0.5rem' }}>
            What replaces it is one loop, run the same way every time
          </h3>
          <p className="t-body u-muted measure" style={{ marginBottom: '1.5rem' }}>
            Each stage has an owner in the catalog and a check that says whether it ran. The
            stages are not advice in a prompt; they are files on disk that the harness loads.
          </p>

          <div className="loop-strip">
            {LOOP_STEPS.map((step, index) => (
              <div className="loop-strip__step" key={step.name}>
                <span className="loop-strip__index">{String(index + 1).padStart(2, '0')}</span>
                <span className="loop-strip__name">{step.name}</span>
                <span className="loop-strip__note">{step.note}</span>
              </div>
            ))}
          </div>

          <p className="t-small measure" style={{ marginTop: '1.25rem' }}>
            The scarce resource is the context window, so the system loads a narrow slice per task
            and persists everything else to disk. {SITE.claim}
          </p>
        </div>

        <div style={{ marginTop: 'clamp(2.5rem, 2rem + 2vw, 3.5rem)' }}>
          <h3 className="t-h3" style={{ marginBottom: '0.5rem' }}>
            What it costs you not to have it
          </h3>
          <p className="t-body u-muted measure" style={{ marginBottom: '1.5rem' }}>
            None of these show up as an error. They show up as work that has to be done twice.
          </p>

          <div className="grid grid--3">
            {costs.map((cost) => (
              <div className="card" key={cost.title}>
                <span className="card__icon">{cost.icon}</span>
                <h4 className="card__title">{cost.title}</h4>
                <p className="card__body">{cost.body}</p>
              </div>
            ))}
          </div>

          <p className="t-small measure" style={{ marginTop: '1.5rem' }}>
            <Link href="/why">The long version</Link> covers who this is for and who it is not
            for, what changes on day one against what changes in month three, and where FORGE does
            not help — it does not make a weak model strong, and it is not free of cost.
          </p>
        </div>
      </section>

      {/* Catalog counts */}
      <section className="container section">
        <SectionHead
          eyebrow="Catalog"
          title="What gets installed"
          lead="Counted from the repository at build time, not written down. The numbers move when the catalog moves."
        />

        <div className="stat-row">
          <Link className="stat" href="/agents">
            <span className="stat__value">{counts.agents}</span>
            <span className="stat__label">Agents</span>
            <span className="stat__note">Subagents with their own window and tool allowlist</span>
          </Link>
          <Link className="stat" href="/skills">
            <span className="stat__value">{counts.skills}</span>
            <span className="stat__label">Skills</span>
            <span className="stat__note">Procedures loaded on demand, one directory each</span>
          </Link>
          <Link className="stat" href="/commands">
            <span className="stat__value">{counts.commands}</span>
            <span className="stat__label">Commands</span>
            <span className="stat__note">Slash-command shims that front a skill</span>
          </Link>
          <Link className="stat" href={docHref('rules-guide', '/docs')}>
            <span className="stat__value">{counts.rules}</span>
            <span className="stat__label">Rules</span>
            <span className="stat__note">Per-stack constraints injected at session start</span>
          </Link>
          <Link className="stat" href={docHref('hooks-guide', '/docs')}>
            <span className="stat__value">{counts.hooks}</span>
            <span className="stat__label">Hooks</span>
            <span className="stat__note">Lifecycle checks the model cannot decide to skip</span>
          </Link>
          <Link className="stat" href="/platforms">
            <span className="stat__value">{counts.harnesses}</span>
            <span className="stat__label">Harnesses</span>
            <span className="stat__note">Coding agents with an adapter in the repository</span>
          </Link>
          <Link className="stat" href="/docs">
            <span className="stat__value">{counts.docs}</span>
            <span className="stat__label">Doc pages</span>
            <span className="stat__note">Reference pages, rendered from the repository</span>
          </Link>
          <Link className="stat" href="/guides">
            <span className="stat__value">{counts.guides}</span>
            <span className="stat__label">Guides</span>
            <span className="stat__note">Long-form walkthroughs, read start to finish</span>
          </Link>
        </div>
      </section>

      {/* How a session runs */}
      <section className="container section" aria-labelledby="how-a-session-runs">
        <SectionHead
          eyebrow="A worked example"
          id="how-a-session-runs"
          title="How a session actually runs"
          lead="One ordinary request — support reports that the weekly usage export is missing rows — carried through all seven phases. Each phase shows the line the operator sees when it reports, and what the same request produces when that phase is not there."
        />

        <SessionWalkthrough />

        <p className="t-small measure" style={{ marginTop: '1.25rem' }}>
          The transcript fragments illustrate the shape of a run rather than reproduce one. What is
          fixed is the order of the phases, which of them can write, and the fact that each has an
          owner in the catalog and a check that says whether it ran.
        </p>
      </section>

      {/* What you get */}
      <section className="container section">
        <SectionHead
          eyebrow="What you get"
          title="Six pieces, one system"
          lead="Each piece answers a different question. Skills answer how. Agents answer who. Commands answer when. Hooks answer what must always happen. Rules answer what is never allowed. Forge Shield answers what is unsafe."
        />

        <div className="grid grid--3">
          {pillars.map((pillar) => (
            <Link className="card" href={pillar.href} key={pillar.title}>
              <span className="card__icon">{pillar.icon}</span>
              <h3 className="card__title">{pillar.title}</h3>
              {pillar.lines.map((line) => (
                <p className="card__body" key={line}>
                  {line}
                </p>
              ))}
              <span className="card__foot">
                {pillar.cta}
                <ArrowRightIcon size={14} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Mental model */}
      <section className="container section">
        <SectionHead
          eyebrow="Mental model"
          title="How the pieces relate"
          lead="Read this once and the rest of the documentation is navigation rather than discovery."
        />

        <div className="panel">
          <div className="table-scroll">
            <table className="data-table">
              <caption className="visually-hidden">
                What each part of FORGE is, when it runs, and what it costs in context
              </caption>
              <thead>
                <tr>
                  <th scope="col">Piece</th>
                  <th scope="col">Is</th>
                  <th scope="col">Runs</th>
                  <th scope="col">Context cost</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row" className="data-table__name">
                    Skill
                  </th>
                  <td className="data-table__desc">
                    A directory with a SKILL.md describing a procedure and when to use it
                  </td>
                  <td>When its trigger matches</td>
                  <td>Only the matched skill</td>
                </tr>
                <tr>
                  <th scope="row" className="data-table__name">
                    Agent
                  </th>
                  <td className="data-table__desc">
                    A subagent with its own context window, tool allowlist, and model tier
                  </td>
                  <td>When work is delegated to it</td>
                  <td>None in the parent window</td>
                </tr>
                <tr>
                  <th scope="row" className="data-table__name">
                    Command
                  </th>
                  <td className="data-table__desc">
                    A slash-command shim that names an intent and calls a skill
                  </td>
                  <td>When you type it</td>
                  <td>One line, plus the skill it loads</td>
                </tr>
                <tr>
                  <th scope="row" className="data-table__name">
                    Hook
                  </th>
                  <td className="data-table__desc">
                    Deterministic code registered against a lifecycle event
                  </td>
                  <td>Always, on the event it matches</td>
                  <td>Its output only</td>
                </tr>
                <tr>
                  <th scope="row" className="data-table__name">
                    Rule
                  </th>
                  <td className="data-table__desc">
                    A short constraint file for one stack and one topic
                  </td>
                  <td>Injected at session start</td>
                  <td>The whole file, every session</td>
                </tr>
                <tr>
                  <th scope="row" className="data-table__name">
                    Memory
                  </th>
                  <td className="data-table__desc">
                    Durable notes written at the end of a session and read at the start of the next
                  </td>
                  <td>Session start and session end</td>
                  <td>A summary, not the transcript</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="t-small" style={{ marginTop: '1rem' }}>
            The rule of thumb: if a behaviour must happen every time, it is a hook. If it must
            never happen, it is a rule. If it is a procedure you reach for sometimes, it is a
            skill. If it needs its own context window, it is an agent.
          </p>
        </div>
      </section>

      {/* Skills sampler */}
      <section className="container section" aria-labelledby="a-sample-of-the-catalog">
        <SectionHead
          eyebrow="The catalog, sampled"
          id="a-sample-of-the-catalog"
          title="What a skill looks like when it fires"
          lead="A spread across testing, security, frontend, data and operations, each with the description the model matches against. That description is the entire trigger: a vague one means the skill either never loads or loads constantly, which is why authoring one has a contract."
        />

        <SkillsSampler />

        <p className="t-small measure" style={{ marginTop: '1.5rem' }}>
          These are read from the catalog when the page is built. All {counts.skills} of them are on
          the <Link href="/skills">skills page</Link>, searchable and grouped. You should not
          install every one —{' '}
          <span className="t-mono u-wrap">--profile developer</span> plus the capability components
          a real task needs is the shape that works.
        </p>
      </section>

      {/* Install footprint */}
      <section className="container section" aria-labelledby="what-lands-on-your-machine">
        <SectionHead
          eyebrow="Footprint"
          id="what-lands-on-your-machine"
          title="What this puts on your machine"
          lead="A plain answer, with the sizes measured from the repository rather than written down. Two channels reach a harness, four kinds of state outlive an uninstall, and almost nothing in the catalog is in the context window at any given moment."
        />

        <InstallFootprint />

        <p className="t-small measure" style={{ marginTop: '1.5rem' }}>
          Every path, flag and leftover is in the{' '}
          <Link href={docHref('installation', '/docs')}>installation reference</Link>; every
          environment variable and its precedence chain is in the{' '}
          <Link href={docHref('configuration', '/docs')}>configuration reference</Link>.
        </p>
      </section>

      {/* Continuous learning */}
      <section className="container section" aria-labelledby="continuous-learning">
        <SectionHead
          eyebrow="Continuous learning"
          id="continuous-learning"
          title="How a correction becomes an instinct"
          lead="The remember and improve phases are the two that are easiest to leave out and the two that decide whether month three is better than day one. This is the path a single correction takes from the moment you make it to the moment a later session starts already holding it."
        />

        <LearningSection
          skillHref={learningSkill ? `/skills/${learningSkill.name}` : undefined}
        />
      </section>

      {/* Harness support */}
      <section className="container section">
        <SectionHead
          eyebrow="Harness support"
          title="One catalog, many agents"
          lead="Claude Code is the primary target. The other harnesses receive a projection of the same catalog through an adapter; coverage varies by what each harness exposes."
        />

        <div className="grid grid--3">
          {HARNESSES.map((harness) => (
            <div className="card" key={harness.name}>
              <h3 className="card__title">{harness.name}</h3>
              <p className="card__body">{harness.note}</p>
            </div>
          ))}
        </div>

        <p className="t-small measure" style={{ marginTop: '1.25rem' }}>
          An adapter is a projection, never a second source of truth. When an adapter and the
          catalog disagree, the catalog is right.{' '}
          <Link href="/platforms">See the full support matrix</Link>.
        </p>
      </section>

      {/* Recent changes */}
      <section className="container section" aria-labelledby="recent-changes">
        <SectionHead
          eyebrow="Recent changes"
          id="recent-changes"
          title="What moved most recently"
          lead="Read out of the repository changelog at build time. An empty release block renders nothing rather than an announcement with no content behind it."
        />

        <RecentChanges />
      </section>

      {/* FAQ */}
      <section className="container section" aria-labelledby="questions">
        <SectionHead
          eyebrow="Questions"
          id="questions"
          title="Asked before installing"
          lead="Taken from the repository FAQ, which answers honestly where a claim could not be checked against the code. The accordion works with JavaScript switched off."
        />

        <FaqPreview faqHref={faqHref} />
      </section>

      {/* Closing CTA */}
      <section className="container section">
        <div className="cta-band">
          <p className="t-eyebrow">Next</p>
          <h2 className="t-h2">Install it and run the loop once</h2>
          <p className="t-lead" style={{ maxWidth: '52ch' }}>
            Pick a small, real change in a repository you control. The point of the first run is
            to watch each stage fire, not to ship anything.
          </p>
          <div style={{ width: '100%', maxWidth: '34rem' }}>
            <CopyCommand command={SITE.installCommand} />
          </div>
          <div className="hero__ctas">
            <Link className="btn btn--primary" href="/docs/getting-started">
              Get started
              <ArrowRightIcon size={16} />
            </Link>
            <Link className="btn" href="/guides">
              Read the guides
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

/** Local to this page: a struck-through eye, for review that did not happen. */
function EyeOffIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 6.5A15.6 15.6 0 0 0 2.5 12S6 18.5 12 18.5a9.7 9.7 0 0 0 4.4-1" />
      <path d="M9.8 6a10.6 10.6 0 0 1 2.2-.2c6 0 9.5 6.2 9.5 6.2a16.7 16.7 0 0 1-2.8 3.6" />
      <path d="M10 10a2.8 2.8 0 0 0 4 4" />
      <path d="m4 4 16 16" />
    </svg>
  );
}
