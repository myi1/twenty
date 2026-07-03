import {
  Badge,
  Box,
  Button,
  Checkbox,
  Group,
  Menu,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMemo, useState } from 'react';
import {
  IconClock,
  IconDownload,
  IconExternalLink,
  IconFilter,
  IconSend,
  IconUserPlus,
  IconUsers,
} from 'twenty-ui/display';
import {
  getSiteLeads,
  type SiteLeadRow,
  type SiteLeadSource,
  type SiteLeadStatus,
} from '@/propel/mocks/websiteMockData';
import { SlaAgeChip } from '@/propel/components/website/SlaAgeChip';
import { usePropelToast } from '@/propel/hooks/usePropelToast';

// Site leads sub-tab (Website tab, spec §6): a WORKING QUEUE, not a report — metric
// strip (this-week count, visit→lead %, median first-reply, SLA-breach count),
// filter row (source/campaign/status/search), a bulk-action bar that appears on
// selection (assign/add-to-campaign/export), and a row list with SLA-colored age
// chips, an inline assign dropdown, and an Open button.
//
// Mock-backed this wave (CONVENTIONS.md): local `useState` seeded from
// `getSiteLeads()`, mutated in place for "actions" so the UI feels interactive in a
// demo/QA pass. No route call, nothing persists across reload — the real
// `/marketing/website/site-leads`-shaped route is a later, separate task.
//
// A codebase-wide search for the "Move to lane" RECORD_SELECTION bulk-action
// launcher pattern (referenced by the founder as prior art) turned up no
// `mcp__propel__` usage of it under `modules/propel/**` in this fork worktree — it
// appears to be a Twenty-core record-table mechanism for real CRM objects
// (RECORD_SELECTION context store + a per-object launcher component), which doesn't
// apply to a mock-data table with no backing object/view. This bulk-action bar is a
// plain local-selection Mantine implementation instead (Checkbox column + a
// conditional action Paper), matching the "appears on selection" requirement without
// forcing a record-table mechanism onto non-record data. Flagged as a CONVENTIONS.md
// deviation — see the task handoff notes.

type SourceFilter = 'ALL' | SiteLeadSource;
type StatusFilter = 'ALL' | SiteLeadStatus;

const ASSIGNEE_OPTIONS = [
  'Ahmed Saeed',
  'Layla Hassan',
  'Omar Nasser',
  'Sara Al Farsi',
];

const STATUS_TONE: Record<SiteLeadStatus, 'blue' | 'yellow' | 'teal' | 'gray'> = {
  NEW: 'blue',
  CONTACTED: 'yellow',
  QUALIFIED: 'teal',
  LOST: 'gray',
};

const formatAed = (value: number): string =>
  `AED ${value.toLocaleString('en-US')}`;

const MetricCard = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'red' | 'teal';
}) => (
  <Paper withBorder radius="md" p="md">
    <Stack gap={4}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="xl" fw={700} c={tone}>
        {value}
      </Text>
    </Stack>
  </Paper>
);

