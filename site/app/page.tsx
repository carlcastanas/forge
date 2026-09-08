import Link from 'next/link';
import type { Metadata } from 'next';

import { CopyCommand } from '@/components/copy-command';
import {
  AgentIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  CommandIcon,
  HookIcon,
  MinusCircleIcon,
  RuleIcon,
  ShieldIcon,
  SkillIcon,
} from '@/components/icons';
import { SectionHead } from '@/components/page-parts';
import { getCounts, getDocEntries } from '@/lib/content';
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
      href: docHref('threat-model', '/docs'),
      lines: [
        'A security scanner for the agent surface: prompt injection, exfiltration, unsafe tool use.',
        'It treats fetched pages, MCP responses, and package metadata as untrusted data.',
      ],
      cta: 'Read the threat model',
    },
  ];

  const without = [
    'The model starts every session with no memory of the last one and re-derives your conventions.',
    'A plan exists only in the transcript, so nothing can check whether the work matched it.',
    'Tests are written after the code, against the code, and pass for the wrong reason.',
    'Review is whatever the same model that wrote the diff thinks of the diff.',
    'The build is declared green without the output being read.',
    'What was learned dies with the context window.',
  ];

  const withForge = [
    'Session start loads the rules for the stack and the memory written by the last session.',
    'The planner writes the plan to a file before a single edit, so the diff can be checked against it.',
    'A failing test lands first and defines done.',
    'The diff is routed to a read-only reviewer scoped to the language it touches.',
    'Verification runs the build, the suite, and the security scan, and reads each result.',
    'What was learned is written back into memory and into the rules that produced it.',
  ];

  return (
    <>
      {/* Hero */}
      <section className="container hero">
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
            <Link className="btn" href="/skills">
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
      </section>

      {/* The loop */}
      <section className="container section">
        <SectionHead
          eyebrow="The loop"
          title="One pass, seven stages, every time"
          lead="FORGE does not make the model smarter. It makes the model finish. Each stage has an owner in the catalog and a check that says whether it ran."
        />

        <div className="loop-strip">
          {LOOP_STEPS.map((step, index) => (
            <div className="loop-strip__step" key={step.name}>
              <span className="loop-strip__index">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="loop-strip__name">{step.name}</span>
              <span className="loop-strip__note">{step.note}</span>
            </div>
          ))}
        </div>

        <p className="t-small" style={{ marginTop: '1.25rem', maxWidth: '62ch' }}>
          {SITE.claim} Everything the agent might need is on disk. Only what the current stage
          needs is in the window.
        </p>
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
        </div>
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

      {/* Before / after */}
      <section className="container section">
        <SectionHead
          eyebrow="Before and after"
          title="The same session, twice"
          lead="Nothing below depends on a better model. It depends on the process around the model."
        />

        <div className="compare">
          <div className="compare__col">
            <h3 className="t-h3">Without FORGE</h3>
            <ul className="compare__list">
              {without.map((item) => (
                <li className="compare__item compare__item--neg" key={item}>
                  <MinusCircleIcon size={16} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="compare__col compare__col--with">
            <h3 className="t-h3">With FORGE</h3>
            <ul className="compare__list">
              {withForge.map((item) => (
                <li className="compare__item compare__item--pos" key={item}>
                  <CheckCircleIcon size={16} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
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

        <p className="t-small" style={{ marginTop: '1.25rem', maxWidth: '62ch' }}>
          An adapter is a projection, never a second source of truth. When an adapter and the
          catalog disagree, the catalog is right.{' '}
          <Link href={docHref('harness-matrix', '/docs')}>See the full support matrix</Link>.
        </p>
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
