import { useState, type CSSProperties, type DragEvent } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Collapse,
  Divider,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
} from '@mantine/core';
import {
  IconArrowDown,
  IconArrowUp,
  IconBuildingSkyscraper,
  IconCalendar,
  IconCalendarEvent,
  IconChartBar,
  IconChevronRight,
  IconClock,
  IconColumns,
  IconCreditCard,
  IconFileText,
  IconGripVertical,
  IconHelp,
  IconLayoutGrid,
  IconLayoutNavbar,
  IconListCheck,
  IconListDetails,
  IconListNumbers,
  IconLock,
  IconMap,
  IconMessage,
  IconPhoto,
  IconSparkles,
  IconStack2,
  IconStar,
  IconUsers,
  IconVideo,
  IconX,
  type IconComponent,
} from 'twenty-ui/display';
import { sectionDef, type LandingSectionType } from '@/propel/lib/landingSectionDefs';
import { MediaStudioModal } from '@/propel/components/website/MediaStudioModal';

// LP editor polish — A1 (collapsible + native-drag section rows), A4 (image
// fields as thumbnails), and the shared section→icon identity map reused by the
// grouped add menu (A2). NO new deps: drag is native HTML5 DnD, collapse is
// Mantine's <Collapse>, icons are the SAME twenty-ui set the nav resolves (a
// static type→icon map; NO emoji — emoji icons are a hard reject per the plan).

// The editor's working shape for one section (every scalar coerced to a string;
// each row group to Array<Record<string,string>>). Kept here so both the tab and
// the row share one type.
export type EditSection = { type: LandingSectionType; props: Record<string, unknown> };

const asStr = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

// ── section → twenty-ui icon (identity, A1/A2) ────────────────────────────────
// Every mapped icon is verified-exported from twenty-ui/display. A missing key
// falls back to the generic grid glyph, never crashes.
export const SECTION_ICON: Record<LandingSectionType, IconComponent> = {
  hero: IconLayoutNavbar,
  leadForm: IconListDetails,
  listingsGrid: IconLayoutGrid,
  marketReport: IconChartBar,
  testimonial: IconStar,
  faq: IconHelp,
  videoHero: IconVideo,
  gallery: IconPhoto,
  developerStrip: IconBuildingSkyscraper,
  uspGrid: IconListCheck,
  comparisonTable: IconColumns,
  timeline: IconCalendar,
  countdown: IconClock,
  paymentPlan: IconCreditCard,
  floorPlans: IconStack2,
  locationMap: IconMap,
  agentCards: IconUsers,
  pressStrip: IconFileText,
  stickyWhatsAppCta: IconMessage,
  multiStepLeadForm: IconListNumbers,
  gatedDownload: IconLock,
  bookingBlock: IconCalendarEvent,
};

export const iconForSection = (type: LandingSectionType): IconComponent =>
  SECTION_ICON[type] ?? IconLayoutGrid;

// ── one-line collapsed summary (A1) ───────────────────────────────────────────
const rowCount = (props: Record<string, unknown>, key: string): number =>
  Array.isArray(props[key]) ? (props[key] as unknown[]).length : 0;

export const sectionSummary = (section: EditSection): string => {
  const { type, props } = section;
  switch (type) {
    case 'hero':
    case 'videoHero':
      return asStr(props.headline) || 'No headline yet';
    case 'uspGrid':
      return `${rowCount(props, 'items')} points`;
    case 'gallery':
      return `${rowCount(props, 'images')} images`;
    case 'paymentPlan':
      return `${rowCount(props, 'rows')} rows`;
    case 'countdown':
      return asStr(props.deadlineIso) || 'No deadline set';
    default: {
      const heading = asStr(props.heading) || asStr(props.label) || asStr(props.headline);
      return heading || sectionDef(type).label;
    }
  }
};

// ── image-ish field keys get the thumbnail + picker (A4 / B2 / C4) ────────────
// An image keyword AND a Src|Url suffix (or the bare `src` column). Tight on
// purpose so videoUrl / assetUrl / mapEmbedUrl / href don't sprout a picker.
export const isImageFieldKey = (key: string): boolean =>
  key === 'src' || (/(Src|Url)$/.test(key) && /(image|photo|logo|poster|og)/i.test(key));

