import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Divider,
  Group,
  Loader,
  Paper,
  Select,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconChevronDown,
  IconDeviceFloppy,
  IconExternalLink,
  IconEye,
  IconLayoutGrid,
  IconPencil,
  IconPlus,
  IconSparkles,
  IconUsers,
  IconWorld,
  IconX,
} from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { useLandingPages } from '@/propel/hooks/useLandingPages';
import {
  getLandingPage,
  saveLandingPage,
  setLandingStatus,
  type LandingPageSummary,
  type LandingSection,
} from '@/propel/lib/landingPagesCrm';
import {
  LANDING_SECTION_DEFS,
  LANDING_THEMES,
  sectionDef,
  seedSectionsFromPrompt,
  type LandingStatus,
  type LandingTheme,
  type LandingSectionType,
} from '@/propel/lib/landingSectionDefs';

// Landing page builder — WEBSITE-REBUILD-DESIGN §4. A LIGHTWEIGHT, Mantine-only
// form-driven assembler (NO GrapesJS / no heavy or lazy-loaded lib — that is
// exactly what crashed the previous hero bundle). A page is an ordered list of
// pre-built section components; the marketer picks types, edits their props,
// reorders, picks a theme, and saves via the CRM landing-admin route. The site
// renders the same {type, props}[] at remaxhub.ae/lp/<slug>.

type EditSection = { type: LandingSectionType; props: Record<string, unknown> };

interface Draft {
  id?: string;
  title: string;
  slug: string;
  theme: LandingTheme;
  status: LandingStatus;
  headline: string;
  metaDescription: string;
  ogImageUrl: string;
  sections: EditSection[];
}

const slugify = (input: string): string =>
  input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');

const EMPTY_DRAFT: Draft = {
  title: '',
  slug: '',
  theme: 'RIVIERA',
  status: 'DRAFT',
  headline: '',
  metaDescription: '',
  ogImageUrl: '',
  sections: [],
};

const asStr = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

// Coerce a raw {type, props} (from the CRM or a default) into the edit shape:
// every scalar becomes a string; every row group becomes Array<Record<string,string>>.
const toEditSection = (type: LandingSectionType, rawProps: Record<string, unknown>): EditSection => {
  const def = sectionDef(type);
  const props: Record<string, unknown> = {};
  for (const f of def.scalarFields) props[f.key] = asStr(rawProps[f.key]);
  if (def.rows) {
    const raw = Array.isArray(rawProps[def.rows.key]) ? (rawProps[def.rows.key] as unknown[]) : [];
    props[def.rows.key] = raw.map((row) => {
      const r = (row ?? {}) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const col of def.rows!.columns) out[col.key] = asStr(r[col.key]);
      return out;
    });
  }
  return { type, props };
};

const newSection = (type: LandingSectionType): EditSection =>
  toEditSection(type, sectionDef(type).defaultProps);

const THEME_LABEL: Record<LandingTheme, string> = {
  NOCTURNE: 'Nocturne',
  RIVIERA: 'Riviera',
  ATLAS: 'Atlas',
};

const statusColor = (s: string): string =>
  s === 'LIVE' ? 'teal' : s === 'ARCHIVED' ? 'orange' : 'gray';

const convPct = (visits: number, leads: number): number =>
  visits > 0 ? Math.round((leads / visits) * 100) : 0;

