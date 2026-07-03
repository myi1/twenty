/* eslint-disable @nx/enforce-module-boundaries */
/* oxlint-disable twenty/no-hardcoded-colors -- this file builds PAGE content
   (theme token CSS + GrapesJS block-tile SVG icons) where the Nocturne/
   Riviera/Atlas design-token values MUST be literal — they define the theme,
   not the Mantine chrome around the editor (which uses theme tokens as
   normal). Same exemption GrapesEmailEditor takes for its MJML/brand-kit
   literals. */
// ─────────────────────────────────────────────────────────────────────────────
// GrapesJS section-assembly PAGE editor — the HEAVY inner component
// ─────────────────────────────────────────────────────────────────────────────
//
// Sibling of campaign/GrapesEmailEditor.tsx (see CONVENTIONS.md "GrapesJS
// reuse plan" for the recorded decision): reuses the PATTERN — lazy wrapper +
// heavy editor, `grapesjs` + `@grapesjs/react`, a brand-aware canvas, an
// AI-assist side panel — but NOT the `grapesjs-mjml` plugin (wrong for pages:
// MJML is an email-safe table layout model, not a marketing-page one) and NOT
// the plugin's default freeform Block/Style Manager UI (spec §4 demands
// "assembly, not freeform" — a LOCKED library of pre-built sections, not raw
// drag-anything blocks).
//
// THIS WAVE (scope constraint — see propel-crm-integration CLAUDE.md task
// instructions + KNOWN_GOTCHAS.md "Hero builds never typecheck"):
//   • The left-rail section-block palette is a MOCK, PLACEHOLDER set
//     (SECTION_BLOCKS below) grouped by category (Heroes/Proof/Capture/Data).
//     The REAL ~14-section library (WEBSITE-REBUILD-DESIGN.md §4, authored via
//     `claude design`) lands in a separate wave and REPLACES these block
//     definitions wholesale — the shape (SectionBlockDefinition) is built to
//     make that swap data-only.
//   • "AI assist" in the right panel is a STUB — it calls the no-op
//     `onApplyAiAssist(prompt)` prop and appends a canned assistant reply to a
//     local log. No route call (no /marketing/draft-copy-equivalent for pages
//     exists yet).
//   • No save persists anywhere real — landingPage has no CRM object this
//     wave (deliberately deferred). "Save draft" / "Publish" call
//     `onSaved?.(mockId)` so the embedding tab can return to the gallery, same
//     shape a real save would eventually have.
//
// Constrained editing, per spec §4 + CONVENTIONS.md: NO raw-HTML/freeform
// block (unlike the email editor's default MJML block set), NO Style Manager
// panel (colors/fonts are theme tokens, not per-element overrides), NO Layer
// Manager. The editor intentionally feels like "assembling from a fixed
// library", not a general web builder.

import grapesjs, { type Editor } from 'grapesjs';
import GjsEditor, { BlocksProvider, type BlocksResultProps } from '@grapesjs/react';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  IconCheck,
  IconChevronDown,
  IconDeviceFloppy,
  IconLayoutGrid,
  IconRocket,
  IconSend,
  IconSparkles,
  IconX,
} from 'twenty-ui/display';
import { type LandingPageTheme } from '@/propel/mocks/websiteMockData';
import {
  type GrapesPageEditorProps,
  type SectionBlockCategory,
  type SectionBlockDefinition,
} from './grapesPageTypes';

import 'grapesjs/dist/css/grapes.min.css';

// ── Theme tokens (Nocturne / Riviera / Atlas) ────────────────────────────────
// Design tokens per spec §4: "themes are design tokens; switching restyles
// the whole page". Applied as CSS custom properties on the canvas iframe's
// root so every dropped section (which reads `var(--pg-*)`) restyles when the
// theme changes, with no per-section rewrite. Real values match the RE/MAX
// doc design system (project memory: remax-doc-design-system.md) — Nocturne
// dark/serif/gold, Riviera light coastal, Atlas editorial.
type ThemeTokens = {
  bg: string;
  surface: string;
  text: string;
  textDim: string;
  accent: string;
  headingFont: string;
  bodyFont: string;
};

