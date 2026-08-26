import { useCallback, useMemo, useState } from 'react';
import {
  Alert, Badge, Box, Button, Chip, Group, Modal, ScrollArea, SegmentedControl, Select,
  Skeleton, Stack, Text, Textarea,
} from '@mantine/core';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import type { RouteEnvelope } from '@/propel/offplan/types';
import { AgendaView } from './AgendaView';
import { MonthView } from './MonthView';
import { EventFormModal } from './EventFormModal';
import { useOffplanCalendar } from './useOffplanCalendar';
import { dayLabel, itemDayKey, type TypeFilter } from './calendarUtils';
import type { CalendarEventItem, CalendarItem, CalendarLaunchItem, MarketEventRecord } from './types';

// The Calendar tab — Off-Plan Launch Calendar v1 (founder-approved design
// 2026-08-27). UI promise, stated plainly: what changed · what expires · what is
// next. It informs; it does not rank. All bucketing/provenance/freshness logic is
// server-side; this component renders states and wires actions.

const WINDOW_OPTIONS = [
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
];

type CopyState = 'idle' | 'copying' | 'copied' | 'fallback';

export const OffplanCalendarTab = ({
  active, onOpenProject,
}: {
  active: boolean;
  /** Open the project drawer for a launch row (snapshot-based — drawer self-fetches). */
  onOpenProject: (item: CalendarLaunchItem) => void;
}) => {
  const cal = useOffplanCalendar(active);
  const [view, setView] = useState<'agenda' | 'month'>('agenda');
  const [typeFilter, setTypeFilter] = useState<Set<TypeFilter>>(new Set());
  const [dayFilter, setDayFilter] = useState<string | null>(null); // month "+N" → agenda for that day
  const [modal, setModal] = useState<{ editing: MarketEventRecord | null; prefillDay: string | null } | null>(null);
  const [deleting, setDeleting] = useState<CalendarEventItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [briefText, setBriefText] = useState<string | null>(null);

  const nowMs = Date.now();
  const payload = cal.payload;
  const canManage = payload?.canManage ?? false;

  const toggleType = (t: TypeFilter) =>
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const openEdit = useCallback(async (e: CalendarEventItem) => {
    // The agenda row carries a SUMMARY (notes truncated); edit needs the full record.
    const res = await callPropelRoute<RouteEnvelope<{ event: MarketEventRecord }>>(
      '/market-events',
      { action: 'detail', id: e.id },
    ).catch(() => null);
    if (res?.ok && res.data?.event) setModal({ editing: res.data.event, prefillDay: null });
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    await callPropelRoute('/market-events', { action: 'delete', id: deleting.id }).catch(() => null);
    setDeleteBusy(false);
    setDeleting(null);
    cal.retry();
  }, [deleting, cal]);

  const briefDisabled = useMemo(() => {
    if (!payload) return true;
    const s = payload.sections;
    return (
      s.justLaunched.length === 0 && s.closingSoon.length === 0 && s.next7.length === 0 && s.following14.length === 0
    );
  }, [payload]);

  const copyBrief = useCallback(async () => {
    setCopyState('copying');
    const res = await callPropelRoute<RouteEnvelope<{ text: string | null }>>(
      '/offplan/browse',
      { action: 'brief' },
    ).catch(() => null);
    const text = res?.ok ? res.data?.text ?? null : null;
    if (!text) {
      setCopyState('idle');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      // Clipboard API can be refused — fall back to a modal with the text
      // pre-selected so the manager can copy by hand.
      setBriefText(text);
      setCopyState('fallback');
    }
  }, []);

  // Month "+N" overflow / day-cell jump → the agenda filtered to that one day.
  const jumpToDay = useCallback((dayKey: string) => {
    setDayFilter(dayKey);
    setView('agenda');
  }, []);

  const openRef = useCallback(
    (ref: string) => {
      if (!payload) return;
      if (ref.startsWith('p:')) {
        const id = Number(ref.slice(2));
        const all: CalendarItem[] = [
          ...payload.sections.next7,
          ...payload.sections.following14,
          ...payload.sections.later.items,
        ];
        const item = all.find((i) => i.kind === 'launch' && i.projectExternalId === id) as CalendarLaunchItem | undefined;
        if (item) onOpenProject(item);
        return;
      }
      // e:<id> → jump to its agenda entry (inline expansion is the detail view).
      setView('agenda');
    },
    [payload, onOpenProject],
  );

  // Day-filtered sections (a client-side narrowing of already-bucketed data).
  const sections = useMemo(() => {
    if (!payload) return null;
    if (!dayFilter) return payload.sections;
    const s = payload.sections;
    const only = (items: CalendarItem[]) => items.filter((i) => itemDayKey(i, nowMs) === dayFilter);
    return {
      ...s,
      justLaunched: s.justLaunched.filter((i) => i.dayKey === dayFilter),
      closingSoon: s.closingSoon.filter((e) => itemDayKey(e, nowMs) === dayFilter),
      next7: only(s.next7),
      following14: only(s.following14),
      later: { count: only(s.later.items).length, items: only(s.later.items) },
      tbcGroups: s.tbcGroups.filter((g) => g.dayKey === dayFilter),
    };
  }, [payload, dayFilter, nowMs]);

  const allEmpty =
    sections !== null &&
    sections.justLaunched.length === 0 &&
    sections.closingSoon.length === 0 &&
    sections.next7.length === 0 &&
    sections.following14.length === 0 &&
    sections.later.count === 0 &&
    sections.tbcGroups.length === 0;

  // ── page-level states ─────────────────────────────────────────────────────
  if (cal.notEnabled) {
    return (
      <Box p="xl">
        <Text fw={600}>Calendar isn't enabled on this server yet</Text>
        <Text size="sm" c="dimmed" mt={4}>
          The server hasn't been updated with the calendar routes (or the off-plan data service isn't wired here).
        </Text>
      </Box>
    );
  }
  if (cal.loading && !payload) {
    return (
      <Stack gap={10} p="md" aria-busy>
        <Skeleton height={34} width="60%" />
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} height={44} />
        ))}
      </Stack>
    );
  }
  if (cal.error && !payload) {
    return (
      <Box p="xl">
        <Text fw={600}>Couldn't load the calendar</Text>
        <Text size="sm" c="dimmed" mt={4}>{cal.error}</Text>
        <Button mt="md" variant="default" onClick={cal.retry}>Retry</Button>
      </Box>
    );
  }
  if (!payload || !sections) return null;

  const fresh = payload.freshness;
  const src = payload.sources;

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* toolbar */}
      <Group gap={8} px="md" py={10} wrap="wrap" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <SegmentedControl
          size="xs"
          value={view}
          onChange={(v) => {
            setView(v as 'agenda' | 'month');
            setDayFilter(null);
          }}
          data={[
            { value: 'agenda', label: 'Agenda' },
            { value: 'month', label: 'Month' },
          ]}
        />
        <Chip.Group multiple value={[...typeFilter]} onChange={(vals) => setTypeFilter(new Set(vals as TypeFilter[]))}>
          <Group gap={6}>
            <Chip size="xs" value="LAUNCHES">Launches</Chip>
            <Chip size="xs" value="EVENTS">Developer events</Chip>
            <Chip size="xs" value="OFFERS">Offers &amp; EOI</Chip>
            <Chip size="xs" value="OTHER">Other</Chip>
          </Group>
        </Chip.Group>
        <Select
          size="xs"
          w={110}
          value={String(cal.windowDays)}
          onChange={(v) => v && cal.setWindowDays(Number(v))}
          data={WINDOW_OPTIONS}
          allowDeselect={false}
          comboboxProps={{ zIndex: 3000 }}
          aria-label="Date window"
        />
        {cal.refreshing && <Text size="xs" c="dimmed">refreshing…</Text>}
        <Box style={{ flex: 1 }} />
        {canManage && (
          <>
            <Button size="xs" variant="default" onClick={copyBrief} disabled={briefDisabled || copyState === 'copying'}
              title={briefDisabled ? 'Nothing in the brief window yet' : undefined}>
              {copyState === 'copied' ? 'Copied ✓' : 'Copy weekly brief'}
            </Button>
            <Button size="xs" onClick={() => setModal({ editing: null, prefillDay: null })}>+ Add event</Button>
          </>
        )}
        {fresh.state === 'green' && (
          <Text size="xs" c="teal" ff="monospace" title="Off-plan data freshness">● {fresh.label}</Text>
        )}
      </Group>

      {/* freshness / source banners — loud only when something is wrong */}
      {fresh.state === 'amber' && <Alert color="yellow" radius={0} py={8}>⚠ {fresh.label}</Alert>}
      {fresh.state === 'red' && <Alert color="red" radius={0} py={8}>⛔ {fresh.label}</Alert>}
      {fresh.state === 'unreachable' && <Alert color="gray" radius={0} py={8}>{fresh.label}</Alert>}
      {fresh.state !== 'unreachable' && (src.launchCalendar === 'error' || src.weekLaunches === 'error' || src.events === 'error') && (
        <Alert color="yellow" radius={0} py={8}>
          <Group gap={8}>
            <Text size="sm">
              Couldn't load{' '}
              {[
                src.weekLaunches === 'error' && 'recent launches',
                src.launchCalendar === 'error' && 'upcoming launches',
                src.events === 'error' && 'team events',
              ]
                .filter(Boolean)
                .join(' + ')}{' '}
              — the rest is up to date.
            </Text>
            <Button size="compact-xs" variant="default" onClick={cal.retry}>Retry</Button>
          </Group>
        </Alert>
      )}
      {payload.truncated && (
        <Alert color="yellow" radius={0} py={8}>
          Showing the first {view === 'agenda' ? 'batch of' : ''} launches only — narrow the window to see everything.
        </Alert>
      )}
      {dayFilter && (
        <Alert color="blue" radius={0} py={8}>
          <Group gap={8}>
            <Text size="sm">Showing {dayLabel(dayFilter)} only.</Text>
            <Button size="compact-xs" variant="default" onClick={() => setDayFilter(null)}>Show everything</Button>
          </Group>
        </Alert>
      )}

      {/* body */}
      <ScrollArea style={{ flex: 1, minHeight: 0 }}>
        {allEmpty ? (
          <Box p="xl" ta="center">
            {typeFilter.size > 0 || dayFilter ? (
              <>
                <Text fw={600}>No activity matches these filters</Text>
                <Button mt="md" variant="default" size="xs" onClick={() => { setTypeFilter(new Set()); setDayFilter(null); }}>
                  Clear filters
                </Button>
              </>
            ) : (
              <>
                <Text fw={600}>Nothing on the radar yet</Text>
                <Text size="sm" c="dimmed" mt={4}>
                  Launches appear automatically as the data syncs.
                  {canManage ? ' Add the first developer event or offer to get the team calendar going.' : ''}
                </Text>
                {canManage && (
                  <Button mt="md" size="xs" onClick={() => setModal({ editing: null, prefillDay: null })}>+ Add event</Button>
                )}
              </>
            )}
          </Box>
        ) : view === 'agenda' ? (
          <AgendaView
            sections={sections}
            nowMs={nowMs}
            typeFilter={typeFilter}
            canManage={canManage}
            onOpenLaunch={onOpenProject}
            onEdit={openEdit}
            onDelete={setDeleting}
          />
        ) : (
          <MonthView
            sections={sections}
            canManage={canManage}
            onJumpToDay={jumpToDay}
            onAddOnDay={(dayKey) => setModal({ editing: null, prefillDay: dayKey })}
            onOpenRef={openRef}
          />
        )}
      </ScrollArea>

      {/* modals */}
      <EventFormModal
        opened={modal !== null}
        editing={modal?.editing ?? null}
        prefillDay={modal?.prefillDay ?? null}
        onClose={() => setModal(null)}
        onSaved={cal.retry}
      />
      <Modal opened={deleting !== null} onClose={() => !deleteBusy && setDeleting(null)} title={<Text fw={700}>Delete event</Text>} centered zIndex={4000}>
        <Text size="sm">Delete "{deleting?.name}"? It can be restored by an admin if needed.</Text>
        <Group justify="flex-end" gap={8} mt="md">
          <Button variant="default" onClick={() => setDeleting(null)} disabled={deleteBusy}>Cancel</Button>
          <Button color="red" onClick={confirmDelete} loading={deleteBusy}>Delete</Button>
        </Group>
      </Modal>
      <Modal opened={copyState === 'fallback' && briefText !== null} onClose={() => setCopyState('idle')} title={<Text fw={700}>Copy the brief</Text>} centered zIndex={4000}>
        <Text size="sm" c="dimmed" mb={8}>Your browser blocked automatic copying — select and copy the text below.</Text>
        <Textarea value={briefText ?? ''} readOnly autosize minRows={6} maxRows={14} onFocus={(e) => e.currentTarget.select()} data-autofocus />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setCopyState('idle')}>Done</Button>
        </Group>
      </Modal>
    </Box>
  );
};
