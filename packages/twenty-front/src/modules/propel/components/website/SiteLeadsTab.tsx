import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Checkbox,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconAlertTriangle,
  IconClock,
  IconDownload,
  IconExternalLink,
  IconFilter,
  IconRefresh,
  IconUsers,
} from 'twenty-ui/display';
import { useSiteLeads } from '@/propel/hooks/useSiteLeads';
import {
  ageMinutes,
  countBy,
  relativeAge,
  type RelationshipState,
  type SiteLead,
} from '@/propel/lib/websiteCrm';
import { SlaAgeChip } from '@/propel/components/website/SlaAgeChip';
import { usePropelToast } from '@/propel/hooks/usePropelToast';

// Site leads sub-tab (Website tab, spec §6): the working QUEUE of every lead the
// website generates — now backed by REAL CRM data (useSiteLeads → People where
// leadSource = WEBSITE, read with the agent's own token so propel-rls applies).
//
// Metric strip (this-week count, unassigned, median first-touch age, SLA breach
// count) + a filter row (form type / campaign / lifecycle / search) + a row list
// with SLA-colored age chips and a deep-link into each Person record. Bulk
// selection drives a real client-side CSV export (works offline, no route). Write
// actions (assign / add-to-campaign) are intentionally NOT here — they belong to
// manager-gated routes and land in a later wave (see WEBSITE-MARKETING-TAB-PLAN.md).

// Lead-system SLA target for first touch (LEAD-SYSTEM-SPEC §2 = 10 minutes).
const SLA_TARGET_MINUTES = 10;

type StatusFilter = 'ALL' | RelationshipState | 'UNASSIGNED';

const STATUS_TONE: Record<RelationshipState, string> = {
  PROSPECT: 'gray',
  ACTIVE: 'blue',
  CLIENT: 'green',
  ADVOCATE: 'grape',
  DORMANT: 'orange',
  LOST: 'red',
};

const STATUS_LABEL: Record<RelationshipState, string> = {
  PROSPECT: 'Prospect',
  ACTIVE: 'Active',
  CLIENT: 'Client',
  ADVOCATE: 'Advocate',
  DORMANT: 'Dormant',
  LOST: 'Lost',
};

const INTENT_TONE: Record<string, string> = {
  GENUINE: 'teal',
  BROWSER: 'yellow',
  NON_LEAD: 'gray',
  UNCLASSIFIED: 'gray',
};

const formatAed = (value: number): string =>
  `AED ${value.toLocaleString('en-US')}`;

