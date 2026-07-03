import {
  Badge,
  Box,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { useState } from 'react';
import {
  IconArrowLeft,
  IconLayoutGrid,
  IconPlus,
  IconSparkles,
} from 'twenty-ui/display';
import {
  getLandingPages,
  type LandingPageCard,
  type LandingPageTheme,
} from '@/propel/mocks/websiteMockData';
import { GrapesPageBuilder } from '@/propel/components/website/GrapesPageBuilder';
import { type GrapesPageSeed } from '@/propel/components/website/grapesPageTypes';

// Landing pages sub-tab (spec §6-7): gallery of page cards (theme badge,
// Live/Draft, visits·leads·conv%) + a "New page from a prompt" entry point
// that opens the creation flow (theme picker + prompt textarea + "Generate
// draft" stub + a template-grid fallback with mock conversion rates), which
// hands off into the section-assembly editor (GrapesPageBuilder — see
// CONVENTIONS.md "GrapesJS reuse plan" for the reuse decision: a sibling of
// GrapesEmailBuilder, not a mode-flag on it).
//
// THIS WAVE: `generateDraftFromPrompt` is a STUB — a simulated delay
// returning a canned mock page structure, no real AI call. Everything below
// (gallery / creation flow / editor) is mock-data-backed per
// CONVENTIONS.md's data-fetching pattern; nothing persists.

type ViewState =
  | { mode: 'gallery' }
  | { mode: 'create' }
  | { mode: 'editor'; seed: GrapesPageSeed | null; editorMode: 'create' | 'edit' };

const THEME_LABEL: Record<LandingPageTheme, string> = {
  NOCTURNE: 'Nocturne',
  RIVIERA: 'Riviera',
  ATLAS: 'Atlas',
};

const THEME_BADGE_COLOR: Record<LandingPageTheme, string> = {
  NOCTURNE: 'dark',
  RIVIERA: 'blue',
  ATLAS: 'yellow',
};

const THEME_SWATCH_STYLE: Record<LandingPageTheme, React.CSSProperties> = {
  NOCTURNE: { background: 'linear-gradient(135deg, #0B0E14 0%, #2A2416 100%)' },
  RIVIERA: { background: 'linear-gradient(135deg, #E8F0FE 0%, #C9DBFA 100%)' },
  ATLAS: { background: 'linear-gradient(135deg, #F7F5F0 0%, #E5E0D5 100%)' },
};

// The 3-4 template cards the creation flow falls back to (spec §6-7: "or
// start from templates that display their real conversion rates"). Mock
// conversion rates this wave — same shape a real "top-performing templates"
// query would eventually return.
type PageTemplate = {
  id: string;
  label: string;
  theme: LandingPageTheme;
  convPct: number;
  description: string;
};

const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: 'tpl-valuation',
    label: 'Valuation capture',
    theme: 'RIVIERA',
    convPct: 2.3,
    description: 'Hero + valuation widget + testimonials.',
  },
  {
    id: 'tpl-gated-guide',
    label: 'Gated guide download',
    theme: 'NOCTURNE',
    convPct: 2.7,
    description: 'Minimal hero + gated-PDF form.',
  },
  {
    id: 'tpl-listing-launch',
    label: 'Listing launch',
    theme: 'NOCTURNE',
    convPct: 2.4,
    description: 'Video hero + listings grid + WhatsApp CTA.',
  },
  {
    id: 'tpl-market-report',
    label: 'Market report',
    theme: 'ATLAS',
    convPct: 1.8,
    description: 'Split hero + live market chart + lead form.',
  },
];

// STUB — per task scope, returns a canned mock page structure after a
// simulated delay. No real AI call this wave. Swapping this for a live
// generation route later is a body-only change (same return shape).
const generateDraftFromPrompt = (
  prompt: string,
  theme: LandingPageTheme,
): Promise<GrapesPageSeed> =>
  new Promise((resolve) => {
    setTimeout(() => {
      const slugSeed = prompt
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 40);
      resolve({
        title: prompt.trim() === '' ? 'New landing page' : prompt.trim().slice(0, 60),
        slug: slugSeed || 'new-landing-page',
        theme,
        // No sectionsJson — the editor seeds a starter skeleton from its own
        // mock section blocks when no seed is provided (see
        // GrapesPageEditor's STARTER_HTML / AI_DRAFT_HTML).
      });
    }, 900);
  });

