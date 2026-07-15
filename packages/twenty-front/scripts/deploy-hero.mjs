#!/usr/bin/env node
/**
 * deploy-hero.mjs — the ONE gated path for shipping a Propel runtime-loaded hero
 * bundle to staging or prod. The hero equivalent of the CRM's scripts/deploy.mjs.
 *
 * WHY THIS EXISTS
 *   The live hero (Inbox, Marketing, …) is a JS bundle dropped onto a folder the
 *   server reads at runtime. Nothing structural forced that file to match a git
 *   branch, so features silently drifted / regressed and got rebuilt from scratch
 *   on new branches (see memory: inbox-contact-tagging-restore). This script makes
 *   that impossible: the ONLY way a bundle reaches a mount is through these gates.
 *
 * THE GATES (a bundle cannot ship unless ALL pass)
 *   1. BRANCH LOCK        — must be on the canonical branch, clean working tree,
 *                           so we always build from committed source (never a
 *                           stray rebuild branch or uncommitted edits).
 *   2. PUSHED (prod only)  — HEAD must equal the pushed canonical tip, so what's
 *                           live always traces to a durable, shared commit.
 *   3. TYPECHECK           — tsc --noEmit clean. Catches the undeclared-identifier
 *                           bug that build:hero (esbuild, no tsc) would ship as a
 *                           runtime ReferenceError.
 *   4. BUILD FROM HEAD     — build:hero from the (clean == committed) tree.
 *   5. STAGING-BEFORE-PROD — a prod deploy of <hero>@<sha>/<md5> is refused unless
 *                           the SAME sha+md5 is recorded live on staging.
 *   6. BACKUP + DROP + VERIFY — back up the current mount bundle, drop the new one,
 *                           then re-read it and assert deployed md5 == built md5
 *                           (proves branch == live, no botched upload).
 *   7. MANIFEST            — write HERO-MANIFEST.json onto the mount: hero → {sha,
 *                           md5, branch, deployedAt}. The always-true record of
 *                           what is actually live and which commit it came from.
 *
 * USAGE
 *   node scripts/deploy-hero.mjs --env staging --hero inbox
 *   node scripts/deploy-hero.mjs --env prod --hero inbox,marketing-hub --yes
 *   flags: --yes (skip confirm) · --skip-tsc (emergency only) · --allow-dirty (NO)
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONT_ROOT = resolve(__dirname, '..'); // packages/twenty-front

// ── config ──────────────────────────────────────────────────────────────────
const CANONICAL_BRANCH = 'feat/website-marketing-tab';
const REMOTE = 'myfork';
const ENVS = {
  staging: { kind: 'local', mount: '/Users/yahyaismail/twenty-staging/heroes' },
  prod: {
    kind: 'ssh',
    host: 'root@145.223.20.76',
    mount: '/data/coolify/services/dte0mdfz8uv0mgrxh8d2fl4e/heroes',
  },
};

// ── tiny helpers (mirror deploy.mjs style) ───────────────────────────────────
const step = (m) => console.log(`\n▶ ${m}`);
const ok = (m) => console.log(`✓ ${m}`);
const die = (m) => {
  console.error(`✗ ${m}`);
  process.exit(1);
};
const sh = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.status !== 0 && !opts.allowFail)
    die(`\`${cmd} ${args.join(' ')}\` failed: ${r.stderr || r.stdout || r.status}`);
  return (r.stdout || '').trim();
};
const md5 = (buf) => createHash('md5').update(buf).digest('hex');

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const getFlag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name) => argv.includes(`--${name}`);

const env = getFlag('env');
if (!env || !ENVS[env]) die(`--env must be one of: ${Object.keys(ENVS).join(', ')}`);
const target = ENVS[env];
const heroes = (getFlag('hero') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (!heroes.length) die('--hero <name>[,<name>...] is required (e.g. --hero inbox)');

console.log(`\n=== deploy-hero → ${env.toUpperCase()} : ${heroes.join(', ')} ===`);

// ── gate 1: branch lock + clean tree ─────────────────────────────────────────
step('branch / working-tree');
const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
if (branch !== CANONICAL_BRANCH)
  die(`on '${branch}' — hero bundles ship ONLY from '${CANONICAL_BRANCH}'. Fold your work in first.`);
const dirty = sh('git', ['status', '--porcelain']);
if (dirty && !has('allow-dirty'))
  die('working tree is dirty — commit first so the bundle is built from committed source.');
const sha = sh('git', ['rev-parse', 'HEAD']);
ok(`on ${CANONICAL_BRANCH} @ ${sha.slice(0, 8)}${dirty ? ' (DIRTY — --allow-dirty)' : ' (clean)'}`);

// ── gate 2: pushed (prod only) ───────────────────────────────────────────────
if (env === 'prod') {
  step('pushed to remote');
  sh('git', ['fetch', REMOTE, '--quiet'], { allowFail: true });
  const remoteSha = sh('git', ['rev-parse', `${REMOTE}/${CANONICAL_BRANCH}`], { allowFail: true });
  if (remoteSha !== sha)
    die(`HEAD (${sha.slice(0, 8)}) != ${REMOTE}/${CANONICAL_BRANCH} (${remoteSha.slice(0, 8)}). Push first — prod must trace to a shared commit.`);
  ok(`HEAD is pushed to ${REMOTE}/${CANONICAL_BRANCH}`);
}

// ── gate 3: typecheck ────────────────────────────────────────────────────────
if (has('skip-tsc')) {
  step('typecheck SKIPPED (--skip-tsc) — emergency only');
} else {
  step('typecheck (tsc --noEmit)');
  sh('npx', ['tsc', '--noEmit'], { cwd: FRONT_ROOT, stdio: 'inherit' });
  ok('tsc clean');
}

// ── read staging manifest (for staging-before-prod) ──────────────────────────
const stagingManifestPath = `${ENVS.staging.mount}/HERO-MANIFEST.json`;
const readStagingManifest = () => {
  try {
    return JSON.parse(readFileSync(stagingManifestPath, 'utf8'));
  } catch {
    return {};
  }
};

// ── per-hero: build → gate → deploy → verify → record ────────────────────────
const results = [];
for (const hero of heroes) {
  console.log(`\n──────── ${hero} ────────`);

  // gate 4: build from HEAD
  step(`build:hero ${hero}`);
  const build = spawnSync('npm', ['run', 'build:hero', hero], { cwd: FRONT_ROOT, stdio: 'inherit' });
  if (build.status !== 0) die(`build:hero ${hero} failed`);
  const bundlePath = resolve(FRONT_ROOT, `dist-heroes/${hero}/index.js`);
  if (!existsSync(bundlePath)) die(`built bundle missing: ${bundlePath}`);
  const bundle = readFileSync(bundlePath);
  if (bundle.length < 1024) die(`bundle suspiciously small (${bundle.length}B) — refusing`);
  const builtMd5 = md5(bundle);
  // parse gate (catches syntax-level breakage)
  const chk = spawnSync('node', ['--check', bundlePath], { encoding: 'utf8' });
  if (chk.status !== 0) die(`bundle failed node --check: ${chk.stderr}`);
  ok(`built ${hero} — md5 ${builtMd5} (${Math.round(bundle.length / 1024)}kB)`);

  // gate 5: staging-before-prod
  if (env === 'prod') {
    step('staging-before-prod');
    const sm = readStagingManifest()[hero];
    if (!sm) die(`${hero} has no staging record — deploy to staging first.`);
    if (sm.sha !== sha || sm.md5 !== builtMd5)
      die(`staging has ${hero}@${sm.sha.slice(0, 8)}/${sm.md5.slice(0, 8)} but you're shipping @${sha.slice(0, 8)}/${builtMd5.slice(0, 8)} — re-verify on staging.`);
    ok(`${hero}@${sha.slice(0, 8)}/${builtMd5.slice(0, 8)} matches the staging record`);
  }

  // confirm (prod, unless --yes)
  if (env === 'prod' && !has('yes')) {
    die(`ready to ship ${hero}@${sha.slice(0, 8)} to PROD — re-run with --yes to confirm.`);
  }

  // gate 6: backup + drop + md5-verify
  const ts = sh('git', ['show', '-s', '--format=%cd', '--date=format:%Y%m%d-%H%M%S', 'HEAD']).replace(/\D/g, '').slice(0, 14) || 'now';
  const remoteBundle = `${target.mount}/${hero}/index.js`;
  const bakName = `index.js.bak-${env}-${ts}-${sha.slice(0, 8)}`;
  if (target.kind === 'local') {
    step(`deploy ${hero} → staging mount`);
    if (existsSync(remoteBundle)) sh('cp', [remoteBundle, `${target.mount}/${hero}/${bakName}`]);
    sh('cp', [bundlePath, remoteBundle]);
    sh('chmod', ['644', remoteBundle]);
    const liveMd5 = md5(readFileSync(remoteBundle));
    if (liveMd5 !== builtMd5) die(`DROP MISMATCH: live ${liveMd5} != built ${builtMd5}`);
    ok(`dropped + verified (md5 ${liveMd5})`);
  } else {
    step(`deploy ${hero} → prod mount (${target.host})`);
    sh('ssh', ['-o', 'StrictHostKeyChecking=no', target.host,
      `test -f ${remoteBundle} && cp ${remoteBundle} ${target.mount}/${hero}/${bakName} || true`]);
    sh('scp', ['-o', 'StrictHostKeyChecking=no', bundlePath, `${target.host}:${remoteBundle}`]);
    const liveMd5 = sh('ssh', ['-o', 'StrictHostKeyChecking=no', target.host,
      `chmod 644 ${remoteBundle}; md5sum ${remoteBundle} | cut -d' ' -f1`]);
    if (liveMd5 !== builtMd5) die(`DROP MISMATCH: live ${liveMd5} != built ${builtMd5}`);
    ok(`dropped + verified (md5 ${liveMd5})`);
  }

  results.push({ hero, sha, md5: builtMd5, branch: CANONICAL_BRANCH, env, deployedAt: ts });
}

// ── gate 7: write manifest onto the mount (the record of what's live) ────────
step('record manifest');
const writeManifest = () => {
  const existing = (() => {
    try {
      if (target.kind === 'local') return JSON.parse(readFileSync(`${target.mount}/HERO-MANIFEST.json`, 'utf8'));
      const raw = sh('ssh', ['-o', 'StrictHostKeyChecking=no', target.host, `cat ${target.mount}/HERO-MANIFEST.json 2>/dev/null || echo '{}'`]);
      return JSON.parse(raw || '{}');
    } catch {
      return {};
    }
  })();
  for (const r of results) existing[r.hero] = { sha: r.sha, md5: r.md5, branch: r.branch, deployedAt: r.deployedAt };
  const json = JSON.stringify(existing, null, 2);
  if (target.kind === 'local') {
    writeFileSync(`${target.mount}/HERO-MANIFEST.json`, json + '\n');
  } else {
    const tmp = resolve(FRONT_ROOT, 'dist-heroes/HERO-MANIFEST.json');
    writeFileSync(tmp, json + '\n');
    sh('scp', ['-o', 'StrictHostKeyChecking=no', tmp, `${target.host}:${target.mount}/HERO-MANIFEST.json`]);
  }
};
writeManifest();
ok(`HERO-MANIFEST.json updated on ${env} mount`);

console.log(`\n=== ${env.toUpperCase()} deploy complete ===`);
for (const r of results) console.log(`  ${r.hero} → ${r.md5.slice(0, 8)} @ ${r.sha.slice(0, 8)}`);
console.log(`\nProof: the live bundle md5 == a build from ${CANONICAL_BRANCH}@${sha.slice(0, 8)}. Branch == live.`);
