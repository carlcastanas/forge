/**
 * The landing hero's terminal panel.
 *
 * It is a server component and ships zero JavaScript. The complete transcript is
 * in the static HTML, so the panel is fully legible with scripting turned off;
 * the reveal is CSS only and animates opacity, nothing else. The body height is
 * derived from the line count, so no line appearing or disappearing can shift
 * the page. `prefers-reduced-motion: reduce` is handled globally in globals.css,
 * which collapses the animation — and because the base style of a line is
 * opaque, reduced motion lands on the finished transcript rather than a blank
 * box.
 *
 * The session shown is the one a bare model gets wrong: it writes the test
 * first, watches it fail for the stated reason, reviews the diff somewhere other
 * than the context that produced it, and writes the correction down.
 */
import type { CSSProperties, ReactNode } from 'react';

import { CheckIcon } from '@/components/icons';

/** Total lines in the transcript, including the blank one and the caret. */
const LINE_COUNT = 14;

/** Stagger between lines, in seconds. Mirrors the value in globals.css. */
type LineStyle = CSSProperties & { '--i': number };

function Line({ index, children }: { index: number; children?: ReactNode }) {
  return (
    <div className="terminal__line" style={{ '--i': index } as LineStyle}>
      {children}
    </div>
  );
}

function Step({ name }: { name: string }) {
  // Each phase gets its own colour, the way a shell colours a log level, so the
  // loop is legible as a shape before a word of it is read.
  return <span className={`terminal__marker terminal__marker--${name}`}>[{name}]</span>;
}

function Indent() {
  return <span className="terminal__marker" />;
}

export function HeroTerminal() {
  const bodyStyle = { '--terminal-lines': LINE_COUNT } as CSSProperties & {
    '--terminal-lines': number;
  };

  return (
    <figure className="hero__aside" style={{ margin: 0 }}>
      <div className="terminal">
        <div className="terminal__bar">
          <span className="terminal__dots" aria-hidden="true">
            <span className="terminal__dot" />
            <span className="terminal__dot" />
            <span className="terminal__dot" />
          </span>
          <span className="terminal__label">session</span>
          <span className="terminal__label terminal__label--right">forge</span>
        </div>

        <div className="terminal__body" style={bodyStyle}>
          <div className="terminal__lines">
            <Line index={0}>
              <span className="terminal__prompt" aria-hidden="true">
                ${' '}
              </span>
              <span className="terminal__cmd">forge</span>
            </Line>
            <Line index={1}>
              <span className="terminal__prompt" aria-hidden="true">
                &gt;{' '}
              </span>
              <span className="terminal__cmd">add rate limiting to the signup endpoint</span>
            </Line>
            <div
              className="terminal__line terminal__line--gap"
              style={{ '--i': 2 } as LineStyle}
              aria-hidden="true"
            />

            <Line index={3}>
              <Step name="plan" />4 files · 1 new middleware · <span className="terminal__dim">no schema change</span>
            </Line>
            <Line index={4}>
              <Indent />
              waiting for approval
            </Line>

            <Line index={5}>
              <Step name="test" />
              <span className="terminal__path">signup.rate-limit.test.ts</span>
            </Line>
            <Line index={6}>
              <Indent />
              <span className="terminal__bad">FAIL</span>
              {'  '}expected 429 after 6 requests, got 200
            </Line>

            <Line index={7}>
              <Step name="implement" />
              <span className="terminal__path">middleware/rate-limit.ts</span>, <span className="terminal__path">routes/signup.ts</span>
            </Line>

            <Line index={8}>
              <Step name="test" />
              <span className="terminal__ok">PASS</span>
              {'  '}12 passed, 0 failed
            </Line>

            <Line index={9}>
              <Step name="review" />
              fresh context · 1 finding
            </Line>
            <Line index={10}>
              <Indent />
              limiter is per-process; note added for the deploy
            </Line>

            <Line index={11}>
              <Step name="verify" />
              build ok · lint ok · suite green
            </Line>

            <Line index={12}>
              <Step name="remember" />
              rate limits are per-process here {'->'} saved
            </Line>

            <Line index={13}>
              <span className="terminal__prompt" aria-hidden="true">
                ${' '}
              </span>
              <span className="terminal__cursor" aria-hidden="true" />
            </Line>
          </div>
        </div>
      </div>

      <figcaption className="proof-chips">
        <span className="proof-chip">
          <CheckIcon size={13} strokeWidth={2} />
          Test written before the code
        </span>
        <span className="proof-chip">
          <CheckIcon size={13} strokeWidth={2} />
          Reviewed from a clean context
        </span>
        <span className="proof-chip">
          <CheckIcon size={13} strokeWidth={2} />
          Correction persisted
        </span>
      </figcaption>
    </figure>
  );
}
