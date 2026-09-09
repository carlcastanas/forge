#!/usr/bin/env node
/**
 * FORGE brand asset generator.
 *
 * Every shape in this file is hand-authored geometry on an integer grid. There is no
 * traced artwork, no icon package, no gradient, and no colour beyond black and white.
 *
 * THE MARK
 * A capital F whose crossbar has been drawn out into a vector. The spine and the top
 * arm are the letter; the crossbar leaves the letterform and terminates in a 45-degree
 * arrowhead whose back corners sit on the same vertical as the top arm's terminus.
 * That single overshoot is the whole idea: a process entering on the left and leaving
 * to the right. It is the letter and the pipeline in one stroke, and it survives being
 * scaled to 16 pixels because it is three strokes and one angle.
 *
 * THE GRID
 * The mark is drawn on a 24x24 grid at stroke 2 (the same grid components/icons.tsx
 * uses, so the header mark and the UI icons share a construction). The favicon is
 * redrawn natively on a 16x16 grid so that every stroke centre lands on an integer
 * and a 2px stroke covers whole device pixels at 16px. The wordmark is a monoline
 * geometric capital set built from straight strokes and circular arcs at cap height
 * 24, stroke 3 — the same stroke-to-cap-height ratio as the mark.
 *
 * OUTPUT
 *   assets/brand/logo-mark.svg          mark alone, currentColor, 24x24 viewBox
 *   assets/brand/favicon.svg            16x16 redraw, heavier stroke, currentColor
 *   assets/brand/logo-lockup.svg        mark + wordmark, currentColor
 *   assets/brand/logo-lockup-light.svg  same, black ink, for light backgrounds
 *   assets/brand/logo-lockup-dark.svg   same, white ink, for dark backgrounds
 *   assets/brand/icon.png               512x512, white mark on black
 *   assets/brand/apple-icon.png         180x180, white mark on black
 *   assets/brand/og-image.png           1200x630 social card
 *
 * Two files outside this directory are regenerated too, because other files already
 * depend on their paths:
 *   assets/forge-icon.svg  Codex plugin composer icon (package.json files[], plugin.json)
 *   assets/hero.png        1200x630 banner at the head of all fourteen READMEs
 *
 * It then copies the App Router convention files into site/app so the site serves them:
 * icon.svg, apple-icon.png, opengraph-image.png, twitter-image.png. Re-run this script
 * after changing any geometry; every copy is an output, never a source.
 *
 * Rasterising is done by sharp (libvips + librsvg), which is already installed under
 * site/node_modules. Run from anywhere:  node assets/brand/generate.mjs
 */
import { createRequire } from 'node:module';
import { mkdir, readdir, writeFile, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, '..', '..');
const BRAND_DIR = here;
const SITE_APP = path.join(REPO_ROOT, 'site', 'app');

const require = createRequire(path.join(REPO_ROOT, 'site', 'package.json'));
let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error(
    'sharp is required to rasterise. Run `npm install` in site/ first — sharp ships with Next.',
  );
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* Palette — the site tokens, nothing else                                    */
/* -------------------------------------------------------------------------- */

const INK = '#000000'; // --fg light theme
const PAPER = '#ffffff'; // --bg light theme
const MUTED = '#a1a1a1'; // --fg-muted dark theme
const SUBTLE = '#7a7a7a'; // --fg-subtle dark theme
const HAIRLINE = '#1f1f1f'; // --border dark theme

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The mark on the shared 24x24 icon grid.
 *   spine     x=5,  y=4..20
 *   top arm   y=4,  x=5..15
 *   crossbar  y=12, x=5..18 — the shaft stops one unit short of the tip, under the head
 *   arrowhead (15,8) -> (19,12) -> (15,16), a true 45-degree return
 *
 * The top arm terminates at x=15, the same vertical as the arrowhead's back corners:
 * the letter's reach and the vector's reach are measured from the same line. The head's
 * half-height is 4, not 5, so two clear units separate its upper diagonal from the top
 * arm; at a head of 5 the two fuse at 18px and the mark starts to read as a P.
 *
 * Stroked bounding box: x 4..20, y 3..21 — 16 by 18, centred on (12,12).
 */
const MARK_24 = ['M5 20V4h10', 'M5 12h13', 'm15 8 4 4-4 4'];
const MARK_24_STROKE = 2;

