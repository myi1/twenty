import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Menu,
  Modal,
  Paper,
  Popover,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconArchive,
  IconCheck,
  IconChevronDown,
  IconClock,
  IconDeviceFloppy,
  IconExternalLink,
  IconEye,
  IconLanguage,
  IconLayoutGrid,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconRocket,
  IconSparkles,
  IconUsers,
  IconWorld,
  IconX,
  type IconComponent,
} from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { useLandingPages } from '@/propel/hooks/useLandingPages';
import {
  draftFromBrief,
  getLandingPage,
  instructEdit,
  preflightPage,
  readPreflightSummary,
  readRefresherDiffs,
  refresherApply,
  refresherDismiss,
  saveLandingPage,
  setLandingStatus,
  translatePage,
  TRANSLATE_LOCALES,
  type BenchLogEntry,
  type LandingPageFull,
  type LandingPageSummary,
  type LandingSection,
  type PreflightCheck,
  type RefresherDiff,
} from '@/propel/lib/landingPagesCrm';
import {
  LANDING_SECTION_DEFS,
  LANDING_SECTION_GROUPS,
  LANDING_THEMES,
  sectionDef,
  type LandingSectionGroup,
  type LandingStatus,
  type LandingTheme,
  type LandingSectionType,
} from '@/propel/lib/landingSectionDefs';
import { type SectionActionKind } from '@/propel/lib/landingPreviewBridge';
import { enumLabel } from '@/propel/lib/enumLabels';
import { useCanPublish } from '@/propel/lib/canPublish';
import {
  InvitingEmpty,
  KanbanBoard,
  KanbanColumn,
  SubmissionBadge,
  SurfaceIntro,
} from '@/propel/components/marketingHero/deskShared';
import { SubmitForApprovalButton } from '@/propel/components/marketingHero/SubmitForApprovalButton';
import { amplifyBrief, generatePlan } from '@/propel/lib/socialCrm';
import { ALL_NETWORKS } from '@/propel/lib/socialCalendarConfig';
import {
  AddSourcesControl,
  type SelectedSource,
} from '@/propel/components/website/AddSourcesControl';
import { InstructionBar } from '@/propel/components/website/InstructionBar';
import { LandingPreviewPane } from '@/propel/components/website/LandingPreviewPane';
import { ProjectAssetsProvider } from '@/propel/components/website/MediaStudioModal';
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
// The public site origin (external pages live directly under it, not under /lp).
const SITE_ORIGIN = LIVE_LP_BASE.replace(/\/lp$/, '');

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

// ── AI generate bench (Stage 3A) ──────────────────────────────────────────────
// The four bench agents, in run order. The strip below ticks each to "done" as
// the ~40s synchronous route progresses (optimistic timed progression — one
// pill is "active" with a spinner, earlier pills are "done"; on the single await
// resolving we mark all four done, then open the fresh draft in the editor).
const AGENT_STAGES = ['Planner', 'Copywriter', 'Designer', 'SEO'] as const;

const AgentStrip = ({ stage }: { stage: number }) => (
  <Group gap="xs" mt="sm" wrap="wrap">
    {AGENT_STAGES.map((name, i) => {
      const done = i < stage;
      const active = i === stage;
      return (
        <Badge
          key={name}
          size="sm"
          variant={active ? 'filled' : done ? 'light' : 'outline'}
          color={done ? 'teal' : active ? 'red' : 'gray'}
          leftSection={
            done ? (
              <IconCheck size={12} />
            ) : active ? (
              <Loader size={10} color="white" />
            ) : undefined
          }
        >
          {name}
        </Badge>
      );
    })}
  </Group>
);

const statusColor = (s: string): string =>
  s === 'LIVE' ? 'teal' : s === 'ARCHIVED' ? 'orange' : 'gray';

const convPct = (visits: number, leads: number): number =>
  visits > 0 ? Math.round((leads / visits) * 100) : 0;

// ── External-page detection (kills the "live external pages show Draft" bug) ──
// An external page is registered/live on the marketing site directly (residency,
// /areas, /developers) with NO builder sections. The list projection carries no
// sections, so we rely on the backend: an explicit `isExternal`, OR the accepted
// "zero builder sections + a real live URL" heuristic. Both fields are projected
// tolerantly — until the route ships them this is always false, so nothing
// regresses (see the backend-change note in the ship report).
const isExternalPage = (p: LandingPageSummary): boolean =>
  p.isExternal === true ||
  (typeof p.sectionCount === 'number' &&
    p.sectionCount === 0 &&
    typeof p.externalUrl === 'string' &&
    p.externalUrl !== '');

// The real live URL for an external page: the projected externalUrl, else derived
// from the slug against the site origin (external pages live at /<slug>, not /lp/…).
const externalLiveUrl = (p: LandingPageSummary, siteOrigin: string): string => {
  if (typeof p.externalUrl === 'string' && p.externalUrl !== '') return p.externalUrl;
  const base = (siteOrigin || 'https://remaxhub.ae').replace(/\/+$/, '');
  return `${base}/${p.slug}`;
};

// "Source" column — how the page was created. SCOUT = the suggestion helper; else
// a person built it manually.
const sourceLabel = (p: LandingPageSummary): string =>
  (p.source ?? '') === 'SCOUT' ? 'Suggested' : 'Manual';