// ── list view ────────────────────────────────────────────────────────────────
const PageCard = ({
  page,
  onEdit,
  onToggleStatus,
}: {
  page: LandingPageSummary;
  onEdit: () => void;
  onToggleStatus: () => void;
}) => (
  <Paper withBorder radius="md" p="md">
    <Group justify="space-between" align="flex-start" wrap="nowrap" mb="xs">
      <Box style={{ minWidth: 0 }}>
        <Text fw={600} truncate>
          {page.title || 'Untitled'}
        </Text>
        <Text size="xs" c="dimmed" truncate>
          /lp/{page.slug}
        </Text>
      </Box>
      <Group gap={6} wrap="nowrap">
        <Badge color={statusColor(page.status)} variant="light" size="sm">
          {page.status}
        </Badge>
        <Badge color="gray" variant="outline" size="sm">
          {THEME_LABEL[page.theme] ?? page.theme}
        </Badge>
      </Group>
    </Group>
    <Group gap="lg" mt="sm" mb="md">
      <Group gap={4}>
        <IconEye size={14} />
        <Text size="sm">{page.visits}</Text>
      </Group>
      <Group gap={4}>
        <IconUsers size={14} />
        <Text size="sm">{page.leads}</Text>
      </Group>
      <Text size="sm" c="dimmed">
        {convPct(page.visits, page.leads)}% conv
      </Text>
    </Group>
    <Group gap="xs">
      <Button size="xs" variant="light" color="red" leftSection={<IconPencil size={14} />} onClick={onEdit}>
        Edit
      </Button>
      <Button
        size="xs"
        variant="subtle"
        color={page.status === 'LIVE' ? 'gray' : 'teal'}
        leftSection={<IconWorld size={14} />}
        onClick={onToggleStatus}
      >
        {page.status === 'LIVE' ? 'Unpublish' : 'Set live'}
      </Button>
    </Group>
  </Paper>
);

// ── row-group editor (items / stats / quotes / faq) ──────────────────────────
const RowsEditor = ({
  def,
  rows,
  onChange,
}: {
  def: NonNullable<ReturnType<typeof sectionDef>['rows']>;
  rows: Record<string, string>[];
  onChange: (next: Record<string, string>[]) => void;
}) => (
  <Stack gap="xs">
    <Group justify="space-between">
      <Text size="sm" fw={500}>
        {def.label}
      </Text>
      <Button
        size="compact-xs"
        variant="light"
        leftSection={<IconPlus size={12} />}
        onClick={() => onChange([...rows, Object.fromEntries(def.columns.map((c) => [c.key, '']))])}
      >
        {def.addLabel}
      </Button>
    </Group>
    {rows.length === 0 ? (
      <Text size="xs" c="dimmed">
        No {def.label.toLowerCase()} yet.
      </Text>
    ) : (
      rows.map((row, ri) => (
        <Paper key={ri} withBorder radius="sm" p="xs">
          <Group justify="flex-end" mb={4}>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              aria-label="Remove row"
              onClick={() => onChange(rows.filter((_, i) => i !== ri))}
            >
              <IconX size={14} />
            </ActionIcon>
          </Group>
          <Stack gap={6}>
            {def.columns.map((col) =>
              col.kind === 'textarea' ? (
                <Textarea
                  key={col.key}
                  size="xs"
                  autosize
                  minRows={2}
                  label={col.label}
                  value={row[col.key] ?? ''}
                  onChange={(e) => {
                    const next = rows.slice();
                    next[ri] = { ...next[ri], [col.key]: e.currentTarget.value };
                    onChange(next);
                  }}
                />
              ) : (
                <TextInput
                  key={col.key}
                  size="xs"
                  label={col.label}
                  value={row[col.key] ?? ''}
                  onChange={(e) => {
                    const next = rows.slice();
                    next[ri] = { ...next[ri], [col.key]: e.currentTarget.value };
                    onChange(next);
                  }}
                />
              ),
            )}
          </Stack>
        </Paper>
      ))
    )}
  </Stack>
);