// Resolve a stored value to something an <img> can load: absolute/data URLs pass
// through; a gateway path (/img/…) needs the site host prefixed. A relative
// non-path or a path with no host → null (render the dashed placeholder instead).
const resolveThumb = (value: string, sitePublicUrl: string): string | null => {
  const v = value.trim();
  if (v === '') return null;
  if (/^https?:\/\//i.test(v) || v.startsWith('data:')) return v;
  if (v.startsWith('/')) return sitePublicUrl ? `${sitePublicUrl}${v}` : null;
  return null;
};

// ── A4: an image field as a thumbnail + Change button + edit-URL expander ──────
export const ImageField = ({
  label,
  value,
  sitePublicUrl,
  projectName,
  onChange,
}: {
  label: string;
  value: string;
  sitePublicUrl: string;
  projectName?: string;
  onChange: (next: string) => void;
}) => {
  const [showUrl, setShowUrl] = useState(false);
  const [broken, setBroken] = useState(false);
  const src = resolveThumb(value, sitePublicUrl);
  const thumbSrc = broken ? null : src;
  // Provenance (I5): an /img/is/ gateway path is an AI-generated asset — flag it.
  const isAiGenerated = value.trim().startsWith('/img/is/');

  const placeholderStyle: CSSProperties = {
    position: 'relative',
    width: 56,
    height: 56,
    flexShrink: 0,
    borderRadius: 6,
    border: '1px dashed var(--mantine-color-gray-4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--mantine-color-dimmed)',
    overflow: 'hidden',
    background: 'var(--mantine-color-gray-0)',
  };

  return (
    <Box>
      <Text size="sm" fw={500} mb={4}>
        {label}
      </Text>
      <Group gap="xs" wrap="nowrap" align="center">
        <Box style={placeholderStyle}>
          {thumbSrc ? (
            <img
              src={thumbSrc}
              alt=""
              onError={() => setBroken(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <IconPhoto size={20} />
          )}
          {isAiGenerated ? (
            <Badge
              size="xs"
              color="grape"
              variant="filled"
              style={{ position: 'absolute', top: 2, left: 2, pointerEvents: 'none' }}
            >
              AI
            </Badge>
          ) : null}
        </Box>
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Group gap={6} wrap="nowrap">
            <MediaStudioModal
              sitePublicUrl={sitePublicUrl}
              fieldLabel={label}
              projectName={projectName}
              onPick={(path) => {
                setBroken(false);
                onChange(path);
              }}
            />
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              onClick={() => setShowUrl((s) => !s)}
            >
              {showUrl ? 'Hide URL' : 'Edit URL'}
            </Button>
          </Group>
          <Collapse in={showUrl}>
            <TextInput
              size="xs"
              placeholder="https://… or /img/…"
              value={value}
              onChange={(e) => {
                setBroken(false);
                onChange(e.currentTarget.value);
              }}
            />
          </Collapse>
        </Stack>
      </Group>
    </Box>
  );
};

// ── row-group editor (items / stats / quotes / faq …) ─────────────────────────
const RowsEditor = ({
  def,
  rows,
  onChange,
  sitePublicUrl,
  projectName,
}: {
  def: NonNullable<ReturnType<typeof sectionDef>['rows']>;
  rows: Record<string, string>[];
  onChange: (next: Record<string, string>[]) => void;
  sitePublicUrl: string;
  projectName?: string;
}) => (
  <Stack gap="xs">
    <Group justify="space-between">
      <Text size="sm" fw={500}>
        {def.label}
      </Text>
      <Button
        size="compact-xs"
        variant="light"
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
            <Button
              size="compact-xs"
              variant="subtle"
              color="red"
              onClick={() => onChange(rows.filter((_, i) => i !== ri))}
            >
              Remove
            </Button>
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
              ) : isImageFieldKey(col.key) ? (
                <ImageField
                  key={col.key}
                  label={col.label}
                  value={row[col.key] ?? ''}
                  sitePublicUrl={sitePublicUrl}
                  projectName={projectName}
                  onChange={(v) => {
                    const next = rows.slice();
                    next[ri] = { ...next[ri], [col.key]: v };
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

// ── the collapsible, drag-reorderable section row ─────────────────────────────
export interface SectionRowProps {
  section: EditSection;
  index: number;
  total: number;
  open: boolean;
  selected: boolean;
  sitePublicUrl: string;
  projectName?: string;
  dragOver: boolean;
  onToggle: () => void;
  onChange: (next: EditSection) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  // Stage 3B — target the click+tell instruction bar at this section.
  onInstruct: () => void;
  onHover: (hovering: boolean) => void;
  onDragStart: () => void;
  onDragEnterRow: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

export const SectionRow = ({
  section,
  index,
  total,
  open,
  selected,
  sitePublicUrl,
  projectName,
  dragOver,
  onToggle,
  onChange,
  onMove,
  onRemove,
  onInstruct,
  onHover,
  onDragStart,
  onDragEnterRow,
  onDrop,
  onDragEnd,
}: SectionRowProps) => {
  const def = sectionDef(section.type);
  const Icon = iconForSection(section.type);
  const setScalar = (key: string, value: string) =>
    onChange({ ...section, props: { ...section.props, [key]: value } });

  const stop = (fn: () => void) => (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    fn();
  };

  const borderStyle: CSSProperties = selected
    ? { borderColor: 'var(--mantine-color-red-6)', boxShadow: '0 0 0 1px var(--mantine-color-red-6)' }
    : dragOver
      ? { borderColor: 'var(--mantine-color-red-4)', borderStyle: 'dashed' }
      : {};

  return (
    <Paper
      withBorder
      radius="md"
      p={0}
      style={borderStyle}
      onDragOver={(e: DragEvent) => e.preventDefault()}
      onDragEnter={onDragEnterRow}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        onDrop();
      }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      {/* collapsed header — the whole strip toggles; the handle drags */}
      <Group
        gap="xs"
        wrap="nowrap"
        p="xs"
        style={{ cursor: 'pointer' }}
        onClick={onToggle}
      >
        <Box
          component="span"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onClick={stop(() => {})}
          aria-label="Drag to reorder"
          style={{ cursor: 'grab', display: 'flex', color: 'var(--mantine-color-dimmed)' }}
        >
          <IconGripVertical size={16} />
        </Box>
        <ThemeIcon size="sm" variant="light" color="red">
          <Icon size={14} />
        </ThemeIcon>
        <Box style={{ minWidth: 0, flex: 1 }}>
          <Text size="sm" fw={600} truncate>
            {def.label}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {sectionSummary(section)}
          </Text>
        </Box>
        <ActionIcon
          size="sm"
          variant="subtle"
          color="grape"
          aria-label="Instruct AI edit"
          title="Instruct — tell the AI what to change in this section"
          onClick={stop(onInstruct)}
        >
          <IconSparkles size={14} />
        </ActionIcon>
        <ActionIcon
          size="sm"
          variant="subtle"
          aria-label="Move up"
          disabled={index === 0}
          onClick={stop(() => onMove(-1))}
        >
          <IconArrowUp size={14} />
        </ActionIcon>
        <ActionIcon
          size="sm"
          variant="subtle"
          aria-label="Move down"
          disabled={index === total - 1}
          onClick={stop(() => onMove(1))}
        >
          <IconArrowDown size={14} />
        </ActionIcon>
        <ActionIcon
          size="sm"
          variant="subtle"
          color="red"
          aria-label="Remove section"
          onClick={stop(onRemove)}
        >
          <IconX size={14} />
        </ActionIcon>
        <IconChevronRight
          size={16}
          style={{
            color: 'var(--mantine-color-dimmed)',
            transition: 'transform 120ms ease',
            transform: open ? 'rotate(90deg)' : 'none',
          }}
        />
      </Group>

      <Collapse in={open}>
        <Box px="md" pb="md" pt={4}>
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
              ) : isImageFieldKey(f.key) ? (
                <ImageField
                  key={f.key}
                  label={f.label}
                  value={asStr(section.props[f.key])}
                  sitePublicUrl={sitePublicUrl}
                  projectName={projectName}
                  onChange={(v) => setScalar(f.key, v)}
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
                  onChange={(next) =>
                    onChange({ ...section, props: { ...section.props, [def.rows!.key]: next } })
                  }
                  sitePublicUrl={sitePublicUrl}
                  projectName={projectName}
                />
              </>
            ) : null}
          </Stack>
        </Box>
      </Collapse>
    </Paper>
  );
};

export default SectionRow;
