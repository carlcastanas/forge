import Link from 'next/link';
import type { Metadata } from 'next';

import { CopyCommand } from '@/components/copy-command';
import {
  AgentIcon,
  AlertIcon,
  ArrowRightIcon,
  BookIcon,
  CheckCircleIcon,
  DocIcon,
  HookIcon,
  InfoIcon,
  IsolationIcon,
  KeyIcon,
  LayersIcon,
  PlugIcon,
  ShieldIcon,
  TerminalIcon,
} from '@/components/icons';
import { JumpList, SectionHead, TableScroll } from '@/components/page-parts';
import { getDocEntries, getGuides } from '@/lib/content';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Forge Shield',
  description:
    'Forge Shield scans the agent surface itself: prompt files, hooks, MCP configuration, tool permissions, secrets, and agent definitions. What it covers, what it does not, and the controls that bound the rest.',
};

function docHref(slug: string, fallback: string): string {
  const match = getDocEntries().find((entry) => entry.slug.join('/') === slug);
  return match ? match.href : fallback;
}

function guideHref(slug: string, fallback: string): string {
  const match = getGuides().find((guide) => guide.slug === slug);
  return match ? match.href : fallback;
}

/* -------------------------------------------------------------------------- */
/* Page content                                                               */
/* -------------------------------------------------------------------------- */

type Coverage = {
  surface: string;
  covers: string;
  omits: string;
};

const COVERAGE: Coverage[] = [
  {
    surface: 'Prompt files',
    covers:
      'Credential shapes pasted into prompt bodies, and prompts that take in untrusted material while carrying no prompt-defense block.',
    omits:
      'Whether the instructions in the file are correct, current, or a good idea. A well-written prompt and a hostile one are both well-formed.',
  },
  {
    surface: 'Hooks',
    covers:
      'Executable entrypoints registered against lifecycle events, listed so the set can be diffed after an install or an update.',
    omits:
      'What the code inside the hook does when it runs. Registration shape is checkable; behaviour is not, and a hostile hook is a full compromise.',
  },
  {
    surface: 'MCP configuration',
    covers:
      'Servers that expose shell or filesystem access, remote transports, and invocations resolved from a registry at start rather than pinned.',
    omits:
      'The server implementation. The configuration template is in scope; the program it launches belongs to whoever publishes it.',
  },
  {
    surface: 'Tool permissions',
    covers:
      'Grants wider than the surrounding work needs, across agent tool allowlists and the permission entries in settings.',
    omits:
      'Whether a wide grant is justified. Some workflows genuinely need shell. The scanner reports the breadth and leaves the judgement.',
  },
  {
    surface: 'Secrets',
    covers:
      'Known credential shapes anywhere in the scanned tree, including prompt text, configuration, and committed environment files.',
    omits:
      'Every secret shape. It is a backstop behind pre-commit and CI scanning, not a classifier, and a novel format will pass it.',
  },
  {
    surface: 'Agent definitions',
    covers:
      'Missing prompt-defense baselines and the breadth of declared capability, per agent, against the work the description claims.',
    omits:
      'How the model behaves under adversarial input. No static read of a definition predicts what the model does when it is argued with.',
  },
];

type Invocation = {
  title: string;
  command: string;
  note: string;
};

const INVOCATIONS: Invocation[] = [
  {
    title: 'Read the report',
    command: 'npx forge-shield scan --path . --format text',
    note: 'The default pass over a checkout. Point --path at a plugin directory or a cloned repository to read it before it is installed or opened in an agent.',
  },
  {
    title: 'Gate a pipeline on it',
    command: 'npx forge-shield scan --path . --format json --min-severity medium',
    note: 'Structured output with the low-severity noise dropped, which is the shape a CI job wants. Wire it to every change under hooks/, mcp-configs/, or an adapter directory.',
  },
  {
    title: 'Apply the safe fixes',
    command: 'npx forge-shield scan --fix',
    note: 'Only the findings the scanner marks auto-fixable are touched. Everything that needs a decision stays in the report, unchanged, for you to make it.',
  },
];