const THEME_TOKENS: Record<LandingPageTheme, ThemeTokens> = {
  NOCTURNE: {
    bg: '#0B0E14',
    surface: '#171A21',
    text: '#F5F1E6',
    textDim: '#A9A38C',
    accent: '#C9A227',
    headingFont: '"Playfair Display", Georgia, serif',
    bodyFont: '"Hanken Grotesk", Arial, sans-serif',
  },
  RIVIERA: {
    bg: '#F7FAFD',
    surface: '#FFFFFF',
    text: '#122031',
    textDim: '#5A6B7C',
    accent: '#1D6FA5',
    headingFont: '"Fraunces", Georgia, serif',
    bodyFont: '"Inter", Arial, sans-serif',
  },
  ATLAS: {
    bg: '#F7F5F0',
    surface: '#FFFFFF',
    text: '#1E1B16',
    textDim: '#6B6559',
    accent: '#8A6D3B',
    headingFont: '"Source Serif 4", Georgia, serif',
    bodyFont: '"IBM Plex Sans", Arial, sans-serif',
  },
};

const THEME_LABEL: Record<LandingPageTheme, string> = {
  NOCTURNE: 'Nocturne',
  RIVIERA: 'Riviera',
  ATLAS: 'Atlas',
};

// Root CSS injected into the GrapesJS canvas iframe. Every mock section block
// below styles itself with `var(--pg-*)` so a theme switch re-themes the
// canvas without touching the component tree.
const canvasCss = (t: ThemeTokens) => `
  :root {
    --pg-bg: ${t.bg};
    --pg-surface: ${t.surface};
    --pg-text: ${t.text};
    --pg-text-dim: ${t.textDim};
    --pg-accent: ${t.accent};
    --pg-heading-font: ${t.headingFont};
    --pg-body-font: ${t.bodyFont};
  }
  body {
    margin: 0;
    background: var(--pg-bg);
    color: var(--pg-text);
    font-family: var(--pg-body-font);
  }
  .pg-section { padding: 48px 32px; }
  .pg-heading {
    font-family: var(--pg-heading-font);
    color: var(--pg-text);
    margin: 0 0 12px;
  }
  .pg-copy { color: var(--pg-text-dim); line-height: 1.6; margin: 0 0 16px; }
  .pg-cta {
    display: inline-block;
    background: var(--pg-accent);
    color: var(--pg-bg);
    padding: 12px 24px;
    border-radius: 6px;
    font-weight: 600;
    text-decoration: none;
  }
  .pg-card {
    background: var(--pg-surface);
    border: 1px solid color-mix(in srgb, var(--pg-text) 12%, transparent);
    border-radius: 10px;
    padding: 20px;
  }
`;

