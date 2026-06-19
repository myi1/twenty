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
import tsconfigPaths from 'vite-tsconfig-paths';

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
  // twenty-ui subpaths
  'twenty-ui/display',
  'twenty-ui/theme-constants',
  // host-internal (resolved bare in the browser via the import map → shims)
  '@/apollo/utils/getTokenPair',
  '@/propel/lib/callPropelRoute',
  '@/ui/layout/page/components/PageContainer',
  '@/ui/layout/page/components/PageHeader',
  '@/ui/feedback/snack-bar-manager/hooks/useSnackBar',
  '@/dialer-dock/utils/dialerCrmBridge',
  '~/config',
];

// CSS the host already loads (PropelMantineProvider does `import '@mantine/core/styles.css'`).
// The hero must NOT re-bundle Mantine's stylesheet — the host owns it. Treat the CSS
// side-effect import as external so it's dropped from the hero bundle.
const EXTERNAL_CSS = ['@mantine/core/styles.css'];

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
    plugins: [
      react(),
      tsconfigPaths({ root: __dirname, projects: ['tsconfig.json'] }),
    ],
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
          if (EXTERNAL.includes(id)) return true;
          if (EXTERNAL_CSS.includes(id)) return true;
          // subpath guard, e.g. `react/jsx-dev-runtime`, `@mantine/core/styles.css`
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