const SAMPLE_REPORT = `$ npx forge-shield scan --path . --format text

forge-shield  scan  ./            6 surfaces · 148 files · 2.1s

ACTIVE RUNTIME — 7 findings

  high    mcp-shell-exposure
          .mcp.json:14   server "ops-runner"
          Launches a shell command and declares no tool restriction.
          Every session opened in this project inherits it.

  high    mcp-unpinned-invocation
          .mcp.json:31   server "docs-search"
          Started through npx with no version. Whatever upstream
          publishes next is what runs next.

  medium  permission-grant-too-broad
          .claude/settings.json:9
          allow: Bash(*), and no deny list is present.

  medium  hook-registered-on-pretooluse
          .claude/settings.json:22  ->  hooks/format-and-push.sh
          Executable hook on a lifecycle event. The registration is
          well-formed. The code inside it was not read.

  medium  agent-missing-prompt-defense
          agents/pr-triage.md
          Reads pull-request bodies, declares WebFetch, and carries
          no prompt-defense block.

  low     credential-paths-readable
          .claude/settings.json
          No deny rule covers ~/.ssh, ~/.aws, or **/.env.

  low     secret-shape-in-prompt-text
          agents/deploy-notes.md:40
          Matches a known access-key shape. Confirm, then rotate.

LOWER-CONFIDENCE INVENTORY — 12 findings

  docs/examples/*.md                6   documentation examples
  .claude-plugin/marketplace.json   4   plugin manifest entries
  .mcp.json  (disabled servers)     2   project-local optional settings

SUMMARY  active 7  (high 2 · medium 3 · low 2)    inventory 12
         2 findings are marked auto-fixable — rerun with --fix`;

type RiskSurface = {
  icon: React.ReactNode;
  title: string;
  paragraphs: string[];
  wrong: string;
  bound: string;
};

const RISK_SURFACES: RiskSurface[] = [
  {
    icon: <HookIcon size={20} />,
    title: 'Harness configuration',
    paragraphs: [
      'Settings files, hook registrations, MCP entries, agent definitions, and committed environment files all travel through source control, and all of them change what executes on the machine that opens the project. They are read as configuration and behave as code.',
      'That makes them the one class of input that crosses from semi-trusted into trusted without anybody deciding to promote it. Cloning a repository and opening an agent inside it is an action with consequences, and the consequences are described in files most reviewers skim past on their way to the source.',
    ],
    wrong:
      'A checkout you pulled to look at one bug carries a settings file that registers a hook script and an environment file that names the variables which switch hook enforcement off. Both are applied when the session starts, before a line of the actual code has been read.',
    bound:
      'Read the configuration directories, the MCP entries, and any committed environment files with cat before the first agent session, not by asking the agent to summarise them. Deny writes to settings, hook, and credential paths so a session cannot widen its own grant. Scan the tree first; diff the hook registrations after every install and update.',
  },
  {
    icon: <DocIcon size={20} />,
    title: 'Untrusted foreign data',
    paragraphs: [
      'A file comment, an issue body, a fetched page, a dependency README, a tool result, a document, and a memory entry written by an earlier session all land in the same context window as your instructions, and the same mechanism weighs all of them. There is no parser separating instruction from data, because the parser is a language model whose job is to act on natural language.',
      'So the useful question is not whether the model can be talked into something. Assume it can. The question is what the process is permitted to do once it has been, and that is settled long before the text arrives.',
    ],
    wrong:
      'An agent is asked to summarise the changelog of a dependency before an upgrade. Somewhere in that text is a paragraph addressed to the reader that is the model rather than to the reader that is you. Telling the model in advance to disregard instructions found in content reduces the hit rate; under a long session and enough pressure it is a mitigation, not a boundary.',
    bound:
      'Sort inputs into trusted, semi-trusted, and untrusted, and handle the third differently. Split extraction from action: one agent with read and search tools, no shell, no write, no network, returns structured facts; a second agent acts on those facts and never sees the raw material. An injection that lands in the first process lands somewhere holding nothing and reaching nowhere.',
  },
  {
    icon: <PlugIcon size={20} />,
    title: 'Tool and MCP exposure',
    paragraphs: [
      'An MCP server is a program granted a seat inside the trust boundary. Its tool names, descriptions, and schemas are read as context before any tool is called, so a server can shape behaviour without ever being invoked, and everything it returns is a conduit for whatever it fetched.',
      'Tool allowlists are the other half of the same surface. A capability that is not granted cannot be argued into use, which is why a read-only reviewer gets read and search tools and nothing else, and why widening one is a reviewable change rather than a convenience.',
    ],
    wrong:
      'A connector is added for one genuinely useful operation. It also exposes filesystem and shell, and it starts through an unpinned invocation, so the version reviewed on the day it was added is not the version running a month later. Nothing announces the change, and attribution after the fact is hard: the trail through the model reasoning is not always reconstructable.',
    bound:
      'Prefer a command-line tool wrapped in a skill unless held-open session state is genuinely required; a CLI call runs once and returns once, while a connector participates in every session. Pin or vendor the servers you keep, grant each one only the tools it needs, keep the unused ones configured and disconnected, and log tool inputs and outputs somewhere the agent cannot write.',
  },
];