// ── Mock section-block palette ───────────────────────────────────────────────
// THIS WAVE ONLY — a small placeholder set standing in for the real ~14-
// section launch library (spec §4). Grouped into the 4 categories the task
// requires: Heroes, Proof, Capture, Data. Each block's HTML uses the theme
// token classes above so it reflects whichever theme is active; no inline
// literal colors inside a block (the whole point — theme = tokens).
const SECTION_BLOCKS: SectionBlockDefinition[] = [
  {
    id: 'hero-split',
    label: 'Split hero',
    category: 'HEROES',
    description: 'Headline + copy + CTA beside an image panel.',
    html: `<section class="pg-section" style="display:flex;gap:32px;align-items:center;flex-wrap:wrap;">
      <div style="flex:1;min-width:260px;">
        <h1 class="pg-heading" style="font-size:36px;">A home that fits the life you're building</h1>
        <p class="pg-copy">Curated listings across Dubai, matched to your budget and timeline.</p>
        <a class="pg-cta" href="#">Get started</a>
      </div>
      <div style="flex:1;min-width:260px;height:220px;border-radius:10px;background:var(--pg-surface);"></div>
    </section>`,
  },
  {
    id: 'hero-video',
    label: 'Video hero',
    category: 'HEROES',
    description: 'Full-bleed video/image background with a centered CTA.',
    html: `<section class="pg-section" style="min-height:320px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:var(--pg-surface);">
      <h1 class="pg-heading" style="font-size:40px;max-width:640px;">See it before you visit it</h1>
      <p class="pg-copy" style="max-width:480px;">A walkthrough of every listing, shot on-site this week.</p>
      <a class="pg-cta" href="#">Watch the tour</a>
    </section>`,
  },
  {
    id: 'hero-minimal',
    label: 'Minimal hero',
    category: 'HEROES',
    description: 'Just a headline, subhead, and one CTA — no imagery.',
    html: `<section class="pg-section" style="text-align:center;">
      <h1 class="pg-heading" style="font-size:32px;">Off-plan, decoded.</h1>
      <p class="pg-copy">Payment plans, developer track record, and yield — in one page.</p>
      <a class="pg-cta" href="#">See the report</a>
    </section>`,
  },
  {
    id: 'stats-strip',
    label: 'Stats / proof strip',
    category: 'PROOF',
    description: 'A row of headline numbers (deals closed, AUM, years).',
    html: `<section class="pg-section" style="display:flex;gap:24px;justify-content:center;flex-wrap:wrap;text-align:center;">
      <div><div class="pg-heading" style="font-size:28px;">1,200+</div><div class="pg-copy">Deals closed</div></div>
      <div><div class="pg-heading" style="font-size:28px;">AED 4.1B</div><div class="pg-copy">Transacted</div></div>
      <div><div class="pg-heading" style="font-size:28px;">18</div><div class="pg-copy">Years in Dubai</div></div>
    </section>`,
  },
  {
    id: 'testimonials',
    label: 'Testimonials',
    category: 'PROOF',
    description: 'Client quotes in a 3-card row.',
    html: `<section class="pg-section">
      <h2 class="pg-heading" style="font-size:24px;text-align:center;">What clients say</h2>
      <div style="display:flex;gap:16px;flex-wrap:wrap;">
        <div class="pg-card" style="flex:1;min-width:200px;"><p class="pg-copy">"Found us the villa in two weeks."</p><strong>— S. Al Marri</strong></div>
        <div class="pg-card" style="flex:1;min-width:200px;"><p class="pg-copy">"Transparent through the whole off-plan process."</p><strong>— J. Whitfield</strong></div>
        <div class="pg-card" style="flex:1;min-width:200px;"><p class="pg-copy">"Best ROI guidance we've had."</p><strong>— P. Nair</strong></div>
      </div>
    </section>`,
  },
  {
    id: 'faq',
    label: 'FAQ',
    category: 'PROOF',
    description: 'An accordion-style question list (static in this mock).',
    html: `<section class="pg-section">
      <h2 class="pg-heading" style="font-size:24px;">Frequently asked</h2>
      <div class="pg-card" style="margin-bottom:10px;"><strong>Is the price negotiable?</strong><p class="pg-copy" style="margin:6px 0 0;">Most listings allow reasonable offers — ask your agent.</p></div>
      <div class="pg-card"><strong>Can I view remotely?</strong><p class="pg-copy" style="margin:6px 0 0;">Yes — every listing has a video walkthrough on request.</p></div>
    </section>`,
  },
  {
    id: 'lead-form',
    label: 'Lead form',
    category: 'CAPTURE',
    description: 'Name / phone / message capture card.',
    html: `<section class="pg-section" style="display:flex;justify-content:center;">
      <div class="pg-card" style="max-width:380px;width:100%;">
        <h3 class="pg-heading" style="font-size:20px;">Talk to an agent</h3>
        <p class="pg-copy">We reply within 10 minutes during business hours.</p>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <input placeholder="Full name" style="padding:10px;border-radius:6px;border:1px solid var(--pg-text-dim);" />
          <input placeholder="Phone" style="padding:10px;border-radius:6px;border:1px solid var(--pg-text-dim);" />
          <a class="pg-cta" href="#" style="text-align:center;">Request a call</a>
        </div>
      </div>
    </section>`,
  },
  {
    id: 'gated-pdf-form',
    label: 'Gated-PDF form',
    category: 'CAPTURE',
    description: 'Email-gate a downloadable guide/report.',
    html: `<section class="pg-section" style="display:flex;justify-content:center;">
      <div class="pg-card" style="max-width:380px;width:100%;text-align:center;">
        <h3 class="pg-heading" style="font-size:20px;">Get the investor playbook</h3>
        <p class="pg-copy">18 pages on RCBI eligibility and returns.</p>
        <input placeholder="Email address" style="width:100%;padding:10px;border-radius:6px;border:1px solid var(--pg-text-dim);margin-bottom:8px;box-sizing:border-box;" />
        <a class="pg-cta" href="#">Download the PDF</a>
      </div>
    </section>`,
  },
  {
    id: 'whatsapp-cta',
    label: 'WhatsApp CTA',
    category: 'CAPTURE',
    description: 'A single prominent "Chat on WhatsApp" band.',
    html: `<section class="pg-section" style="text-align:center;background:var(--pg-surface);">
      <h3 class="pg-heading" style="font-size:22px;">Prefer WhatsApp?</h3>
      <p class="pg-copy">Message us and get a reply in minutes.</p>
      <a class="pg-cta" href="#" style="background:#25D366;color:#fff;">Chat on WhatsApp</a>
    </section>`,
  },
  {
    id: 'listings-grid',
    label: 'Listings grid',
    category: 'DATA',
    description: 'A 3-up grid of listing cards (placeholder data).',
    html: `<section class="pg-section">
      <h2 class="pg-heading" style="font-size:24px;">Featured listings</h2>
      <div style="display:flex;gap:16px;flex-wrap:wrap;">
        <div class="pg-card" style="flex:1;min-width:200px;"><div style="height:110px;background:var(--pg-bg);border-radius:6px;margin-bottom:8px;"></div><strong>3BR Villa · Dubai Hills</strong><p class="pg-copy">AED 3.4M</p></div>
        <div class="pg-card" style="flex:1;min-width:200px;"><div style="height:110px;background:var(--pg-bg);border-radius:6px;margin-bottom:8px;"></div><strong>2BR Apt · Marina</strong><p class="pg-copy">AED 1.9M</p></div>
        <div class="pg-card" style="flex:1;min-width:200px;"><div style="height:110px;background:var(--pg-bg);border-radius:6px;margin-bottom:8px;"></div><strong>Studio · JVC</strong><p class="pg-copy">AED 620K</p></div>
      </div>
    </section>`,
  },
  {
    id: 'market-chart',
    label: 'Live market/ROI chart',
    category: 'DATA',
    description: 'DLD-bound price-trend chart (placeholder panel).',
    html: `<section class="pg-section">
      <h2 class="pg-heading" style="font-size:24px;">Dubai Hills price trend</h2>
      <div class="pg-card" style="height:180px;display:flex;align-items:flex-end;gap:6px;padding:20px;">
        <div style="flex:1;height:40%;background:var(--pg-accent);border-radius:3px;"></div>
        <div style="flex:1;height:55%;background:var(--pg-accent);border-radius:3px;"></div>
        <div style="flex:1;height:50%;background:var(--pg-accent);border-radius:3px;"></div>
        <div style="flex:1;height:70%;background:var(--pg-accent);border-radius:3px;"></div>
        <div style="flex:1;height:85%;background:var(--pg-accent);border-radius:3px;"></div>
      </div>
    </section>`,
  },
  {
    id: 'payment-plan-compare',
    label: 'Payment-plan compare',
    category: 'DATA',
    description: 'Side-by-side developer payment-plan table.',
    html: `<section class="pg-section">
      <h2 class="pg-heading" style="font-size:24px;">Compare payment plans</h2>
      <div style="display:flex;gap:16px;flex-wrap:wrap;">
        <div class="pg-card" style="flex:1;min-width:200px;"><strong>Plan A</strong><p class="pg-copy">20/80, 3yr post-handover</p></div>
        <div class="pg-card" style="flex:1;min-width:200px;"><strong>Plan B</strong><p class="pg-copy">40/60, on handover</p></div>
      </div>
    </section>`,
  },
  {
    id: 'valuation-widget',
    label: 'Valuation widget',
    category: 'DATA',
    description: 'CMA-bound "what is my property worth" capture card.',
    html: `<section class="pg-section" style="display:flex;justify-content:center;">
      <div class="pg-card" style="max-width:380px;width:100%;text-align:center;">
        <h3 class="pg-heading" style="font-size:20px;">What's your property worth?</h3>
        <p class="pg-copy">Get an AI-assisted estimate in under a minute.</p>
        <input placeholder="Area or building" style="width:100%;padding:10px;border-radius:6px;border:1px solid var(--pg-text-dim);margin-bottom:8px;box-sizing:border-box;" />
        <a class="pg-cta" href="#">Estimate my value</a>
      </div>
    </section>`,
  },
];

