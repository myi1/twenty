import { useState } from 'react';
import { ActionIcon, Anchor, Badge, Box, Button, Collapse, Group, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { OffplanHeroImage } from '@/propel/offplan/OffplanHeroImage';
import type { CalendarEventItem, CalendarItem, CalendarLaunchItem, CalendarSections } from './types';
import { aedShort, countdownLabel, dayLabel, eventTypeIcon, eventTypeLabel, matchesTypeFilter, type TypeFilter } from './calendarUtils';

// Agenda view — the default and the value. Render order is DECLARED in the design:
// Just launched (what changed) → Closing soon (what expires / what's on) →
// Next 7 days → Following 14 days → Later (collapsed) → Date TBC (collapsed).
// Empty sections are HIDDEN entirely (no empty-row graveyard); the page-level empty
// state lives in the tab. Launch rows open the project drawer; manual-event rows
// expand INLINE (notes, source, link; edit/delete for managers). Hover states use
// React state per the runtime-hero Emotion parent-selector gotcha.

const SectionHeader = ({ label, hint, accent }: { label: string; hint?: string; accent?: boolean }) => (
  <Group gap={8} px="md" pt={14} pb={4}>
    <Text size="xs" fw={700} tt="uppercase" lts="0.13em" c={accent ? 'yellow.5' : 'dimmed'} ff="monospace">
      {label}
    </Text>
    {hint && (
      <Text size="xs" c="dimmed" ff="monospace">
        — {hint}
      </Text>
    )}
  </Group>
);

const Row = ({ children, onClick, accent }: { children: React.ReactNode; onClick?: () => void; accent?: boolean }) => {
  const [hover, setHover] = useState(false);
  return (
    <UnstyledButton
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '9px 16px',
        paddingLeft: accent ? 13 : 16,
        borderTop: '1px solid var(--mantine-color-default-border)',
        borderLeft: accent ? '3px solid var(--mantine-color-yellow-6)' : undefined,
        background: hover ? 'var(--mantine-color-default-hover)' : undefined,
        cursor: onClick ? 'pointer' : 'default',
        textAlign: 'left',
      }}
    >
      {children}
    </UnstyledButton>
  );
};

const ProvenanceBadge = ({ item }: { item: CalendarLaunchItem }) => {
  if (item.provenance === 'FIRST_SEEN') {
    return <Badge size="sm" variant="light" color="blue">First seen {dayLabel(item.dayKey)}</Badge>;
  }
  if (item.provenance === 'ANNOUNCED_UNCONFIRMED') {
    return (
      <Tooltip label="The developer announced this date, but our data hasn't confirmed the launch yet">
        <Badge size="sm" variant="light" color="gray">Announced {dayLabel(item.dayKey)} — unconfirmed</Badge>
      </Tooltip>
    );
  }
  return <Badge size="sm" variant="light" color="gray">Announced for {dayLabel(item.dayKey)}</Badge>;
};

const LaunchRow = ({ item, withThumb, onOpen }: { item: CalendarLaunchItem; withThumb: boolean; onOpen: (i: CalendarLaunchItem) => void }) => (
  <Row onClick={() => onOpen(item)}>
    <Text size="xs" c="dimmed" ff="monospace" style={{ minWidth: 56, flexShrink: 0 }}>
      {dayLabel(item.dayKey)}
    </Text>
    {withThumb && (
      <Box style={{ width: 48, height: 36, flexShrink: 0, borderRadius: 6, overflow: 'hidden' }}>
        <OffplanHeroImage src={item.heroImageUrl} w={48} h={36} radius={6} alt={item.name} />
      </Box>
    )}
    <Box style={{ flex: 1, minWidth: 0 }}>
      <Text size="sm" fw={600} lineClamp={1}>{item.name}</Text>
      <Text size="xs" c="dimmed" lineClamp={1}>
        {item.developerName ?? 'Unknown developer'} · {item.districtName ?? 'Unknown district'}
      </Text>
    </Box>
    <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
      {item.minPrice !== null && <Badge size="sm" variant="light" color="green" ff="monospace">from {aedShort(item.minPrice)}</Badge>}
      <ProvenanceBadge item={item} />
      {item.handoverYear && <Badge size="sm" variant="light" color="gray">Handover {item.handoverYear}</Badge>}
    </Group>
  </Row>
);

const EventRow = ({
  item, nowMs, accent, canManage, onEdit, onDelete,
}: {
  item: CalendarEventItem;
  nowMs: number;
  accent?: boolean;
  canManage: boolean;
  onEdit: (e: CalendarEventItem) => void;
  onDelete: (e: CalendarEventItem) => void;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <Box>
      <Row accent={accent} onClick={() => setOpen((o) => !o)}>
        <Text size="sm" style={{ width: 26, textAlign: 'center', flexShrink: 0 }} aria-hidden>
          {eventTypeIcon[item.eventType]}
        </Text>
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={600} lineClamp={1}>{item.name}</Text>
          <Text size="xs" c="dimmed" lineClamp={1}>
            {eventTypeLabel[item.eventType]}
            {item.developerName ? ` · ${item.developerName}` : ''}
            {item.projectName ? ` · ${item.projectName}` : ''}
            {item.sourceNote ? ` · ${item.sourceNote}` : ''}
          </Text>
        </Box>
        <Badge size="sm" variant="light" color="yellow" ff="monospace" style={{ flexShrink: 0 }}>
          {countdownLabel(item, nowMs)}
        </Badge>
      </Row>
      <Collapse in={open}>
        <Box px={54} py={8} style={{ borderTop: '1px dashed var(--mantine-color-default-border)' }}>
          <Stack gap={6}>
            {item.notesSummary && <Text size="sm" c="dimmed">{item.notesSummary}</Text>}
            {item.url && (
              <Anchor href={item.url} target="_blank" rel="noopener noreferrer" size="sm">
                {item.url}
              </Anchor>
            )}
            {canManage && (
              <Group gap={8}>
                <Button size="compact-xs" variant="default" onClick={() => onEdit(item)}>Edit</Button>
                <Button size="compact-xs" variant="default" color="red" onClick={() => onDelete(item)}>Delete</Button>
              </Group>
            )}
          </Stack>
        </Box>
      </Collapse>
    </Box>
  );
};