// Human date for the "Updated" column ("Jul 3, 2026"). Empty when unset/unparseable.
const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// ── Stage 3C — publish pre-flight gate ───────────────────────────────────────
// Humanize a check key ("leadForm" → "Lead form") — the row labels stay tolerant
// to whatever keys the CRM gate ships, with the server's `detail` as the truth.
const checkLabel = (key: string): string => {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

// True when the page's STORED pre-flight result has HARD failures — i.e. the
// card is "in draft with issues". Drives the "Fix issues" affordance.
const hasFailingPreflight = (page: LandingPageSummary): boolean => {
  const s = readPreflightSummary(page.preflightJson);
  return s !== null && (!s.passed || s.hardFails > 0);
};

// ── Board lanes ──────────────────────────────────────────────────────────────
// The landing lifecycle as kanban columns, derived from the REAL landingPage
// status enum (DRAFT / LIVE / ARCHIVED) + the pre-flight result + the maker-checker
// submission stamp — mirroring the Blog newsroom's status-column board:
//   • Needs fixes — a stored pre-flight with hard failures (takes precedence; this
//                   is the "Fix issues" card).
//   • Draft       — a DRAFT with no failing pre-flight and not yet submitted.
//   • In review   — a DRAFT an agent submitted for approval (submittedForApprovalAt).
//   • Live        — status LIVE (published to /lp/<slug>).
//   • Archived    — status ARCHIVED.
// (Bucketing is by the EN PARENT's state; locale siblings ride in the parent card's
// footer exactly as before, so translation nesting is preserved.)
type LandingLane = 'fixes' | 'draft' | 'review' | 'live' | 'archived';

const laneOf = (page: LandingPageSummary): LandingLane => {
  if (hasFailingPreflight(page)) return 'fixes';
  if (page.status === 'LIVE') return 'live';
  if (page.status === 'ARCHIVED') return 'archived';
  const submitted =
    typeof page.submittedForApprovalAt === 'string' &&
    page.submittedForApprovalAt !== '';
  return submitted ? 'review' : 'draft';
};

const LANDING_LANES: {
  id: LandingLane;
  title: string;
  Icon: IconComponent;
  emptyTitle: string;
  emptyMessage: string;
}[] = [
  {
    id: 'fixes',
    title: 'Needs fixes',
    Icon: IconAlertTriangle,
    emptyTitle: 'Nothing to fix',
    emptyMessage: 'Pages that fail a pre-flight check land here with a Fix issues action.',
  },
  {
    id: 'draft',
    title: 'Draft',
    Icon: IconPencil,
    emptyTitle: 'No drafts',
    emptyMessage: 'Draft a page from a prompt or template and it waits here.',
  },
  {
    id: 'review',
    title: 'In review',
    Icon: IconClock,
    emptyTitle: 'Nothing awaiting sign-off',
    emptyMessage: 'Pages submitted for approval queue here for a publisher.',
  },
  {
    id: 'live',
    title: 'Live',
    Icon: IconWorld,
    emptyTitle: 'Nothing live yet',
    emptyMessage: 'Approved pages go live at /lp/<slug> and settle here.',
  },
  {
    id: 'archived',
    title: 'Archived',
    Icon: IconArchive,
    emptyTitle: 'Nothing archived',
    emptyMessage: 'Retired pages rest here — nothing to do.',
  },
];

// Small pass/fail/warn chip for the list cards — only when the route projects a
// readable preflightJson (older routes don't → no chip at all).
const PreflightChip = ({ page }: { page: LandingPageSummary }) => {
  const s = readPreflightSummary(page.preflightJson);
  if (!s) return null;
  if (!s.passed || s.hardFails > 0) {
    return (
      <Badge color="red" variant="light" size="sm" leftSection={<IconX size={12} />}>
        Checks
      </Badge>
    );
  }
  if (s.warnings > 0) {
    return (
      <Badge color="yellow" variant="light" size="sm" leftSection={<IconAlertTriangle size={12} />}>
        {s.warnings} warn
      </Badge>
    );
  }
  return (
    <Badge color="teal" variant="light" size="sm" leftSection={<IconCheck size={12} />}>
      Checks
    </Badge>
  );
};

// The keys the pre-flight gate emits that need the full page editor to fix (a
// lead-form section, real images, a valid section schema, the mobile budget).
const EDITOR_FIX_KEYS = new Set([
  'leadFormPresent',
  'imagesResolve',
  'schemaValid',
  'mobileBudget',
]);

// A short "here's what to do in the editor" hint per editor-fixable check.
const EDITOR_FIX_HINT: Record<string, string> = {
  leadFormPresent: 'Add a lead-capture section (Lead form / Booking) in the editor.',
  imagesResolve: 'Replace the broken or missing images in the editor.',
  schemaValid: 'Fix the section content in the editor so it validates.',
  mobileBudget: 'Trim or lighten sections in the editor to fit the mobile budget.',
};

// The inline fix control for ONE failed pre-flight check (fix mode only). Permit
// and meta are fixed in place here; everything else opens the editor at the right
// spot. Fixing is a DRAFT save (maker-allowed) — publishing stays gated below.
const PreflightFixControl = ({
  check,
  page,
  busy,
  onFixPermit,
  onFixMeta,
  onEditPage,
}: {
  check: PreflightCheck;
  page: LandingPageFull;
  busy: boolean;
  onFixPermit: (permit: string) => void;
  onFixMeta: (headline: string, metaDescription: string) => void;
  onEditPage: (hint: string) => void;
}) => {
  const [permit, setPermit] = useState('');
  const [headline, setHeadline] = useState(page.headline ?? '');
  const [metaDescription, setMetaDescription] = useState(page.metaDescription ?? '');

  if (check.key === 'permitCheck') {
    return (
      <Group gap="xs" wrap="nowrap" mt={6} align="flex-end">
        <TextInput
          size="xs"
          label="Trakheesi permit number"
          placeholder="e.g. 7128394520"
          value={permit}
          onChange={(e) => setPermit(e.currentTarget.value)}
          style={{ flex: 1, minWidth: 0 }}
          disabled={busy}
        />
        <Button
          size="xs"
          color="teal"
          leftSection={<IconDeviceFloppy size={13} />}
          loading={busy}
          onClick={() => onFixPermit(permit)}
        >
          Save + re-check
        </Button>
      </Group>
    );
  }

  if (check.key === 'metaPresent') {
    return (
      <Stack gap={6} mt={6}>
        <TextInput
          size="xs"
          label="Headline"
          placeholder="The page's SEO headline"
          value={headline}
          onChange={(e) => setHeadline(e.currentTarget.value)}
          disabled={busy}
        />
        <Textarea
          size="xs"
          label="Meta description"
          placeholder="One or two sentences for search results"
          value={metaDescription}
          onChange={(e) => setMetaDescription(e.currentTarget.value)}
          autosize
          minRows={2}
          disabled={busy}
        />
        <Group justify="flex-end">
          <Button
            size="xs"
            color="teal"
            leftSection={<IconDeviceFloppy size={13} />}
            loading={busy}
            onClick={() => onFixMeta(headline, metaDescription)}
          >
            Save + re-check
          </Button>
        </Group>
      </Stack>
    );
  }

  if (check.key === 'legalReady') {
    // The legal footer is composed from the workspace BRAND KIT (RERA line +
    // disclaimer), not a per-page field — so it's a Settings fix, not an editor
    // or inline one. Guide rather than offer a control that can't write it.
    return (
      <Text size="xs" c="dimmed" mt={6}>
        Complete the brand kit legal block (RERA line + disclaimer) in Settings — the
        site composes the mandatory legal footer from it.
      </Text>
    );
  }

  // Everything else → open the editor at the relevant spot (never a dead end).
  const hint = EDITOR_FIX_HINT[check.key] ?? 'Fix this in the page editor.';
  return (
    <Button
      size="xs"
      variant="light"
      color="red"
      leftSection={<IconPencil size={13} />}
      mt={6}
      onClick={() => onEditPage(hint)}
    >
      Fix in editor
    </Button>
  );
};

// ── Stage 3E — the Scout + Refresher queues (SC4) ────────────────────────────
// Badge label + color per diff kind. Unknown kinds (a later CRM leg) fall back
// to a humanized gray badge — tolerant, never dropped, never a crash.
const REFRESHER_KIND_META: Record<string, { label: string; color: string }> = {
  COUNTDOWN_PAST: { label: 'Countdown past', color: 'orange' },
  DATE_PAST: { label: 'Date past', color: 'orange' },
  PERMIT_EXPIRED: { label: 'Permit expired', color: 'red' },
  LISTING_GONE: { label: 'Listing gone', color: 'red' },
  COPY_STALE: { label: 'Stale copy', color: 'yellow' },
};

const refresherKindMeta = (kind: string): { label: string; color: string } =>
  REFRESHER_KIND_META[kind] ?? { label: checkLabel(kind), color: 'gray' };

// ── list view ────────────────────────────────────────────────────────────────
const PageCard = ({
  page,
  onEdit,
  onToggleStatus,
  onFixIssues,
  canPublish,
  publishLoading,
  onSubmitted,
  titleExtra,
  actionsExtra,
  footer,
}: {
  page: LandingPageSummary;
  onEdit: () => void;
  onToggleStatus: () => void;
  /** Open the pre-flight issues review for a page whose stored checks fail. */
  onFixIssues: () => void;
  /** Maker-checker (Phase 2): true → a publisher (keeps "Set live"). */
  canPublish: boolean;
  /** The publish verdict is still in flight → the go-live control is disabled. */
  publishLoading: boolean;
  /** Fired after an agent submits this page for approval → reload the list. */
  onSubmitted: () => void;
  /** Stage 3D — a locale chip for an orphaned translation card. */
  titleExtra?: React.ReactNode;
  /** Stage 3D — the "Translate →" menu on EN parents. */
  actionsExtra?: React.ReactNode;
  /** Stage 3D — the nested translation-sibling rows + "Publish all". */
  footer?: React.ReactNode;
}) => (
  <Paper withBorder radius="md" p="md">
    <Group justify="space-between" align="flex-start" wrap="nowrap" mb="xs">
      <Box style={{ minWidth: 0 }}>
        <Group gap={6} wrap="nowrap">
          <Text fw={600} truncate>
            {page.title || 'Untitled'}
          </Text>
          {titleExtra}
        </Group>
        <Text size="xs" c="dimmed" truncate>
          /lp/{page.slug}
        </Text>
      </Box>
      <Group gap={6} wrap="nowrap">
        <SubmissionBadge
          size="sm"
          submittedForApprovalAt={page.submittedForApprovalAt}
          sentBackAt={page.sentBackAt}
          sentBackNote={page.sentBackNote}
        />
        <PreflightChip page={page} />
        {isExternalPage(page) ? (
          <Badge color="blue" variant="light" size="sm">
            Live · External
          </Badge>
        ) : (
          <Badge color={statusColor(page.status)} variant="light" size="sm">
            {enumLabel(page.status)}
          </Badge>
        )}
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
      {hasFailingPreflight(page) ? (
        <Button
          size="xs"
          variant="light"
          color="orange"
          leftSection={<IconAlertTriangle size={14} />}
          onClick={onFixIssues}
        >
          Fix issues
        </Button>
      ) : null}
      {page.status === 'LIVE' ? (
        // Unpublish (LIVE → DRAFT) is not a go-live; unchanged for everyone.
        <Button
          size="xs"
          variant="subtle"
          color="gray"
          leftSection={<IconWorld size={14} />}
          onClick={onToggleStatus}
        >
          Unpublish
        </Button>
      ) : publishLoading ? (
        <Button size="xs" variant="subtle" color="teal" leftSection={<IconWorld size={14} />} disabled>
          Set live
        </Button>
      ) : canPublish ? (
        <Button
          size="xs"
          variant="subtle"
          color="teal"
          leftSection={<IconWorld size={14} />}
          onClick={onToggleStatus}
        >
          Set live
        </Button>
      ) : (
        // Agent → submit instead of going live (the backend gate is authoritative).
        <SubmitForApprovalButton
          kind="LANDING_PAGE"
          id={page.id}
          alreadySubmitted={
            page.submittedForApprovalAt != null && page.submittedForApprovalAt !== ''
          }
          onSubmitted={onSubmitted}
          size="xs"
        />
      )}
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
      {actionsExtra}
    </Group>
    {footer}
  </Paper>
);


// ── the tab ──────────────────────────────────────────────────────────────────
export const LandingPagesTab = () => {
  const notify = usePropelToast();
  // Maker-checker (Phase 2): a publisher keeps "Set live" / "Publish"; an agent's
  // same click becomes "Submit for approval". Read once here, threaded to the list
  // cards + the editor toolbar. Fails closed to the agent view; the backend gate
  // stays authoritative.
  const { canPublish, loading: publishLoading } = useCanPublish();
  const { phase, error, data, usingMock, sitePublicUrl, autoTranslate, reload } =
    useLandingPages();
  // Campaign Spine deep-link (CS4): the campaign review's "Open in editor"
  // navigates to /marketing?tab=website&sub=landing-pages&edit=<id>. There is no
  // standalone editor route (mode is local state), so we consume a one-shot
  // ?edit= param here: once the list load settles (mock vs live known), open
  // that page's editor and strip the param so back/refresh don't re-trigger it.
  const [searchParams, setSearchParams] = useSearchParams();
  const editParam = searchParams.get('edit');
  const consumedEditRef = useRef(false);

  const [mode, setMode] = useState<'list' | 'editor'>('list');
  // The list defaults to a sortable PERFORMANCE TABLE (the founder's ask); the
  // stage-lane kanban is demoted to an optional "Board" toggle.
  const [listView, setListView] = useState<'table' | 'board'>('table');
  const [sortCol, setSortCol] = useState<
    'title' | 'status' | 'visits' | 'leads' | 'conv' | 'source' | 'updated'
  >('updated');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [slugTouched, setSlugTouched] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  // AI generate bench (Stage 3A). `drafting` = a bench run is in flight;
  // `draftStage` (0–4) drives the agent strip; `briefTheme` is the optional theme
  // override (null → the brand-kit default the server picks); `aiFeatureOff` dims
  // the box when the route reports the LLM key is unset.
  const [drafting, setDrafting] = useState(false);
  const [draftStage, setDraftStage] = useState(0);
  const [briefTheme, setBriefTheme] = useState<LandingTheme | null>(null);
  // Sources grounding (SRC-1 / plan SM6): ≤8 library sources picked via the
  // "Add sources" popover; their ids ride the draftFromBrief call (SM3).
  const [briefSources, setBriefSources] = useState<SelectedSource[]>([]);
  const [aiFeatureOff, setAiFeatureOff] = useState(false);
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
  // Stage 3B — the click+tell instruction bar. `instructTarget` is the section
  // the bar edits (null = whole page), set by the preview's "Edit with AI"
  // button or a row's Instruct affordance. `benchLog` is the page's append-only
  // AI audit trail (seeded on open, replaced by each instruct response) — it
  // feeds the bar's history popover. `instructFeatureOff` dims the bar when the
  // route reports the LLM key is unset (or the CRM leg isn't live yet).
  const [instructTarget, setInstructTarget] = useState<number | null>(null);
  const [instructText, setInstructText] = useState('');
  const [instructBusy, setInstructBusy] = useState(false);
  const [instructFeatureOff, setInstructFeatureOff] = useState(false);
  const [benchLog, setBenchLog] = useState<BenchLogEntry[]>([]);
  const instructInputRef = useRef<HTMLInputElement | null>(null);
  // Stage 3C — the publish pre-flight checklist modal. Non-null = open, holding
  // the target page + the latest check rows (from preflightPage OR the server's
  // PREFLIGHT_FAILED response). `running` = a re-run is in flight; `publishing`
  // = the setStatus LIVE leg is in flight.
  const [preflightState, setPreflightState] = useState<{
    pageId: string;
    checks: PreflightCheck[];
    running: boolean;
    publishing: boolean;
    // Present only when the modal is opened via "Fix issues" (openIssuesReview):
    // the full page, so a failing check can be fixed IN PLACE (permit / meta) and
    // re-checked. Absent on the publish-gate path (openPublishGate) — those rows
    // fall back to "Fix in editor". `fixBusy` = an inline fix save is in flight.
    page?: LandingPageFull;
    fixBusy?: boolean;
  } | null>(null);
  // Stage 3D — the post-publish auto-translate loop + translations queue.
  // `translateState` drives the passive progress strip ("Translating… AR ✓ RU ⏳");
  // `translateUnavailable` dims every translate affordance once the bench route
  // answers unknown-action / FEATURE_OFF (the CRM leg isn't live yet);
  // `adHocTranslating` is the in-flight ad-hoc run key (`pageId:locale`);
  // `bulkPublishingId` is the parent whose "Publish all translations" is running.
  // `translateRunRef` is the fire-once guard: the loop starts ONLY from a
  // successful publish event (never a render), and never twice concurrently.
  const [translateState, setTranslateState] = useState<{
    pageId: string;
    results: { locale: string; state: 'pending' | 'running' | 'done' | 'failed' }[];
  } | null>(null);
  const [translateUnavailable, setTranslateUnavailable] = useState(false);
  const [adHocTranslating, setAdHocTranslating] = useState<string | null>(null);
  const [bulkPublishingId, setBulkPublishingId] = useState<string | null>(null);
  const translateRunRef = useRef(false);
  // 4S-B AM2 — the amplify hook's guards, mirroring the translate loop's ref
  // pattern: `amplifyFiredRef` = one fire per page per session (a re-publish
  // click can't spawn duplicate plans); `amplifyUnavailableRef` mirrors the
  // featureOff detection — after one FEATURE_OFF answer we stop calling AND
  // stop toasting (one soft note max).
  const amplifyFiredRef = useRef<Set<string>>(new Set());
  const amplifyUnavailableRef = useRef(false);
  // Stage 3E — the Scout + Refresher queues (SC4). `scoutDismissTarget` holds
  // the proposal awaiting the archive confirm; `refresherBusy` is the in-flight
  // action key (`<pageId>:<apply|dismiss>:<diffKey|*>`, one at a time);
  // `refresherUnavailable` dims the queue's buttons once landing-admin answers
  // unknown-action / FEATURE_OFF / unreachable (the CRM leg isn't live yet).
  const [scoutDismissTarget, setScoutDismissTarget] = useState<LandingPageSummary | null>(null);
  const [scoutDismissBusy, setScoutDismissBusy] = useState(false);
  const [refresherBusy, setRefresherBusy] = useState<string | null>(null);
  const [refresherUnavailable, setRefresherUnavailable] = useState(false);

  const derivedSlug = useMemo(
    () => (slugTouched ? draft.slug : slugify(draft.title)),
    [slugTouched, draft.slug, draft.title],
  );

  // A3 — the working draft is dirty when its content diverges from the snapshot.
  const currentSnapshot = useMemo(() => serializeDraft(draft, derivedSlug), [draft, derivedSlug]);
  const isDirty = mode === 'editor' && currentSnapshot !== savedSnapshot;

  // ── Stage 3D — group locale siblings under their EN parent ────────────────
  // Pages carrying a sourceLandingPageId that resolves to another listed page
  // nest under it (locale order = the loop order); anything else — parents,
  // pre-translator pages with no locale fields, or an orphaned sibling whose
  // parent was deleted — stays a top-level card, exactly as before.
  const { parentPages, siblingsByParent } = useMemo(() => {
    const ids = new Set(data.map((p) => p.id));
    const parents: LandingPageSummary[] = [];
    const byParent = new Map<string, LandingPageSummary[]>();
    for (const p of data) {
      const src =
        typeof p.sourceLandingPageId === 'string' && p.sourceLandingPageId !== ''
          ? p.sourceLandingPageId
          : null;
      if (src !== null && ids.has(src)) {
        byParent.set(src, [...(byParent.get(src) ?? []), p]);
      } else {
        parents.push(p);
      }
    }
    const rank = (l: string | null | undefined): number => {
      const i = (TRANSLATE_LOCALES as readonly string[]).indexOf((l ?? '').toUpperCase());
      return i === -1 ? TRANSLATE_LOCALES.length : i;
    };
    for (const [key, list] of byParent) {
      byParent.set(
        key,
        [...list].sort((a, b) => rank(a.locale) - rank(b.locale)),
      );
    }
    return { parentPages: parents, siblingsByParent: byParent };
  }, [data]);

  // Bucket the EN parents into the board lanes (locale siblings stay nested in
  // their parent card's footer — see the render).
  const parentsByLane = useMemo(() => {
    const lanes: Record<LandingLane, LandingPageSummary[]> = {
      fixes: [],
      draft: [],
      review: [],
      live: [],
      archived: [],
    };
    for (const p of parentPages) lanes[laneOf(p)].push(p);
    return lanes;
  }, [parentPages]);

  // Sorted rows for the performance table. Sorts the EN parents (locale siblings
  // stay tucked under their parent — the table shows a translations count instead
  // of one row per language, to keep it a performance view, not a page dump).
  const sortedParents = useMemo(() => {
    const laneRank: Record<LandingLane, number> = {
      fixes: 0,
      draft: 1,
      review: 2,
      live: 3,
      archived: 4,
    };
    const dir = sortDir === 'asc' ? 1 : -1;
    const rows = [...parentPages];
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortCol) {
        case 'title':
          cmp = (a.title || '').localeCompare(b.title || '');
          break;
        case 'status':
          cmp = laneRank[laneOf(a)] - laneRank[laneOf(b)];
          break;
        case 'visits':
          cmp = a.visits - b.visits;
          break;
        case 'leads':
          cmp = a.leads - b.leads;
          break;
        case 'conv':
          cmp = convPct(a.visits, a.leads) - convPct(b.visits, b.leads);
          break;
        case 'source':
          cmp = sourceLabel(a).localeCompare(sourceLabel(b));
          break;
        case 'updated':
          cmp = (Date.parse(a.updatedAt ?? '') || 0) - (Date.parse(b.updatedAt ?? '') || 0);
          break;
      }
      return cmp * dir;
    });
    return rows;
  }, [parentPages, sortCol, sortDir]);

  // Click a column header to sort by it; click again to flip direction.
  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir(col === 'title' || col === 'source' ? 'asc' : 'desc');
    }
  };

  // A sortable table header cell — shows a caret on the active column.
  const sortTh = (col: typeof sortCol, label: string, numeric = false) => (
    <Table.Th style={{ textAlign: numeric ? 'right' : 'left', whiteSpace: 'nowrap' }}>
      <UnstyledButton
        onClick={() => toggleSort(col)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
      >
        <Text component="span" size="sm" fw={600}>
          {label}
        </Text>
        {sortCol === col ? (
          <Text component="span" size="xs" c="dimmed">
            {sortDir === 'asc' ? '▲' : '▼'}
          </Text>
        ) : null}
      </UnstyledButton>
    </Table.Th>
  );

  // ── Stage 3E — the two pinned queues (SC4). Both derive tolerantly off the
  // list projection: pre-3E routes omit source/scoutReason/refresherJson, so
  // both arrays stay empty and neither section renders (the grid is untouched).
  const scoutPages = useMemo(
    () => data.filter((p) => (p.source ?? '') === 'SCOUT' && p.status === 'DRAFT'),
    [data],
  );
  const refresherPages = useMemo(
    () =>
      data
        .map((p) => ({ page: p, diffs: readRefresherDiffs(p.refresherJson) }))
        .filter((entry) => entry.diffs.length > 0),
    [data],
  );

  // Keep the selection valid as sections are added/removed/reordered.
  useEffect(() => {
    setSelectedIndex((cur) => (cur !== null && cur >= draft.sections.length ? null : cur));
    // The instruction bar's target follows the same clamp (falls back to whole page).
    setInstructTarget((cur) => (cur !== null && cur >= draft.sections.length ? null : cur));
  }, [draft.sections.length]);

  // Preview → left rail: scroll the selected (auto-expanded) row into view.
  useEffect(() => {
    if (selectedIndex === null) return;
    sectionRefs.current[selectedIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedIndex]);

  // Snapshot a freshly-opened draft so a pristine page is not "dirty".
  const beginEditing = (next: Draft, pageBenchLog: BenchLogEntry[] = []) => {
    const slug = next.slug || slugify(next.title);
    setDraft(next);
    setSavedSnapshot(serializeDraft(next, slug));
    setSelectedIndex(null);
    setHoverIndex(null);
    setJustSaved(false);
    setInstructTarget(null);
    setInstructText('');
    setBenchLog(pageBenchLog);
  };

  const openNew = (sections: EditSection[] = []) => {
    beginEditing({ ...EMPTY_DRAFT, sections });
    setSlugTouched(false);
    setMode('editor');
  };

  // Stage 3A — the "Start from a prompt … Draft it" box now runs the REAL 4-agent
  // bench server-side (draftFromBrief → website/landing-bench), not a client-side
  // section seed. While the single ~40s await runs we advance the agent strip
  // optimistically; on success we open the fresh DRAFT in the editor (same nav as
  // a manual edit). FEATURE_OFF dims the box; any other failure toasts + keeps it.
  const runBench = async () => {
    const brief = prompt.trim();
    if (brief === '') return;
    if (usingMock) {
      notify('AI drafting needs the landingPage object deployed to this workspace.', 'info');
      return;
    }
    setDrafting(true);
    setDraftStage(0);
    // Optimistic progression: tick to the next agent every ~9s (cap at the last
    // one) so the strip reads as forward motion during the synchronous await.
    const timer = window.setInterval(() => {
      setDraftStage((s) => (s < AGENT_STAGES.length - 1 ? s + 1 : s));
    }, 9000);
    const overrides = {
      ...(briefTheme ? { theme: briefTheme } : {}),
      ...(briefSources.length > 0 ? { sourceIds: briefSources.map((s) => s.id) } : {}),
    };
    const res = await draftFromBrief(
      brief,
      Object.keys(overrides).length > 0 ? overrides : undefined,
    );
    window.clearInterval(timer);
    setDraftStage(AGENT_STAGES.length); // all four done
    if (res.ok) {
      setDrafting(false);
      setPrompt('');
      setBriefSources([]);
      await openEdit(res.id); // land the founder on the split-pane editor
      return;
    }
    setDrafting(false);
    setDraftStage(0);
    if (res.featureOff) {
      setAiFeatureOff(true);
      return;
    }
    notify(res.error, 'error');
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
    beginEditing(
      {
        id: p.id,
        title: p.title,
        slug: p.slug,
        theme: p.theme,
        status: p.status,
        headline: p.headline,
        metaDescription: p.metaDescription,
        ogImageUrl: p.ogImageUrl,
        sections: p.sections.map((s) => toEditSection(s.type, s.props)),
      },
      p.benchLog,
    );
    setSlugTouched(true);
    setMode('editor');
  };

  // Consume the one-shot ?edit=<id> deep-link (Campaign Spine CS4) once the
  // list load settled — `usingMock` is only trustworthy at phase 'ready', and
  // openEdit itself no-ops with an honest note in mock mode.
  useEffect(() => {
    if (editParam === null || consumedEditRef.current) return;
    if (phase !== 'ready') return;
    consumedEditRef.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete('edit');
    setSearchParams(next, { replace: true });
    void openEdit(editParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editParam, phase, searchParams, setSearchParams]);

  // ── Stage 3D — the auto-translate loop (TR2, against the pinned TR1 contract:
  // landing-bench {action:'translate', id, locale} → {ok, id, locale}) ────────
  // The auto-loop runs ONLY for an EN parent — a translated sibling flipping
  // LIVE must never fan out again. A page the list doesn't know yet (a fresh
  // editor draft) is founder-authored EN by construction.
  const isEnParent = (id: string): boolean => {
    const p = data.find((x) => x.id === id);
    if (!p) return true;
    if (typeof p.sourceLandingPageId === 'string' && p.sourceLandingPageId !== '') return false;
    const locale = typeof p.locale === 'string' ? p.locale.toUpperCase() : '';
    return locale === '' || locale === 'EN';
  };

  const markLocale = (locale: string, state: 'pending' | 'running' | 'done' | 'failed') =>
    setTranslateState((s) =>
      s
        ? { ...s, results: s.results.map((r) => (r.locale === locale ? { ...r, state } : r)) }
        : s,
    );

  // The 7 locales, SEQUENTIALLY (each call is a ~10s bench run — parallel calls
  // would stampede the route). Per-locale failure → mark ✗ + continue; the loop
  // NEVER blocks or re-opens the publish flow (fire-and-forget from the publish
  // event), never publishes a translation (the bench creates DRAFTS only — the
  // founder publishes), and a first-call unknown-action/FEATURE_OFF stops it
  // quietly with one subtle note + dims the affordances.
  const runTranslateLoop = async (pageId: string) => {
    if (translateRunRef.current) return; // fire-once: one loop at a time
    translateRunRef.current = true;
    setTranslateState({
      pageId,
      results: TRANSLATE_LOCALES.map((locale) => ({ locale, state: 'pending' as const })),
    });
    let drafted = 0;
    let failed = 0;
    let unavailable = false;
    for (let i = 0; i < TRANSLATE_LOCALES.length; i++) {
      const locale = TRANSLATE_LOCALES[i];
      markLocale(locale, 'running');
      const res = await translatePage(pageId, locale);
      if (res.ok) {
        drafted += 1;
        markLocale(locale, 'done');
        continue;
      }
      if (res.unavailable && i === 0) {
        // The action isn't on this workspace yet (older bench route /
        // FEATURE_OFF / unreachable) — stop quietly, don't hammer 6 more calls.
        unavailable = true;
        break;
      }
      failed += 1;
      markLocale(locale, 'failed');
    }
    translateRunRef.current = false;
    if (unavailable) {
      setTranslateUnavailable(true);
      setTranslateState(null);
      notify('Auto-translate isn’t available on this workspace yet.', 'info');
      return;
    }
    notify(
      failed > 0
        ? `${drafted} translation${drafted === 1 ? '' : 's'} drafted, ${failed} failed`
        : `${drafted} translation${drafted === 1 ? '' : 's'} drafted`,
      failed > 0 ? 'info' : 'success',
    );
    reload();
    // Let the finished strip linger briefly, then clear (guarded so it never
    // wipes a NEWER run's strip).
    window.setTimeout(() => {
      setTranslateState((s) => (s && s.pageId === pageId && !translateRunRef.current ? null : s));
    }, 4000);
  };

  // Gate + kick-off, called from the publish success path (an EVENT — the loop
  // can never re-trigger on a re-render). meta.autoTranslate defaults ON;
  // an explicit false keeps publishes silent (the manual menu still works).
  const maybeStartTranslateLoop = (id: string) => {
    if (usingMock || !autoTranslate || translateUnavailable) return;
    if (!isEnParent(id)) return;
    void runTranslateLoop(id);
  };

  // ── 4S-B AM2 — the amplify hook ────────────────────────────────────────────
  // After a successful EN publish, fire-and-forget a social AMPLIFY plan
  // promoting the page (CTAs UTM-stamped onto the live /lp/<slug> URL by the
  // bench). Fires ALONGSIDE the translate loop from the same publish event
  // (both fire-and-forget; order irrelevant) and NEVER blocks or fails the
  // publish. Translated siblings never amplify (isEnParent — same gate as the
  // translator; a fresh editor draft the list doesn't know is EN by
  // construction).
  const maybeAmplifyLandingPage = (id: string) => {
    if (usingMock || amplifyUnavailableRef.current || amplifyFiredRef.current.has(id)) return;
    if (!isEnParent(id)) return;
    const summary = data.find((p) => p.id === id);
    const fromEditor = mode === 'editor' && draft.id === id;
    const title = fromEditor ? draft.title : (summary?.title ?? '');
    const slug = fromEditor ? derivedSlug : (summary?.slug ?? '');
    const blurb = fromEditor
      ? draft.metaDescription || draft.headline
      : summary?.metaDescription || summary?.headline || '';
    if (slug === '') return; // no public URL to promote — skip quietly
    const base =
      sitePublicUrl !== '' ? `${sitePublicUrl.replace(/\/+$/, '')}/lp` : LIVE_LP_BASE;
    amplifyFiredRef.current.add(id);
    void (async () => {
      const res = await generatePlan(
        amplifyBrief('landing page', title, blurb),
        ALL_NETWORKS,
        undefined,
        undefined,
        {
          mode: 'AMPLIFY',
          sourceKind: 'LANDING_PAGE',
          sourceRef: id,
          destinationUrl: `${base}/${slug}`,
        },
      );
      if (res.ok) {
        notify('Social plan drafted — review in the Social tab', 'success');
        return;
      }
      if (res.featureOff) amplifyUnavailableRef.current = true;
      notify('Couldn’t draft the social plan — create one manually in the Social tab.', 'info');
    })();
  };

  // Ad-hoc "Translate →" (locale picker on the EN parent card; re-translate is
  // safe — the bench dedups by (slug, locale) and overwrites the sibling DRAFT).
  const runAdHocTranslate = async (pageId: string, locale: string) => {
    if (usingMock) {
      notify('Preview data — deploy the landingPage object to translate.', 'info');
      return;
    }
    if (adHocTranslating !== null || translateRunRef.current) return;
    setAdHocTranslating(`${pageId}:${locale}`);
    const res = await translatePage(pageId, locale);
    setAdHocTranslating(null);
    if (res.ok) {
      notify(`${locale} draft ready — publish it when you’re happy.`, 'success');
      reload();
      return;
    }
    if (res.unavailable) {
      setTranslateUnavailable(true);
      notify('Translate isn’t available on this workspace yet.', 'info');
      return;
    }
    notify(res.error, 'error');
  };

  // "Publish all translations" — sequential setStatus LIVE on the DRAFT
  // siblings. Each flip re-runs the pre-flight gate SERVER-side (authoritative);
  // PREFLIGHT_FAILED counts as blocked, and the EN parent is never touched.
  const publishAllTranslations = async (parentId: string, siblings: LandingPageSummary[]) => {
    if (usingMock) {
      notify('Preview data — deploy the landingPage object to publish.', 'info');
      return;
    }
    const drafts = siblings.filter((s) => s.status === 'DRAFT');
    if (drafts.length === 0 || bulkPublishingId !== null) return;
    setBulkPublishingId(parentId);
    let published = 0;
    let blocked = 0;
    let failedCount = 0;
    for (const sibling of drafts) {
      const res = await setLandingStatus(sibling.id, 'LIVE');
      if (res.ok) published += 1;
      else if (res.preflightFailed) blocked += 1;
      else failedCount += 1;
    }
    setBulkPublishingId(null);
    reload();
    const parts = [`${published} published`];
    if (blocked > 0) parts.push(`${blocked} blocked by checks`);
    if (failedCount > 0) parts.push(`${failedCount} failed`);
    notify(`Translations: ${parts.join(', ')}`, blocked + failedCount > 0 ? 'info' : 'success');
  };

  // ── Stage 3E — queue actions (SC4) ─────────────────────────────────────────
  // Dismissing a Scout proposal rides the EXISTING archive path (setStatus
  // ARCHIVED — the same route every card uses), behind a confirm modal.
  const confirmScoutDismiss = async () => {
    const target = scoutDismissTarget;
    if (!target || scoutDismissBusy) return;
    if (usingMock) {
      notify('Preview data — deploy the landingPage object to dismiss proposals.', 'info');
      setScoutDismissTarget(null);
      return;
    }
    setScoutDismissBusy(true);
    const res = await setLandingStatus(target.id, 'ARCHIVED');
    setScoutDismissBusy(false);
    setScoutDismissTarget(null);
    if (res.ok) {
      notify('Suggestion dismissed.', 'success');
      reload();
      return;
    }
    notify(res.error, 'error');
  };

  // Apply/dismiss queued Refresher diffs — `keys` targets specific diffs;
  // undefined ⇒ the whole page's queue ("Apply all"/"Dismiss all"). A route
  // that predates SC3 (unknown action / FEATURE_OFF / unreachable) toasts once
  // and dims the queue's buttons — never a crash.
  const runRefresher = async (
    kind: 'apply' | 'dismiss',
    page: LandingPageSummary,
    keys?: string[],
  ) => {
    if (refresherBusy !== null || refresherUnavailable) return;
    if (usingMock) {
      notify('Preview data — deploy the landingPage object to use the Refresher.', 'info');
      return;
    }
    setRefresherBusy(`${page.id}:${kind}:${keys && keys.length > 0 ? keys.join(',') : '*'}`);
    const res =
      kind === 'apply'
        ? await refresherApply(page.id, keys)
        : await refresherDismiss(page.id, keys);
    setRefresherBusy(null);
    if (res.ok) {
      notify(kind === 'apply' ? 'Fix applied.' : 'Dismissed.', 'success');
      reload();
      return;
    }
    if (res.unavailable) {
      setRefresherUnavailable(true);
      notify('Auto-refresh isn’t available on this workspace yet.', 'info');
      return;
    }
    notify(res.error, 'error');
  };

  // ── Stage 3C — the publish pre-flight gate ─────────────────────────────────
  // The actual go-live leg: setStatus LIVE (the server RE-RUNS the gate — the
  // modal is UX, not enforcement). PREFLIGHT_FAILED → re-render the server's
  // checks in the modal instead of a dead-end toast.
  const finalizePublish = async (id: string) => {
    const res = await setLandingStatus(id, 'LIVE');
    if (res.ok) {
      setPreflightState(null);
      if (mode === 'editor' && draft.id === id) {
        setDraft((d) => ({ ...d, status: 'LIVE' }));
        setSavedSnapshot(serializeDraft({ ...draft, status: 'LIVE' }, derivedSlug));
      }
      reload();
      notify('Page published', 'success');
      // Stage 3D — after a successful EN publish, fan out the 7 locale drafts.
      // Fire-and-forget: the publish flow is already fully settled above.
      maybeStartTranslateLoop(id);
      // 4S-B AM2 — and draft the social AMPLIFY plan (also fire-and-forget;
      // fires alongside the translate loop, order irrelevant).
      maybeAmplifyLandingPage(id);
      return;
    }
    if (res.preflightFailed) {
      setPreflightState({ pageId: id, checks: res.checks, running: false, publishing: false });
      notify('Publish blocked — the gate still reports failing checks.', 'error');
      return;
    }
    setPreflightState((s) => (s ? { ...s, publishing: false } : s));
    notify(res.error, 'error');
  };

  // Publish click → run pre-flight → the checklist modal. A workspace whose
  // route predates the gate (unknown action / FEATURE_OFF / unreachable) falls
  // back to the DIRECT publish path with a note — a missing gate must never
  // block publishing.
  const openPublishGate = async (id: string) => {
    setBusy(true);
    const pf = await preflightPage(id);
    if (!pf.ok && pf.unavailable) {
      notify('Pre-flight checks unavailable on this workspace — publishing directly.', 'info');
      await finalizePublish(id);
      setBusy(false);
      return;
    }
    setBusy(false);
    if (!pf.ok) {
      notify(pf.error, 'error');
      return;
    }
    setPreflightState({ pageId: id, checks: pf.checks, running: false, publishing: false });
  };

  // "Fix issues" from a card whose stored pre-flight is failing — opens the
  // checklist modal in FIX mode: it shows which checks fail AND makes each fixable
  // in place (permit / meta inline; the rest → "Fix in editor"), then re-runs.
  // Fetches the full page so the inline fixes have its sections/meta to edit.
  // Available to everyone — fixing is a save (maker-allowed), not a publish; the
  // Publish/Submit decision stays maker-checker gated in the modal footer.
  const openIssuesReview = async (id: string) => {
    setBusy(true);
    const [pf, pageRes] = await Promise.all([preflightPage(id), getLandingPage(id)]);
    setBusy(false);
    if (!pf.ok && pf.unavailable) {
      notify('Pre-flight checks aren’t available on this workspace yet.', 'info');
      return;
    }
    if (!pf.ok) {
      notify(pf.error, 'error');
      return;
    }
    // External tracking pages (area / developer / RCBI attribution rows) carry NO
    // builder sections — they're not real pages, so they must never read as a
    // "broken" build with fixable issues.
    if (pageRes.ok && pageRes.data.sections.length === 0) {
      notify(
        'This is a tracking page (area / developer / RCBI), not a builder page — there’s nothing to fix here.',
        'info',
      );
      return;
    }
    setPreflightState({
      pageId: id,
      checks: pf.checks,
      running: false,
      publishing: false,
      page: pageRes.ok ? pageRes.data : undefined,
    });
  };

  // Persist an inline fix (updated sections and/or meta) as a DRAFT save, then
  // auto re-run the checks so a cleared check flips green without a manual step.
  // A DRAFT save is a maker action (never a publish), so it's allowed for agents.
  const applyFixAndRerun = async (
    patch: Partial<Pick<LandingPageFull, 'sections' | 'headline' | 'metaDescription'>>,
  ) => {
    const st = preflightState;
    if (!st || !st.page || st.fixBusy) return;
    const page = st.page;
    const next: LandingPageFull = { ...page, ...patch };
    setPreflightState((s) => (s ? { ...s, fixBusy: true } : s));
    const res = await saveLandingPage({
      id: page.id,
      title: page.title,
      slug: page.slug,
      theme: page.theme,
      status: 'DRAFT',
      headline: next.headline,
      metaDescription: next.metaDescription,
      ogImageUrl: page.ogImageUrl,
      sections: next.sections,
    });
    if (!res.ok) {
      setPreflightState((s) => (s ? { ...s, fixBusy: false } : s));
      notify(res.error, 'error');
      return;
    }
    // Re-run the gate against the just-saved page and refresh the local copy.
    const pf = await preflightPage(page.id);
    setPreflightState((s) =>
      s
        ? {
            ...s,
            fixBusy: false,
            page: next,
            ...(pf.ok ? { checks: pf.checks } : {}),
          }
        : s,
    );
    reload();
    if (pf.ok) {
      const stillFailing = pf.checks.some((c) => c.level === 'HARD' && !c.ok);
      notify(stillFailing ? 'Saved — some checks still need attention.' : 'Fixed — all checks pass.', stillFailing ? 'info' : 'success');
    }
  };

  // Set the Trakheesi permit number: the check passes when a `permitNumber` prop
  // is present on ANY section, so we stamp it onto the FIRST section's props (the
  // site composes the legal footer from it). A page with no sections can't carry
  // it — but such pages are skipped as trackers above.
  const fixPermit = async (permit: string) => {
    const st = preflightState;
    if (!st?.page) return;
    const value = permit.trim();
    if (value === '') {
      notify('Enter the Trakheesi permit number.', 'error');
      return;
    }
    const sections = st.page.sections.map((s, i) =>
      i === 0 ? { ...s, props: { ...s.props, permitNumber: value } } : s,
    );
    await applyFixAndRerun({ sections });
  };

  const fixMeta = async (headline: string, metaDescription: string) => {
    if (!preflightState?.page) return;
    if (headline.trim() === '' || metaDescription.trim() === '') {
      notify('Enter both the headline and the meta description.', 'error');
      return;
    }
    await applyFixAndRerun({
      headline: headline.trim(),
      metaDescription: metaDescription.trim(),
    });
  };

  const rerunChecks = async () => {
    if (!preflightState || preflightState.running || preflightState.publishing) return;
    const id = preflightState.pageId;
    setPreflightState((s) => (s ? { ...s, running: true } : s));
    const pf = await preflightPage(id);
    setPreflightState((s) =>
      s ? { ...s, running: false, ...(pf.ok ? { checks: pf.checks } : {}) } : s,
    );
    if (!pf.ok) notify(pf.error, 'error');
  };

  const publishFromModal = async () => {
    if (!preflightState || preflightState.publishing) return;
    const id = preflightState.pageId;
    setPreflightState((s) => (s ? { ...s, publishing: true } : s));
    await finalizePublish(id);
  };

  const toggleStatus = async (page: LandingPageSummary) => {
    if (usingMock) {
      notify('Preview data — deploy the landingPage object to publish.', 'info');
      return;
    }
    if (page.status !== 'LIVE') {
      // Going LIVE from the list — same pre-flight gate as the editor's Publish.
      await openPublishGate(page.id);
      return;
    }
    const res = await setLandingStatus(page.id, 'DRAFT');
    if (res.ok) {
      notify('Page unpublished', 'success');
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

  // ── Stage 3B — click+tell (instruct edits) ────────────────────────────────
  // Target the bar at a section (from the preview's "Edit with AI" button or a
  // row's Instruct affordance) and put the cursor in the input.
  const targetInstruct = (index: number | null) => {
    setInstructTarget(index);
    if (index !== null) setSelectedIndex(index);
    window.setTimeout(() => instructInputRef.current?.focus(), 0);
  };

  const applyInstruct = async () => {
    const instruction = instructText.trim();
    const id = draft.id;
    if (instruction === '' || instructBusy || !id || usingMock) return;
    setInstructBusy(true);
    // The route edits the last-SAVED sectionsJson — flush local edits first so
    // the AI works from (and its result can't clobber) the founder's latest.
    if (isDirty) {
      const saved = await persist(draft.status, true);
      if (!saved) {
        setInstructBusy(false);
        notify('Could not save your edits before the AI edit — check the title, then retry.', 'error');
        return;
      }
    }
    const sourceIds = briefSources.map((s) => s.id);
    const res = await instructEdit(
      id,
      instructTarget,
      instruction,
      sourceIds.length > 0 ? sourceIds : undefined,
    );
    setInstructBusy(false);
    if (res.ok) {
      const sections = res.sections.map((s) => toEditSection(s.type, s.props));
      const patch = {
        sections,
        ...(res.headline !== null ? { headline: res.headline } : {}),
        ...(res.metaDescription !== null ? { metaDescription: res.metaDescription } : {}),
      };
      // Functional merge — edits typed DURING the await survive (and keep the
      // draft dirty, so autosave reconciles them on top of the AI's save).
      setDraft((d) => ({ ...d, ...patch }));
      // The route already saved this content; re-baseline the snapshot so the
      // AI edit itself doesn't read as "Unsaved". The existing debounced
      // postMessage re-renders the preview from the new sections.
      setSavedSnapshot(serializeDraft({ ...draft, ...patch }, derivedSlug));
      setBenchLog(res.benchLog);
      setInstructText('');
      const last = [...res.benchLog].reverse().find((e) => e.action === 'instruct');
      notify(last?.summary ? `AI edit applied — ${last.summary}` : 'AI edit applied', 'success');
      return;
    }
    if (res.featureOff) {
      setInstructFeatureOff(true);
      return;
    }
    // BENCH_INVALID and transient failures both land here: toast, draft untouched.
    notify(res.error, 'error');
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
  // spinner / toast). Returns the server id when it persisted (null = failed) —
  // truthy on success, so boolean-style callers keep working. Adopts the server
  // id + status and re-baselines the dirty snapshot to exactly what was sent.
  const persist = async (status: LandingStatus, silent = false): Promise<string | null> => {
    const v = validTitleSlug();
    if (!v) return null;
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
      return null;
    }
    // Merge server id + status without clobbering edits made during the request.
    setDraft((d) => ({ ...d, id: res.data.id, slug: v.slug, status }));
    setSlugTouched(true);
    setSavedSnapshot(snapshotAtSend);
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 2000);
    reload();
    if (!silent) notify(status === 'LIVE' ? `Published /lp/${v.slug}` : `Saved /lp/${v.slug}`, 'success');
    return res.data.id;
  };

  const publish = async () => {
    if (usingMock) {
      notify('Preview data — deploy the landingPage object to publish.', 'info');
      return;
    }
    const goingLive = draft.status !== 'LIVE';
    if (!goingLive) {
      // Unpublish is ungated: a clean saved page flips status only; a dirty one
      // persists content WITH the DRAFT status in one shot (as before).
      if (!isDirty && draft.id) {
        setBusy(true);
        const res = await setLandingStatus(draft.id, 'DRAFT');
        setBusy(false);
        if (!res.ok) {
          notify(res.error, 'error');
          return;
        }
        setDraft((d) => ({ ...d, status: 'DRAFT' }));
        setSavedSnapshot(serializeDraft({ ...draft, status: 'DRAFT' }, derivedSlug));
        reload();
        notify('Page unpublished', 'success');
        return;
      }
      await persist('DRAFT');
      return;
    }
    // Going LIVE (Stage 3C) — the gate checks the SAVED page, so flush local
    // edits first (at the current non-live status), then pre-flight → the
    // checklist modal → setStatus LIVE from the modal's Publish button.
    let id: string | null = draft.id ?? null;
    if (isDirty || !id) {
      id = await persist(draft.status, true);
      if (!id) {
        notify('Could not save the page before pre-flight — check the title, then retry.', 'error');
        return;
      }
    }
    await openPublishGate(id);
  };

  // Maker-checker (Phase 2), editor leg: an agent's "Publish" submits for approval
  // instead of going live. The submitForApproval route keys off the page id, so a
  // dirty/new draft is persisted first (at its current non-live status) to mint the
  // id — the same flush the publisher's gate does — then the id is submitted.
  const resolveEditorSubmitId = async (): Promise<string | null> => {
    if (usingMock) {
      notify('Preview data — deploy the landingPage object to submit.', 'info');
      return null;
    }
    let id: string | null = draft.id ?? null;
    if (isDirty || !id) {
      id = await persist(draft.status, true);
      if (!id) {
        notify('Could not save the page before submitting — check the title, then retry.', 'error');
        return null;
      }
    }
    return id;
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

  // ── Stage 3C — the pre-flight checklist modal (rendered in BOTH views: the
  // editor's Publish and the list cards' "Set live" share the same gate) ──────
  const pfChecks = preflightState?.checks ?? [];
  const pfHardFails = pfChecks.filter((c) => c.level === 'HARD' && !c.ok).length;
  const pfWarnings = pfChecks.filter((c) => c.level === 'SOFT' && !c.ok).length;
  const pfSummary =
    pfHardFails > 0
      ? `${pfHardFails} check${pfHardFails === 1 ? '' : 's'} failed`
      : pfWarnings > 0
        ? `All checks passed — ${pfWarnings} warning${pfWarnings === 1 ? '' : 's'}`
        : 'All checks passed';
  const preflightModal = (
    <Modal
      opened={preflightState !== null}
      onClose={() => setPreflightState(null)}
      title="Pre-flight checks"
      centered
      zIndex={5000}
      size="lg"
    >
      <Alert
        color={pfHardFails > 0 ? 'red' : pfWarnings > 0 ? 'yellow' : 'teal'}
        variant="light"
        mb="sm"
        icon={
          pfHardFails > 0 ? (
            <IconX size={16} />
          ) : pfWarnings > 0 ? (
            <IconAlertTriangle size={16} />
          ) : (
            <IconCheck size={16} />
          )
        }
      >
        {pfSummary}
      </Alert>
      <Stack gap={4}>
        {pfChecks.map((c) => {
          const hardFail = !c.ok && c.level === 'HARD';
          const warn = !c.ok && c.level === 'SOFT';
          return (
            <Group
              key={c.key}
              gap="sm"
              align="flex-start"
              wrap="nowrap"
              p="xs"
              style={
                hardFail
                  ? { background: 'var(--mantine-color-red-light)', borderRadius: 6 }
                  : undefined
              }
            >
              <ThemeIcon
                size="sm"
                radius="xl"
                variant="light"
                color={c.ok ? 'teal' : hardFail ? 'red' : 'yellow'}
              >
                {c.ok ? (
                  <IconCheck size={12} />
                ) : hardFail ? (
                  <IconX size={12} />
                ) : (
                  <IconAlertTriangle size={12} />
                )}
              </ThemeIcon>
              <Box style={{ minWidth: 0, flex: 1 }}>
                <Group gap={6} wrap="nowrap">
                  <Text size="sm" fw={hardFail ? 600 : 500}>
                    {checkLabel(c.key)}
                  </Text>
                  {warn ? (
                    <Badge size="xs" color="yellow" variant="light">
                      warning
                    </Badge>
                  ) : null}
                </Group>
                {c.detail ? (
                  <Text size="xs" c={hardFail ? 'red' : 'dimmed'}>
                    {c.detail}
                  </Text>
                ) : null}
                {/* Fix mode (opened via "Fix issues"): make each FAILED check
                    actionable in place. Publish-gate path has no page → no inline
                    fix (that flow just checks + publishes). */}
                {!c.ok && preflightState?.page ? (
                  <PreflightFixControl
                    check={c}
                    page={preflightState.page}
                    busy={preflightState?.fixBusy ?? false}
                    onFixPermit={(permit) => void fixPermit(permit)}
                    onFixMeta={(h, m) => void fixMeta(h, m)}
                    onEditPage={(hint) => {
                      const id = preflightState?.pageId;
                      setPreflightState(null);
                      notify(hint, 'info');
                      if (id) void openEdit(id);
                    }}
                  />
                ) : null}
              </Box>
            </Group>
          );
        })}
        {pfChecks.length === 0 ? (
          <Text size="sm" c="dimmed">
            No check results returned — re-run the checks.
          </Text>
        ) : null}
      </Stack>
      <Group justify="space-between" mt="md">
        <Button
          variant="default"
          size="sm"
          loading={preflightState?.running ?? false}
          disabled={preflightState?.publishing ?? false}
          onClick={() => void rerunChecks()}
        >
          Re-run checks
        </Button>
        <Group gap="xs">
          <Button
            variant="subtle"
            color="gray"
            size="sm"
            disabled={preflightState?.publishing ?? false}
            onClick={() => setPreflightState(null)}
          >
            Cancel
          </Button>
          {/* Maker-checker: fixing checks ≠ publishing. A publisher gets Publish;
              a maker who has cleared the checks submits for approval instead. Both
              require no HARD fails. */}
          {canPublish ? (
            <Button
              size="sm"
              color="teal"
              leftSection={<IconRocket size={14} />}
              disabled={
                pfHardFails > 0 ||
                pfChecks.length === 0 ||
                (preflightState?.running ?? false) ||
                (preflightState?.fixBusy ?? false)
              }
              loading={preflightState?.publishing ?? false}
              onClick={() => void publishFromModal()}
            >
              Publish
            </Button>
          ) : pfHardFails === 0 && pfChecks.length > 0 && preflightState ? (
            <SubmitForApprovalButton
              kind="LANDING_PAGE"
              id={preflightState.pageId}
              alreadySubmitted={false}
              onSubmitted={() => {
                setPreflightState(null);
                reload();
              }}
              size="sm"
            />
          ) : (
            <Button size="sm" color="teal" leftSection={<IconRocket size={14} />} disabled>
              Publish
            </Button>
          )}
        </Group>
      </Group>
    </Modal>
  );

  // Stage 3D — the passive translate progress strip. Driven by translateState
  // (the sequential post-publish loop / ad-hoc runs); rendered in BOTH views so
  // the founder can navigate while translations draft. Purely visual — the loop
  // never blocks anything.
  const translateStrip = translateState ? (
    <Paper withBorder radius="md" p="xs" mb="md">
      <Group gap="xs" wrap="wrap">
        <IconLanguage size={16} />
        <Text size="sm" fw={500}>
          Translating…
        </Text>
        {translateState.results.map((r) => (
          <Badge
            key={r.locale}
            size="sm"
            variant={r.state === 'pending' ? 'outline' : 'light'}
            color={
              r.state === 'done'
                ? 'teal'
                : r.state === 'failed'
                  ? 'red'
                  : r.state === 'running'
                    ? 'blue'
                    : 'gray'
            }
            leftSection={r.state === 'running' ? <Loader size={10} color="blue" /> : undefined}
          >
            {r.locale}
            {r.state === 'done' ? ' ✓' : r.state === 'failed' ? ' ✗' : ''}
          </Badge>
        ))}
      </Group>
    </Paper>
  ) : null;

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
            label="Social preview headline"
            description="Shown when the page is shared on WhatsApp, LinkedIn, or search."
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
            label="Social share image"
            value={draft.ogImageUrl}
            sitePublicUrl={sitePublicUrl}
            projectName={draft.title}
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
              projectName={draft.title}
              dragOver={dragOverIndex === i && dragIndex !== null && dragIndex !== i}
              onToggle={() => setSelectedIndex((cur) => (cur === i ? null : i))}
              onChange={(next) => updateSection(i, next)}
              onMove={(dir) => moveSection(i, dir)}
              onRemove={() => removeSection(i)}
              onInstruct={() => targetInstruct(i)}
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
    ) : publishLoading ? (
      <Button size="sm" color="teal" leftSection={<IconRocket size={16} />} disabled>
        Publish
      </Button>
    ) : canPublish ? (
      <Button
        size="sm"
        color="teal"
        loading={busy}
        leftSection={<IconRocket size={16} />}
        onClick={publish}
      >
        Publish
      </Button>
    ) : (
      // Agent → submit for approval (persists first via resolveEditorSubmitId).
      <SubmitForApprovalButton
        kind="LANDING_PAGE"
        id={draft.id ?? null}
        resolveId={resolveEditorSubmitId}
        disabled={busy}
        onSubmitted={reload}
        iconSize={16}
      />
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

    // Stage 3B — the click+tell instruction bar (bottom of the editor, both
    // layouts). Targeted from the preview toolbar's "Edit with AI" or a row's
    // Instruct affordance; cleared → whole page.
    const instructTargetLabel =
      instructTarget !== null && draft.sections[instructTarget]
        ? `${sectionDef(draft.sections[instructTarget].type).label} · #${instructTarget + 1}`
        : 'Whole page';
    const instructionBar = (
      <InstructionBar
        targetIndex={instructTarget}
        targetLabel={instructTargetLabel}
        text={instructText}
        busy={instructBusy}
        featureOff={instructFeatureOff}
        canApply={!usingMock && !!draft.id}
        disabledHint={
          usingMock
            ? 'Preview data — deploy the landingPage object to use AI edits.'
            : !draft.id
              ? 'Save the page first (a title is enough — autosave does the rest).'
              : null
        }
        history={benchLog}
        inputRef={instructInputRef}
        onTextChange={setInstructText}
        onClearTarget={() => setInstructTarget(null)}
        onApply={() => void applyInstruct()}
      />
    );

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
        {preflightModal}
        <Box
          p="md"
          style={
            hasPreview
              ? { display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 220px)', minHeight: 480 }
              : undefined
          }
        >
          {header}
          {translateStrip}

          {hasPreview ? (
            <>
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
                    onEditWithAi={targetInstruct}
                    liveUrl={liveUrl}
                  />
                </Box>
              </Group>
              {/* Stage 3B — click+tell, pinned under the split view */}
              <Box mt="sm" style={{ flexShrink: 0 }}>
                {instructionBar}
              </Box>
            </>
          ) : (
            <>
              <Alert color="gray" variant="light" icon={<IconWorld size={16} />} mb="md">
                Live preview is available once your site address is set for this workspace
                (ask an admin). You can still assemble and save the page below.
              </Alert>
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                <Stack gap="sm">
                  {pageSettingsBlock}
                  {addSectionBlock}
                </Stack>
                <Stack gap="sm">{sectionStack}</Stack>
              </SimpleGrid>
              <Box mt="md">{instructionBar}</Box>
            </>
          )}
        </Box>
      </ProjectAssetsProvider>
    );
  }

  // ── list ──
  // ── Stage 3E — "Proposed by Scout" (SC4): DRAFT pages the landing-scout cron
  // briefed onto the bench (source:'SCOUT'). Pinned above the grid; renders only
  // when non-empty. Open lands in the normal editor; Dismiss archives (confirmed).
  const scoutQueue =
    scoutPages.length > 0 ? (
      <Paper withBorder radius="md" p="md" mb="md">
        <Group gap="xs" mb="sm">
          <ThemeIcon size="sm" variant="light" color="grape">
            <IconSparkles size={14} />
          </ThemeIcon>
          <Text fw={600}>Suggested pages</Text>
          <Badge size="xs" variant="light" color="grape">
            {scoutPages.length}
          </Badge>
        </Group>
        <Stack gap="xs">
          {scoutPages.map((page) => (
            <Group key={page.id} justify="space-between" align="center" wrap="nowrap">
              <Box style={{ minWidth: 0 }}>
                <Group gap={6} wrap="nowrap">
                  <Text size="sm" fw={500} truncate>
                    {page.title || 'Untitled'}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    /lp/{page.slug}
                  </Text>
                </Group>
                {page.scoutReason ? (
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {page.scoutReason}
                  </Text>
                ) : null}
              </Box>
              <Group gap={6} wrap="nowrap">
                <Button
                  size="compact-xs"
                  variant="light"
                  color="red"
                  leftSection={<IconPencil size={12} />}
                  onClick={() => void openEdit(page.id)}
                >
                  Open
                </Button>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="gray"
                  onClick={() => setScoutDismissTarget(page)}
                >
                  Dismiss
                </Button>
              </Group>
            </Group>
          ))}
        </Stack>
      </Paper>
    ) : null;

  // ── Stage 3E — "Refresher" (SC4): LIVE pages whose refresherJson parses to a
  // non-empty diffs queue. One group per page; per-diff Apply/Dismiss plus a
  // whole-page "Apply all"/"Dismiss all" (keys omitted ⇒ the route acts on all).
  const refresherQueue =
    refresherPages.length > 0 ? (
      <Paper
        withBorder
        radius="md"
        p="md"
        mb="md"
        style={refresherUnavailable ? { opacity: 0.55 } : undefined}
      >
        <Group gap="xs" mb="sm">
          <ThemeIcon size="sm" variant="light" color="orange">
            <IconRefresh size={14} />
          </ThemeIcon>
          <Text fw={600}>Needs refreshing</Text>
          <Badge size="xs" variant="light" color="orange">
            {refresherPages.reduce((n, entry) => n + entry.diffs.length, 0)}
          </Badge>
          <Text size="xs" c="dimmed">
            Stale bits found on live pages — apply the fix or dismiss.
          </Text>
        </Group>
        <Stack gap="md">
          {refresherPages.map(({ page, diffs }) => (
            <Box key={page.id}>
              <Group justify="space-between" align="center" wrap="nowrap" mb={4}>
                <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                  <Text size="sm" fw={600} truncate>
                    {page.title || 'Untitled'}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    /lp/{page.slug}
                  </Text>
                </Group>
                <Group gap={4} wrap="nowrap">
                  <Button
                    size="compact-xs"
                    variant="light"
                    color="teal"
                    disabled={refresherUnavailable || (refresherBusy !== null && refresherBusy !== `${page.id}:apply:*`)}
                    loading={refresherBusy === `${page.id}:apply:*`}
                    onClick={() => void runRefresher('apply', page)}
                  >
                    Apply all
                  </Button>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="gray"
                    disabled={refresherUnavailable || (refresherBusy !== null && refresherBusy !== `${page.id}:dismiss:*`)}
                    loading={refresherBusy === `${page.id}:dismiss:*`}
                    onClick={() => void runRefresher('dismiss', page)}
                  >
                    Dismiss all
                  </Button>
                </Group>
              </Group>
              <Stack gap={4}>
                {diffs.map((diff: RefresherDiff) => {
                  const meta = refresherKindMeta(diff.kind);
                  const applyKey = `${page.id}:apply:${diff.key}`;
                  const dismissKey = `${page.id}:dismiss:${diff.key}`;
                  return (
                    <Group
                      key={diff.key}
                      justify="space-between"
                      align="center"
                      wrap="nowrap"
                      p="xs"
                      style={{
                        border: '1px solid var(--mantine-color-default-border)',
                        borderRadius: 6,
                      }}
                    >
                      <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                        <Badge size="xs" variant="light" color={meta.color} style={{ flexShrink: 0 }}>
                          {meta.label}
                        </Badge>
                        <Box style={{ minWidth: 0 }}>
                          <Text size="xs" truncate>
                            {diff.detail || diff.key}
                          </Text>
                          {diff.proposal ? (
                            <Text size="xs" c="dimmed" truncate>
                              Proposed: {diff.proposal}
                            </Text>
                          ) : null}
                        </Box>
                      </Group>
                      <Group gap={4} wrap="nowrap">
                        <Button
                          size="compact-xs"
                          variant="light"
                          color="teal"
                          disabled={refresherUnavailable || (refresherBusy !== null && refresherBusy !== applyKey)}
                          loading={refresherBusy === applyKey}
                          onClick={() => void runRefresher('apply', page, [diff.key])}
                        >
                          Apply
                        </Button>
                        <Button
                          size="compact-xs"
                          variant="subtle"
                          color="gray"
                          disabled={refresherUnavailable || (refresherBusy !== null && refresherBusy !== dismissKey)}
                          loading={refresherBusy === dismissKey}
                          onClick={() => void runRefresher('dismiss', page, [diff.key])}
                        >
                          Dismiss
                        </Button>
                      </Group>
                    </Group>
                  );
                })}
              </Stack>
            </Box>
          ))}
        </Stack>
        {refresherUnavailable ? (
          <Text size="xs" c="dimmed" mt="xs">
            Auto-refresh isn’t available on this workspace yet.
          </Text>
        ) : null}
      </Paper>
    ) : null;

  const scoutDismissModal = (
    <Modal
      opened={scoutDismissTarget !== null}
      onClose={() => (scoutDismissBusy ? undefined : setScoutDismissTarget(null))}
      title="Dismiss this suggested page?"
      centered
      zIndex={6000}
    >
      <Text size="sm" c="dimmed" mb="md">
        “{scoutDismissTarget?.title || 'Untitled'}” will be archived. You can still find it later
        under archived pages.
      </Text>
      <Group justify="flex-end" gap="xs">
        <Button
          variant="default"
          size="sm"
          disabled={scoutDismissBusy}
          onClick={() => setScoutDismissTarget(null)}
        >
          Keep it
        </Button>
        <Button
          color="red"
          size="sm"
          loading={scoutDismissBusy}
          onClick={() => void confirmScoutDismiss()}
        >
          Dismiss proposal
        </Button>
      </Group>
    </Modal>
  );

  return (
    <Box p="md">
      {preflightModal}
      {scoutDismissModal}
      <SurfaceIntro
        eyebrow="The page studio"
        title="Every campaign page — drafted, checked, and live."
        icon={<IconLayoutGrid size={20} />}
        actions={
          <Button
            color="red"
            size="compact-sm"
            leftSection={<IconPlus size={16} />}
            onClick={() => openNew()}
          >
            New page
          </Button>
        }
      />

      {usingMock ? (
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} mb="md">
          Showing preview data — the landingPage object isn&apos;t deployed to this workspace yet, so
          saving/editing is disabled. The assembler below is fully usable; it becomes live once the
          gated CRM deploy lands.{error ? ` (${error})` : ''}
        </Alert>
      ) : null}

      {/* Stage 3A — type a brief, the 4-agent bench drafts a full on-brand page */}
      <Paper
        withBorder
        radius="md"
        p="md"
        mb="md"
        style={aiFeatureOff ? { opacity: 0.55 } : undefined}
      >
        <Group gap="xs" mb="xs">
          <IconSparkles size={16} />
          <Text fw={600}>Start from a prompt</Text>
          <Badge size="xs" variant="light" color="grape">
            AI
          </Badge>
        </Group>
        <Group gap="xs" wrap="nowrap" align="flex-end">
          <TextInput
            style={{ flex: 1 }}
            placeholder="e.g. Palm Jumeirah 2-bed launch, flexible payment plan"
            value={prompt}
            onChange={(e) => setPrompt(e.currentTarget.value)}
            disabled={drafting || aiFeatureOff}
          />
          <Select
            w={132}
            placeholder="Theme"
            clearable
            value={briefTheme}
            onChange={(v) => setBriefTheme(v as LandingTheme | null)}
            data={LANDING_THEMES.map((t) => ({ value: t, label: THEME_LABEL[t] }))}
            disabled={drafting || aiFeatureOff}
            comboboxProps={{ zIndex: 5000 }}
          />
          <Button
            variant="light"
            color="red"
            onClick={runBench}
            loading={drafting}
            disabled={prompt.trim() === '' || aiFeatureOff}
          >
            Draft it
          </Button>
        </Group>
        <Box mt="xs">
          <AddSourcesControl
            value={briefSources}
            onChange={setBriefSources}
            disabled={drafting || aiFeatureOff}
          />
        </Box>
        {drafting ? <AgentStrip stage={draftStage} /> : null}
        {aiFeatureOff ? (
          <Text size="xs" c="dimmed" mt="xs">
            AI drafting isn’t configured yet.
          </Text>
        ) : null}
      </Paper>

      {translateStrip}

      {/* Stage 3E — the self-updating layer's two queues, pinned above the grid */}
      {scoutQueue}
      {refresherQueue}

      {!busy && data.length > 0 ? (
        <Group justify="flex-end" mb="sm">
          <SegmentedControl
            size="xs"
            value={listView}
            onChange={(v) => setListView(v as 'table' | 'board')}
            data={[
              { value: 'table', label: 'Table' },
              { value: 'board', label: 'Board' },
            ]}
          />
        </Group>
      ) : null}

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
      ) : listView === 'board' ? (
        <KanbanBoard cols={{ base: 1, sm: 2, lg: 5 }}>
          {LANDING_LANES.map((lane) => {
            const laneParents = parentsByLane[lane.id];
            return (
              <KanbanColumn
                key={lane.id}
                title={lane.title}
                count={laneParents.length}
                icon={
                  <lane.Icon size={15} style={{ color: 'var(--mantine-color-dimmed)' }} />
                }
                empty={
                  <InvitingEmpty
                    compact
                    title={lane.emptyTitle}
                    message={lane.emptyMessage}
                  />
                }
              >
                {laneParents.map((page) => {
                  const sibs = siblingsByParent.get(page.id) ?? [];
            // An orphaned translation (its EN parent isn't in the list) renders
            // top-level with its locale made visible.
            const orphanLocale =
              page.sourceLandingPageId && (page.locale ?? 'EN') !== 'EN' ? page.locale : null;
            const canTranslate = !translateUnavailable && isEnParent(page.id);
            return (
              <PageCard
                key={page.id}
                page={page}
                onEdit={() => openEdit(page.id)}
                onToggleStatus={() => toggleStatus(page)}
                onFixIssues={() => void openIssuesReview(page.id)}
                canPublish={canPublish}
                publishLoading={publishLoading}
                onSubmitted={reload}
                titleExtra={
                  orphanLocale ? (
                    <Badge size="xs" variant="outline" color="gray">
                      {orphanLocale}
                    </Badge>
                  ) : null
                }
                actionsExtra={
                  canTranslate ? (
                    <Menu withinPortal position="bottom-end" zIndex={5000}>
                      <Menu.Target>
                        <Button
                          size="xs"
                          variant="subtle"
                          color="gray"
                          leftSection={<IconLanguage size={14} />}
                          rightSection={<IconChevronDown size={12} />}
                          loading={adHocTranslating !== null && adHocTranslating.startsWith(`${page.id}:`)}
                        >
                          Translate
                        </Button>
                      </Menu.Target>
                      <Menu.Dropdown>
                        {TRANSLATE_LOCALES.map((lc) => {
                          const exists = sibs.some((s) => (s.locale ?? '') === lc);
                          return (
                            <Menu.Item
                              key={lc}
                              disabled={adHocTranslating !== null || translateRunRef.current}
                              onClick={() => void runAdHocTranslate(page.id, lc)}
                            >
                              {lc}
                              {exists ? ' (re-translate)' : ''}
                            </Menu.Item>
                          );
                        })}
                      </Menu.Dropdown>
                    </Menu>
                  ) : null
                }
                footer={
                  sibs.length > 0 ? (
                    <Stack
                      gap={4}
                      mt="sm"
                      pl="sm"
                      style={{ borderLeft: '2px solid var(--mantine-color-gray-3)' }}
                    >
                      {sibs.map((s) => (
                        <Group key={s.id} gap="xs" wrap="nowrap" justify="space-between">
                          <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                            <Badge size="xs" variant="outline" color="gray">
                              {s.locale ?? '—'}
                            </Badge>
                            <Badge size="xs" variant="light" color={statusColor(s.status)}>
                              {enumLabel(s.status)}
                            </Badge>
                            <Text size="xs" c="dimmed" truncate>
                              {s.title || 'Untitled'}
                            </Text>
                          </Group>
                          <Group gap={4} wrap="nowrap">
                            <Button size="compact-xs" variant="subtle" onClick={() => openEdit(s.id)}>
                              Edit
                            </Button>
                            {s.status !== 'LIVE' ? (
                              <Button
                                size="compact-xs"
                                variant="subtle"
                                color="teal"
                                onClick={() => toggleStatus(s)}
                              >
                                Set live
                              </Button>
                            ) : null}
                          </Group>
                        </Group>
                      ))}
                      <Button
                        size="compact-xs"
                        variant="light"
                        mt={4}
                        loading={bulkPublishingId === page.id}
                        disabled={sibs.every((s) => s.status === 'LIVE')}
                        onClick={() => void publishAllTranslations(page.id, sibs)}
                      >
                        Publish all translations
                      </Button>
                    </Stack>
                  ) : null
                }
              />
                  );
                })}
              </KanbanColumn>
            );
          })}
        </KanbanBoard>
      ) : (
        <Table.ScrollContainer minWidth={780}>
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                {sortTh('title', 'Name')}
                {sortTh('status', 'Status')}
                {sortTh('visits', 'Visits', true)}
                {sortTh('leads', 'Leads', true)}
                {sortTh('conv', 'Conversion %', true)}
                {sortTh('source', 'Source')}
                {sortTh('updated', 'Updated')}
                <Table.Th style={{ textAlign: 'right' }}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sortedParents.map((page) => {
                const external = isExternalPage(page);
                const sibs = siblingsByParent.get(page.id) ?? [];
                const failing = hasFailingPreflight(page);
                return (
                  <Table.Tr key={page.id}>
                    <Table.Td style={{ maxWidth: 280 }}>
                      <Text fw={600} size="sm" truncate>
                        {page.title || 'Untitled'}
                      </Text>
                      <Group gap={6} wrap="nowrap">
                        <Text size="xs" c="dimmed" truncate>
                          /{external ? page.slug : `lp/${page.slug}`}
                        </Text>
                        {sibs.length > 0 ? (
                          <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                            · {sibs.length} language{sibs.length === 1 ? '' : 's'}
                          </Text>
                        ) : null}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      {external ? (
                        <Badge color="blue" variant="light" size="sm">
                          Live · External
                        </Badge>
                      ) : (
                        <Group gap={6} wrap="nowrap">
                          <Badge color={statusColor(page.status)} variant="light" size="sm">
                            {enumLabel(page.status)}
                          </Badge>
                          {failing ? <PreflightChip page={page} /> : null}
                          <SubmissionBadge
                            size="sm"
                            submittedForApprovalAt={page.submittedForApprovalAt}
                            sentBackAt={page.sentBackAt}
                            sentBackNote={page.sentBackNote}
                          />
                        </Group>
                      )}
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      <Text size="sm">{page.visits}</Text>
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      <Text size="sm">{page.leads}</Text>
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      <Text size="sm">{convPct(page.visits, page.leads)}%</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{sourceLabel(page)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {formatDate(page.updatedAt) || '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={6} justify="flex-end" wrap="nowrap">
                        {external ? (
                          // External pages skip the builder editor + pre-flight —
                          // they just open the real live page on the site.
                          <Button
                            component="a"
                            href={externalLiveUrl(page, SITE_ORIGIN)}
                            target="_blank"
                            rel="noopener noreferrer"
                            size="compact-xs"
                            variant="light"
                            color="blue"
                            rightSection={<IconExternalLink size={13} />}
                          >
                            Open
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="compact-xs"
                              variant="light"
                              color="red"
                              leftSection={<IconPencil size={13} />}
                              onClick={() => openEdit(page.id)}
                            >
                              Edit
                            </Button>
                            {failing ? (
                              <Button
                                size="compact-xs"
                                variant="light"
                                color="orange"
                                leftSection={<IconAlertTriangle size={13} />}
                                onClick={() => void openIssuesReview(page.id)}
                              >
                                Fix
                              </Button>
                            ) : null}
                            {page.status === 'LIVE' ? (
                              <Button
                                component="a"
                                href={`${LIVE_LP_BASE}/${page.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                size="compact-xs"
                                variant="subtle"
                                color="blue"
                                rightSection={<IconExternalLink size={13} />}
                              >
                                Open
                              </Button>
                            ) : publishLoading ? (
                              <Button size="compact-xs" variant="subtle" color="teal" disabled>
                                Set live
                              </Button>
                            ) : canPublish ? (
                              <Button
                                size="compact-xs"
                                variant="subtle"
                                color="teal"
                                leftSection={<IconWorld size={13} />}
                                onClick={() => toggleStatus(page)}
                              >
                                Set live
                              </Button>
                            ) : (
                              <SubmitForApprovalButton
                                kind="LANDING_PAGE"
                                id={page.id}
                                alreadySubmitted={
                                  page.submittedForApprovalAt != null &&
                                  page.submittedForApprovalAt !== ''
                                }
                                onSubmitted={reload}
                                size="compact-xs"
                              />
                            )}
                          </>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <Group justify="center" mt="lg">
        <Text size="xs" c="dimmed">
          <IconExternalLink size={12} style={{ verticalAlign: 'middle' }} /> Pages go live on your
          site at /lp/&lt;slug&gt;, and every lead flows straight into the CRM.
        </Text>
      </Group>
    </Box>
  );
};

export default LandingPagesTab;