const CATEGORY_LABEL: Record<SectionBlockCategory, string> = {
  HEROES: 'Heroes',
  PROOF: 'Proof',
  CAPTURE: 'Capture',
  DATA: 'Data',
};

const CATEGORY_ORDER: SectionBlockCategory[] = [
  'HEROES',
  'PROOF',
  'CAPTURE',
  'DATA',
];

// A basic starter canvas so "New page from a prompt" (blank / no AI seed) and
// "Generate draft" (an AI-drafted skeleton, built from a couple of the mock
// blocks) both open to something, not an empty white iframe.
const STARTER_HTML = `${SECTION_BLOCKS[0].html}\n${SECTION_BLOCKS[3].html}`;
const AI_DRAFT_HTML = `${SECTION_BLOCKS[0].html}\n${SECTION_BLOCKS[3].html}\n${SECTION_BLOCKS[6].html}`;

export const GrapesPageEditor = ({
  mode,
  initial,
  theme,
  onThemeChange,
  onSaved,
  onClose,
  onApplyAiAssist,
}: GrapesPageEditorProps) => {
  // oxlint-disable-next-line twenty/no-state-useref
  const editorRef = useRef<Editor | null>(null);
  // Seed + mode captured once — the editor owns its canvas after mount; a
  // parent re-render must not reset it. Same pattern as GrapesEmailEditor's
  // initialRef.
  // oxlint-disable-next-line twenty/no-state-useref
  const initialRef = useRef(initial);
  // oxlint-disable-next-line twenty/no-state-useref
  const modeRef = useRef(mode);

  const [activeCategory, setActiveCategory] =
    useState<SectionBlockCategory>('HEROES');
  const [heroTitle, setHeroTitle] = useState(initial?.title ?? '');
  const [heroSlug, setHeroSlug] = useState(initial?.slug ?? '');
  const [saving, setSaving] = useState(false);

  // AI assist — a STUB this wave. Local chat log only; calls the no-op
  // onApplyAiAssist(prompt) prop so the embedding surface can wire a real
  // action later without a call-site rewrite.
  const [aiInput, setAiInput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiLog, setAiLog] = useState<{ role: 'you' | 'ai'; text: string }[]>(
    [],
  );

  // Register ONLY the mock section blocks (constrained palette — no default
  // grapesjs blocks, no raw-HTML block). Seed the canvas from the initial
  // page (edit) or a starter skeleton (create).
  const onEditor = useCallback((editor: Editor) => {
    editorRef.current = editor;

    for (const block of SECTION_BLOCKS) {
      editor.BlockManager.add(block.id, {
        label: block.label,
        category: CATEGORY_LABEL[block.category],
        content: block.html,
        media: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="10" rx="1" opacity="0.4"/></svg>`,
      });
    }

    const seedHtml = initialRef.current?.sectionsJson;
    if (seedHtml) {
      try {
        const parsed = JSON.parse(seedHtml) as unknown;
        editor.loadProjectData(parsed as Parameters<typeof editor.loadProjectData>[0]);
      } catch {
        editor.setComponents(STARTER_HTML);
      }
    } else if (modeRef.current === 'create') {
      // "Generate draft" / "New page from a prompt" hands the editor a seed
      // with NO sectionsJson (the stub doesn't fabricate a real component
      // tree — see LandingPagesTab's generateDraftFromPrompt). Open a richer
      // multi-section starter here so a "generated" page reads as more than
      // a single hero, while `edit` mode (opening a real saved page that
      // simply has no re-editable snapshot yet) falls back to the plainer
      // STARTER_HTML rather than implying content that was never there.
      editor.setComponents(AI_DRAFT_HTML);
    } else {
      editor.setComponents(STARTER_HTML);
    }
  }, []);

  const sendAiAssist = useCallback(
    (request: string) => {
      const text = request.trim();
      if (text === '' || aiBusy) return;
      setAiBusy(true);
      setAiLog((l) => [...l, { role: 'you', text }]);
      setAiInput('');
      onApplyAiAssist?.(text);
      // Stub reply — no route call this wave (see file header). Simulated
      // delay so the interaction reads as "thinking", per creation-flow
      // convention (generateDraftFromPrompt uses the same idea).
      setTimeout(() => {
        setAiLog((l) => [
          ...l,
          {
            role: 'ai',
            text: 'AI assist isn’t wired to a live model yet — this is a placeholder response. Your request was noted.',
          },
        ]);
        setAiBusy(false);
      }, 600);
    },
    [aiBusy, onApplyAiAssist],
  );

  const doSave = useCallback(
    (publish: boolean) => {
      if (saving) return;
      setSaving(true);
      // Mock save — no route exists yet (landingPage object deferred). Same
      // simulated-delay convention as generateDraftFromPrompt.
      setTimeout(() => {
        setSaving(false);
        onSaved?.(initial?.id ?? `mock-${Date.now()}`);
      }, publish ? 500 : 300);
    },
    [saving, onSaved, initial],
  );

  const tokens = THEME_TOKENS[theme];
  const isEditMode = mode === 'edit';

  return (
    <Stack gap="xs" style={{ flex: 1, minHeight: 0 }}>
      {/* Toolbar */}
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <Badge
            size="sm"
            variant="light"
            color="red"
            leftSection={<IconLayoutGrid size={12} />}
          >
            Section assembly
          </Badge>
          <Select
            size="xs"
            w={140}
            allowDeselect={false}
            value={theme}
            data={[
              { value: 'NOCTURNE', label: THEME_LABEL.NOCTURNE },
              { value: 'RIVIERA', label: THEME_LABEL.RIVIERA },
              { value: 'ATLAS', label: THEME_LABEL.ATLAS },
            ]}
            onChange={(v) =>
              v !== null && onThemeChange?.(v as LandingPageTheme)
            }
          />
        </Group>
        <Group gap="xs" wrap="nowrap">
          {onClose && (
            <Button
              size="compact-sm"
              variant="subtle"
              color="gray"
              onClick={onClose}
            >
              Close
            </Button>
          )}
          <Button
            size="compact-sm"
            variant="default"
            leftSection={<IconDeviceFloppy size={14} />}
            loading={saving}
            onClick={() => doSave(false)}
          >
            Save draft
          </Button>
          <Button
            size="compact-sm"
            color="red"
            leftSection={<IconRocket size={14} />}
            loading={saving}
            onClick={() => doSave(true)}
          >
            {isEditMode ? 'Update & publish' : 'Publish'}
          </Button>
        </Group>
      </Group>

      {/* Left palette · center canvas · right panel */}
      <Box
        style={{
          flex: 1,
          minHeight: 560,
          display: 'flex',
          gap: 8,
          minWidth: 0,
        }}
      >
        {/* Left: section-block palette, grouped by category */}
        <Paper
          withBorder
          radius="md"
          style={{
            width: 220,
            flex: 'none',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <Box
            px="sm"
            py={8}
            style={{
              borderBottom: '1px solid var(--mantine-color-default-border)',
            }}
          >
            <Text size="sm" fw={700}>
              Sections
            </Text>
            <Text size="xs" c="dimmed">
              Drag a block onto the canvas
            </Text>
          </Box>
          <SegmentedControl
            mx="sm"
            mt={8}
            size="xs"
            color="red"
            orientation="vertical"
            value={activeCategory}
            onChange={(v) => setActiveCategory(v as SectionBlockCategory)}
            data={CATEGORY_ORDER.map((cat) => ({
              value: cat,
              label: CATEGORY_LABEL[cat],
            }))}
          />
          <ScrollArea style={{ flex: 1, minHeight: 0 }} px="sm" py="sm">
            {/* BlocksProvider (the documented @grapesjs/react primitive for a
                custom block-panel UI) hands us the REAL block models grouped
                by category + a dragStart handler — so these Mantine tiles ARE
                the actual GrapesJS drag source (native HTML5 drag into the
                canvas iframe), not a second competing rail over a hidden
                default panel. mapCategoryBlocks keys by the block's
                CATEGORY LABEL string (CATEGORY_LABEL[activeCategory],
                matching what onEditor registered each block under). */}
            <BlocksProvider>
              {({ mapCategoryBlocks, dragStart, dragStop }: BlocksResultProps) => {
                const blocks =
                  mapCategoryBlocks.get(CATEGORY_LABEL[activeCategory]) ?? [];
                return (
                  <Stack gap={8}>
                    {blocks.map((block) => {
                      const def = SECTION_BLOCKS.find(
                        (b) => b.id === block.getId(),
                      );
                      return (
                        <Tooltip
                          key={block.getId()}
                          label={def?.description ?? block.getLabel()}
                          position="right"
                          withArrow
                        >
                          <Paper
                            withBorder
                            radius="sm"
                            p={8}
                            draggable
                            onDragStart={(e) => {
                              dragStart(block, e.nativeEvent);
                            }}
                            onDragEnd={() => dragStop(false)}
                            style={{ cursor: 'grab' }}
                          >
                            <Text size="xs" fw={600}>
                              {block.getLabel()}
                            </Text>
                          </Paper>
                        </Tooltip>
                      );
                    })}
                    {blocks.length === 0 ? (
                      <Text size="xs" c="dimmed" ta="center" py="md">
                        No sections in this category yet.
                      </Text>
                    ) : null}
                  </Stack>
                );
              }}
            </BlocksProvider>
          </ScrollArea>
        </Paper>

        {/* Center: canvas */}
        <Box
          style={{
            flex: 1,
            minWidth: 0,
            border: '1px solid var(--mantine-color-default-border)',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <GjsEditor
            grapesjs={grapesjs}
            onEditor={onEditor}
            options={{
              height: '100%',
              storageManager: false,
              fromElement: false,
              // No default panels — this editor supplies its own toolbar +
              // palette + settings chrome (Mantine), not GrapesJS's stock UI.
              // No Style Manager / Layer Manager panel is mounted anywhere in
              // this component either — theming rides CSS custom properties
              // (canvasCss) driven by the theme picker, not per-element style
              // overrides. Keeps the editor "assembly, not freeform" per
              // spec §4: there is no UI path to a raw block or a style editor.
              panels: { defaults: [] },
            }}
          />
        </Box>

        {/* Right: Hero settings + AI assist */}
        <Paper
          withBorder
          radius="md"
          style={{
            width: 300,
            flex: 'none',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <ScrollArea style={{ flex: 1, minHeight: 0 }} px="sm" py="sm">
            <Stack gap="md">
              <Box>
                <Text size="sm" fw={700} mb={6}>
                  Hero settings
                </Text>
                <Stack gap={8}>
                  <TextInput
                    label="Page title"
                    size="xs"
                    value={heroTitle}
                    onChange={(e) => setHeroTitle(e.currentTarget.value)}
                    placeholder="Dubai Hills valuation"
                  />
                  <TextInput
                    label="Slug"
                    size="xs"
                    value={heroSlug}
                    onChange={(e) => setHeroSlug(e.currentTarget.value)}
                    placeholder="valuation-dubai-hills"
                    leftSection={
                      <Text size="xs" c="dimmed">
                        /
                      </Text>
                    }
                  />
                </Stack>
              </Box>

              <Box>
                <Group gap={6} mb={6}>
                  <IconSparkles size={14} color="var(--mantine-color-red-6)" />
                  <Text size="sm" fw={700}>
                    AI assist
                  </Text>
                </Group>
                <Text size="xs" c="dimmed" mb={8}>
                  Ask for a change (e.g. "swap the stats for testimonials",
                  "make the hero punchier"). Placeholder this wave — not
                  wired to a live model.
                </Text>
                <Stack gap={6}>
                  {aiLog.map((m, i) => (
                    <Box
                      key={i}
                      style={{
                        alignSelf: m.role === 'you' ? 'flex-end' : 'flex-start',
                        background:
                          m.role === 'you'
                            ? 'var(--mantine-color-red-light)'
                            : 'var(--mantine-color-default-hover)',
                        borderRadius: 8,
                        padding: '6px 8px',
                      }}
                    >
                      <Text size="xs" style={{ whiteSpace: 'pre-wrap' }}>
                        {m.text}
                      </Text>
                    </Box>
                  ))}
                  {aiBusy && (
                    <Group gap={6}>
                      <Loader size="xs" color="red" />
                      <Text size="xs" c="dimmed">
                        Thinking…
                      </Text>
                    </Group>
                  )}
                </Stack>
              </Box>
            </Stack>
          </ScrollArea>
          <Box
            px="sm"
            py={8}
            style={{
              borderTop: '1px solid var(--mantine-color-default-border)',
            }}
          >
            <Group gap={6} align="flex-end" wrap="nowrap">
              <Textarea
                autosize
                minRows={1}
                maxRows={3}
                style={{ flex: 1 }}
                placeholder="Ask the AI to change this page…"
                value={aiInput}
                disabled={aiBusy}
                onChange={(e) => setAiInput(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendAiAssist(aiInput);
                  }
                }}
              />
              <ActionIcon
                variant="filled"
                color="red"
                size="lg"
                disabled={aiBusy || aiInput.trim() === ''}
                onClick={() => sendAiAssist(aiInput)}
              >
                <IconSend size={16} />
              </ActionIcon>
            </Group>
          </Box>
        </Paper>
      </Box>

      {/* Theme-token CSS for the canvas iframe — re-injected on theme change
          via the `key` on GjsEditor's canvas wrapper would remount the whole
          editor (losing content), so instead we push updated CSS text into
          the canvas document on every theme change via the editor ref. */}
      <ThemeCssInjector editorRef={editorRef} tokens={tokens} />
    </Stack>
  );
};

// Re-injects the theme-token <style> tag into the GrapesJS canvas iframe
// whenever `tokens` (i.e. the selected theme) changes, without remounting the
// editor or touching the component tree — a pure presentational side-effect,
// same spirit as GrapesEmailEditor's contrast-aware logo re-pick on banner
// recolor.
const ThemeCssInjector = ({
  editorRef,
  tokens,
}: {
  editorRef: React.RefObject<Editor | null>;
  tokens: ThemeTokens;
}) => {
  const styleIdRef = useRef('propel-page-theme-tokens');
  useMemo(() => {
    const editor = editorRef.current;
    const doc = editor?.Canvas?.getDocument?.();
    if (!doc) return;
    let styleEl = doc.getElementById(styleIdRef.current);
    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = styleIdRef.current;
      doc.head?.appendChild(styleEl);
    }
    styleEl.textContent = canvasCss(tokens);
    // Re-run whenever tokens (theme) change. editorRef is a ref (stable
    // identity), so it's intentionally excluded from a dep array — this
    // block is invoked inline on every render, which is correct here: it's a
    // cheap idempotent DOM write, not an effect needing its own scheduling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens]);
  return null;
};

export type { GrapesPageEditorProps };
export default GrapesPageEditor;