/**
 * The same construction redrawn natively on a 16x16 grid, not scaled down to it. Every
 * stroke centre is an integer, so a 2px stroke covers whole device pixels at 16px:
 * the spine covers columns 2..4, the top arm rows 1..3, the crossbar rows 7..9.
 *
 * The favicon spends its extra height on the counter. The top arm is pushed up to y=2
 * and the spine runs the full 2..14, which leaves four clear pixels between the top arm
 * and the crossbar and one clear pixel between the top arm and the arrowhead's upper
 * diagonal. Below that clearance the F closes into a bowl and the mark reads as a P.
 */
const MARK_16 = ['M3 14V2h6', 'M3 8h8.5', 'm9 5 3 3-3 3'];
const MARK_16_STROKE = 2;

/**
 * The mark again at wordmark scale: cap height 24, width 21, origin at the top left of
 * the cap box. This is MARK_24 translated by (-5,-4) and scaled by 1.5, which is why its
 * stroke is 3 where the 24-grid mark's is 2 — the ratio to cap height is identical.
 */
const MARK_CAP = ['M0 24V0h15', 'M0 12h19.5', 'm15 6 6 6-6 6'];
const MARK_CAP_WIDTH = 21;

/**
 * FORGE as monoline geometric capitals. Cap height 24: y=0 is the cap line, y=24 the
 * baseline. Flat letters (F, E) are 11 wide and the R bowl is a true semicircle of
 * radius 6. The round letters overshoot the cap line and the baseline by 0.4 — the
 * standard optical correction, without which O and G read a size smaller than F and E.
 *
 * Every horizontal detail sits on y=12: the F and E crossbars, the bottom of the R
 * bowl, the G terminal bar, and the mark's own vector. One line runs the whole lockup.
 *
 *   F  x  0..11    O  x  14.7..37.3    R  x  42..55    G  x  58.7..81.3    E  x  86..97
 *
 * Side bearings are 3.7 next to a round letter and 4.7 next to a flat one.
 */
const WORDMARK_WIDTH = 97;
const WORDMARK_PATHS = [
  // F — spine, top arm, crossbar
  'M0 24V0h11',
  'M0 12h9',
  // R — spine and top arm, semicircular bowl closing on y=12, then the leg
  'M42 24V0h7a6 6 0 0 1 0 12h-7',
  'M48.5 12 55 24',
  // G — the O opened 25 degrees at the upper right, running round to the rightmost
  //     point on y=12 and turning back into the counter as a crossbar
  'M80.24 6.76A11.3 12.4 0 1 0 81.3 12h-9.3',
  // E — top arm, spine, foot, then the crossbar
  'M97 0H86v24h11',
  'M86 12h9',
];
const WORDMARK_ELLIPSES = [{ cx: 26, cy: 12, rx: 11.3, ry: 12.4 }]; // O
const WORDMARK_STROKE = 3;

const LOCKUP_GAP = 13; // mark-to-wordmark, a little over half the cap height
const LOCKUP_WIDTH = MARK_CAP_WIDTH + LOCKUP_GAP + WORDMARK_WIDTH; // 131

/* -------------------------------------------------------------------------- */
/* SVG builders                                                               */
/* -------------------------------------------------------------------------- */

const strokeAttrs = (w, ink = 'currentColor') =>
  `fill="none" stroke="${ink}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;

function markMarkup(paths, width, ink) {
  return `<g ${strokeAttrs(width, ink)}>${paths.map((d) => `<path d="${d}"/>`).join('')}</g>`;
}

function logoMarkSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" role="img" aria-label="FORGE">
  <title>FORGE</title>
  ${markMarkup(MARK_24, MARK_24_STROKE)}
</svg>
`;
}

function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" role="img" aria-label="FORGE">
  <title>FORGE</title>
  ${markMarkup(MARK_16, MARK_16_STROKE)}
</svg>
`;
}

/** Mark plus wordmark, both as one monoline group. */
function lockupBody(ink) {
  const wordmark = [
    ...WORDMARK_PATHS.map((d) => `<path d="${d}"/>`),
    ...WORDMARK_ELLIPSES.map((e) => `<ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}"/>`),
  ].join('');
  return `<g ${strokeAttrs(WORDMARK_STROKE, ink)}>${MARK_CAP.map((d) => `<path d="${d}"/>`).join('')}<g transform="translate(${MARK_CAP_WIDTH + LOCKUP_GAP} 0)">${wordmark}</g></g>`;
}