const CONDITIONS = [
  {
    title: 'Access to something valuable',
    body: 'Source, credentials on disk, customer data, a production system reachable with whatever the machine is already authenticated as.',
  },
  {
    title: 'Exposure to untrusted content',
    body: 'Anything the operator did not author and review: foreign code, a pull request, a fetched page, package metadata, a tool result, a recalled memory.',
  },
  {
    title: 'A path out',
    body: 'Network egress, a push, an outbound call, or a written file that something else later reads. The exit does not have to look like an exit.',
  },
];

const LAYERS = [
  {
    layer: 'Forge Shield',
    mechanism:
      'Deterministic scan of the prompt, hook, MCP, permission, secret, and agent-definition surfaces',
    runs: 'On demand, and in CI',
  },
  {
    layer: 'Lifecycle hooks',
    mechanism: 'Enforcement that does not depend on the model agreeing with it',
    runs: 'Every matching tool event',
  },
  {
    layer: 'Permission model',
    mechanism: 'Per-agent tool allowlists, command restrictions, and install profiles',
    runs: 'Every tool invocation',
  },
  {
    layer: 'Repository validators',
    mechanism:
      'Unicode safety, personal-path detection, hook and workflow validation over tracked content',
    runs: 'The test gate, before every commit',
  },
];

/** The page's own contents, shown in the hero and used as its reading order. */
const SECTIONS = [
  { href: '#coverage', label: 'Six surfaces, and the line under each one' },
  { href: '#running-it', label: 'Three invocations worth knowing' },
  { href: '#output', label: 'What a report looks like' },
  { href: '#risk-surfaces', label: 'Where agent security actually goes wrong' },
  { href: '#conditions', label: 'The condition that turns an injection into a breach' },
  { href: '#layers', label: 'Four independent layers' },
  { href: '#further', label: 'The long form, in the repository' },
];

