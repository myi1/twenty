import {
  Alert,
  Button,
  Card,
  Center,
  Group,
  Loader,
  MultiSelect,
  NumberInput,
  Select,
  Stack,
  Switch,
  Table,
  Text,
} from '@mantine/core';
import { IconAlertTriangle } from 'twenty-ui/display';

import { useLeadRoutingConfig } from '@/propel/hooks/useLeadRoutingConfig';
import {
  LEAD_ASSIGNMENT_MODES,
  LEAD_PIPELINES,
  LEAD_SLA_BEHAVIORS,
  type LeadConfigRow,
} from '@/propel/types/leadRouting';

// The Lead Sources tab — one row per leadSourceConfig, with in-place Mantine
// controls for assignment mode / pipeline / agent pool / SLA minutes / on-breach
// behavior / enabled. Reuses the existing useLeadRoutingConfig hook (which talks to
// the UNCHANGED /lead/source-config route). When there are no rows yet, offers the
// one-click "Seed default sources" action.

const toStringArray = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];

export const SettingsLeadSourcesTab = () => {
  const { phase, error, rows, agents, savingKey, seeding, saveRow, onSeed } =
    useLeadRoutingConfig();

  const agentData = agents.map((a) => ({ value: a.id, label: a.name }));

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed" style={{ lineHeight: 1.5 }}>
        How leads from each source are routed — who they go to, on what pipeline,
        and what happens when the response SLA is missed. One row per lead source.
      </Text>

      {error !== null && (
        <Alert
          color="red"
          variant="light"
          icon={<IconAlertTriangle size={16} />}
        >
          {error}
        </Alert>
      )}

      {phase === 'loading' ? (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      ) : rows.length === 0 ? (
        <Card withBorder radius="md" padding="lg">
          <Stack gap="sm" align="flex-start">
            <Text size="sm" c="dimmed" style={{ lineHeight: 1.5 }}>
              No source rows yet. Seed the defaults to start routing (Property
              Finder &amp; Bayut owner-locked, Meta &amp; WhatsApp round-robin, …).
            </Text>
            <Button
              color="red"
              size="sm"
              loading={seeding}
              onClick={() => void onSeed()}
            >
              Seed default sources
            </Button>
          </Stack>
        </Card>
      ) : (
        <Card withBorder radius="md" padding={0} style={{ overflowX: 'auto' }}>
          <Table verticalSpacing="sm" horizontalSpacing="md" striped highlightOnHover>
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
            <Table.Tbody>
              {rows.map((r: LeadConfigRow) => {
                const isSaving = savingKey === r.sourceKey;
                const pool = toStringArray(r.agentPool);
                return (
                  <Table.Tr key={r.id} style={{ opacity: isSaving ? 0.6 : 1 }}>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {r.name ?? r.sourceKey}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Select
                        w={160}
                        allowDeselect={false}
                        disabled={isSaving}
                        data={LEAD_ASSIGNMENT_MODES}
                        value={r.assignmentMode ?? 'MANUAL'}
                        onChange={(v) =>
                          v && void saveRow(r, { assignmentMode: v })
                        }
                        comboboxProps={{ zIndex: 5000 }}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Select
                        w={150}
                        allowDeselect={false}
                        disabled={isSaving}
                        data={LEAD_PIPELINES}
                        value={r.defaultPipeline ?? 'AUTO'}
                        onChange={(v) =>
                          v && void saveRow(r, { defaultPipeline: v })
                        }
                        comboboxProps={{ zIndex: 5000 }}
                      />
                    </Table.Td>
                    <Table.Td>
                      <MultiSelect
                        w={200}
                        searchable
                        clearable
                        disabled={isSaving}
                        placeholder="No agents"
                        nothingFoundMessage="No agents found"
                        data={agentData}
                        value={pool}
                        onChange={(next) =>
                          void saveRow(r, { agentPool: next })
                        }
                        comboboxProps={{ zIndex: 5000 }}
                      />
                    </Table.Td>
                    <Table.Td>
                      <NumberInput
                        w={80}
                        min={0}
                        allowDecimal={false}
                        allowNegative={false}
                        disabled={isSaving}
                        defaultValue={r.slaMinutes ?? 15}
                        onBlur={(e) => {
                          const n = parseInt(e.currentTarget.value, 10);
                          const next = Number.isFinite(n) ? n : 15;
                          if (next !== (r.slaMinutes ?? 15))
                            void saveRow(r, { slaMinutes: next });
                        }}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Select
                        w={150}
                        allowDeselect={false}
                        disabled={isSaving}
                        data={LEAD_SLA_BEHAVIORS}
                        value={r.slaBehavior ?? 'BOTH'}
                        onChange={(v) =>
                          v && void saveRow(r, { slaBehavior: v })
                        }
                        comboboxProps={{ zIndex: 5000 }}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Switch
                        color="red"
                        checked={Boolean(r.enabled)}
                        disabled={isSaving}
                        onChange={() =>
                          void saveRow(r, { enabled: !r.enabled })
                        }
                      />
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Card>
      )}
    </Stack>
  );
};
