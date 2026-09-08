#!/usr/bin/env node
/**
 * validate-links.js — fail the build on relative markdown links that point nowhere.
 *
 * Scope: the English documentation surface (root pages, docs/, guides/). Translated
 * trees under docs/<locale>/ are excluded because they intentionally lag the English
 * source and are allowed to reference pages that have since been restructured.
 *
 * Usage:
 *   node scripts/ci/validate-links.js            # report and exit non-zero on failure
 *   node scripts/ci/validate-links.js --warn     # report only, always exit 0
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const WARN_ONLY = process.argv.includes('--warn');

const LOCALE_DIRS = new Set([
  'pt-BR', 'zh-CN', 'zh-TW', 'ja-JP', 'ko-KR', 'tr', 'ru',
  'vi-VN', 'th', 'de-DE', 'es', 'uk-UA', 'ur',
]);

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'out', 'site']);

/** Collect the markdown files that make up the English doc surface. */
function collect() {
  const files = [];

  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(path.join(ROOT, entry.name));
    }
  }

  for (const dir of ['docs', 'guides']) {
    const base = path.join(ROOT, dir);
    if (!fs.existsSync(base)) continue;
    walk(base, files);
  }

  return files;
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (path.dirname(full) === path.join(ROOT, 'docs') && LOCALE_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
}

// [text](target) where target is not a URL, anchor, or mail link.
const LINK = /\[[^\]]*\]\((?!https?:|#|mailto:|data:)([^)\s]+?)(?:\s+"[^"]*")?\)/g;

const problems = [];

for (const file of collect()) {
  const body = fs.readFileSync(file, 'utf8');
  const lines = body.split('\n');

  // Links inside fenced code blocks are illustrative samples, not navigation.
  // Track the opening fence so nested fences (```` around ```) close correctly.
  let fence = null;

  lines.forEach((line, index) => {
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (fence === null) {
        fence = marker;
      } else if (marker[0] === fence[0] && marker.length >= fence.length) {
        fence = null;
      }
      return;
    }
    if (fence !== null) return;

    for (const match of line.matchAll(LINK)) {
      const raw = match[1];
      const target = raw.split('#')[0];
      if (!target) continue; // pure anchor

      const resolved = path.resolve(path.dirname(file), target);
      if (fs.existsSync(resolved)) continue;

      problems.push({
        file: path.relative(ROOT, file),
        line: index + 1,
        target: raw,
      });
    }
  });
}

if (problems.length === 0) {
  console.log('Link check passed: no broken relative links in the English doc surface.');
  process.exit(0);
}

const label = WARN_ONLY ? 'WARN' : 'ERROR';
for (const p of problems) {
  console.error(`${label}: ${p.file}:${p.line} -> ${p.target}`);
}
console.error(`\n${problems.length} broken relative link(s).`);
process.exit(WARN_ONLY ? 0 : 1);
