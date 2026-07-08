import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  Paper,
  Popover,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCheck,
  IconDeviceFloppy,
  IconExternalLink,
  IconEye,
  IconLayoutGrid,
  IconPencil,
  IconPlus,
  IconRocket,
  IconSparkles,
  IconUsers,
  IconWorld,
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
  LANDING_SECTION_GROUPS,
  LANDING_THEMES,
  sectionDef,
  seedSectionsFromPrompt,
  type LandingSectionGroup,
  type LandingStatus,
  type LandingTheme,
  type LandingSectionType,
} from '@/propel/lib/landingSectionDefs';
import { type SectionActionKind } from '@/propel/lib/landingPreviewBridge';
import { LandingPreviewPane } from '@/propel/components/website/LandingPreviewPane';
import { ProjectAssetsProvider } from '@/propel/components/website/ProjectImagePicker';
import {
  ImageField,
  SectionRow,
  iconForSection,
  type EditSection,
} from '@/propel/components/website/SectionRow';

// Landing page builder — WEBSITE-REBUILD-DESIGN §4. A LIGHTWEIGHT, Mantine-only
// form-driven assembler (NO GrapesJS / no heavy or lazy-loaded lib — that is
// exactly what crashed the previous hero bundle). A page is an ordered list of
// pre-built section components; the marketer picks types, edits their props,
// reorders, picks a theme, and saves via the CRM landing-admin route. The site
// renders the same {type, props}[] at remaxhub.ae/lp/<slug>.

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

// Live pages render on the marketing site at this base. Staging renders the same
// {type,props}[] on the site dev server (a different host) — swap this only if the
// public LP host changes; the slug/path shape is stable.
const LIVE_LP_BASE = 'https://remaxhub.ae/lp';

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

