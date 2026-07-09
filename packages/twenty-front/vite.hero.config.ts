// ─────────────────────────────────────────────────────────────────────────────
// Vite build config for a Propel runtime-loaded HERO bundle.
// ─────────────────────────────────────────────────────────────────────────────
//
// Usage:  npm run build:hero <name>      (HERO_NAME=<name> vite build -c vite.hero.config.ts)
//   e.g.  npm run build:hero listing-studio  →  dist-heroes/listing-studio/index.js
//
// Builds src/heroes/<name>/index.tsx into ONE self-contained ESM file with all
// SHARED + HOST specifiers EXTERNAL (their bare imports stay bare and resolve, in the
// browser, via the page import map → /propel-shims/* → window.__propelShared). The
// hero's OWN code (its local @/… and ~/… children) is bundled in — tsconfig path
// aliases resolve via vite-tsconfig-paths, and only the explicit externals are kept
// out. Result: KB-not-MB bundles that share the host's React/Mantine/ThemeContext.

import react from '@vitejs/plugin-react-swc';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The exact specifiers kept EXTERNAL. MUST mirror SHARED_SPECIFIERS in
// src/modules/propel/runtime/heroShared.ts (and the import map / shims). If a hero
// imports a shared specifier NOT listed here, it gets bundled (duplicate instance) —
// add it to all three places (heroShared, gen-hero-shims, here) before porting.
const EXTERNAL = [
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
  // twenty-ui subpaths (post-v2.19.2 kit: icons live under `icon`; the
  // `display` entry stays for any not-yet-migrated import — both resolve to
  // the same host icon namespace via the import map)
  'twenty-ui/icon',
  'twenty-ui/theme-constants',
  'twenty-ui/display',
  // host-internal (resolved bare in the browser via the import map → shims)
  '@/apollo/utils/getTokenPair',
  '@/propel/lib/callPropelRoute',
  '@/ui/layout/page/components/PageContainer',
  '@/ui/layout/page/components/PageHeader',
  '@/ui/feedback/snack-bar-manager/hooks/useSnackBar',
  '@/dialer-dock/utils/dialerCrmBridge',
  '~/config',
];

// ── Inject ALL bundled CSS via JS (no un-loaded sidecar) ───────────────────────
// CRITICAL (verified on live staging): the host does NOT load @mantine/core/styles.css
// on a runtime-hero route. PropelMantineProvider imports it, but Vite code-splits that
// CSS into the lazy in-bundle hero chunks — none of which mount on a HeroRoute. So a
// runtime hero must ship Mantine's CSS ITSELF, alongside its hero-specific CSS
// (react-big-calendar, @xyflow/react, react-grid-layout, …). We therefore do NOT stub
// @mantine/core/styles.css — we let it (and the hero-specific CSS) bundle in.
//
// (twenty-ui/style.css is the ONE exception: src/index.tsx loads it globally on the
// host, so twenty-ui icon/display styles are already present on every route. It is not
// imported anywhere in the hero subtree, so it never reaches this bundle — nothing to
// do. Only Mantine + hero-specific CSS ship in the hero.)
//
// In lib mode with cssCodeSplit:false, Vite extracts ALL of that CSS into ONE sidecar
// `style.css` next to index.js. The heroes volume serves only index.js and the page
// never <link>s that sidecar, so those styles would silently never apply (this is
// exactly why the first deployed Listing Studio rendered UNSTYLED). Rather than add the
// vite-plugin-css-injected-by-js dependency (absent from node_modules — and
// `npm install` is forbidden here), we do the same thing inline: at generateBundle,
// pull the emitted CSS asset out of the output and prepend a tiny self-executing
// snippet to index.js that creates a <style data-propel-hero> at runtime.
const injectHeroCss = (heroName: string) => ({
  name: 'propel-inject-hero-css',
  // MUST run AFTER Vite's internal `vite:css-post` plugin, which is the plugin that
  // actually EMITS the extracted `*.css` asset into the bundle during generateBundle.
  // Without `order: 'post'`, our hook runs first and the CSS asset isn't in `bundle`
  // yet → nothing to inject and the sidecar survives. `order: 'post'` guarantees we
  // see (and can delete) the emitted CSS asset.
  generateBundle: {
    order: 'post' as const,
    handler(_options: unknown, bundle: Record<string, any>) {
    // Per-hero <style> id so two heroes never collide on the same DOM node (only one
    // hero route mounts at a time, but distinct ids keep it robust to future overlap).
    const styleId = `propel-hero-css-${heroName}`;
    // Find the single extracted CSS asset (cssCodeSplit:false → at most one).
    const cssKey = Object.keys(bundle).find(
      (k) => bundle[k]?.type === 'asset' && k.endsWith('.css'),
    );
    if (cssKey === undefined) {
      // No hero-specific CSS — nothing to inject (e.g. marketing/a2a if they ever
      // drop their CSS deps). Leave index.js untouched.
      return;
    }
    const cssAsset = bundle[cssKey];
    const css =
      typeof cssAsset.source === 'string'
        ? cssAsset.source
        : Buffer.from(cssAsset.source).toString('utf-8');

    // Remove the sidecar so the hero output is ONLY index.js — no un-loaded file.
    delete bundle[cssKey];

    const indexKey = Object.keys(bundle).find(
      (k) => bundle[k]?.type === 'chunk' && bundle[k]?.isEntry,
    );
    if (indexKey === undefined) {
      throw new Error('[propel-inject-hero-css] no entry chunk to inject CSS into');
    }

    // Idempotent runtime injector: insert one <style> the first time the hero
    // module is evaluated; keyed by id so re-navigating doesn't duplicate it.
    const snippet =
      `(function(){try{` +
      `if(typeof document==='undefined')return;` +
      `if(document.getElementById(${JSON.stringify(styleId)}))return;` +
      `var s=document.createElement('style');` +
      `s.id=${JSON.stringify(styleId)};` +
      `s.setAttribute('data-propel-hero',${JSON.stringify(heroName)});` +
      `s.textContent=${JSON.stringify(css)};` +
      `document.head.appendChild(s);` +
      `}catch(e){}})();\n`;

    bundle[indexKey].code = snippet + bundle[indexKey].code;
    },
  },
});

