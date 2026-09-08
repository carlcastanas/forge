/**
 * The /why hero's terminal pair.
 *
 * Same mechanics as the landing hero's panel: a server component with zero
 * JavaScript, the complete transcript in the static HTML, a CSS-only reveal that
 * animates opacity alone, and a body height fixed from the line count so nothing
 * below can shift. Reduced motion lands on the finished transcript.
 *
 * Where the landing panel shows the loop working, this one shows the argument:
 * the same request run without a process and then with one. The first transcript
 * is not a strawman — every line in it is a thing a capable model does when
 * nothing tells it otherwise.
 */
import type { CSSProperties, ReactNode } from 'react';

type LineStyle = CSSProperties & { '--i': number };
type BodyStyle = CSSProperties & { '--terminal-lines': number };

function Line({ index, children }: { index: number; children?: ReactNode }) {
  return (
    <div className="terminal__line" style={{ '--i': index } as LineStyle}>
      {children}
    </div>
  );
}

function Prompt() {
  return (
    <span className="terminal__prompt" aria-hidden="true">
      ${' '}
    </span>
  );
}

function Panel({
  label,
  tone,
  lines,
  children,
}: {
  label: string;
  tone: 'bare' | 'forge';
  lines: number;
  children: ReactNode;
}) {
  return (
    <div className={`terminal terminal--${tone}`}>
      <div className="terminal__bar">
        <span className="terminal__dots" aria-hidden="true">
          <span className="terminal__dot" />
          <span className="terminal__dot" />
          <span className="terminal__dot" />
        </span>
        <span className="terminal__label">{label}</span>
      </div>
      <div className="terminal__body" style={{ '--terminal-lines': lines } as BodyStyle}>
        <div className="terminal__lines">{children}</div>
      </div>
    </div>
  );
}

export function ContrastTerminals() {
  return (
    <div className="terminal-pair">
      <Panel label="without a process" tone="bare" lines={11}>
        <Line index={0}>
          <Prompt />
          <span className="terminal__cmd">add rate limiting to the signup endpoint</span>
        </Line>
        <Line index={1}>
          <span className="terminal__dim">editing </span>
          <span className="terminal__path">routes/signup.ts</span>
        </Line>
        <Line index={2}>
          <span className="terminal__dim">editing </span>
          <span className="terminal__path">middleware/rate-limit.ts</span>
        </Line>
        <Line index={3}>
          <span className="terminal__dim">editing </span>
          <span className="terminal__path">config/limits.ts</span>
        </Line>
        <Line index={4}>
          <span className="terminal__dim">wrote </span>
          <span className="terminal__path">signup.test.ts</span>
          <span className="terminal__dim"> after the implementation</span>
        </Line>
        <Line index={5}>
          <span className="terminal__ok">PASS</span>
          {'  '}
          <span className="terminal__dim">
            1 test, asserting what the code already does
          </span>
        </Line>
        <Line index={6}>
          <span className="terminal__bad">!</span>
          {'  '}the limiter is per-process; four pods means 4x the limit
        </Line>
        <Line index={7}>
          <span className="terminal__dim">not mentioned. nobody asked.</span>
        </Line>
        <Line index={8}>&ldquo;Done — rate limiting is implemented.&rdquo;</Line>
        <Line index={9}>
          <span className="terminal__dim">
            (the suite was never run; the build was never checked)
          </span>
        </Line>
        <Line index={10}>
          <Prompt />
          <span className="terminal__cursor" aria-hidden="true" />
        </Line>
      </Panel>

      <Panel label="with FORGE" tone="forge" lines={11}>
        <Line index={0}>
          <Prompt />
          <span className="terminal__cmd">add rate limiting to the signup endpoint</span>
        </Line>
        <Line index={1}>
          <span className="terminal__marker terminal__marker--plan">[plan]</span>3 files ·{' '}
          <span className="terminal__dim">approve before any edit</span>
        </Line>
        <Line index={2}>
          <span className="terminal__marker terminal__marker--test">[test]</span>
          <span className="terminal__path">signup.rate-limit.test.ts</span>
        </Line>
        <Line index={3}>
          <span className="terminal__marker" />
          <span className="terminal__bad">FAIL</span>
          {'  '}expected 429 after 6 requests, got 200
        </Line>
        <Line index={4}>
          <span className="terminal__marker terminal__marker--implement">[implement]</span>
          <span className="terminal__path">middleware/rate-limit.ts</span>
        </Line>
        <Line index={5}>
          <span className="terminal__marker terminal__marker--test">[test]</span>
          <span className="terminal__ok">PASS</span>
          {'  '}12 passed, 0 failed
        </Line>
        <Line index={6}>
          <span className="terminal__marker terminal__marker--review">[review]</span>
          <span className="terminal__dim">fresh context</span> · 1 finding
        </Line>
        <Line index={7}>
          <span className="terminal__marker" />
          per-process limiter — flagged before merge
        </Line>
        <Line index={8}>
          <span className="terminal__marker terminal__marker--verify">[verify]</span>build ok ·
          lint ok · suite green
        </Line>
        <Line index={9}>
          <span className="terminal__marker terminal__marker--remember">[remember]</span>
          <span className="terminal__dim">limits are per-process here {'->'} saved</span>
        </Line>
        <Line index={10}>
          <Prompt />
          <span className="terminal__cursor" aria-hidden="true" />
        </Line>
      </Panel>
    </div>
  );
}