const LandingPageGridCard = ({
  page,
  onEdit,
}: {
  page: LandingPageCard;
  onEdit: () => void;
}) => (
  <Paper
    withBorder
    radius="md"
    p={0}
    style={{ overflow: 'hidden', cursor: 'pointer' }}
    onClick={onEdit}
  >
    <Box h={100} style={{ background: page.thumbnailGradient }} />
    <Stack gap={6} p="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Text fw={600} size="sm" lineClamp={1}>
          {page.title}
        </Text>
        <Badge
          color={page.status === 'LIVE' ? 'teal' : 'gray'}
          variant="light"
          radius="sm"
        >
          {page.status === 'LIVE' ? 'Live' : 'Draft'}
        </Badge>
      </Group>
      <Text c="dimmed" size="xs">
        /{page.slug}
      </Text>
      <Badge
        color={THEME_BADGE_COLOR[page.theme]}
        variant="outline"
        size="xs"
        radius="sm"
        style={{ alignSelf: 'flex-start' }}
      >
        {THEME_LABEL[page.theme]}
      </Badge>
      <Group gap="md" mt={4}>
        <Text size="xs" c="dimmed">
          {page.visits.toLocaleString('en-US')} visits
        </Text>
        <Text size="xs" c="dimmed">
          {page.leads} leads
        </Text>
        <Text size="xs" c="dimmed">
          {page.convPct}% conv
        </Text>
      </Group>
      <Text size="xs" c="dimmed">
        Updated {page.updatedLabel}
      </Text>
    </Stack>
  </Paper>
);

const ThemeSwatchOption = ({
  theme,
  selected,
  onSelect,
}: {
  theme: LandingPageTheme;
  selected: boolean;
  onSelect: () => void;
}) => (
  <Paper
    withBorder
    radius="md"
    p="xs"
    onClick={onSelect}
    style={{
      cursor: 'pointer',
      borderColor: selected ? 'var(--mantine-color-red-6)' : undefined,
      borderWidth: selected ? 2 : 1,
      flex: 1,
      minWidth: 120,
    }}
  >
    <Box h={48} style={{ ...THEME_SWATCH_STYLE[theme], borderRadius: 6 }} />
    <Text size="xs" fw={600} mt={6} ta="center">
      {THEME_LABEL[theme]}
    </Text>
  </Paper>
);

const CreationFlow = ({
  onBack,
  onDraftReady,
}: {
  onBack: () => void;
  onDraftReady: (seed: GrapesPageSeed) => void;
}) => {
  const [theme, setTheme] = useState<LandingPageTheme>('NOCTURNE');
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);

  const onGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    const seed = await generateDraftFromPrompt(prompt, theme);
    setGenerating(false);
    onDraftReady(seed);
  };

  const onUseTemplate = (tpl: PageTemplate) => {
    onDraftReady({
      title: tpl.label,
      slug: tpl.id.replace(/^tpl-/, ''),
      theme: tpl.theme,
    });
  };

  return (
    <Box p="md">
      <Group gap={8} mb="md">
        <Button
          size="compact-sm"
          variant="subtle"
          color="gray"
          leftSection={<IconArrowLeft size={14} />}
          onClick={onBack}
        >
          Back to pages
        </Button>
      </Group>

      <Title order={4} mb={4}>
        New page from a prompt
      </Title>
      <Text c="dimmed" size="sm" mb="md" maw={560}>
        Describe the page you want — the AI assembles a draft from the
        section library, fully editable afterward.
      </Text>

      <Paper withBorder radius="md" p="md" mb="lg">
        <Text size="sm" fw={600} mb={8}>
          1. Pick a theme
        </Text>
        <Group gap="sm" mb="md" wrap="wrap">
          {(['NOCTURNE', 'RIVIERA', 'ATLAS'] as LandingPageTheme[]).map((t) => (
            <ThemeSwatchOption
              key={t}
              theme={t}
              selected={theme === t}
              onSelect={() => setTheme(t)}
            />
          ))}
        </Group>

        <Text size="sm" fw={600} mb={8}>
          2. Describe the page
        </Text>
        <Textarea
          autosize
          minRows={3}
          maxRows={6}
          placeholder="e.g. A valuation landing page for Dubai Hills, warm tone, with a testimonial strip."
          value={prompt}
          onChange={(e) => setPrompt(e.currentTarget.value)}
          mb="md"
        />

        <Button
          color="red"
          leftSection={<IconSparkles size={14} />}
          loading={generating}
          onClick={() => void onGenerate()}
        >
          Generate draft
        </Button>
      </Paper>

      <Text size="sm" fw={600} mb={8}>
        Or start from a template
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        {PAGE_TEMPLATES.map((tpl) => (
          <Paper
            key={tpl.id}
            withBorder
            radius="md"
            p={0}
            style={{ overflow: 'hidden', cursor: 'pointer' }}
            onClick={() => onUseTemplate(tpl)}
          >
            <Box h={70} style={{ ...THEME_SWATCH_STYLE[tpl.theme] }} />
            <Stack gap={4} p="sm">
              <Text size="sm" fw={600}>
                {tpl.label}
              </Text>
              <Text size="xs" c="dimmed">
                {tpl.description}
              </Text>
              <Badge size="xs" variant="light" color="teal" style={{ alignSelf: 'flex-start' }}>
                {tpl.convPct}% avg conv
              </Badge>
            </Stack>
          </Paper>
        ))}
      </SimpleGrid>
    </Box>
  );
};