// A stable serialization of the fields that constitute "content" — used for
// dirty-tracking (A3): the working draft is dirty when this differs from the
// snapshot taken at open / last successful save. Slug is passed in (already
// derived) so the compare is independent of the slugTouched toggle.
const serializeDraft = (d: Draft, slug: string): string =>
  JSON.stringify({
    title: d.title.trim(),
    slug,
    theme: d.theme,
    status: d.status,
    headline: d.headline,
    metaDescription: d.metaDescription,
    ogImageUrl: d.ogImageUrl,
    sections: d.sections,
  });

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
      {page.status === 'LIVE' ? (
        <Button
          size="xs"
          variant="subtle"
          color="blue"
          component="a"
          href={`${LIVE_LP_BASE}/${page.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          rightSection={<IconExternalLink size={14} />}
        >
          Open page
        </Button>
      ) : null}
    </Group>
  </Paper>
);


// ── the tab ──────────────────────────────────────────────────────────────────
export const LandingPagesTab = () => {
  const notify = usePropelToast();
  const { error, data, usingMock, sitePublicUrl, reload } = useLandingPages();

  const [mode, setMode] = useState<'list' | 'editor'>('list');
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [slugTouched, setSlugTouched] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  // Live-preview selection (B1) — synced BOTH directions: a left-rail card click
  // and a preview `sectionClick` both set this; it highlights the card + the
  // preview section and scrolls the selected card into view.
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  // A5/C7 — the row the pointer is over; forwarded to the preview for a dashed
  // hover-outline. Distinct from selectedIndex (solid).
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  // Native HTML5 drag-reorder state (A1). No dnd-kit — draggable handle only.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  // A3 — dirty tracking + save feedback. savedSnapshot is the content as of the
  // last open / successful save; justSaved shows a transient "Saved" tick.
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [justSaved, setJustSaved] = useState(false);
  const [confirmBackOpen, setConfirmBackOpen] = useState(false);
  // A2 — grouped add-section menu. insertIndexRef holds the target slot when the
  // menu was opened via an `insertAfter` action (else null → append).
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const insertIndexRef = useRef<number | null>(null);
  const sectionRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const derivedSlug = useMemo(
    () => (slugTouched ? draft.slug : slugify(draft.title)),
    [slugTouched, draft.slug, draft.title],
  );

  // A3 — the working draft is dirty when its content diverges from the snapshot.
  const currentSnapshot = useMemo(() => serializeDraft(draft, derivedSlug), [draft, derivedSlug]);
  const isDirty = mode === 'editor' && currentSnapshot !== savedSnapshot;

  // Keep the selection valid as sections are added/removed/reordered.
  useEffect(() => {
    setSelectedIndex((cur) => (cur !== null && cur >= draft.sections.length ? null : cur));
  }, [draft.sections.length]);

  // Preview → left rail: scroll the selected (auto-expanded) row into view.
  useEffect(() => {
    if (selectedIndex === null) return;
    sectionRefs.current[selectedIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedIndex]);

  // Snapshot a freshly-opened draft so a pristine page is not "dirty".
  const beginEditing = (next: Draft) => {
    const slug = next.slug || slugify(next.title);
    setDraft(next);
    setSavedSnapshot(serializeDraft(next, slug));
    setSelectedIndex(null);
    setHoverIndex(null);
    setJustSaved(false);
  };

  const openNew = (sections: EditSection[] = []) => {
    beginEditing({ ...EMPTY_DRAFT, sections });
    setSlugTouched(false);
    setMode('editor');
  };

  const openFromPrompt = () => {
    const seeded = seedSectionsFromPrompt(prompt).map((s) => toEditSection(s.type, s.props));
    beginEditing({ ...EMPTY_DRAFT, title: prompt.trim().slice(0, 80), sections: seeded });
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
    beginEditing({
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

  // ── section mutations (parent is the single source of truth for sections[]) ──
  const addSectionAt = (type: LandingSectionType, at: number | null) => {
    setDraft((d) => {
      const next = d.sections.slice();
      const idx = at === null ? next.length : Math.max(0, Math.min(at, next.length));
      next.splice(idx, 0, newSection(type));
      return { ...d, sections: next };
    });
    const idx = at === null ? draft.sections.length : Math.max(0, Math.min(at, draft.sections.length));
    setSelectedIndex(idx); // select + auto-expand the new row
  };

  const chooseSectionFromMenu = (type: LandingSectionType) => {
    addSectionAt(type, insertIndexRef.current);
    insertIndexRef.current = null;
    setAddMenuOpen(false);
  };

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

  const duplicateSection = (i: number) =>
    setDraft((d) => {
      const src = d.sections[i];
      if (!src) return d;
      const copy: EditSection = { type: src.type, props: JSON.parse(JSON.stringify(src.props)) };
      const next = d.sections.slice();
      next.splice(i + 1, 0, copy);
      return { ...d, sections: next };
    });

  // Native-DnD drop: move the dragged row so it lands at the drop-target slot.
  const reorderSection = (from: number, to: number) =>
    setDraft((d) => {
      if (from === to || from < 0 || from >= d.sections.length) return d;
      const next = d.sections.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...d, sections: next };
    });

  const onRowDrop = (to: number) => {
    if (dragIndex !== null && dragIndex !== to) {
      reorderSection(dragIndex, to);
      setSelectedIndex(to);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // C7 — apply an action bubbled up from the on-canvas floating toolbar.
  const handleSectionAction = (index: number, action: SectionActionKind) => {
    switch (action) {
      case 'moveUp':
        moveSection(index, -1);
        setSelectedIndex(Math.max(0, index - 1));
        break;
      case 'moveDown':
        moveSection(index, 1);
        setSelectedIndex(Math.min(draft.sections.length - 1, index + 1));
        break;
      case 'duplicate':
        duplicateSection(index);
        setSelectedIndex(index + 1);
        break;
      case 'delete':
        removeSection(index);
        setSelectedIndex(null);
        break;
      case 'insertAfter':
        insertIndexRef.current = index + 1;
        setAddMenuOpen(true);
        break;
    }
  };

  // ── persistence (A3) ──
  const validTitleSlug = (): { title: string; slug: string } | null => {
    const title = draft.title.trim();
    if (!title) {
      notify('Give the page a title first.', 'error');
      return null;
    }
    const slug = derivedSlug;
    if (!slug) {
      notify('Could not derive a URL slug — add a title with letters/numbers.', 'error');
      return null;
    }
    return { title, slug };
  };

  // Save the working draft with an explicit status. `silent` = autosave (no
  // spinner / toast). Returns whether it persisted. Adopts the server id + status
  // and re-baselines the dirty snapshot to exactly what was sent.
  const persist = async (status: LandingStatus, silent = false): Promise<boolean> => {
    const v = validTitleSlug();
    if (!v) return false;
    if (!silent) setBusy(true);
    const snapshotAtSend = serializeDraft({ ...draft, status }, v.slug);
    const res = await saveLandingPage({
      id: draft.id,
      title: v.title,
      slug: v.slug,
      theme: draft.theme,
      status,
      headline: draft.headline,
      metaDescription: draft.metaDescription,
      ogImageUrl: draft.ogImageUrl,
      sections: draft.sections as LandingSection[],
    });
    if (!silent) setBusy(false);
    if (!res.ok) {
      if (!silent) notify(res.error, 'error');
      return false;
    }
    // Merge server id + status without clobbering edits made during the request.
    setDraft((d) => ({ ...d, id: res.data.id, slug: v.slug, status }));
    setSlugTouched(true);
    setSavedSnapshot(snapshotAtSend);
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 2000);
    reload();
    if (!silent) notify(status === 'LIVE' ? `Published /lp/${v.slug}` : `Saved /lp/${v.slug}`, 'success');
    return true;
  };

  const publish = async () => {
    if (usingMock) {
      notify('Preview data — deploy the landingPage object to publish.', 'info');
      return;
    }
    const goingLive = draft.status !== 'LIVE';
    const nextStatus: LandingStatus = goingLive ? 'LIVE' : 'DRAFT';
    // Clean + already saved → a status-only flip is enough (reuse setStatus).
    if (!isDirty && draft.id) {
      setBusy(true);
      const res = await setLandingStatus(draft.id, nextStatus);
      setBusy(false);
      if (!res.ok) {
        notify(res.error, 'error');
        return;
      }
      setDraft((d) => ({ ...d, status: nextStatus }));
      setSavedSnapshot(serializeDraft({ ...draft, status: nextStatus }, derivedSlug));
      reload();
      notify(goingLive ? 'Page published' : 'Page unpublished', 'success');
      return;
    }
    // Dirty or never-saved → persist content WITH the new status in one shot.
    await persist(nextStatus);
  };

  const requestBack = () => {
    if (isDirty) setConfirmBackOpen(true);
    else setMode('list');
  };

  // A3 — guard a full tab-away / refresh while there are unsaved edits.
  useEffect(() => {
    if (mode !== 'editor' || !isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [mode, isDirty]);

  // A3 — autosave DRAFT pages after 4s of inactivity. NEVER autosaves a LIVE page
  // (that would silently publish edits) and never in mock mode (no route).
  useEffect(() => {
    if (mode !== 'editor' || usingMock || busy) return;
    if (draft.status === 'LIVE' || !isDirty || !draft.title.trim()) return;
    const t = window.setTimeout(() => {
      void persist(draft.status, true);
    }, 4000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, usingMock, busy, draft, isDirty]);

  // ── editor ──
  if (mode === 'editor') {
    // C6 graceful degrade: with a configured site origin we render the split
    // live-preview editor; without one, the forms go full-width and the preview
    // is replaced by a dimmed note (never a crash).
    const hasPreview = sitePublicUrl !== '';

    const pageSettingsBlock = (
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
          <ImageField
            label="OG image"
            value={draft.ogImageUrl}
            sitePublicUrl={sitePublicUrl}
            onChange={(path) => setDraft((d) => ({ ...d, ogImageUrl: path }))}
          />
        </Stack>
      </Paper>
    );

    // A2 — grouped add-section menu (replaces the flat pill wall). Opened by the
    // "Add section" button or by an `insertAfter` action (anchored to that button;
    // the target slot is held in insertIndexRef).
    const addSectionBlock = (
      <Popover
        opened={addMenuOpen}
        onChange={(o) => {
          if (!o) insertIndexRef.current = null;
          setAddMenuOpen(o);
        }}
        position="bottom-start"
        width={340}
        shadow="md"
        zIndex={5000}
        withinPortal
      >
        <Popover.Target>
          <Button
            fullWidth
            variant="light"
            color="red"
            leftSection={<IconPlus size={14} />}
            onClick={() => {
              insertIndexRef.current = null;
              setAddMenuOpen((o) => !o);
            }}
          >
            Add section
          </Button>
        </Popover.Target>
        <Popover.Dropdown p="xs">
          <ScrollArea.Autosize mah={420}>
            <Stack gap="sm">
              {LANDING_SECTION_GROUPS.map((group: LandingSectionGroup) => {
                const defs = LANDING_SECTION_DEFS.filter((d) => d.group === group);
                if (defs.length === 0) return null;
                return (
                  <Box key={group}>
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={4} px={4}>
                      {group}
                    </Text>
                    <Stack gap={2}>
                      {defs.map((d) => {
                        const Icon = iconForSection(d.type);
                        return (
                          <UnstyledButton
                            key={d.type}
                            onClick={() => chooseSectionFromMenu(d.type)}
                            style={{ padding: '6px 8px', borderRadius: 6 }}
                            className="propel-lp-add-item"
                          >
                            <Group gap="xs" wrap="nowrap" align="flex-start">
                              <ThemeIcon size="sm" variant="light" color="red" mt={2}>
                                <Icon size={14} />
                              </ThemeIcon>
                              <Box style={{ minWidth: 0 }}>
                                <Text size="sm" fw={500}>
                                  {d.label}
                                </Text>
                                <Text size="xs" c="dimmed" lineClamp={1}>
                                  {d.description}
                                </Text>
                              </Box>
                            </Group>
                          </UnstyledButton>
                        );
                      })}
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          </ScrollArea.Autosize>
        </Popover.Dropdown>
      </Popover>
    );

    const sectionStack =
      draft.sections.length === 0 ? (
        <Paper withBorder p="xl" radius="md" style={{ borderStyle: 'dashed' }}>
          <Stack align="center" gap="xs">
            <IconLayoutGrid size={28} />
            <Text c="dimmed" size="sm" ta="center">
              No sections yet — use “Add section” to start building the page.
            </Text>
          </Stack>
        </Paper>
      ) : (
        draft.sections.map((section, i) => (
          <Box
            key={i}
            ref={(el: HTMLDivElement | null) => {
              sectionRefs.current[i] = el;
            }}
          >
            <SectionRow
              section={section}
              index={i}
              total={draft.sections.length}
              open={selectedIndex === i}
              selected={selectedIndex === i}
              sitePublicUrl={sitePublicUrl}
              dragOver={dragOverIndex === i && dragIndex !== null && dragIndex !== i}
              onToggle={() => setSelectedIndex((cur) => (cur === i ? null : i))}
              onChange={(next) => updateSection(i, next)}
              onMove={(dir) => moveSection(i, dir)}
              onRemove={() => removeSection(i)}
              onHover={(hovering) => setHoverIndex(hovering ? i : null)}
              onDragStart={() => setDragIndex(i)}
              onDragEnterRow={() => setDragOverIndex(i)}
              onDrop={() => onRowDrop(i)}
              onDragEnd={() => {
                setDragIndex(null);
                setDragOverIndex(null);
              }}
            />
          </Box>
        ))
      );

    const dirtyChip = isDirty ? (
      <Badge size="sm" color="orange" variant="light">
        Unsaved
      </Badge>
    ) : justSaved ? (
      <Badge size="sm" color="teal" variant="light" leftSection={<IconCheck size={12} />}>
        Saved
      </Badge>
    ) : null;

    const isLive = draft.status === 'LIVE';
    const publishControl = isLive ? (
      <Group gap={6} wrap="nowrap">
        <Badge color="teal" variant="light" leftSection={<IconCheck size={12} />}>
          Published
        </Badge>
        <Button size="sm" variant="subtle" color="gray" loading={busy} onClick={publish}>
          Unpublish
        </Button>
      </Group>
    ) : (
      <Button
        size="sm"
        color="teal"
        loading={busy}
        leftSection={<IconRocket size={16} />}
        onClick={publish}
      >
        Publish
      </Button>
    );

    const header = (
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
        <Group gap="xs" wrap="nowrap">
          {dirtyChip}
          <Button variant="default" size="sm" onClick={requestBack}>
            Back
          </Button>
          <Button
            size="sm"
            color="red"
            variant="default"
            loading={busy}
            leftSection={<IconDeviceFloppy size={16} />}
            onClick={() => void persist(draft.status)}
          >
            Save
          </Button>
          {publishControl}
        </Group>
      </Group>
    );

    const liveUrl = draft.status === 'LIVE' && derivedSlug ? `${LIVE_LP_BASE}/${derivedSlug}` : undefined;

    const confirmBackModal = (
      <Modal
        opened={confirmBackOpen}
        onClose={() => setConfirmBackOpen(false)}
        title="Discard unsaved changes?"
        centered
        zIndex={6000}
      >
        <Text size="sm" c="dimmed" mb="md">
          You have unsaved edits to this page. Leaving now will lose them.
        </Text>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" size="sm" onClick={() => setConfirmBackOpen(false)}>
            Keep editing
          </Button>
          <Button
            color="red"
            size="sm"
            onClick={() => {
              setConfirmBackOpen(false);
              setMode('list');
            }}
          >
            Discard &amp; leave
          </Button>
        </Group>
      </Modal>
    );

    return (
      <ProjectAssetsProvider>
        {confirmBackModal}
        <Box
          p="md"
          style={
            hasPreview
              ? { display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 220px)', minHeight: 480 }
              : undefined
          }
        >
          {header}

          {hasPreview ? (
            <Group align="stretch" gap="lg" wrap="nowrap" style={{ flex: 1, minHeight: 0 }}>
              {/* left rail — forms, independently scrollable */}
              <Box
                style={{ width: 420, flexShrink: 0, minHeight: 0, overflowY: 'auto', paddingRight: 8 }}
              >
                <Stack gap="sm">
                  {pageSettingsBlock}
                  {addSectionBlock}
                  {sectionStack}
                </Stack>
              </Box>
              {/* right — the live preview iframe */}
              <Box style={{ flex: 1, minWidth: 0 }}>
                <LandingPreviewPane
                  sitePublicUrl={sitePublicUrl}
                  theme={draft.theme}
                  sections={draft.sections}
                  selectedIndex={selectedIndex}
                  hoverIndex={hoverIndex}
                  onSelectSection={setSelectedIndex}
                  onSectionAction={handleSectionAction}
                  liveUrl={liveUrl}
                />
              </Box>
            </Group>
          ) : (
            <>
              <Alert color="gray" variant="light" icon={<IconWorld size={16} />} mb="md">
                Live preview is available once SITE_PUBLIC_URL is configured for this workspace.
                You can still assemble and save the page below.
              </Alert>
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                <Stack gap="sm">
                  {pageSettingsBlock}
                  {addSectionBlock}
                </Stack>
                <Stack gap="sm">{sectionStack}</Stack>
              </SimpleGrid>
            </>
          )}
        </Box>
      </ProjectAssetsProvider>
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