export default function SecurityPage() {
  const threatModel = docHref('threat-model', '/docs');
  const securityGuide = guideHref('the-security-guide', '/guides');

  return (
    <>
      {/* Hero */}
      <section className="container hero">
        <div className="hero__grid hero__grid--nav">
          <div className="hero__inner">
            <span className="chip">
              {SITE.shield} · <span className="u-mono">forge-shield</span>
            </span>

            <h1 className="t-display">The configuration around your agent is an attack surface</h1>

            <p className="t-lead hero__subhead">
              Classical application security assumes a boundary between code and data. A coding
              agent has none. The files that decide what it may do — prompt files, hooks, MCP
              entries, tool allowlists, agent definitions — arrive through source control, take
              effect at session start, and are almost never scanned. Forge Shield scans them.
            </p>

            <div className="command-slot">
              <CopyCommand command="npx forge-shield scan --path . --format text" />
              <p className="t-small mt-2">
                Ships as the separate <code className="t-mono">forge-shield</code> package, free
                and MIT like the rest of the catalog. Inside a harness,{' '}
                <code className="t-mono">/security-scan</code> runs the same scanner and turns the
                findings into an ordered remediation plan.
              </p>
            </div>

            <div className="btn-row">
              <Link className="btn btn--primary" href={threatModel}>
                Read the threat model
                <ArrowRightIcon size={16} />
              </Link>
              <Link className="btn" href={securityGuide}>
                Read the security guide
              </Link>
            </div>
          </div>

          <JumpList items={SECTIONS} />
        </div>
      </section>

      {/* Coverage */}
      <section className="container section" aria-labelledby="coverage">
        <SectionHead
          eyebrow="Coverage"
          id="coverage"
          title="Six surfaces, and the line under each one"
          lead="Every row states what the scan decides mechanically and what it deliberately leaves alone. A finding is evidence to triage, not a verdict, and the scanner output is the source of truth for what it found. Anything past that output is judgement and should be labelled as such."
        />

        <TableScroll label="Each surface Forge Shield scans, what the scan looks for, and what it does not cover">
          <table className="data-table">
            <caption className="visually-hidden">
              Each surface Forge Shield scans, what the scan looks for, and what it does not cover
            </caption>
            <thead>
              <tr>
                <th scope="col">Surface</th>
                <th scope="col">What the scan looks for</th>
                <th scope="col">What it does not cover</th>
              </tr>
            </thead>
            <tbody>
              {COVERAGE.map((row) => (
                <tr key={row.surface}>
                  <th scope="row" className="data-table__name">
                    {row.surface}
                  </th>
                  <td className="data-table__desc">{row.covers}</td>
                  <td className="data-table__desc">{row.omits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>

        <div className="callout mt-4">
          <span className="callout__icon">
            <InfoIcon size={18} />
          </span>
          <div className="callout__body">
            <strong>The scan is deterministic.</strong> No model sits in the loop deciding whether
            a finding is real, which is what makes the same tree produce the same report twice and
            makes the output safe to gate a pipeline on. The cost of that determinism is the
            right-hand column above: intent, behaviour, and justification are not things a static
            read can settle.
          </div>
        </div>
      </section>

      {/* Running it */}
      <section className="container section" aria-labelledby="running-it">
        <SectionHead
          eyebrow="Running it"
          id="running-it"
          title="Three invocations worth knowing"
          lead="Run it before publishing a repository, before installing anything from anywhere, and in continuous integration on every change to a hook, an MCP configuration, or a harness adapter."
        />

        <div className="stack stack--loose">
          {INVOCATIONS.map((item) => (
            <div className="stack stack--tight" key={item.command}>
              <h3 className="t-h4">{item.title}</h3>
              <CopyCommand command={item.command} />
              <p className="t-small measure">{item.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Sample report */}
      <section className="container section" aria-labelledby="output">
        <SectionHead
          eyebrow="Output"
          id="output"
          title="What a report looks like"
          lead="The scan splits active runtime findings from lower-confidence inventory — documentation examples, template snippets, plugin manifests, project-local optional settings. That split is what makes a long list triageable. Treat the first group as work and the second as awareness."
        />

        <div className="terminal">
          <div className="terminal__bar">
            <span className="terminal__dots" aria-hidden="true">
              <span className="terminal__dot" />
              <span className="terminal__dot" />
              <span className="terminal__dot" />
            </span>
            <span className="terminal__label">sample output</span>
          </div>
          <div className="terminal__body terminal__body--auto">
            <pre className="terminal__lines">{SAMPLE_REPORT}</pre>
          </div>
        </div>

        <div className="callout mt-4">
          <span className="callout__icon">
            <TerminalIcon size={18} />
          </span>
          <div className="callout__body">
            <strong>Illustrative sample.</strong> The paths, servers, and counts above are invented
            to show the shape of a report — the severity ordering, the file and line references,
            the split between the two groups, and the summary line. They are not a scan of this
            repository or of any other.
          </div>
        </div>

        <div className="grid grid--2 mt-4">
          <div className="card">
            <span className="card__icon">
              <AlertIcon size={20} />
            </span>
            <h3 className="card__title">Active runtime</h3>
            <p className="card__body">
              Configuration that takes effect when a session opens in this project. These findings
              describe capability that already exists, so each one is either work or an accepted,
              recorded decision.
            </p>
          </div>
          <div className="card">
            <span className="card__icon">
              <LayersIcon size={20} />
            </span>
            <h3 className="card__title">Lower-confidence inventory</h3>
            <p className="card__body">
              Matches in material that documents or templates a pattern rather than enabling it.
              Worth knowing about, worth checking once, and not worth failing a build over until
              something moves it into the first group.
            </p>
          </div>
        </div>
      </section>

      {/* The three risk surfaces */}
      <section className="container section" aria-labelledby="risk-surfaces">
        <SectionHead
          eyebrow="Risk surfaces"
          id="risk-surfaces"
          title="The three places agent security actually goes wrong"
          lead="Not a taxonomy. These are the three surfaces that produce real incidents in agent workflows, each with the shape of the failure and the control that bounds it."
        />

        <div className="stack stack--loose">
          {RISK_SURFACES.map((surface) => (
            <div className="panel stack" key={surface.title}>
              <div className="stack stack--tight">
                <span className="card__icon">{surface.icon}</span>
                <h3 className="t-h3">{surface.title}</h3>
                {surface.paragraphs.map((paragraph) => (
                  <p className="t-body measure" key={paragraph.slice(0, 32)}>
                    {paragraph}
                  </p>
                ))}
              </div>

              <div className="kv">
                <div className="kv__row">
                  <div className="kv__key">How it goes wrong</div>
                  <div className="kv__val">{surface.wrong}</div>
                </div>
                <div className="kv__row">
                  <div className="kv__key">What bounds it</div>
                  <div className="kv__val">{surface.bound}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* The three conditions */}
      <section className="container section" aria-labelledby="conditions">
        <SectionHead
          eyebrow="The condition that matters"
          id="conditions"
          title="An injection becomes a breach only when three things share a runtime"
          lead="This is the single most useful sentence in the threat model, because it converts an unbounded worry about model behaviour into a bounded question about process capability."
        />

        <div className="split split--sidebar">
          <ol className="step-list">
            {CONDITIONS.map((condition, index) => (
              <li className="step-list__item" key={condition.title}>
                <span className="step-list__num">{String(index + 1).padStart(2, '0')}</span>
                <h3 className="step-list__title">{condition.title}</h3>
                <p className="step-list__body">{condition.body}</p>
              </li>
            ))}
          </ol>

          <div className="stack">
            <p className="t-body">
              Any two of the three are survivable. The design consequence is to remove one of them
              per workflow, and the cheapest to remove is almost always the third.
            </p>
            <ul className="tick-list">
              <li className="tick-list__item">
                <CheckCircleIcon size={16} />
                <span>
                  A review that reads foreign code holds no credentials and has no route out.
                </span>
              </li>
              <li className="tick-list__item">
                <CheckCircleIcon size={16} />
                <span>
                  A deployment workflow that holds credentials does not also read arbitrary web
                  content.
                </span>
              </li>
              <li className="tick-list__item">
                <CheckCircleIcon size={16} />
                <span>
                  A research workflow that browses the internet has no write access to your
                  repository.
                </span>
              </li>
              <li className="tick-list__item tick-list__item--muted">
                <KeyIcon size={16} />
                <span>
                  Above all of them: give the agent its own identity and short-lived, narrowly
                  scoped credentials. If the agent authenticates as you, a compromised agent is
                  you.
                </span>
              </li>
            </ul>
            <p className="t-small measure">
              Most setups violate this by accident rather than by decision, because one agent
              gradually collects every capability that was ever convenient.
            </p>
          </div>
        </div>
      </section>

      {/* Layers */}
      <section className="container section" aria-labelledby="layers">
        <SectionHead
          eyebrow="Layers"
          id="layers"
          title="Four independent layers, none sufficient alone"
          lead="Forge Shield is one of them. It reports; it does not prevent. The layers below it do not depend on the model reaching the right conclusion, which is the property that makes them controls rather than mitigations."
        />

        <TableScroll label="The four defensive layers, the mechanism each uses, and when each one runs">
          <table className="data-table">
            <caption className="visually-hidden">
              The four defensive layers, the mechanism each uses, and when each one runs
            </caption>
            <thead>
              <tr>
                <th scope="col">Layer</th>
                <th scope="col">Mechanism</th>
                <th scope="col">Runs</th>
              </tr>
            </thead>
            <tbody>
              {LAYERS.map((row) => (
                <tr key={row.layer}>
                  <th scope="row" className="data-table__name">
                    {row.layer}
                  </th>
                  <td className="data-table__desc">{row.mechanism}</td>
                  <td>{row.runs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>

        <div className="callout callout--warn mt-4">
          <span className="callout__icon">
            <IsolationIcon size={18} />
          </span>
          <div className="callout__body">
            <strong>No scanner substitutes for isolation.</strong> None of the four layers is a
            replacement for running untrusted work in a container, a virtual machine, or a remote
            sandbox with no credentials mounted and no route out. FORGE does not sandbox the coding
            agent, and hooks run in the same process they are policing. Isolation stays the
            operator control, and it is the one that makes every other mistake survivable.
          </div>
        </div>
      </section>

      {/* Where to read further */}
      <section className="container section" aria-labelledby="further">
        <SectionHead
          eyebrow="Further"
          id="further"
          title="The long form, in the repository"
          lead="This page is the summary. The two documents below are the material it was written from, and both are rendered here from the repository rather than restated."
        />

        <div className="grid grid--3">
          <Link className="card" href={threatModel}>
            <span className="card__icon">
              <ShieldIcon size={20} />
            </span>
            <h3 className="card__title">Threat model</h3>
            <p className="card__body">
              Assets, trust boundaries, and a pass over every surface the system adds: the control
              FORGE provides, the risk that remains after it, and the part the operator owns.
            </p>
            <span className="card__foot">
              Read the threat model
              <ArrowRightIcon size={14} />
            </span>
          </Link>

          <Link className="card" href={securityGuide}>
            <span className="card__icon">
              <BookIcon size={20} />
            </span>
            <h3 className="card__title">The security guide</h3>
            <p className="card__body">
              The practical side: a baseline deny list, how to write a hook that fails closed,
              container and egress configuration, and what to do in the first ten minutes of an
              incident.
            </p>
            <span className="card__foot">
              Read the guide
              <ArrowRightIcon size={14} />
            </span>
          </Link>

          <Link className="card" href={docHref('project/security', '/docs')}>
            <span className="card__icon">
              <AgentIcon size={20} />
            </span>
            <h3 className="card__title">Security policy</h3>
            <p className="card__body">
              Reporting a vulnerability, the supported versions, the published package identities,
              and the hardening checklist that belongs to the operator rather than to FORGE.
            </p>
            <span className="card__foot">
              Read the policy
              <ArrowRightIcon size={14} />
            </span>
          </Link>
        </div>
      </section>

      {/* Closing */}
      <section className="container section">
        <div className="cta-band">
          <p className="t-eyebrow">Next</p>
          <h2 className="t-h2">Scan something before you trust it</h2>
          <p className="t-lead measure">
            The highest-value moment to run this is the one before an unfamiliar checkout is opened
            in an agent, or before a plugin bundle is installed. It takes seconds and it reads the
            files nobody reads.
          </p>
          <div className="command-slot">
            <CopyCommand command="npx forge-shield scan --path . --format text" />
          </div>
          <div className="btn-row">
            <Link className="btn btn--primary" href={securityGuide}>
              Read the security guide
              <ArrowRightIcon size={16} />
            </Link>
            <Link className="btn" href="/docs/threat-model">
              Read the threat model
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