export const LandingPagesTab = () => {
  const pages = getLandingPages();
  const [view, setView] = useState<ViewState>({ mode: 'gallery' });

  if (view.mode === 'create') {
    return (
      <CreationFlow
        onBack={() => setView({ mode: 'gallery' })}
        onDraftReady={(seed) =>
          setView({ mode: 'editor', seed, editorMode: 'create' })
        }
      />
    );
  }

  if (view.mode === 'editor') {
    return (
      <Box
        p="md"
        style={{
          height: '100%',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Group justify="space-between" align="flex-end" mb="sm" wrap="wrap">
          <Stack gap={2}>
            <Title order={4}>
              {view.editorMode === 'edit'
                ? `Edit page — ${view.seed?.title ?? ''}`
                : 'New landing page'}
            </Title>
            <Text size="sm" c="dimmed" maw={560}>
              Assemble the page from the section library. Themes restyle the
              whole page instantly.
            </Text>
          </Stack>
        </Group>
        <GrapesPageBuilder
          mode={view.editorMode}
          initial={view.seed}
          theme={view.seed?.theme ?? 'NOCTURNE'}
          onThemeChange={(nextTheme) =>
            setView((prev) =>
              prev.mode === 'editor'
                ? {
                    ...prev,
                    seed: { ...(prev.seed ?? {}), theme: nextTheme },
                  }
                : prev,
            )
          }
          onSaved={() => setView({ mode: 'gallery' })}
          onClose={() => setView({ mode: 'gallery' })}
          onApplyAiAssist={() => {
            /* stub — no-op this wave, see GrapesPageEditor header comment */
          }}
        />
      </Box>
    );
  }

  return (
    <Box p="md">
      <Group justify="space-between" align="flex-start" mb="md" wrap="nowrap">
        <Box>
          <Group gap={8} align="center">
            <IconLayoutGrid size={18} />
            <Title order={4}>Landing pages</Title>
          </Group>
          <Text c="dimmed" size="sm" mt={2}>
            Themed pages generated for campaigns and lead capture.
          </Text>
        </Box>
        <Button
          size="xs"
          color="red"
          leftSection={<IconPlus size={14} />}
          onClick={() => setView({ mode: 'create' })}
        >
          New page from a prompt
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        {pages.map((page) => (
          <LandingPageGridCard
            key={page.id}
            page={page}
            onEdit={() =>
              setView({
                mode: 'editor',
                editorMode: 'edit',
                seed: {
                  id: page.id,
                  title: page.title,
                  slug: page.slug,
                  theme: page.theme,
                },
              })
            }
          />
        ))}
      </SimpleGrid>
    </Box>
  );
};

export default LandingPagesTab;