const MixedRows = ({
  items, nowMs, canManage, onOpenLaunch, onEdit, onDelete,
}: {
  items: CalendarItem[];
  nowMs: number;
  canManage: boolean;
  onOpenLaunch: (i: CalendarLaunchItem) => void;
  onEdit: (e: CalendarEventItem) => void;
  onDelete: (e: CalendarEventItem) => void;
}) => (
  <>
    {items.map((i) =>
      i.kind === 'launch' ? (
        <LaunchRow key={`p:${i.projectExternalId}`} item={i} withThumb={false} onOpen={onOpenLaunch} />
      ) : (
        <EventRow key={`e:${i.id}`} item={i} nowMs={nowMs} canManage={canManage} onEdit={onEdit} onDelete={onDelete} />
      ),
    )}
  </>
);

export const AgendaView = ({
  sections, nowMs, typeFilter, canManage, onOpenLaunch, onEdit, onDelete,
}: {
  sections: CalendarSections;
  nowMs: number;
  typeFilter: Set<TypeFilter>;
  canManage: boolean;
  onOpenLaunch: (i: CalendarLaunchItem) => void;
  onEdit: (e: CalendarEventItem) => void;
  onDelete: (e: CalendarEventItem) => void;
}) => {
  const [laterOpen, setLaterOpen] = useState(false);
  const [tbcOpen, setTbcOpen] = useState(false);

  const f = (items: CalendarItem[]) => items.filter((i) => matchesTypeFilter(i, typeFilter));
  const justLaunched = f(sections.justLaunched) as CalendarLaunchItem[];
  const closingSoon = f(sections.closingSoon) as CalendarEventItem[];
  const next7 = f(sections.next7);
  const following14 = f(sections.following14);
  const later = f(sections.later.items);
  const showTbc = typeFilter.size === 0 || typeFilter.has('LAUNCHES');

  return (
    <Stack gap={0} pb="md">
      {justLaunched.length > 0 && (
        <Box>
          <SectionHeader label="Just launched" hint="last 14 days" />
          {justLaunched.map((i) => (
            <LaunchRow key={`p:${i.projectExternalId}`} item={i} withThumb onOpen={onOpenLaunch} />
          ))}
        </Box>
      )}
      {closingSoon.length > 0 && (
        <Box>
          <SectionHeader label="Closing soon" hint="next 7 days" accent />
          {closingSoon.map((e) => (
            <EventRow key={`e:${e.id}`} item={e} nowMs={nowMs} accent canManage={canManage} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </Box>
      )}
      {next7.length > 0 && (
        <Box>
          <SectionHeader label="Next 7 days" />
          <MixedRows items={next7} nowMs={nowMs} canManage={canManage} onOpenLaunch={onOpenLaunch} onEdit={onEdit} onDelete={onDelete} />
        </Box>
      )}
      {following14.length > 0 && (
        <Box>
          <SectionHeader label="Following 14 days" />
          <MixedRows items={following14} nowMs={nowMs} canManage={canManage} onOpenLaunch={onOpenLaunch} onEdit={onEdit} onDelete={onDelete} />
        </Box>
      )}
      {later.length > 0 && (
        <Box>
          <UnstyledButton onClick={() => setLaterOpen((o) => !o)} style={{ width: '100%' }} aria-expanded={laterOpen}>
            <Group justify="space-between" px="md" py={11} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
              <Text size="sm" c="dimmed"><Text span fw={600} c="var(--mantine-color-text)">Later</Text> — {later.length} more through the window</Text>
              <Text c="dimmed" aria-hidden>{laterOpen ? '▾' : '▸'}</Text>
            </Group>
          </UnstyledButton>
          <Collapse in={laterOpen}>
            <MixedRows items={later} nowMs={nowMs} canManage={canManage} onOpenLaunch={onOpenLaunch} onEdit={onEdit} onDelete={onDelete} />
          </Collapse>
        </Box>
      )}
      {showTbc && sections.tbcGroups.length > 0 && (
        <Box>
          <UnstyledButton onClick={() => setTbcOpen((o) => !o)} style={{ width: '100%' }} aria-expanded={tbcOpen}>
            <Group justify="space-between" px="md" py={11} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
              <Text size="sm" c="dimmed">
                <Text span fw={600} c="var(--mantine-color-text)">Date TBC</Text> — {sections.tbcGroups.reduce((n, g) => n + g.count, 0)} launches announced for "end of month" · dates not confirmed by the developer yet
              </Text>
              <Text c="dimmed" aria-hidden>{tbcOpen ? '▾' : '▸'}</Text>
            </Group>
          </UnstyledButton>
          <Collapse in={tbcOpen}>
            {sections.tbcGroups.map((g) => (
              <Box key={g.dayKey} px="xl" py={8} style={{ borderTop: '1px dashed var(--mantine-color-default-border)' }}>
                <Text size="xs" c="dimmed" ff="monospace" mb={4}>announced for {dayLabel(g.dayKey)}</Text>
                <Text size="sm" c="dimmed">{g.names.join(' · ')}</Text>
              </Box>
            ))}
          </Collapse>
        </Box>
      )}
    </Stack>
  );
};
