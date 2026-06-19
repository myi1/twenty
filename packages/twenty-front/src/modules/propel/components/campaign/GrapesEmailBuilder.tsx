// ─────────────────────────────────────────────────────────────────────────────
// GrapesEmailBuilder — the SHARED, lightweight lazy wrapper
// ─────────────────────────────────────────────────────────────────────────────
//
// THE one email editor everywhere (founder direction, TM#50): both the
// campaign-builder hero (MarketingCampaignBuilderPage) and the marketing-hub
// Templates tab import THIS component. It owns ZERO grapesjs code — it React.lazy()
// -loads the heavy GrapesEmailEditor so the ~3.5 MB grapesjs library is not
// EVALUATED until this builder actually mounts.
//
// Code-splitting note (item 4): runtime heroes build as a SINGLE inlined index.js
// (vite.hero.config.ts → `inlineDynamicImports: true`), so this lazy import does
// NOT become a separate network chunk — grapesjs still ships inside the hero
// bundle. What lazy() DOES buy us here is deferred MODULE EVALUATION: grapesjs and
// its CSS-injection side-effects don't run until the editor mounts, so a route that
// only shows the entry cards (campaign builder) or the template grid (Templates
// tab) pays no grapesjs init cost. TRUE network-level splitting of grapesjs out of
// the hero would require changing the hero build to emit multiple chunks + a loader
// that fetches them — a cross-hero infra change, out of scope for this iteration.

import { lazy, Suspense } from 'react';
import { Center, Loader, Stack, Text } from '@mantine/core';
import {
  type GrapesEmailBuilderProps,
  type GrapesEmailTemplateSeed,
} from './grapesEmailTypes';

// The heavy editor (imports grapesjs / grapesjs-mjml / @grapesjs/react). Lazy so
// grapesjs evaluates only on mount. Module-level (not per-render) so React.lazy
// memoizes the import across mounts.
const LazyGrapesEmailEditor = lazy(() => import('./GrapesEmailEditor'));

export const GrapesEmailBuilder = ({
  mode,
  initial,
  customFields,
  onSaved,
  onClose,
  onApplyHtml,
  onHtmlChange,
  onProjectChange,
  hideToolbar,
}: GrapesEmailBuilderProps) => (
  <Suspense
    fallback={
      <Center style={{ flex: 1, minHeight: 480 }}>
        <Stack gap="sm" align="center">
          <Loader color="red" />
          <Text size="xs" c="dimmed">
            Loading the email designer…
          </Text>
        </Stack>
      </Center>
    }
  >
    <LazyGrapesEmailEditor
      mode={mode}
      initial={initial}
      customFields={customFields}
      onSaved={onSaved}
      onClose={onClose}
      onApplyHtml={onApplyHtml}
      onHtmlChange={onHtmlChange}
      onProjectChange={onProjectChange}
      hideToolbar={hideToolbar}
    />
  </Suspense>
);

export type { GrapesEmailBuilderProps, GrapesEmailTemplateSeed };
export default GrapesEmailBuilder;
