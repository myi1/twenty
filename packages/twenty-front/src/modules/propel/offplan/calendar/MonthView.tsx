import { useMemo, useState } from 'react';
import { Badge, Box, Group, Text } from '@mantine/core';
import { Calendar, dateFnsLocalizer, type View } from 'react-big-calendar';
import format from 'date-fns/format';
import getDay from 'date-fns/getDay';
import enUS from 'date-fns/locale/en-US';
import parse from 'date-fns/parse';
import startOfWeek from 'date-fns/startOfWeek';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import type { CalendarSections, MarketEventType } from './types';
import { dayKeyToLocalDate, dayLabel } from './calendarUtils';

// Month view — Slice 1b, CONFIRMED DATES ONLY (approved Decision 3): only
// vendor-dated launches with real dates and manual events plot in cells; the
// "Date TBC" month-end placeholder group renders as a SHELF below the grid, never
// in a cell; detected "first seen" items stay agenda-only. Max 3 pills per cell,
// then "+N" jumps to the agenda filtered to that day (no popup — the agenda IS
// the detail view). Day-cell click prefills the add-event modal (managers).

// RBC ships light-theme defaults (pale-yellow .rbc-today, light-grey off-range,
// #ddd borders) that clash hard with the dark workspace — scoped overrides keyed
// off the wrapper class so nothing leaks to other RBC instances. Plain <style>,
// not Emotion parent-selectors (the runtime-hero gotcha).
const DARK_GRID_CSS = `
.propel-launch-cal .rbc-month-view, .propel-launch-cal .rbc-header,
.propel-launch-cal .rbc-day-bg, .propel-launch-cal .rbc-month-row {
  border-color: var(--mantine-color-default-border);
}
.propel-launch-cal .rbc-header {
  padding: 6px 8px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--mantine-color-dimmed);
}
.propel-launch-cal .rbc-off-range-bg { background: rgba(127, 127, 127, 0.06); }
.propel-launch-cal .rbc-off-range .rbc-button-link { color: var(--mantine-color-dimmed); opacity: 0.5; }
.propel-launch-cal .rbc-today { background: rgba(216, 164, 88, 0.08); }
.propel-launch-cal .rbc-now .rbc-button-link { color: var(--mantine-color-yellow-5); font-weight: 700; }
.propel-launch-cal .rbc-date-cell { padding: 4px 6px; font-size: 11.5px; }
.propel-launch-cal .rbc-show-more { color: var(--mantine-color-blue-4); background: transparent; }
.propel-launch-cal .rbc-toolbar button {
  color: var(--mantine-color-text); border-color: var(--mantine-color-default-border); background: transparent;
}
.propel-launch-cal .rbc-toolbar button:hover { background: var(--mantine-color-default-hover); }
.propel-launch-cal .rbc-toolbar button.rbc-active { background: var(--mantine-color-default-hover); box-shadow: none; }
`;

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { 'en-US': enUS },
});

const VIEWS: View[] = ['month'];

type PlotEvent = {
  title: string;
  start: Date;
  end: Date;
  allDay: true;
  resource: { type: 'launch' | MarketEventType; ref: string };
};

const PILL_COLORS: Record<string, { bg: string; fg: string }> = {
  launch: { bg: 'var(--mantine-color-green-light)', fg: 'var(--mantine-color-green-light-color)' },
  DEVELOPER_EVENT: { bg: 'var(--mantine-color-violet-light)', fg: 'var(--mantine-color-violet-light-color)' },
  OFFER: { bg: 'var(--mantine-color-yellow-light)', fg: 'var(--mantine-color-yellow-light-color)' },
  EOI_DEADLINE: { bg: 'var(--mantine-color-orange-light)', fg: 'var(--mantine-color-orange-light-color)' },
  OTHER: { bg: 'var(--mantine-color-gray-light)', fg: 'var(--mantine-color-gray-light-color)' },
};

const TYPE_GLYPH: Record<string, string> = {
  launch: '🏗',
  DEVELOPER_EVENT: '📅',
  OFFER: '⏳',
  EOI_DEADLINE: '⏳',
  OTHER: '📌',
};

export const MonthView = ({
  sections, canManage, onJumpToDay, onAddOnDay, onOpenRef,
}: {
  sections: CalendarSections;
  canManage: boolean;
  /** "+N" overflow → the agenda filtered to that day (no popup). */
  onJumpToDay: (dayKey: string) => void;
  onAddOnDay: (dayKey: string) => void;
  onOpenRef: (ref: string) => void;
}) => {
  const [date, setDate] = useState(new Date());

  const events = useMemo<PlotEvent[]>(
    () =>
      sections.monthPlot.map((p) => {
        const start = dayKeyToLocalDate(p.dayKey);
        // RBC treats `end` as EXCLUSIVE for all-day spans — plus one day so the
        // final day of a multi-day event renders (inclusive-end semantics).
        const endKey = p.endDayKey ?? p.dayKey;
        const end = dayKeyToLocalDate(endKey);
        end.setDate(end.getDate() + 1);
        return { title: p.label, start, end, allDay: true, resource: { type: p.type, ref: p.ref } };
      }),
    [sections.monthPlot],
  );

  const localKey = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return (
    <Box p="md" className="propel-launch-cal" style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, flex: 1 }}>
      <style>{DARK_GRID_CSS}</style>
      {/* react-big-calendar needs a DEFINITE height — `height:'100%'` against a
          min-height-only parent computes to auto and the grid collapses to ~26px
          (staging QA catch). 560px scrolls inside the tab's ScrollArea. */}
      <Box style={{ height: 560, flexShrink: 0 }}>
        <Calendar<PlotEvent>
          localizer={localizer}
          events={events}
          views={VIEWS}
          view="month"
          date={date}
          onNavigate={setDate}
          popup={false}
          onShowMore={(_evts, showMoreDate) => onJumpToDay(localKey(showMoreDate))}
          messages={{ showMore: (n) => `+${n} — see day` }}
          onSelectEvent={(e) => onOpenRef(e.resource.ref)}
          onSelectSlot={canManage ? (slot) => onAddOnDay(localKey(slot.start)) : undefined}
          selectable={canManage}
          eventPropGetter={(e) => {
            const c = PILL_COLORS[e.resource.type] ?? PILL_COLORS.OTHER;
            return { style: { backgroundColor: c.bg, color: c.fg, border: 'none', fontSize: 11.5, fontWeight: 600 } };
          }}
          components={{
            event: ({ event }) => (
              <span>
                <span aria-hidden>{TYPE_GLYPH[event.resource.type] ?? ''} </span>
                {event.title}
              </span>
            ),
          }}
          style={{ height: '100%' }}
        />
      </Box>
      {sections.tbcGroups.length > 0 && (
        <Group
          gap={8}
          p="sm"
          style={{ borderTop: '1px solid var(--mantine-color-default-border)', flexWrap: 'wrap' }}
        >
          <Badge variant="light" color="yellow">Date TBC</Badge>
          <Text size="sm" c="dimmed" style={{ flex: 1, minWidth: 240 }}>
            {sections.tbcGroups.reduce((n, g) => n + g.count, 0)} launches announced for "
            {sections.tbcGroups.map((g) => dayLabel(g.dayKey)).join(' / ')}" — dates not confirmed by the
            developer yet, so they don't get a grid spot: {sections.tbcGroups.flatMap((g) => g.names).slice(0, 6).join(' · ')}
            {sections.tbcGroups.reduce((n, g) => n + g.count, 0) > 6 ? ' +more' : ''}
          </Text>
        </Group>
      )}
    </Box>
  );
};
