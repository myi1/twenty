// Shared prop/types contract for the GrapesJS PAGE (landing-page) assembly
// editor + its lazy wrapper. Mirrors grapesEmailTypes.ts's split (campaign/
// GrapesEmailEditor's types module): kept in a TINY standalone module (no
// grapesjs imports) so both the lightweight GrapesPageBuilder wrapper and the
// heavy GrapesPageEditor can import the types without the wrapper pulling in
// grapesjs. See CONVENTIONS.md "GrapesJS reuse plan" for the reuse decision
// this pair implements: extend the GrapesEmailEditor PATTERN with a sibling
// editor, not a mode-flag on the email editor and not a from-scratch builder.

import { type LandingPageTheme } from '@/propel/mocks/websiteMockData';

// The page a session seeds from / saves back to. `id` present ⇒ editing an
// existing landing page (save = update); absent ⇒ a fresh page from the
// creation flow (save = create). `sectionsJson` is the GrapesJS project JSON
// for exact re-editability — same forward-compat note as
// GrapesEmailTemplateSeed.designProjectJson: no backing CRM field exists yet
// (landingPage object is deliberately deferred this wave), so this is always
// undefined on load today.
export type GrapesPageSeed = {
  id?: string;
  title?: string;
  slug?: string;
  theme?: LandingPageTheme;
  sectionsJson?: string;
};

// `create` — the editor opens fresh from the creation flow (an AI-drafted
//            skeleton or a blank canvas), primary action is "Publish"/"Save
//            draft".
// `edit`   — the editor opens an existing landing page (from a gallery card),
//            primary action is "Save".
export type GrapesPageEditorMode = 'create' | 'edit';

// A single entry in the left-rail section-block palette. THIS WAVE: a MOCK,
// placeholder set — see CONVENTIONS.md's mock-data-contract note and the task
// scope constraint (the real ~14-section library per WEBSITE-REBUILD-DESIGN.md
// §4 lands in a separate wave and will REPLACE these block definitions
// wholesale; keep the shape stable so that swap is data-only). Each block
// drops a small, self-contained HTML/CSS snippet onto the canvas — NOT MJML
// (this is a full HTML page editor, not an email editor — see CONVENTIONS.md
// "the plugin is wrong for pages").
export type SectionBlockCategory = 'HEROES' | 'PROOF' | 'CAPTURE' | 'DATA';

export type SectionBlockDefinition = {
  id: string;
  label: string;
  category: SectionBlockCategory;
  // Short description shown under the block thumbnail in the palette.
  description: string;
  // The HTML fragment dropped onto the canvas when the block is dragged in.
  // Placeholder markup this wave — theme tokens (Nocturne/Riviera/Atlas) are
  // applied via CSS custom properties set on the canvas root (see
  // GrapesPageEditor's THEME_TOKENS), not baked into each block's HTML.
  html: string;
};

export type GrapesPageEditorProps = {
  mode: GrapesPageEditorMode;
  // Seed an existing page (edit) or an AI-drafted skeleton (create, from
  // "Generate draft"). `null`/absent ⇒ start from a blank canvas.
  initial?: GrapesPageSeed | null;
  // The active theme — drives the canvas's CSS custom properties (accent,
  // background, font stack) per spec §4 ("themes are design tokens;
  // switching restyles the whole page"). Controlled by the embedding tab so
  // the theme picker (creation flow) and the editor's own theme switch (if
  // added later) stay in sync.
  theme: LandingPageTheme;
  onThemeChange?: (theme: LandingPageTheme) => void;
  // Called after a successful save with the (mock) saved page id.
  onSaved?: (pageId: string) => void;
  // "Close" affordance — returns the embedding tab to the gallery grid.
  onClose?: () => void;
  // OPTIONAL — stub AI-assist hook for the right-panel "AI assist" input +
  // button (Hero settings panel). THIS WAVE: a no-op prop the caller can wire
  // later; the editor itself does not call any route. Mirrors the shape of
  // GrapesEmailEditor's AI co-pilot send handler, minus the live backend call.
  onApplyAiAssist?: (prompt: string) => void;
};

// The lazy wrapper (GrapesPageBuilder) takes the same props as the editor it
// wraps. Aliased so the wrapper's prop type matches its component name (lint
// rule twenty/component-props-naming) — mirrors GrapesEmailBuilderProps.
export type GrapesPageBuilderProps = GrapesPageEditorProps;
