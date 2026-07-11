// Regenerates the static theme artifacts in src/theme-constants/ from the
// hand-authored constants in src/theme/constants/:
//   - theme-dark.css   (.dark  { --t-*: ... })
//   - theme-light.css  (.light { --t-*: ... })
//   - themeCssVariables.ts (nested object of var(--t-*) references)
//
// Restored + adapted from the pre-c41a8e2b23 generator: instead of requiring
// the built dist bundle, it bundles THEME_DARK / THEME_LIGHT straight from
// src via esbuild (image assets inlined as data URLs, matching the committed
// output), so it runs on a clean tree with no prior nx build.
//
// Usage (from workspace root):
//   npx tsx packages/twenty-ui/scripts/generateThemeConstants.ts
//   (or: npx nx run twenty-ui:generateThemeConstants)
//
// Output is formatted with the repo formatter (oxfmt); regenerating on a
// clean tree must produce a zero git diff.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, '..');
const workspaceRoot = resolve(packageRoot, '../..');
const outputDir = resolve(packageRoot, 'src/theme-constants');

// Spacing steps enumerated for the spacing() theme function
// (formerly SPACING_VALUES in src/theme/utils/spacingValues.ts).
const SPACING_VALUES = [...Array.from({ length: 33 }, (_, i) => i), 0.5, 1.5];

const camelToKebab = (str: string): string =>
  str.replace(/([A-Z])/g, (match) => `-${match.toLowerCase()}`);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const formatSpacingKey = (n: number): string => String(n).replace('.', '_');

// --- 1. Bundle the theme objects from src (assets become data URLs) ---

const bundleThemes = async (): Promise<{
  THEME_DARK: Record<string, unknown>;
  THEME_LIGHT: Record<string, unknown>;
}> => {
  const result = await build({
    stdin: {
      contents: `
        export { THEME_DARK } from './src/theme/constants/ThemeDark';
        export { THEME_LIGHT } from './src/theme/constants/ThemeLight';
      `,
      resolveDir: packageRoot,
      loader: 'ts',
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
    tsconfig: resolve(packageRoot, 'tsconfig.json'),
    loader: {
      '.jpg': 'dataurl',
      '.jpeg': 'dataurl',
      '.png': 'dataurl',
      '.gif': 'dataurl',
      '.webp': 'dataurl',
      '.svg': 'dataurl',
    },
  });

  const tempDir = mkdtempSync(join(tmpdir(), 'theme-constants-'));
  const bundlePath = join(tempDir, 'themes.cjs');
  writeFileSync(bundlePath, result.outputFiles[0].text, 'utf-8');

  try {
    const require = createRequire(import.meta.url);
    const { THEME_DARK, THEME_LIGHT } = require(bundlePath);
    return { THEME_DARK, THEME_LIGHT };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
};

// --- 2. Flatten a theme object to [--css-variable-name, value] entries ---

const collectSpacingEntries = (
  name: string,
  spacingFn: (...args: number[]) => string,
): [string, string][] =>
  SPACING_VALUES.map((n) => [`--${name}-${formatSpacingKey(n)}`, spacingFn(n)]);

const collectEntriesForValue = ({
  key,
  value,
  name,
}: {
  key: string;
  value: unknown;
  name: string;
}): [string, string][] => {
  if (typeof value === 'function' && key === 'spacing') {
    return collectSpacingEntries(name, value as (...args: number[]) => string);
  }

  if (isPlainObject(value)) {
    return prepareThemeForRootCssVariableInjection({
      themeNode: value,
      prefix: name,
    });
  }

  return [[`--${name}`, String(value)]];
};

const prepareThemeForRootCssVariableInjection = ({
  themeNode,
  prefix,
}: {
  themeNode: Record<string, unknown>;
  prefix: string;
}): [string, string][] =>
  Object.entries(themeNode).flatMap(([key, value]) => {
    const name = `${prefix}-${camelToKebab(key)}`;
    return collectEntriesForValue({ key, value, name });
  });

// --- 3. Build the nested var(--t-*) reference object ---

const buildThemeReferencingRootCssVariables = ({
  themeNode,
  prefix,
}: {
  themeNode: Record<string, unknown>;
  prefix: string;
}): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(themeNode).map(([key, value]) => {
      const name = `${prefix}-${camelToKebab(key)}`;

      if (typeof value === 'function' && key === 'spacing') {
        return [
          key,
          Object.fromEntries(
            SPACING_VALUES.map((n) => [
              String(n),
              `var(--${name}-${formatSpacingKey(n)})`,
            ]),
          ),
        ];
      }

      if (isPlainObject(value)) {
        return [
          key,
          buildThemeReferencingRootCssVariables({
            themeNode: value,
            prefix: name,
          }),
        ];
      }

      return [key, `var(--${name})`];
    }),
  );

// --- 4. Serialization ---

const CSS_HEADER = `/* This file is generated from packages/twenty-ui/src/theme/constants/.
   Do not edit manually — regenerate by running the generation script. */
`;

const TS_HEADER = `// This file is generated from packages/twenty-ui/src/theme/constants/.
// Do not edit manually — regenerate by running the generation script.
`;

const serializeCss = (selector: string, entries: [string, string][]): string =>
  `${CSS_HEADER}\n${selector} {\n${entries
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n')}\n}\n`;

const quoteKey = (key: string): string =>
  /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`;

const serializeObject = (obj: Record<string, unknown>, indent = 2): string => {
  const spaces = ' '.repeat(indent);
  const entries = Object.entries(obj).map(([key, value]) => {
    if (isPlainObject(value)) {
      return `${spaces}${quoteKey(key)}: ${serializeObject(value, indent + 2)},`;
    }
    return `${spaces}${quoteKey(key)}: '${String(value)}',`;
  });

  return `{\n${entries.join('\n')}\n${' '.repeat(indent - 2)}}`;
};

// --- 5. Generate ---

const main = async () => {
  const { THEME_DARK, THEME_LIGHT } = await bundleThemes();

  const darkEntries = prepareThemeForRootCssVariableInjection({
    themeNode: THEME_DARK,
    prefix: 't',
  });
  const lightEntries = prepareThemeForRootCssVariableInjection({
    themeNode: THEME_LIGHT,
    prefix: 't',
  });
  const themeCssVariables = buildThemeReferencingRootCssVariables({
    themeNode: THEME_LIGHT,
    prefix: 't',
  });

  const darkCssPath = resolve(outputDir, 'theme-dark.css');
  const lightCssPath = resolve(outputDir, 'theme-light.css');
  const themeCssVariablesPath = resolve(outputDir, 'themeCssVariables.ts');

  writeFileSync(darkCssPath, serializeCss('.dark', darkEntries), 'utf-8');
  console.log('Generated theme-dark.css');

  writeFileSync(lightCssPath, serializeCss('.light', lightEntries), 'utf-8');
  console.log('Generated theme-light.css');

  writeFileSync(
    themeCssVariablesPath,
    `${TS_HEADER}export const themeCssVariables = ${serializeObject(themeCssVariables)};\n`,
    'utf-8',
  );
  console.log('Generated themeCssVariables.ts');

  // Normalize with the repo formatter so a clean-tree regen is a no-op.
  execFileSync(
    resolve(workspaceRoot, 'node_modules/.bin/oxfmt'),
    [darkCssPath, lightCssPath, themeCssVariablesPath],
    { stdio: 'inherit', cwd: workspaceRoot },
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
