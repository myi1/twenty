// ─────────────────────────────────────────────────────────────────────────────
// GrapesPageBuilder — the SHARED, lightweight lazy wrapper (Landing pages)
// ─────────────────────────────────────────────────────────────────────────────
//
// Sibling of campaign/GrapesEmailBuilder.tsx, same shape and same reasoning
// (see CONVENTIONS.md "GrapesJS reuse plan" for the decision this pair
// implements): it owns ZERO grapesjs code — it React.lazy()-loads the heavy
// GrapesPageEditor so the ~3.5 MB grapesjs library is not EVALUATED until the
// assembly editor actually mounts. The Landing pages tab shows just the
// gallery/creation-flow cards until "Generate draft" or "Edit" opens this.
//
// Code-splitting note: same caveat as GrapesEmailBuilder — heroes build as a
// single inlined index.js, so this lazy import defers MODULE EVALUATION, not
// network download. Still valuable: a session that never opens the editor
// (browses the gallery, reads Site leads, etc.) pays no grapesjs init cost.

import { lazy, Suspense } from 'react';
import { Center, Loader, Stack, Text } from '@mantine/core';
import {
  type GrapesPageBuilderProps,
  type GrapesPageSeed,
} from './grapesPageTypes';

// The heavy editor (imports grapesjs / @grapesjs/react). Lazy so grapesjs
// evaluates only on mount. Module-level (not per-render) so React.lazy
// memoizes the import across mounts.
const LazyGrapesPageEditor = lazy(() => import('./GrapesPageEditor'));

export const GrapesPageBuilder = ({
  mode,
  initial,
  theme,
  onThemeChange,
  onSaved,
  onClose,
  onApplyAiAssist,
}: GrapesPageBuilderProps) => (
  <Suspense
    fallback={
      <Center style={{ flex: 1, minHeight: 480 }}>
        <Stack gap="sm" align="center">
          <Loader color="red" />
          <Text size="xs" c="dimmed">
            Loading the page builder…
          </Text>
        </Stack>
      </Center>
    }
  >
    <LazyGrapesPageEditor
      mode={mode}
      initial={initial}
      theme={theme}
      onThemeChange={onThemeChange}
      onSaved={onSaved}
      onClose={onClose}
      onApplyAiAssist={onApplyAiAssist}
    />
  </Suspense>
);

export type { GrapesPageBuilderProps, GrapesPageSeed };
export default GrapesPageBuilder;