/**
 * The lockup. Once the 3-unit stroke and the round letters' 0.4 overshoot are counted,
 * content runs x -1.5..132.5 and y -1.9..25.9; a 6-unit margin is added on every side.
 *
 * `ink` is left undefined for the canonical currentColor file. The light and dark
 * variants bake a literal stroke colour instead: they are consumed through <img> tags in
 * the README, where there is no inherited colour for currentColor to pick up.
 */
function lockupSvg(ink) {
  const w = LOCKUP_WIDTH + 15; // 1.5 stroke + 6 margin, both sides
  const h = 24 + 15;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="FORGE">
  <title>FORGE</title>
  <g transform="translate(7.5 7.5)">${lockupBody(ink)}</g>
</svg>
`;
}

/**
 * Square app icon: white mark on black, full bleed. The mark's stroked bounding box
 * is 16x18 units on the 24 grid, so scaling by 16 gives a 256x288 mark inside 512 with
 * 128 units of side margin and 112 above and below — optically centred, generous
 * enough that iOS's own corner mask never clips it.
 */
function appIconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${INK}"/>
  <g transform="translate(64 64) scale(16)">${markMarkup(MARK_24, MARK_24_STROKE, PAPER)}</g>
</svg>
`;
}

/* -------------------------------------------------------------------------- */
/* Catalog counts, read from the real directories                             */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors the counting rules in site/lib/content.ts so the card can never disagree with
 * the site: agents and commands skip a directory README, the recursive rules count does
 * not (rules/README.md is itself part of the rule set the loader exposes).
 */
async function countMarkdown(dir, { recursive = false, skipReadme = true } = {}) {
  let total = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      if (recursive) total += await countMarkdown(path.join(dir, entry.name), { recursive, skipReadme });
      continue;
    }
    if (!/\.md$/i.test(entry.name)) continue;
    if (skipReadme && entry.name.toLowerCase() === 'readme.md') continue;
    total += 1;
  }
  return total;
}

async function countSkills(dir) {
  let total = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    try {
      await stat(path.join(dir, entry.name, 'SKILL.md'));
      total += 1;
    } catch {
      /* not a skill directory */
    }
  }
  return total;
}

async function readCounts() {
  return {
    agents: await countMarkdown(path.join(REPO_ROOT, 'agents')),
    skills: await countSkills(path.join(REPO_ROOT, 'skills')),
    commands: await countMarkdown(path.join(REPO_ROOT, 'commands')),
    rules: await countMarkdown(path.join(REPO_ROOT, 'rules'), { recursive: true, skipReadme: false }),
  };
}

/* -------------------------------------------------------------------------- */
/* Social card                                                                */
/* -------------------------------------------------------------------------- */

const TAGLINE = ['The engineering system your', 'coding agent is missing'];
const SANS = 'Helvetica Neue, Helvetica, Arial, sans-serif';
const MONO = 'Menlo, DejaVu Sans Mono, monospace';

/**
 * 1200x630. Black ground, the lockup at cap height 66, the tagline on two lines, a
 * hairline rule, and the catalog counts in mono. A single oversized copy of the mark sits
 * flush to the right edge at 7% opacity — the same geometry, nothing decorative.
 */
function ogSvg(counts) {
  const countLine = `${counts.agents} agents  ·  ${counts.skills} skills  ·  ${counts.commands} commands  ·  ${counts.rules} rules`;
  const lockupScale = 66 / 24;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <rect width="1200" height="630" fill="${INK}"/>

  <!-- the mark again at 20x, flush to the right edge and vertically centred: the mark's
       stroked box is x 4..20 by y 3..21, so 20*20 + 800 = 1200 and 12*20 + 75 = 315 -->
  <g transform="translate(800 75) scale(20)" opacity="0.07">
    ${markMarkup(MARK_24, MARK_24_STROKE, PAPER)}
  </g>

  <rect x="0" y="0" width="1200" height="630" fill="none" stroke="${HAIRLINE}" stroke-width="2"/>

  <g transform="translate(88 96) scale(${lockupScale})">
    ${lockupBody(PAPER)}
  </g>

  <text x="88" y="322" font-family="${SANS}" font-size="58" font-weight="500" fill="${PAPER}" letter-spacing="-1.4">${TAGLINE[0]}</text>
  <text x="88" y="390" font-family="${SANS}" font-size="58" font-weight="500" fill="${PAPER}" letter-spacing="-1.4">${TAGLINE[1]}</text>

  <path d="M88 470h1024" stroke="${HAIRLINE}" stroke-width="2"/>

  <text x="88" y="524" font-family="${MONO}" font-size="25" fill="${MUTED}">${countLine}</text>
  <text x="88" y="566" font-family="${MONO}" font-size="21" fill="${SUBTLE}">plan -&gt; test -&gt; implement -&gt; review -&gt; verify -&gt; remember -&gt; improve</text>
</svg>
`;
}

/**
 * assets/forge-icon.svg — the Codex plugin composer icon. The path is load-bearing: it
 * is listed in package.json `files`, referenced as `composerIcon` by
 * plugins/forge/.codex-plugin/plugin.json, and asserted by tests/scripts. Only the
 * artwork inside it changes. The 64x64 box and the 14-unit corner radius are the
 * dimensions that file already had.
 */
function composerIconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="FORGE">
  <title>FORGE</title>
  <rect width="64" height="64" rx="14" fill="${INK}"/>
  <g transform="translate(8 8) scale(2)">${markMarkup(MARK_24, MARK_24_STROKE, PAPER)}</g>
</svg>
`;
}