export const SiteLeadsTab = () => {
  const notify = usePropelToast();
  const initial = useMemo(() => getSiteLeads(), []);
  const [rows, setRows] = useState<SiteLeadRow[]>(initial.rows);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [campaignFilter, setCampaignFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  const campaignOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.campaign) set.add(r.campaign);
    });
    return Array.from(set).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (sourceFilter !== 'ALL' && r.source !== sourceFilter) return false;
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (campaignFilter !== 'ALL' && r.campaign !== campaignFilter)
        return false;
      if (q.length > 0) {
        const hay = `${r.name} ${r.phone} ${r.sourceLabel} ${r.campaign ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, sourceFilter, statusFilter, campaignFilter, search]);

  const visitToLeadPct = 4.8; // mock derived ratio; no visits dataset joined this wave

  const allVisibleSelected =
    filteredRows.length > 0 &&
    filteredRows.every((r) => selected.has(r.id));

  const toggleAll = () => {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        filteredRows.forEach((r) => next.delete(r.id));
        return next;
      }
      const next = new Set(prev);
      filteredRows.forEach((r) => next.add(r.id));
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const assignOne = (id: string, assignee: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              assignee,
              status: r.status === 'NEW' ? 'CONTACTED' : r.status,
            }
          : r,
      ),
    );
    notify(`Assigned to ${assignee}`, 'success');
  };

  const bulkAssign = (assignee: string) => {
    setRows((prev) =>
      prev.map((r) =>
        selected.has(r.id)
          ? {
              ...r,
              assignee,
              status: r.status === 'NEW' ? 'CONTACTED' : r.status,
            }
          : r,
      ),
    );
    notify(`${selected.size} lead(s) assigned to ${assignee}`, 'success');
    setSelected(new Set());
  };

  const bulkAddToCampaign = () => {
    notify(`${selected.size} lead(s) added to a campaign`, 'success');
    setSelected(new Set());
  };

  const bulkExport = () => {
    notify(`Exporting ${selected.size} lead(s)…`, 'info');
    setSelected(new Set());
  };

  return (
    <Box p="md">
      <Group justify="space-between" align="flex-start" mb="md" wrap="nowrap">
        <Box>
          <Group gap={8} align="center">
            <IconUsers size={18} />
            <Title order={4}>Site leads</Title>
          </Group>
          <Text c="dimmed" size="sm" mt={2}>
            Every lead the website generates — a working queue, not a report.
          </Text>
        </Box>
      </Group>

      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md" mb="lg">
        <MetricCard label="This week" value={String(initial.metrics.totalLeads)} />
        <MetricCard label="Visit → lead" value={`${visitToLeadPct}%`} />
        <MetricCard
          label="Median first reply"
          value={`${initial.metrics.medianFirstReplyMinutes}m`}
          tone={
            initial.metrics.medianFirstReplyMinutes >
            initial.metrics.slaTargetMinutes
              ? 'red'
              : 'teal'
          }
        />
        <MetricCard
          label={`SLA breaches (${initial.metrics.slaTargetMinutes}m target)`}
          value={String(initial.metrics.breachCount)}
          tone={initial.metrics.breachCount > 0 ? 'red' : 'teal'}
        />
      </SimpleGrid>

      <Paper withBorder radius="md" p="md" mb="md">
        <Group gap="sm" align="flex-end" wrap="wrap">
          <Select
            label="Source"
            leftSection={<IconFilter size={14} />}
            data={[
              { value: 'ALL', label: 'All sources' },
              ...Object.entries(initial.rows.reduce<Record<string, string>>(
                (acc, r) => {
                  acc[r.source] = r.sourceLabel;
                  return acc;
                },
                {},
              )).map(([value, label]) => ({ value, label })),
            ]}
            value={sourceFilter}
            onChange={(v) => setSourceFilter((v as SourceFilter) ?? 'ALL')}
            allowDeselect={false}
            checkIconPosition="right"
            w={200}
          />
          <Select
            label="Campaign"
            data={[
              { value: 'ALL', label: 'All campaigns' },
              ...campaignOptions.map((c) => ({ value: c, label: c })),
            ]}
            value={campaignFilter}
            onChange={(v) => setCampaignFilter(v ?? 'ALL')}
            allowDeselect={false}
            checkIconPosition="right"
            w={200}
          />
          <Select
            label="Status"
            data={[
              { value: 'ALL', label: 'All statuses' },
              { value: 'NEW', label: 'New' },
              { value: 'CONTACTED', label: 'Contacted' },
              { value: 'QUALIFIED', label: 'Qualified' },
              { value: 'LOST', label: 'Lost' },
            ]}
            value={statusFilter}
            onChange={(v) => setStatusFilter((v as StatusFilter) ?? 'ALL')}
            allowDeselect={false}
            checkIconPosition="right"
            w={160}
          />
          <TextInput
            label="Search"
            placeholder="Name, phone, campaign…"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            w={220}
          />
        </Group>
      </Paper>

      {selected.size > 0 ? (
        <Paper withBorder radius="md" p="sm" mb="md" bg="red.0">
          <Group justify="space-between" wrap="wrap">
            <Text size="sm" fw={600}>
              {selected.size} selected
            </Text>
            <Group gap="xs">
              <Menu shadow="md" position="bottom-end">
                <Menu.Target>
                  <Button
                    size="xs"
                    variant="default"
                    leftSection={<IconUserPlus size={14} />}
                  >
                    Assign
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {ASSIGNEE_OPTIONS.map((a) => (
                    <Menu.Item key={a} onClick={() => bulkAssign(a)}>
                      {a}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
              <Button
                size="xs"
                variant="default"
                leftSection={<IconSend size={14} />}
                onClick={bulkAddToCampaign}
              >
                Add to campaign
              </Button>
              <Button
                size="xs"
                variant="default"
                leftSection={<IconDownload size={14} />}
                onClick={bulkExport}
              >
                Export
              </Button>
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
            </Group>
          </Group>
        </Paper>
      ) : null}

      {filteredRows.length === 0 ? (
        <Paper withBorder p="xl" radius="md" style={{ borderStyle: 'dashed' }}>
          <Stack align="center" gap="md">
            <Text c="dimmed" ta="center">
              No leads match the current filters.
            </Text>
          </Stack>
        </Paper>
      ) : (
        <Table
          striped
          highlightOnHover
          verticalSpacing="sm"
          horizontalSpacing="md"
          layout="auto"
          stickyHeader
        >
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={40}>
                <Checkbox
                  checked={allVisibleSelected}
                  indeterminate={
                    !allVisibleSelected &&
                    filteredRows.some((r) => selected.has(r.id))
                  }
                  onChange={toggleAll}
                  aria-label="Select all visible leads"
                />
              </Table.Th>
              <Table.Th>Lead</Table.Th>
              <Table.Th>Source</Table.Th>
              <Table.Th>Campaign</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>
                <Group gap={4}>
                  <IconClock size={13} />
                  Age
                </Group>
              </Table.Th>
              <Table.Th>Assignee</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filteredRows.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td>
                  <Checkbox
                    checked={selected.has(r.id)}
                    onChange={() => toggleOne(r.id)}
                    aria-label={`Select ${r.name}`}
                  />
                </Table.Td>
                <Table.Td>
                  <Text fw={600} size="sm">
                    {r.name}
                  </Text>
                  <Text c="dimmed" size="xs">
                    {r.phone}
                  </Text>
                  {r.estimatedValueAed !== null ? (
                    <Badge color="teal" variant="light" size="xs" mt={2}>
                      Est. {formatAed(r.estimatedValueAed)}
                    </Badge>
                  ) : null}
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{r.sourceLabel}</Text>
                  <Text c="dimmed" size="xs">
                    {r.pageSlug}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{r.campaign ?? '—'}</Text>
                </Table.Td>
                <Table.Td>
                  <Badge color={STATUS_TONE[r.status]} variant="light" radius="sm">
                    {r.status}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <SlaAgeChip
                    ageMinutes={r.slaAgeMinutes}
                    breached={r.slaBreached}
                    targetMinutes={initial.metrics.slaTargetMinutes}
                    ageLabel={r.createdLabel}
                  />
                </Table.Td>
                <Table.Td miw={180}>
                  <Select
                    data={ASSIGNEE_OPTIONS}
                    value={r.assignee}
                    placeholder="Unassigned"
                    clearable
                    searchable
                    checkIconPosition="right"
                    onChange={(v) => v !== null && assignOne(r.id, v)}
                  />
                </Table.Td>
                <Table.Td>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    rightSection={<IconExternalLink size={13} />}
                    onClick={() => notify('Opening in Inbox…', 'info')}
                  >
                    Open
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Box>
  );
};
