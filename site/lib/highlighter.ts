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
