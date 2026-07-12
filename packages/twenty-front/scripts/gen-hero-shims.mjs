#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Generate the Propel hero re-export SHIMS + the page IMPORT MAP.
// ─────────────────────────────────────────────────────────────────────────────
//
// For every shared specifier (the list mirrors src/modules/propel/runtime/heroShared.ts),
// emit `public/propel-shims/<slug>.js` — a tiny ESM module that re-exports the host's
// instance off `window.__propelShared['<specifier>']`. A runtime-loaded hero builds
// with these specifiers EXTERNAL; the page import map (also emitted here, as JSON we
// inline into index.html) maps each bare specifier → its shim URL, so the hero's bare
// imports resolve to the host's singletons (one React, one Mantine, one ThemeContext).
//
// Why generate (vs hand-write)? The named-export surface is huge and version-drifty —
// @mantine/core alone is ~365 names, twenty-ui/display ~500+. We introspect the REAL
// loaded module to get the exact current names. DOM-touching modules (twenty-ui/*)
// are loaded inside a jsdom window so their module-eval doesn't crash under Node.
//
// Run:  node packages/twenty-front/scripts/gen-hero-shims.mjs
// (from the repo root or anywhere — paths are resolved relative to this file.)

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

// ── jsdom: some shared modules (twenty-ui/display) read window.location / DOM at
// module-eval time. Provide a real DOM so introspection doesn't throw. Harmless for
// the pure-JS modules (react, mantine) which ignore it.
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost:3000/',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.self = dom.window;
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: dom.window.navigator,
    configurable: true,
  });
} catch {
  /* navigator may already be defined+writable on some Node versions */
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONT_ROOT = join(__dirname, '..'); // packages/twenty-front
const OUT_DIR = join(FRONT_ROOT, 'public', 'propel-shims');
const SHIM_URL_BASE = '/propel-shims';

// The canonical shared-specifier list. KEEP IN SYNC with heroShared.ts (SHARED keys).
// Order is irrelevant; the generator introspects each independently.
const SHARED_SPECIFIERS = [
  // npm
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@mantine/core',
  '@mantine/hooks',
  '@emotion/react',
  '@emotion/styled',
  'react-router-dom',
  'framer-motion',
  // twenty-ui
  'twenty-ui/display',
  'twenty-ui/theme-constants',
  // host-internal
  '@/apollo/utils/getTokenPair',
  '@/propel/lib/callPropelRoute',
  '@/ui/layout/page/components/PageContainer',
  '@/ui/layout/page/components/PageHeader',
  '@/ui/feedback/snack-bar-manager/hooks/useSnackBar',
  '@/dialer-dock/utils/dialerCrmBridge',
  '~/config',
];

// Host-internal specifiers can't be `import()`-ed from Node (they resolve via the
// app's tsconfig path aliases, not from node_modules, and pull in the whole app).
// We hard-code their named exports — they're small + stable, and the boot module
// is the source of truth for the values anyway.
const HOST_INTERNAL_EXPORTS = {
  '@/apollo/utils/getTokenPair': { named: ['getTokenPair'], hasDefault: false },
  '@/propel/lib/callPropelRoute': { named: ['callPropelRoute', 'callPropelRouteWithStatus'], hasDefault: false },
  '@/ui/layout/page/components/PageContainer': {
    named: ['PageContainer'],
    hasDefault: false,
  },
  '@/ui/layout/page/components/PageHeader': {
    named: ['PageHeader'],
    hasDefault: false,
  },
  '@/ui/feedback/snack-bar-manager/hooks/useSnackBar': {
    named: ['useSnackBar'],
    hasDefault: false,
  },
  '@/dialer-dock/utils/dialerCrmBridge': {
    named: [
      'lookupPeopleByNumbers',
      'splitE164',
      'createPersonWithPhone',
      'navigateCrm',
      'openWhatsAppInCrm',
    ],
    hasDefault: false,
  },
  '~/config': { named: ['REACT_APP_SERVER_BASE_URL'], hasDefault: false },
};

// Map a specifier to a filesystem-safe slug used for both the shim filename and the
// import-map value. e.g. '@mantine/core' -> 'mantine-core', 'react/jsx-runtime' ->
// 'react-jsx-runtime', '@/propel/lib/callPropelRoute' -> 'at-propel-lib-callPropelRoute'.
const slugFor = (spec) =>
  spec
    .replace(/^@\//, 'at-') // host alias '@/...'
    .replace(/^~\//, 'tilde-') // host alias '~/...'
    .replace(/^@/, '') // npm scope '@mantine'
    .replace(/[/]/g, '-');

const isValidIdentifier = (n) =>
  n !== 'default' && /^[A-Za-z_$][\w$]*$/.test(n);

// Introspect an npm/twenty-ui specifier's real export names by importing it here.
const introspect = async (spec) => {
  const mod = await import(spec);
  const named = Object.keys(mod)
    .filter(isValidIdentifier)
    // CJS interop sometimes leaks a 'module.exports' key past the regex? No — but
    // guard '__esModule' explicitly so it never becomes a bogus `export const`.
    .filter((n) => n !== '__esModule');
  return { named, hasDefault: 'default' in mod };
};

const renderShim = (spec, slug, { named, hasDefault }) => {
  const key = JSON.stringify(spec);
  const lines = [
    `// AUTO-GENERATED by scripts/gen-hero-shims.mjs — DO NOT EDIT.`,
    `// Re-exports the host's instance of ${spec} off window.__propelShared.`,
    `// A runtime-loaded hero's bare \`import … from ${key}\` resolves here via the`,
    `// page import map, so host + hero share ONE instance.`,
    `const M = (window.__propelShared || {})[${key}];`,
    `if (!M) throw new Error('[propel-hero] window.__propelShared[' + ${JSON.stringify(
      key,
    )} + '] missing — host boot (heroShared) did not run before this hero loaded');`,
    hasDefault ? `export default M.default;` : `export default M;`,
  ];
  for (const n of named) {
    lines.push(`export const ${n} = M[${JSON.stringify(n)}];`);
  }
  return lines.join('\n') + '\n';
};

const main = async () => {
  mkdirSync(OUT_DIR, { recursive: true });

  const importMap = { imports: {} };
  const report = [];

  for (const spec of SHARED_SPECIFIERS) {
    const slug = slugFor(spec);
    let exportsInfo;

    if (Object.prototype.hasOwnProperty.call(HOST_INTERNAL_EXPORTS, spec)) {
      exportsInfo = HOST_INTERNAL_EXPORTS[spec];
    } else {
      try {
        exportsInfo = await introspect(spec);
      } catch (err) {
        console.error(`✗ ${spec}: introspection failed — ${err.message}`);
        process.exitCode = 1;
        continue;
      }
    }

    const shim = renderShim(spec, slug, exportsInfo);
    const fileName = `${slug}.js`;
    writeFileSync(join(OUT_DIR, fileName), shim);
    importMap.imports[spec] = `${SHIM_URL_BASE}/${fileName}`;
    report.push(
      `  ${spec.padEnd(50)} → ${fileName} (${exportsInfo.named.length} named${
        exportsInfo.hasDefault ? ' +default' : ''
      })`,
    );
  }

  // Emit the import map as JSON next to the shims so index.html / tooling can read
  // the exact same map the generator produced (single source of truth).
  writeFileSync(
    join(OUT_DIR, 'import-map.json'),
    JSON.stringify(importMap, null, 2) + '\n',
  );

  console.log('Generated propel-shims:');
  console.log(report.join('\n'));
  console.log(`\nImport map → ${join(OUT_DIR, 'import-map.json')}`);
  console.log(
    `\nInline this into index.html:\n<script type="importmap">\n${JSON.stringify(
      importMap,
      null,
      2,
    )}\n</script>`,
  );
};

main();