/**
 * assets/hero.png — the banner at the head of all fourteen READMEs. It carries no
 * translatable prose: the lockup and the canonical loop string are printed verbatim in
 * every language edition, so one file serves them all.
 */
function heroSvg() {
  const scale = 96 / 24; // lockup cap height 96
  const lockupW = (LOCKUP_WIDTH + 15) * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <rect width="1200" height="630" fill="${INK}"/>
  <g transform="translate(${(1200 - lockupW) / 2} 232) scale(${scale})">
    ${lockupBody(PAPER)}
  </g>
  <text x="600" y="404" text-anchor="middle" font-family="${MONO}" font-size="23" fill="${SUBTLE}">plan -&gt; test -&gt; implement -&gt; review -&gt; verify -&gt; remember -&gt; improve</text>
</svg>
`;
}

/* -------------------------------------------------------------------------- */
/* Run                                                                        */
/* -------------------------------------------------------------------------- */

const render = (svg, size) =>
  sharp(Buffer.from(svg), { density: 900 }).resize(size, size, { fit: 'contain' }).png({ compressionLevel: 9 }).toBuffer();

async function main() {
  await mkdir(BRAND_DIR, { recursive: true });
  const counts = await readCounts();

  const written = [];
  const put = async (name, contents) => {
    await writeFile(path.join(BRAND_DIR, name), contents);
    written.push(name);
  };

  await put('logo-mark.svg', logoMarkSvg());
  await put('favicon.svg', faviconSvg());
  await put('logo-lockup.svg', lockupSvg(undefined));
  await put('logo-lockup-light.svg', lockupSvg(INK));
  await put('logo-lockup-dark.svg', lockupSvg(PAPER));

  const icon = appIconSvg();
  await put('icon.png', await render(icon, 512));
  await put('apple-icon.png', await render(icon, 180));

  await put(
    'og-image.png',
    await sharp(Buffer.from(ogSvg(counts)), { density: 300 })
      .resize(1200, 630)
      .png({ compressionLevel: 9 })
      .toBuffer(),
  );

  // Two assets outside this directory whose paths other files already depend on.
  const assetsDir = path.join(REPO_ROOT, 'assets');
  await writeFile(path.join(assetsDir, 'forge-icon.svg'), composerIconSvg());
  await writeFile(
    path.join(assetsDir, 'hero.png'),
    await sharp(Buffer.from(heroSvg()), { density: 300 }).resize(1200, 630).png({ compressionLevel: 9 }).toBuffer(),
  );

  // App Router file conventions. These are copies of the files above, not sources.
  await mkdir(SITE_APP, { recursive: true });
  await copyFile(path.join(BRAND_DIR, 'favicon.svg'), path.join(SITE_APP, 'icon.svg'));
  await copyFile(path.join(BRAND_DIR, 'apple-icon.png'), path.join(SITE_APP, 'apple-icon.png'));
  await copyFile(path.join(BRAND_DIR, 'og-image.png'), path.join(SITE_APP, 'opengraph-image.png'));
  await copyFile(path.join(BRAND_DIR, 'og-image.png'), path.join(SITE_APP, 'twitter-image.png'));

  console.log(`catalog: ${counts.agents} agents, ${counts.skills} skills, ${counts.commands} commands, ${counts.rules} rules`);
  for (const name of written) console.log(`  assets/brand/${name}`);
  console.log('  assets/forge-icon.svg, assets/hero.png');
  console.log('  site/app/icon.svg, apple-icon.png, opengraph-image.png, twitter-image.png');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
