import {
  Alert,
  Box,
  Button,
  Center,
  Group,
  Loader,
  MultiSelect,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useMemo } from 'react';
import {
  IconAlertTriangle,
  IconArrowsSplit2,
  IconRefresh,
} from 'twenty-ui/display';
import {
  LEAD_ASSIGNMENT_MODES,
  LEAD_PIPELINES,
  LEAD_SLA_BEHAVIORS,
  type LeadConfigRow,
} from '@/propel/types/leadRouting';
import { friendlyError } from '@/propel/lib/friendlyError';
import { useLeadRoutingConfig } from '@/propel/hooks/useLeadRoutingConfig';

// Lead Routing tab of the unified Marketing hero (Lead Engine S3) — manager/admin
// only (gated at the hero level by useViewerRole; every write is also fail-closed
// server-side). A full-width Mantine rebuild of the legacy app-sandbox front-
// component (propel-crm-integration src/front-components/lead-source-config.tsx),
// which lived in a cramped Cmd-K side-drawer with horizontal scroll. Same 7 columns
// and the same gated routes (/lead/source-config read + flat upsert, /seed), just
// rendered with real Mantine controls (Select / MultiSelect / NumberInput / Switch)
// and the full hero width — so the agent-pool picker is an inline MultiSelect rather
// than the old popover, and nothing scrolls sideways.

const toStringArray = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];

export const LeadRoutingTab = () => {
  const {
    phase,
    error,
    rows,
    agents,
    savingKey,
    seeding,
    reload,
    saveRow,
    onSeed,
  } = useLeadRoutingConfig();

  // Agent options for the pool MultiSelect — value = workspaceMember id, label =
  // name (+ availability hint when present). Built once per agent roster change.
  const agentOptions = useMemo(
    () =>
      agents.map((a) => ({
        value: a.id,
        label: a.availability
          ? `${a.name} · ${a.availability.toLowerCase()}`
          : a.name,
      })),
    [agents],
  );

  const renderRow = (r: LeadConfigRow) => {
    const pool = toStringArray(r.agentPool);
    const isSaving = savingKey === r.sourceKey;
    return (
      <Table.Tr key={r.id} opacity={isSaving ? 0.6 : 1}>
        <Table.Td>
          <Text fw={600} size="sm">
            {r.name ?? r.sourceKey}
          </Text>
          {r.sourceKey && r.name ? (
            <Text c="dimmed" size="xs">
              {r.sourceKey}
            </Text>
          ) : null}
        </Table.Td>

        <Table.Td>
          <Select
            data={LEAD_ASSIGNMENT_MODES}
            value={r.assignmentMode ?? 'MANUAL'}
            disabled={isSaving}
            allowDeselect={false}
            checkIconPosition="right"
            onChange={(v) =>
              v !== null && void saveRow(r, { assignmentMode: v })
            }
          />
        </Table.Td>

        <Table.Td>
          <Select
            data={LEAD_PIPELINES}
            value={r.defaultPipeline ?? 'AUTO'}
            disabled={isSaving}
            allowDeselect={false}
            checkIconPosition="right"
            onChange={(v) =>
              v !== null && void saveRow(r, { defaultPipeline: v })
            }
          />
        </Table.Td>

        <Table.Td miw={240}>
          <MultiSelect
            data={agentOptions}
            value={pool}
            disabled={isSaving}
            placeholder={pool.length === 0 ? 'No agents' : undefined}
            searchable
            clearable
            nothingFoundMessage="No agents"
            onChange={(v) => void saveRow(r, { agentPool: v })}
          />
        </Table.Td>

        <Table.Td w={110}>
          <NumberInput
            value={r.slaMinutes ?? 15}
            min={0}
            disabled={isSaving}
            allowNegative={false}
            clampBehavior="strict"
            hideControls
            onChange={(value) => {
              const n =
                typeof value === 'number'
                  ? value
                  : parseInt(String(value), 10);
              void saveRow(r, { slaMinutes: Number.isFinite(n) ? n : 15 });
            }}
          />
        </Table.Td>

        <Table.Td>
          <Select
            data={LEAD_SLA_BEHAVIORS}
            value={r.slaBehavior ?? 'BOTH'}
            disabled={isSaving}
            allowDeselect={false}
            checkIconPosition="right"
            onChange={(v) =>
              v !== null && void saveRow(r, { slaBehavior: v })
            }
          />
        </Table.Td>

        <Table.Td w={90}>
          <Switch
            color="red"
            checked={Boolean(r.enabled)}
            disabled={isSaving}
            aria-label="Toggle enabled"
            onChange={(event) =>
              void saveRow(r, { enabled: event.currentTarget.checked })
            }
          />
        </Table.Td>
      </Table.Tr>
    );
  };

  return (
    // Vertical scroll is now owned by the SHARED hero shell (MarketingHero's
    // Tabs.Panel is the single flex:1 / overflowY:auto scroll region), so this body
    // just flows naturally — no per-tab `calc(100vh - 168px)` box (that would nest a
    // second scroller inside the panel's). Plain padded Box; the panel scrolls it.
    <Box p="md">
      <Group justify="space-between" align="flex-start" mb="md" wrap="nowrap">
        <Box>
          <Group gap={8} align="center">
            <IconArrowsSplit2 size={18} />
            <Title order={4}>Lead Routing</Title>
          </Group>
          <Text c="dimmed" size="sm" mt={2}>
            One row per lead source — assignment, agent pool, SLA, and pipeline.
          </Text>
        </Box>
        <Button
          size="xs"
          variant="default"
          leftSection={<IconRefresh size={14} />}
          onClick={() => void reload()}
          disabled={phase === 'loading'}
        >
          Refresh
        </Button>
      </Group>

      {error ? (
        <Alert
          color="red"
          icon={<IconAlertTriangle size={16} />}
          mb="md"
          variant="light"
        >
          {friendlyError(error, 'load')}
        </Alert>
      ) : null}

      {phase === 'loading' ? (
        <Center h={240}>
          <Loader color="red" />
        </Center>
      ) : null}

      {phase !== 'loading' && rows.length === 0 ? (
        <Paper
          withBorder
          p="xl"
          radius="md"
          style={{ borderStyle: 'dashed' }}
        >
          <Stack align="center" gap="md">
            <Text c="dimmed" ta="center" maw={460}>
              No source rows yet. Seed the defaults to start routing (Property
              Finder &amp; Bayut owner-locked, Meta &amp; WhatsApp round-robin,
              …).
            </Text>
            <Button
              color="red"
              loading={seeding}
              onClick={() => void onSeed()}
            >
              Seed default sources
            </Button>
          </Stack>
        </Paper>
      ) : null}

      {phase !== 'loading' && rows.length > 0 ? (
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
              <Table.Th>Source</Table.Th>
              <Table.Th>Assignment</Table.Th>
              <Table.Th>Pipeline</Table.Th>
              <Table.Th>Pool</Table.Th>
              <Table.Th>SLA min</Table.Th>
              <Table.Th>On breach</Table.Th>
              <Table.Th>Enabled</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{rows.map(renderRow)}</Table.Tbody>
        </Table>
      ) : null}
    </Box>
  );
};