export default defineConfig(() => {
  const heroName = process.env.HERO_NAME;
  if (!heroName) {
    throw new Error(
      'HERO_NAME env is required (e.g. `npm run build:hero listing-studio`)',
    );
  }
  const entry = resolve(__dirname, `src/heroes/${heroName}/index.tsx`);

  return {
    root: __dirname,
    configFile: false,
    // Don't copy the front's public/ dir (manifest, mockServiceWorker, images, …)
    // into each hero output — the heroes volume serves only index.js.
    publicDir: false,
    plugins: [react(), injectHeroCss(heroName)],
    resolve: {
      // Vite 8 resolves tsconfig path aliases natively (upstream #22100 dropped
      // the vite-tsconfig-paths plugin repo-wide; it is no longer installed).
      tsconfigPaths: true,
      alias: [
        // Mirror the app vite.config.ts fallback aliases so non-TS resolvers
        // (CSS, url()) see the same mapping.
        {
          find: /^@\//,
          replacement: resolve(__dirname, 'src/modules') + '/',
        },
        { find: /^~\//, replacement: resolve(__dirname, 'src') + '/' },
      ],
    },
    define: {
      // Hero source may reference these (shared with the app); fix them at build time.
      'process.env.NODE_ENV': JSON.stringify('production'),
      'process.env': '{}',
    },
    build: {
      outDir: resolve(__dirname, `dist-heroes/${heroName}`),
      emptyOutDir: true,
      cssCodeSplit: false,
      // Library mode → one ESM entry, no index.html, no code-splitting.
      lib: {
        entry,
        formats: ['es'],
        fileName: () => 'index.js',
      },
      rollupOptions: {
        // Keep shared/host specifiers (and their subpaths) external.
        external: (id) => {
          // CSS is NEVER external: ALL of it (Mantine + hero-specific) bundles in and
          // is injected at runtime via injectHeroCss. Externalizing CSS would leave a
          // dangling bare import with no import-map entry → the hero would fail to load.
          if (id.endsWith('.css')) return false;
          if (EXTERNAL.includes(id)) return true;
          // subpath guard, e.g. `react/jsx-dev-runtime`, `@mantine/hooks/...`
          return EXTERNAL.some((e) => id === e || id.startsWith(`${e}/`));
        },
        output: {
          // No hashed chunks — single deterministic index.js the heroes volume serves.
          entryFileNames: 'index.js',
          inlineDynamicImports: true,
        },
      },
      // Heroes are small; don't trip the app's chunk-size guard (not applied here).
      chunkSizeWarningLimit: 4096,
      minify: 'esbuild',
      sourcemap: false,
      target: 'es2022',
    },
  };
});
