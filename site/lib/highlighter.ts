/**
 * A single shiki highlighter shared by every page rendered in this build.
 *
 * Languages are loaded eagerly so the rehype transformer stays synchronous, which
 * is what react-markdown requires. Anything not in the list falls back to plain
 * text rather than throwing.
 */
import { createHighlighter, type Highlighter } from 'shiki';

const LANGS = [
  'bash',
  'c',
  'cpp',
  'csharp',
  'css',
  'diff',
  'docker',
  'go',
  'graphql',
  'groovy',
  'hcl',
  'html',
  'ini',
  'java',
  'javascript',
  'json',
  'json5',
  'jsonc',
  'kotlin',
  'lua',
  'make',
  'markdown',
  'nginx',
  'objective-c',
  'perl',
  'php',
  'powershell',
  'prisma',
  'python',
  'r',
  'ruby',
  'rust',
  'scala',
  'scss',
  'shellscript',
  'sql',
  'swift',
  'toml',
  'tsx',
  'typescript',
  'vue',
  'xml',
  'yaml',
];

export const SHIKI_THEMES = { light: 'github-light', dark: 'github-dark' } as const;

/**
 * Four tokens in the stock GitHub themes land under 4.5:1 against the code
 * surface this site paints behind them, so they are swapped for darker or
 * lighter members of the same hue family. Everything else in both themes
 * already clears AA and is left alone.
 *
 * Measured against --code-bg: #fafafa on light, #0a0a0a on dark.
 */
export const SHIKI_COLOR_REPLACEMENTS = {
  'github-light': {
    '#d73a49': '#cf222e', // keyword    4.38 -> 5.13
    '#22863a': '#116329', // string     4.43 -> 7.08
    '#e36209': '#953800', // variable   3.34 -> 7.08
  },
  'github-dark': {
    '#6a737d': '#8b949e', // comment    4.11 -> 6.44
  },
};

let highlighterPromise: Promise<Highlighter> | null = null;

export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [SHIKI_THEMES.light, SHIKI_THEMES.dark],
      langs: LANGS,
    });
  }
  return highlighterPromise;
}
