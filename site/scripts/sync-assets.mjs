/**
 * Mirrors ../assets/images into public/assets/images so that images referenced from
 * repository markdown resolve when the site is served.
 *
 * Nothing outside site/ is written. If the source tree is missing the script exits
 * quietly: a build must never fail because sibling agents are mid-edit.
 */
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, '..');
const source = path.resolve(siteRoot, '..', 'assets', 'images');
const destination = path.join(siteRoot, 'public', 'assets', 'images');

async function isDirectory(target) {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

async function main() {
  if (!(await isDirectory(source))) {
    console.log('[sync-assets] no ../assets/images directory; nothing to mirror');
    return;
  }

  await rm(destination, { recursive: true, force: true });
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
  console.log(`[sync-assets] mirrored ${source} -> ${destination}`);
}

main().catch((error) => {
  console.warn('[sync-assets] skipped:', error instanceof Error ? error.message : error);
});
