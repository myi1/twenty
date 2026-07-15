import { type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import styled from '@emotion/styled';
import {
  ActionIcon,
  Group,
  Loader,
  MultiSelect,
  RangeSlider,
  Select,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconFilter, IconSearch, IconSparkles } from 'twenty-ui/display';
import { ThemeContext } from 'twenty-ui/theme-constants';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { formatAed } from '@/propel/lib/formatMoney';
import { DUR, EASE, RADIUS, SPACE, Z } from '~/heroes/_pulse/pulse-tokens';
import { FONT_MONO, P, PulseFonts, PulseScope } from '~/heroes/_pulse/pulse';
import { compactFilterLabel } from './filterLabels';
import { quarterCutoffIso } from './handover';
import type { OffplanBrowseFilters, OffplanMapPoint } from './types';

// ─── Nocturne instrument bar (DESIGN.md §3) ──────────────────────────────────
// One coherent filter row: search left, labelled filter group, price popover,
// toggle chips, active-count + clear-all. All chrome rides the _pulse token
// ledger — no local hex, no local easing. Below NARROW_BELOW px the secondary
// filters collapse into a single "Filters" popover so the bar never wraps.

const PRICE_MAX = 20_000_000;
const PRICE_STEP = 100_000;
const CONTROL_H = 30;
const NARROW_BELOW = 1100;

const Bar = styled(PulseScope)`
  position: relative; /* anchors the "N filters · Clear all" cluster top-right */
  padding: ${SPACE[2]}px ${SPACE[3]}px;
  border-bottom: 1px solid var(--p-line);
`;

/** Quiet eyebrow above each control — so "District"/"Beds" aren't mystery boxes. */
const FieldLabel = styled.div`
  font-family: ${FONT_MONO};
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  line-height: 1;
  color: var(--p-ink-2);
  margin-bottom: 4px;
  white-space: nowrap;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
`;

/** Toggle chip — brass tint fill + brass hairline when active; press feel. */
const Chip = styled.button<{ $active?: boolean }>`
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  height: ${CONTROL_H}px;
  padding: 0 ${SPACE[3]}px;
  border-radius: var(--p-radius-pill);
  border: 1px solid ${({ $active }) => ($active ? 'var(--p-accent)' : 'var(--p-line)')};
  background: ${({ $active }) => ($active ? 'var(--p-accent-tint)' : 'transparent')};
  color: ${({ $active }) => ($active ? 'var(--p-ink)' : 'var(--p-ink-2)')};
  cursor: pointer;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  transition:
    transform ${DUR.press}ms ${EASE.out},
    background ${DUR.tooltip}ms ${EASE.out},
    border-color ${DUR.tooltip}ms ${EASE.out},
    color ${DUR.tooltip}ms ${EASE.out};
  &:active {
    transform: scale(0.97);
  }
  &:focus-visible {
    outline: none;
    box-shadow: var(--p-focus-ring);
  }
  @media (hover: hover) and (pointer: fine) {
    &:hover {
      color: var(--p-ink);
      border-color: color-mix(in srgb, var(--p-accent) 45%, var(--p-line));
    }
  }
  @media (prefers-reduced-motion: reduce) {
    &:active {
      transform: none;
    }
  }
`;

const ChipDot = styled.span<{ $active?: boolean }>`
  width: 6px;
  height: 6px;
  border-radius: var(--p-radius-pill);
  flex: none;
  background: ${({ $active }) => ($active ? 'var(--p-accent)' : 'var(--p-line)')};
  transition: background ${DUR.dropdown}ms ${EASE.out};
`;

/** Input-look trigger for the price popover; the active range reads as money
 *  (gold, mono) per the register rules. */
const PriceTrigger = styled.button<{ $active?: boolean }>`
  height: ${CONTROL_H}px;
  min-width: 104px;
  padding: 0 ${SPACE[2] + 2}px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: ${({ $active }) => ($active ? FONT_MONO : 'inherit')};
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: ${({ $active }) => ($active ? 'var(--p-accent-strong)' : 'var(--p-ink-2)')};
  background: var(--p-surface);
  border: 1px solid
    ${({ $active }) =>
      $active ? 'color-mix(in srgb, var(--p-accent) 45%, var(--p-line))' : 'var(--p-line)'};
  border-radius: var(--p-radius-sm);
  cursor: pointer;
  white-space: nowrap;
  transition:
    transform ${DUR.press}ms ${EASE.out},
    border-color ${DUR.tooltip}ms ${EASE.out},
    color ${DUR.tooltip}ms ${EASE.out};
  &:active {
    transform: scale(0.97);
  }
  &:focus-visible {
    outline: none;
    box-shadow: var(--p-focus-ring);
  }
  @media (hover: hover) and (pointer: fine) {
    &:hover {
      border-color: color-mix(in srgb, var(--p-accent) 45%, var(--p-line));
    }
  }
  @media (prefers-reduced-motion: reduce) {
    &:active {
      transform: none;
    }
  }
`;

const QuietBtn = styled.button`
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--p-ink-2);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--p-radius-sm);
  white-space: nowrap;
  transition: color ${DUR.tooltip}ms ${EASE.out};
  @media (hover: hover) and (pointer: fine) {
    &:hover {
      color: var(--p-accent);
    }
  }
  &:focus-visible {
    outline: none;
    box-shadow: var(--p-focus-ring);
  }
`;

// ⚠ Mantine's raw <Popover> is a no-go on the staging host: PopoverDropdown's
// Transition never leaves `display:none` (probed live 2026-07-11 with a minimal
// host-Mantine popover — content mounts, transition never enters; Combobox/
// Select/Tooltip are unaffected). So bar popovers are our own anchored panels:
// position:relative wrapper + absolute panel, _pulse enter motion, outside-click
// + Escape to dismiss. PulseScope re-declares the token ledger on the panel.
const PanelPop = styled(PulseScope)`
  position: absolute;
  top: calc(100% + 6px);
  z-index: ${Z.mantinePopover};
  background: var(--p-surface);
  border: 1px solid var(--p-line);
  border-radius: var(--p-radius);
  box-shadow: var(--p-shadow-pop);
  padding: ${SPACE[4]}px;
  @keyframes propelPopIn {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  animation: propelPopIn ${DUR.dropdown}ms ${EASE.out};
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

/** Anchored popover: trigger + panel in one relative wrapper. Dismiss on
 *  outside mousedown or Escape. `align` picks which trigger edge the panel
 *  hugs (right for controls near the bar's right edge). */
function BarPopover({
  trigger,
  open,
  onClose,
  align = 'left',
  width,
  light,
  children,
}: {
  trigger: ReactNode;
  open: boolean;
  onClose: () => void;
  align?: 'left' | 'right';
  width: number;
  light: boolean;
  children: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element;
      // Combobox option lists portal to <body> — clicking an option inside a
      // Select that lives in THIS panel must not read as an outside click.
      if (t.closest?.('.mantine-Popover-dropdown')) return;
      if (wrapRef.current && !wrapRef.current.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {trigger}
      {open && (
        <PanelPop $light={light} style={{ width, [align]: 0 }}>
          {children}
        </PanelPop>
      )}
    </div>
  );
}

// Mantine parts styled onto the token ledger. Every control stays one 30px
// instrument row. Mantine's searchable MultiSelect normally reserves a 100px
// input after selected pills, which wraps and grows the control vertically.
// Collapse that search field's minimum and keep the pill group on one line.
// Individual pills are hidden: the searchable input's placeholder carries one
// compact summary ("Emaar Properties +2") while the dropdown keeps full
// multi-select behaviour and checkmarks.
const selectInput = {
  fontFamily: 'inherit',
  fontSize: 12.5,
  background: 'var(--p-surface)',
  borderColor: 'var(--p-line)',
  borderRadius: RADIUS.sm,
  color: 'var(--p-ink)',
} as const;
const SELECT_STYLES = {
  input: { ...selectInput, height: CONTROL_H, minHeight: CONTROL_H },
} as const;
const MULTI_STYLES = {
  input: {
    ...selectInput,
    height: CONTROL_H,
    minHeight: CONTROL_H,
    maxHeight: CONTROL_H,
    overflow: 'hidden',
    paddingTop: 2,
    paddingBottom: 2,
  },
  pillsList: { flexWrap: 'nowrap', overflow: 'hidden', height: '100%' },
  pill: { display: 'none' },
  inputField: { minWidth: 8 },
} as const;

type AiFilters = {
  minPriceAed?: number | null;
  maxPriceAed?: number | null;
  bedrooms?: number | null;
  districtNames?: string[] | null;
  developerName?: string | null;
  handoverBeforeIso?: string | null;
  newLaunchOnly?: boolean | null;
  q?: string | null;
};

const uniq = (pairs: Array<[string, string]>) => {
  const m = new Map<string, string>();
  for (const [v, l] of pairs) if (v && !m.has(v)) m.set(v, l);
  return [...m].map(([value, label]) => ({ value, label }));
};

// Handover is a single "by Q<q> <year>" cutoff select (was two dropdowns);
// still emits the same exclusive-upper-bound handoverBeforeIso param.
const HANDOVER_OPTS = ['2026', '2027', '2028', '2029', '2030'].flatMap((y) =>
  ['1', '2', '3', '4'].map((q) => ({ value: `${y}-${q}`, label: `By Q${q} ${y}` })),
);

const BED_OPTS = [
  { value: '0', label: 'Studio' },
  { value: '1', label: '1 bedroom' },
  { value: '2', label: '2 bedrooms' },
  { value: '3', label: '3+ bedrooms' },
];

const PRICE_PRESETS: Array<{ label: string; range: [number, number] }> = [
  { label: 'Under 1M', range: [0, 1_000_000] },
  { label: '1M – 3M', range: [1_000_000, 3_000_000] },
  { label: '3M+', range: [3_000_000, PRICE_MAX] },
  { label: 'Any', range: [0, PRICE_MAX] },
];

function PriceEditor({
  draft,
  onDraft,
  onCommit,
}: {
  draft: [number, number];
  onDraft: (v: [number, number]) => void;
  onCommit: (v: [number, number]) => void;
}) {
  const [lo, hi] = draft;
  return (
    <div style={{ width: 280 }}>
      <FieldLabel>Price range · AED</FieldLabel>
      {/* Live bounds — money reads gold + mono (register rule: gold is money only). */}
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 13,
          fontVariantNumeric: 'tabular-nums',
          color: P.accentStrong,
          margin: `${SPACE[1] + 2}px 0 ${SPACE[3]}px`,
        }}
      >
        {lo > 0 ? formatAed(lo, { approx: true }) : 'Any'}
        {' — '}
        {hi >= PRICE_MAX ? 'no max' : formatAed(hi, { approx: true })}
      </div>
      <RangeSlider
        min={0}
        max={PRICE_MAX}
        step={PRICE_STEP}
        minRange={PRICE_STEP}
        value={draft}
        onChange={(v) => onDraft(v as [number, number])}
        onChangeEnd={(v) => onCommit(v as [number, number])}
        label={null}
        styles={{
          bar: { background: P.accent },
          thumb: { background: P.accent, borderColor: P.accent, width: 14, height: 14 },
          track: { '--slider-track-bg': P.line } as never,
        }}
      />
      <Group gap={SPACE[1]} mt={SPACE[3]} wrap="wrap">
        {PRICE_PRESETS.map(({ label, range }) => {
          const active = lo === range[0] && hi === range[1];
          return (
            <Chip
              key={label}
              type="button"
              $active={active}
              onClick={() => {
                onDraft(range);
                onCommit(range);
              }}
              style={{ height: 26, fontSize: 11.5 }}
            >
              {label}
            </Chip>
          );
        })}
      </Group>
    </div>
  );
}

export function OffplanFilters({
  points, filters, onChange, onBedChange,
}: {
  points: OffplanMapPoint[];
  filters: OffplanBrowseFilters;
  onChange: (patch: Partial<OffplanBrowseFilters>) => void;
  onBedChange: (min?: number, max?: number) => void;
}) {
  const { colorScheme } = useContext(ThemeContext);
  const light = colorScheme === 'light';

  const districtOptions = useMemo(() => uniq(points.map((p) => [p.districtId, p.districtName])), [points]);
  const developerOptions = useMemo(() => uniq(points.map((p) => [p.developerSlug ?? '', p.developerName ?? ''])), [points]);

  // Handover select value derives straight from the committed filter (so an
  // AI-applied handoverBeforeIso reflects in the control automatically).
  const handoverValue = useMemo(() => {
    const m = filters.handoverBeforeIso ? /^(\d{4})-(\d{2})/.exec(filters.handoverBeforeIso) : null;
    if (!m) return null;
    const v = `${m[1]}-${Math.floor((Number(m[2]) - 1) / 3) + 1}`;
    return HANDOVER_OPTS.some((o) => o.value === v) ? v : null;
  }, [filters.handoverBeforeIso]);
  const setHandover = (v: string | null) => {
    if (!v) return onChange({ handoverBeforeIso: undefined });
    const [y, q] = v.split('-');
    onChange({ handoverBeforeIso: quarterCutoffIso(Number(q), Number(y)) });
  };

  // Beds ride a controlled value so "Clear all" (and AI search) can reset it.
  const [bedsValue, setBedsValue] = useState<string | null>(null);
  const setBeds = (v: string | null) => {
    setBedsValue(v);
    onBedChange(v == null ? undefined : Number(v), undefined);
  };

  // Price draft: local while dragging, committed on release / preset click.
  const [priceDraft, setPriceDraft] = useState<[number, number]>([0, PRICE_MAX]);
  useEffect(() => {
    setPriceDraft([filters.minPriceAed ?? 0, filters.maxPriceAed ?? PRICE_MAX]);
  }, [filters.minPriceAed, filters.maxPriceAed]);
  const commitPrice = ([lo, hi]: [number, number]) =>
    onChange({
      minPriceAed: lo > 0 ? lo : undefined,
      maxPriceAed: hi >= PRICE_MAX ? undefined : hi,
    });
  const priceActive = filters.minPriceAed != null || filters.maxPriceAed != null;
  const priceLabel = !priceActive
    ? 'Any price'
    : filters.minPriceAed != null && filters.maxPriceAed != null
      ? `${formatAed(filters.minPriceAed)} – ${formatAed(filters.maxPriceAed)}`
      : filters.minPriceAed != null
        ? `From ${formatAed(filters.minPriceAed)}`
        : `Up to ${formatAed(filters.maxPriceAed)}`;
  const [priceOpen, setPriceOpen] = useState(false);

  // Collapse the secondary filters into one "Filters" popover on narrow bars.
  const barRef = useRef<HTMLDivElement | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setNarrow(w > 0 && w < NARROW_BELOW);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bedsActive = bedsValue != null || filters.projectIdAllowlist != null;
  const activeCount = [
    filters.districtIds.length > 0,
    filters.developerSlugs.length > 0,
    filters.handoverBeforeIso != null,
    bedsActive,
    priceActive,
    filters.newLaunchOnly,
    filters.stockedOnly,
  ].filter(Boolean).length;
  // Count badge on the collapsed "Filters" button covers only what it hides.
  const collapsedCount = [
    filters.districtIds.length > 0,
    filters.developerSlugs.length > 0,
    filters.handoverBeforeIso != null,
    bedsActive,
    priceActive,
  ].filter(Boolean).length;

  const clearAll = () => {
    setBedsValue(null);
    onBedChange(undefined, undefined);
    setPriceOpen(false);
    setPanelOpen(false);
    onChange({
      districtIds: [],
      developerSlugs: [],
      minPriceAed: undefined,
      maxPriceAed: undefined,
      handoverBeforeIso: undefined,
      newLaunchOnly: false,
      stockedOnly: false,
    });
  };

  // ✦ AI natural-language search: sends the free text to assist.aiSearch and
  // applies the STRUCTURED filters it extracts as hard client-side filters —
  // the AI never invents ids or numbers we don't map ourselves.
  const [aiBusy, setAiBusy] = useState(false);
  const [aiHidden, setAiHidden] = useState(false);
  const runAiSearch = async () => {
    const prompt = filters.q.trim();
    if (!prompt || aiBusy) return;
    setAiBusy(true);
    const districtNames = [...new Set(points.map((p) => p.districtName).filter(Boolean))].slice(0, 120);
    const res = await callPropelRoute<{ ok?: boolean; code?: string; filters?: AiFilters }>(
      '/offplan/assist',
      { action: 'aiSearch', prompt, districtNames },
    );
    setAiBusy(false);
    if (res?.ok && res.filters) {
      const f = res.filters;
      const wanted = new Set((f.districtNames ?? []).map((n) => n.toLowerCase()));
      const districtIds = [...new Set(
        points.filter((p) => wanted.has(p.districtName.toLowerCase())).map((p) => p.districtId),
      )];
      const devSlug = f.developerName
        ? points.find((p) => p.developerName?.toLowerCase() === f.developerName!.toLowerCase())?.developerSlug
        : null;
      onChange({
        q: f.q ?? '',
        districtIds,
        minPriceAed: f.minPriceAed ?? undefined,
        maxPriceAed: f.maxPriceAed ?? undefined,
        handoverBeforeIso: f.handoverBeforeIso ?? undefined,
        developerSlugs: devSlug ? [devSlug] : [],
        newLaunchOnly: f.newLaunchOnly === true,
      });
      // Reflect the AI's bed pick in the control when it maps to an option.
      const bedStr = f.bedrooms != null ? String(f.bedrooms) : null;
      setBedsValue(bedStr != null && BED_OPTS.some((o) => o.value === bedStr) ? bedStr : null);
      onBedChange(f.bedrooms ?? undefined, undefined);
    } else if (res?.code === 'AI_UNAVAILABLE') {
      setAiHidden(true);
    }
    // AI_PARSE_FAILED / null → silent fallback: the plain q filter already applies as typed.
  };

  const searchField = (
    <Field style={{ flex: '0 1 620px', minWidth: 320, maxWidth: 620 }}>
      <FieldLabel>Search</FieldLabel>
      <TextInput
        placeholder="Search project, developer or area…"
        value={filters.q}
        onChange={(e) => onChange({ q: e.currentTarget.value })}
        size="xs"
        styles={SELECT_STYLES}
        leftSection={<IconSearch size={14} color={P.ink2} />}
        rightSection={
          aiBusy ? (
            <Loader size={14} color={P.accent} />
          ) : !aiHidden && filters.q.trim() !== '' ? (
            <Tooltip label="Ask AI to turn this into filters">
              <ActionIcon variant="subtle" color="gray" onClick={() => void runAiSearch()}>
                <IconSparkles size={14} color={P.accent} />
              </ActionIcon>
            </Tooltip>
          ) : undefined
        }
      />
    </Field>
  );

  const selectFields = (inPanel: boolean) => {
    const w = (px: number) => (inPanel ? { w: '100%' } : { w: px });
    return (
      <>
        <Field>
          <FieldLabel>District</FieldLabel>
          <MultiSelect placeholder={compactFilterLabel(districtOptions, filters.districtIds, 'All districts')} data={districtOptions} value={filters.districtIds}
            onChange={(v) => onChange({ districtIds: v })} searchable clearable size="xs"
            styles={MULTI_STYLES} {...w(200)} />
        </Field>
        <Field>
          <FieldLabel>Developer</FieldLabel>
          <MultiSelect placeholder={compactFilterLabel(developerOptions, filters.developerSlugs, 'All developers')} data={developerOptions} value={filters.developerSlugs}
            onChange={(v) => onChange({ developerSlugs: v })} searchable clearable size="xs"
            styles={MULTI_STYLES} {...w(320)} />
        </Field>
        <Field>
          <FieldLabel>Handover</FieldLabel>
          <Select placeholder="Any date" data={HANDOVER_OPTS} value={handoverValue}
            onChange={setHandover} clearable size="xs" styles={SELECT_STYLES} {...w(150)} />
        </Field>
        <Field>
          <FieldLabel>Beds</FieldLabel>
          <Select placeholder="Any" data={BED_OPTS} value={bedsValue}
            onChange={setBeds} clearable size="xs" styles={SELECT_STYLES} {...w(inPanel ? 132 : 120)} />
        </Field>
      </>
    );
  };

  const priceControl = (
    <Field>
      <FieldLabel>Price</FieldLabel>
      <BarPopover
        width={280 + SPACE[4] * 2}
        align="right"
        light={light}
        open={priceOpen}
        onClose={() => setPriceOpen(false)}
        trigger={
          <PriceTrigger type="button" $active={priceActive} onClick={() => setPriceOpen((o) => !o)}>
            {priceLabel}
          </PriceTrigger>
        }
      >
        <PriceEditor draft={priceDraft} onDraft={setPriceDraft} onCommit={commitPrice} />
      </BarPopover>
    </Field>
  );

  const chips = (
    <>
      <Chip type="button" $active={filters.newLaunchOnly}
        onClick={() => onChange({ newLaunchOnly: !filters.newLaunchOnly })}>
        <ChipDot $active={filters.newLaunchOnly} />
        New launches
      </Chip>
      <Tooltip label="Projects currently marked available; detailed unit inventory may not be loaded for every developer">
        <Chip type="button" $active={filters.stockedOnly}
          onClick={() => onChange({ stockedOnly: !filters.stockedOnly })}>
          <ChipDot $active={filters.stockedOnly} />
          Available projects
        </Chip>
      </Tooltip>
    </>
  );

  // Filter status sits beside search on the first desktop row. Keeping it in
  // normal flow avoids collisions when the app shell changes the usable width.
  const clearCluster = activeCount > 0 && (
    <Group gap={2} wrap="nowrap" style={{ lineHeight: 1, flex: 'none' }}>
      <span style={{ fontSize: 11.5, color: P.ink2, whiteSpace: 'nowrap' }}>
        {activeCount} filter{activeCount === 1 ? '' : 's'}
      </span>
      <span style={{ color: P.line, fontSize: 11.5 }}>·</span>
      <QuietBtn type="button" onClick={clearAll} style={{ fontSize: 11.5, padding: '0 4px' }}>
        Clear all
      </QuietBtn>
    </Group>
  );

  return (
    <Bar ref={barRef} $light={light}>
      <PulseFonts />
      {narrow ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[2] }}>
          <Group gap={SPACE[2]} wrap="nowrap" align="flex-end">
            {searchField}
            <Field>
              <FieldLabel>Filters</FieldLabel>
              <BarPopover
                width={340}
                align="right"
                light={light}
                open={panelOpen}
                onClose={() => setPanelOpen(false)}
                trigger={
                  <PriceTrigger type="button" $active={collapsedCount > 0}
                    onClick={() => setPanelOpen((o) => !o)}
                    style={{ fontFamily: 'inherit', color: collapsedCount > 0 ? 'var(--p-ink)' : undefined }}>
                    <IconFilter size={14} color={collapsedCount > 0 ? P.accent : P.ink2} />
                    Filters
                    {collapsedCount > 0 && (
                      <span style={{
                        fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600, lineHeight: 1,
                        color: P.accent, background: P.accentTint,
                        border: `1px solid ${P.accent}`, borderRadius: RADIUS.pill,
                        padding: '2px 6px',
                      }}>
                        {collapsedCount}
                      </span>
                    )}
                  </PriceTrigger>
                }
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[3] }}>
                  {selectFields(true)}
                  <div style={{ borderTop: '1px solid var(--p-line)', paddingTop: SPACE[3] }}>
                    <PriceEditor draft={priceDraft} onDraft={setPriceDraft} onCommit={commitPrice} />
                  </div>
                </div>
              </BarPopover>
            </Field>
          </Group>
          <Group gap={SPACE[2]} wrap="nowrap" justify="space-between">
            <Group gap={SPACE[2]} wrap="nowrap">{chips}</Group>
            {clearCluster}
          </Group>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[2] }}>
          <Group gap={SPACE[2]} wrap="nowrap" align="flex-end">
            {searchField}
            <Group gap={SPACE[2]} wrap="nowrap">{chips}</Group>
            <div style={{ flex: 1 }} />
            {clearCluster}
          </Group>
          <Group gap={SPACE[2]} wrap="nowrap" align="flex-end">
            {selectFields(false)}
            {priceControl}
          </Group>
        </div>
      )}
    </Bar>
  );
}