// ── one section editor card ──────────────────────────────────────────────────
const SectionEditor = ({
  section,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  section: EditSection;
  index: number;
  total: number;
  onChange: (next: EditSection) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) => {
  const def = sectionDef(section.type);
  const setScalar = (key: string, value: string) =>
    onChange({ ...section, props: { ...section.props, [key]: value } });
  return (
    <Paper withBorder radius="md" p="md">
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="red">
            <IconLayoutGrid size={14} />
          </ThemeIcon>
          <Text fw={600}>{def.label}</Text>
        </Group>
        <Group gap={4}>
          <ActionIcon
            size="sm"
            variant="subtle"
            aria-label="Move up"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <IconChevronDown size={14} style={{ transform: 'rotate(180deg)' }} />
          </ActionIcon>
          <ActionIcon
            size="sm"
            variant="subtle"
            aria-label="Move down"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            <IconChevronDown size={14} />
          </ActionIcon>
          <ActionIcon size="sm" variant="subtle" color="red" aria-label="Remove section" onClick={onRemove}>
            <IconX size={14} />
          </ActionIcon>
        </Group>
      </Group>
      <Stack gap="sm">
        {def.scalarFields.map((f) =>
          f.kind === 'select' ? (
            <Select
              key={f.key}
              size="xs"
              label={f.label}
              data={f.options ?? []}
              value={asStr(section.props[f.key])}
              onChange={(v) => setScalar(f.key, v ?? '')}
              comboboxProps={{ zIndex: 5000 }}
            />
          ) : f.kind === 'textarea' ? (
            <Textarea
              key={f.key}
              size="xs"
              autosize
              minRows={2}
              label={f.label}
              placeholder={f.placeholder}
              value={asStr(section.props[f.key])}
              onChange={(e) => setScalar(f.key, e.currentTarget.value)}
            />
          ) : (
            <TextInput
              key={f.key}
              size="xs"
              label={f.label}
              placeholder={f.placeholder}
              value={asStr(section.props[f.key])}
              onChange={(e) => setScalar(f.key, e.currentTarget.value)}
            />
          ),
        )}
        {def.rows ? (
          <>
            <Divider my={4} />
            <RowsEditor
              def={def.rows}
              rows={(section.props[def.rows.key] as Record<string, string>[]) ?? []}
              onChange={(next) => onChange({ ...section, props: { ...section.props, [def.rows!.key]: next } })}
            />
          </>
        ) : null}
      </Stack>
    </Paper>
  );
};

// ── the tab ──────────────────────────────────────────────────────────────────
export const LandingPagesTab = () => {
  const notify = usePropelToast();
  const { error, data, usingMock, reload } = useLandingPages();

  const [mode, setMode] = useState<'list' | 'editor'>('list');
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [slugTouched, setSlugTouched] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);

  const derivedSlug = useMemo(
    () => (slugTouched ? draft.slug : slugify(draft.title)),
    [slugTouched, draft.slug, draft.title],
  );

  const openNew = (sections: EditSection[] = []) => {
    setDraft({ ...EMPTY_DRAFT, sections });
    setSlugTouched(false);
    setMode('editor');
  };

  const openFromPrompt = () => {
    const seeded = seedSectionsFromPrompt(prompt).map((s) => toEditSection(s.type, s.props));
    setDraft({ ...EMPTY_DRAFT, title: prompt.trim().slice(0, 80), sections: seeded });
    setSlugTouched(false);
    setMode('editor');
    setPrompt('');
  };

  const openEdit = async (id: string) => {
    if (usingMock) {
      notify('This is preview data — deploy the landingPage object to edit real pages.', 'info');
      return;
    }
    setBusy(true);
    const res = await getLandingPage(id);
    setBusy(false);
    if (!res.ok) {
      notify(res.error, 'error');
      return;
    }
    const p = res.data;
    setDraft({
      id: p.id,
      title: p.title,
      slug: p.slug,
      theme: p.theme,
      status: p.status,
      headline: p.headline,
      metaDescription: p.metaDescription,
      ogImageUrl: p.ogImageUrl,
      sections: p.sections.map((s) => toEditSection(s.type, s.props)),
    });
    setSlugTouched(true);
    setMode('editor');
  };

  const toggleStatus = async (page: LandingPageSummary) => {
    if (usingMock) {
      notify('Preview data — deploy the landingPage object to publish.', 'info');
      return;
    }
    const next: LandingStatus = page.status === 'LIVE' ? 'DRAFT' : 'LIVE';
    const res = await setLandingStatus(page.id, next);
    if (res.ok) {
      notify(next === 'LIVE' ? 'Page set live' : 'Page unpublished', 'success');
      reload();
    } else {
      notify(res.error, 'error');
    }
  };

  const addSection = (type: LandingSectionType) =>
    setDraft((d) => ({ ...d, sections: [...d.sections, newSection(type)] }));

  const updateSection = (i: number, next: EditSection) =>
    setDraft((d) => ({ ...d, sections: d.sections.map((s, idx) => (idx === i ? next : s)) }));

  const moveSection = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.sections.length) return d;
      const next = d.sections.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return { ...d, sections: next };
    });

  const removeSection = (i: number) =>
    setDraft((d) => ({ ...d, sections: d.sections.filter((_, idx) => idx !== i) }));

  const save = async () => {
    const title = draft.title.trim();
    if (!title) {
      notify('Give the page a title first.', 'error');
      return;
    }
    const slug = slugify(slugTouched ? draft.slug : draft.title);
    if (!slug) {
      notify('Could not derive a URL slug — add a title with letters/numbers.', 'error');
      return;
    }
    setBusy(true);
    const res = await saveLandingPage({
      id: draft.id,
      title,
      slug,
      theme: draft.theme,
      status: draft.status,
      headline: draft.headline,
      metaDescription: draft.metaDescription,
      ogImageUrl: draft.ogImageUrl,
      sections: draft.sections as LandingSection[],
    });
    setBusy(false);
    if (res.ok) {
      notify(`Saved /lp/${res.data.slug}`, 'success');
      setMode('list');
      reload();
    } else {
      notify(res.error, 'error');
    }
  };

  // ── editor ──
  if (mode === 'editor') {
    return (
      <Box p="md">
        <Group justify="space-between" align="flex-start" mb="md" wrap="nowrap">
          <Group gap="xs">
            <ThemeIcon size="lg" variant="light" color="red">
              <IconLayoutGrid size={18} />
            </ThemeIcon>
            <Box>
              <Title order={4}>{draft.id ? 'Edit landing page' : 'New landing page'}</Title>
              <Text size="xs" c="dimmed">
                remaxhub.ae/lp/{derivedSlug || '…'}
              </Text>
            </Box>
          </Group>
          <Group gap="xs">
            <Button variant="default" size="sm" onClick={() => setMode('list')}>
              Back
            </Button>
            <Button
              size="sm"
              color="red"
              loading={busy}
              leftSection={<IconDeviceFloppy size={16} />}
              onClick={save}
            >
              Save
            </Button>
          </Group>
        </Group>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          {/* page meta */}
          <Stack gap="sm">
            <Paper withBorder radius="md" p="md">
              <Text fw={600} mb="sm">
                Page settings
              </Text>
              <Stack gap="sm">
                <TextInput
                  label="Title"
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.currentTarget.value }))}
                />
                <TextInput
                  label="URL slug"
                  value={derivedSlug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setDraft((d) => ({ ...d, slug: e.currentTarget.value }));
                  }}
                />
                <Box>
                  <Text size="sm" fw={500} mb={4}>
                    Theme
                  </Text>
                  <SegmentedControl
                    fullWidth
                    color="red"
                    value={draft.theme}
                    onChange={(v) => setDraft((d) => ({ ...d, theme: v as LandingTheme }))}
                    data={LANDING_THEMES.map((t) => ({ value: t, label: THEME_LABEL[t] }))}
                  />
                </Box>
                <Select
                  label="Status"
                  value={draft.status}
                  onChange={(v) => setDraft((d) => ({ ...d, status: (v as LandingStatus) ?? 'DRAFT' }))}
                  data={[
                    { value: 'DRAFT', label: 'Draft' },
                    { value: 'LIVE', label: 'Live' },
                    { value: 'ARCHIVED', label: 'Archived' },
                  ]}
                  comboboxProps={{ zIndex: 5000 }}
                />
                <TextInput
                  label="Headline (OG)"
                  value={draft.headline}
                  onChange={(e) => setDraft((d) => ({ ...d, headline: e.currentTarget.value }))}
                />
                <Textarea
                  label="Meta description"
                  autosize
                  minRows={2}
                  value={draft.metaDescription}
                  onChange={(e) => setDraft((d) => ({ ...d, metaDescription: e.currentTarget.value }))}
                />
                <TextInput
                  label="OG image URL"
                  value={draft.ogImageUrl}
                  onChange={(e) => setDraft((d) => ({ ...d, ogImageUrl: e.currentTarget.value }))}
                />
              </Stack>
            </Paper>

            <Paper withBorder radius="md" p="md">
              <Text fw={600} mb="xs">
                Add a section
              </Text>
              <Group gap="xs">
                {LANDING_SECTION_DEFS.map((d) => (
                  <Button
                    key={d.type}
                    size="compact-sm"
                    variant="light"
                    leftSection={<IconPlus size={12} />}
                    onClick={() => addSection(d.type)}
                  >
                    {d.label}
                  </Button>
                ))}
              </Group>
            </Paper>
          </Stack>

          {/* section stack */}
          <Stack gap="sm">
            {draft.sections.length === 0 ? (
              <Paper withBorder p="xl" radius="md" style={{ borderStyle: 'dashed' }}>
                <Stack align="center" gap="xs">
                  <IconLayoutGrid size={28} />
                  <Text c="dimmed" size="sm" ta="center">
                    No sections yet — add one from the left to start building the page.
                  </Text>
                </Stack>
              </Paper>
            ) : (
              draft.sections.map((section, i) => (
                <SectionEditor
                  key={i}
                  section={section}
                  index={i}
                  total={draft.sections.length}
                  onChange={(next) => updateSection(i, next)}
                  onMove={(dir) => moveSection(i, dir)}
                  onRemove={() => removeSection(i)}
                />
              ))
            )}
          </Stack>
        </SimpleGrid>
      </Box>
    );
  }

  // ── list ──
  return (
    <Box p="md">
      <Group justify="space-between" align="flex-start" mb="md" wrap="nowrap">
        <Group gap="xs">
          <ThemeIcon size="lg" variant="light" color="red">
            <IconLayoutGrid size={18} />
          </ThemeIcon>
          <Box>
            <Title order={4}>Landing pages</Title>
            <Text size="xs" c="dimmed">
              Assemble campaign pages from pre-built sections; publish to remaxhub.ae/lp/&lt;slug&gt;.
            </Text>
          </Box>
        </Group>
        <Button color="red" size="sm" leftSection={<IconPlus size={16} />} onClick={() => openNew()}>
          New page
        </Button>
      </Group>

      {usingMock ? (
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} mb="md">
          Showing preview data — the landingPage object isn&apos;t deployed to this workspace yet, so
          saving/editing is disabled. The assembler below is fully usable; it becomes live once the
          gated CRM deploy lands.{error ? ` (${error})` : ''}
        </Alert>
      ) : null}

      {/* prompt-stub: seed a starter stack from a description */}
      <Paper withBorder radius="md" p="md" mb="md">
        <Group gap="xs" mb="xs">
          <IconSparkles size={16} />
          <Text fw={600}>Start from a prompt</Text>
          <Badge size="xs" variant="light" color="gray">
            template
          </Badge>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <TextInput
            style={{ flex: 1 }}
            placeholder="e.g. Palm Jumeirah 2-bed launch, flexible payment plan"
            value={prompt}
            onChange={(e) => setPrompt(e.currentTarget.value)}
          />
          <Button variant="light" color="red" onClick={openFromPrompt} disabled={prompt.trim() === ''}>
            Draft it
          </Button>
        </Group>
      </Paper>

      {busy ? (
        <Center h={200}>
          <Loader color="red" />
        </Center>
      ) : data.length === 0 ? (
        <Paper withBorder p="xl" radius="md" style={{ borderStyle: 'dashed' }}>
          <Stack align="center" gap="md">
            <IconLayoutGrid size={32} />
            <Text c="dimmed" ta="center">
              No landing pages yet. Create one from a template or a prompt.
            </Text>
            <Button color="red" leftSection={<IconPlus size={16} />} onClick={() => openNew()}>
              New page
            </Button>
          </Stack>
        </Paper>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {data.map((page) => (
            <PageCard
              key={page.id}
              page={page}
              onEdit={() => openEdit(page.id)}
              onToggleStatus={() => toggleStatus(page)}
            />
          ))}
        </SimpleGrid>
      )}

      <Group justify="center" mt="lg">
        <Text size="xs" c="dimmed">
          <IconExternalLink size={12} style={{ verticalAlign: 'middle' }} /> Pages render on the site at
          /lp/&lt;slug&gt; with the CRM web-lead pipeline wired in.
        </Text>
      </Group>
    </Box>
  );
};

export default LandingPagesTab;
