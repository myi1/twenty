#!/usr/bin/env node
// Build one Propel runtime-loaded hero bundle.
//
//   npm run build:hero <name>     →  dist-heroes/<name>/index.js
//   e.g. npm run build:hero listing-studio
//
// Thin wrapper: resolves <name> from argv, sets HERO_NAME, and runs
// `vite build -c vite.hero.config.ts` (which does the externalization). A wrapper
// (vs inline npm-script arg munging) keeps it cross-platform and lets us validate
// the hero dir exists before spawning vite.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONT_ROOT = resolve(__dirname, '..');

const heroName = process.argv[2];
if (!heroName) {
  console.error('Usage: npm run build:hero <name>   (e.g. listing-studio)');
  process.exit(1);
}

const entry = resolve(FRONT_ROOT, `src/heroes/${heroName}/index.tsx`);
if (!existsSync(entry)) {
  console.error(`✗ hero entry not found: ${entry}`);
  console.error(`  create src/heroes/${heroName}/index.tsx first.`);
  process.exit(1);
}

const result = spawnSync(
  'npx',
  ['vite', 'build', '-c', 'vite.hero.config.ts'],
  {
    cwd: FRONT_ROOT,
    stdio: 'inherit',
    env: { ...process.env, HERO_NAME: heroName, NODE_ENV: 'production' },
  },
);

process.exit(result.status ?? 1);