const csvCell = (v: string | number | null): string => {
  const s = v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const exportLeadsCsv = (leads: SiteLead[]) => {
  const header = [
    'Name',
    'Phone',
    'Email',
    'Form',
    'Page',
    'Campaign',
    'UTM source',
    'Status',
    'Intent',
    'Assignee',
    'Created',
  ];
  const rows = leads.map((l) => [
    l.name,
    l.phone,
    l.email,
    l.formTypeLabel,
    l.pageSlug,
    l.utmCampaign,
    l.utmSource,
    l.relationshipState,
    l.leadIntent,
    l.assigneeName,
    l.createdAt,
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map(csvCell).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `site-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

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
  const navigate = useNavigate();
  const { phase, error, leads, metrics, reload } = useSiteLeads();

  const [formTypeFilter, setFormTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [campaignFilter, setCampaignFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const formTypeOptions = useMemo(
    () =>
      countBy(leads, (l) =>
        l.formType ? { key: l.formType, label: l.formTypeLabel } : null,
      ),
    [leads],
  );

  const campaignOptions = useMemo(
    () =>
      countBy(leads, (l) =>
        l.utmCampaign ? { key: l.utmCampaign, label: l.utmCampaign } : null,
      ),
    [leads],
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (formTypeFilter !== 'ALL' && l.formType !== formTypeFilter)
        return false;
      if (statusFilter === 'UNASSIGNED' && l.assigneeId !== null) return false;
      if (
        statusFilter !== 'ALL' &&
        statusFilter !== 'UNASSIGNED' &&
        l.relationshipState !== statusFilter
      )
        return false;
      if (campaignFilter !== 'ALL' && l.utmCampaign !== campaignFilter)
        return false;
      if (q.length > 0) {
        const hay =
          `${l.name} ${l.phone ?? ''} ${l.email ?? ''} ${l.pageSlug ?? ''} ${l.utmCampaign ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, formTypeFilter, statusFilter, campaignFilter, search]);

  const allVisibleSelected =
    filteredRows.length > 0 && filteredRows.every((r) => selected.has(r.id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filteredRows.forEach((r) => next.delete(r.id));
      else filteredRows.forEach((r) => next.add(r.id));
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

  const bulkExport = () => {
    const rows = filteredRows.filter((r) => selected.has(r.id));
    if (rows.length === 0) return;
    exportLeadsCsv(rows);
    notify(`Exported ${rows.length} lead(s) to CSV`, 'success');
    setSelected(new Set());
  };

  if (phase === 'loading') {
    return (
      <Center h={280}>
        <Loader color="red" />
      </Center>
    );
  }

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
        <Group gap="xs">
          <Button
            size="xs"
            variant="default"
            leftSection={<IconDownload size={14} />}
            onClick={() => {
              if (filteredRows.length === 0) return;
              exportLeadsCsv(filteredRows);
              notify(`Exported ${filteredRows.length} lead(s) to CSV`, 'success');
            }}
            disabled={filteredRows.length === 0}
          >
            Export all
          </Button>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconRefresh size={14} />}
            onClick={reload}
          >
            Refresh
          </Button>
        </Group>
      </Group>

      {error !== null ? (
        <Alert
          color="red"
          icon={<IconAlertTriangle size={16} />}
          variant="light"
          mb="md"
        >
          Couldn&apos;t load site leads: {error}
          <Button
            size="compact-xs"
            variant="subtle"
            color="red"
            ml="sm"
            onClick={reload}
          >
            Retry
          </Button>
        </Alert>
      ) : null}

      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md" mb="lg">
        <MetricCard label="This week" value={String(metrics.thisWeek)} />
        <MetricCard
          label="Unassigned"
          value={String(metrics.unassigned)}
          tone={metrics.unassigned > 0 ? 'red' : 'teal'}
        />
        <MetricCard
          label="Median wait (unworked)"
          value={
            metrics.medianAgeMinutesUnworked === null
              ? '—'
              : `${metrics.medianAgeMinutesUnworked}m`
          }
          tone={
            metrics.medianAgeMinutesUnworked !== null &&
            metrics.medianAgeMinutesUnworked > SLA_TARGET_MINUTES
              ? 'red'
              : 'teal'
          }
        />
        <MetricCard
          label={`SLA breaches (${SLA_TARGET_MINUTES}m target)`}
          value={String(metrics.slaBreaches)}
          tone={metrics.slaBreaches > 0 ? 'red' : 'teal'}
        />
      </SimpleGrid>

      <Paper withBorder radius="md" p="md" mb="md">
        <Group gap="sm" align="flex-end" wrap="wrap">
          <Select
            label="Form"
            leftSection={<IconFilter size={14} />}
            data={[
              { value: 'ALL', label: 'All forms' },
              ...formTypeOptions.map((o) => ({
                value: o.key,
                label: `${o.label} (${o.count})`,
              })),
            ]}
            value={formTypeFilter}
            onChange={(v) => setFormTypeFilter(v ?? 'ALL')}
            allowDeselect={false}
            checkIconPosition="right"
            w={220}
          />
          <Select
            label="Campaign"
            data={[
              { value: 'ALL', label: 'All campaigns' },
              ...campaignOptions.map((o) => ({
                value: o.key,
                label: `${o.label} (${o.count})`,
              })),
            ]}
            value={campaignFilter}
            onChange={(v) => setCampaignFilter(v ?? 'ALL')}
            allowDeselect={false}
            checkIconPosition="right"
            w={220}
          />
          <Select
            label="Status"
            data={[
              { value: 'ALL', label: 'All statuses' },
              { value: 'UNASSIGNED', label: 'Unassigned' },
              { value: 'PROSPECT', label: 'Prospect' },
              { value: 'ACTIVE', label: 'Active' },
              { value: 'CLIENT', label: 'Client' },
              { value: 'DORMANT', label: 'Dormant' },
              { value: 'LOST', label: 'Lost' },
            ]}
            value={statusFilter}
            onChange={(v) => setStatusFilter((v as StatusFilter) ?? 'ALL')}
            allowDeselect={false}
            checkIconPosition="right"
            w={170}
          />
          <TextInput
            label="Search"
            placeholder="Name, phone, email, page…"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            w={240}
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
              <Button
                size="xs"
                variant="default"
                leftSection={<IconDownload size={14} />}
                onClick={bulkExport}
              >
                Export CSV
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
          <Stack align="center" gap="xs">
            <Text c="dimmed" ta="center" fw={600}>
              {leads.length === 0
                ? 'No website leads yet.'
                : 'No leads match the current filters.'}
            </Text>
            <Text c="dimmed" ta="center" size="sm">
              {leads.length === 0
                ? 'Leads land here automatically when a form is submitted on remaxhub.ae.'
                : 'Try clearing a filter above.'}
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
              <Table.Th>Source page</Table.Th>
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
                    {r.phone ?? r.email ?? '—'}
                  </Text>
                  {r.estimatedValueAed !== null ? (
                    <Badge color="teal" variant="light" size="xs" mt={2}>
                      Est. {formatAed(r.estimatedValueAed)}
                    </Badge>
                  ) : null}
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{r.formTypeLabel}</Text>
                  <Text c="dimmed" size="xs">
                    {r.pageSlug ?? '—'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{r.utmCampaign ?? '—'}</Text>
                  {r.utmSource ? (
                    <Text c="dimmed" size="xs">
                      {r.utmSource}
                    </Text>
                  ) : null}
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    {r.relationshipState ? (
                      <Badge
                        color={STATUS_TONE[r.relationshipState]}
                        variant="light"
                        radius="sm"
                      >
                        {STATUS_LABEL[r.relationshipState]}
                      </Badge>
                    ) : (
                      <Badge color="gray" variant="light" radius="sm">
                        New
                      </Badge>
                    )}
                    {r.leadIntent && r.leadIntent !== 'GENUINE' ? (
                      <Tooltip
                        label={
                          r.leadIntent === 'BROWSER'
                            ? 'Nurture-only — content download, not agent-routed'
                            : r.leadIntent
                        }
                        withArrow
                      >
                        <Badge
                          color={INTENT_TONE[r.leadIntent] ?? 'gray'}
                          variant="dot"
                          radius="sm"
                          size="xs"
                        >
                          {r.leadIntent === 'BROWSER' ? 'Nurture' : r.leadIntent}
                        </Badge>
                      </Tooltip>
                    ) : null}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <SlaAgeChip
                    ageMinutes={ageMinutes(r.createdAt)}
                    breached={r.slaBreached}
                    targetMinutes={SLA_TARGET_MINUTES}
                    ageLabel={relativeAge(r.createdAt)}
                  />
                </Table.Td>
                <Table.Td>
                  {r.assigneeName ? (
                    <Text size="sm">{r.assigneeName}</Text>
                  ) : (
                    <Text size="sm" c="dimmed" fs="italic">
                      Unassigned
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    rightSection={<IconExternalLink size={13} />}
                    onClick={() => navigate(`/object/person/${r.id}`)}
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
