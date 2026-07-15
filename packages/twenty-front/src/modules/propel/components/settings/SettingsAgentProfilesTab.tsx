import {
  Alert,
  Badge,
  Card,
  Center,
  Chip,
  Group,
  Loader,
  Select,
  Stack,
  TagsInput,
  Text,
  TextInput,
} from '@mantine/core';
import { useState } from 'react';
import { IconAlertTriangle } from 'twenty-ui/display';

import { useAgentProfiles } from '@/propel/hooks/useAgentProfiles';
import {
  AGENT_AVAILABILITY,
  AGENT_LANES,
  type AgentProfileMember,
} from '@/propel/types/settingsHub';

const toStringArray = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];

// One agent card. Areas + languages are open-vocab TagsInputs; availability is a
// Select; WhatsApp is a phone TextInput (the route validates/normalizes it). Lane
// qualifications are Chips (manager-only); pool memberships a TagsInput (manager).
const AgentCard = ({
  member,
  actingId,
  canEditAll,
  isSaving,
  onSave,
}: {
  member: AgentProfileMember;
  actingId: string | null;
  canEditAll: boolean;
  isSaving: boolean;
  onSave: (
    member: AgentProfileMember,
    patch: Partial<AgentProfileMember>,
  ) => void;
}) => {
  const isSelf = member.id === actingId;
  const editable = canEditAll || isSelf; // self-serve fields
  const managerFields = canEditAll; // lane-qual + pool-memberships

  const areas = toStringArray(member.agentAreas);
  const langs = toStringArray(member.agentLanguages);
  const lanes = toStringArray(member.agentLaneQualifications);
  const pools = toStringArray(member.agentPoolMemberships);

  // Local WhatsApp draft so we commit on blur (route normalizes/validates).
  const [waDraft, setWaDraft] = useState(member.agentWhatsApp ?? '');

  return (
    <Card
      withBorder
      radius="md"
      padding="md"
      style={{ opacity: isSaving ? 0.6 : 1 }}
    >
      <Group justify="space-between" align="center" mb="sm">
        <Group gap="xs">
          <Text fw={700}>{member.name}</Text>
          {isSelf && (
            <Badge size="xs" variant="light" color="gray">
              you
            </Badge>
          )}
        </Group>
        <Select
          w={170}
          placeholder="Availability…"
          disabled={!editable || isSaving}
          data={AGENT_AVAILABILITY}
          value={member.agentAvailability}
          onChange={(v) => onSave(member, { agentAvailability: v })}
          comboboxProps={{ zIndex: 5000 }}
        />
      </Group>

      <Group grow align="flex-start" gap="md">
        <TagsInput
          label="Areas"
          placeholder="Marina, JVC, Downtown"
          disabled={!editable || isSaving}
          value={areas}
          onChange={(next) => onSave(member, { agentAreas: next })}
          comboboxProps={{ zIndex: 5000 }}
        />
        <TagsInput
          label="Languages"
          placeholder="English, Arabic, Urdu"
          disabled={!editable || isSaving}
          value={langs}
          onChange={(next) => onSave(member, { agentLanguages: next })}
          comboboxProps={{ zIndex: 5000 }}
        />
      </Group>

      <TextInput
        mt="sm"
        label="WhatsApp (lead alerts)"
        placeholder="+9715xxxxxxxx"
        inputMode="tel"
        disabled={!editable || isSaving}
        value={waDraft}
        onChange={(e) => setWaDraft(e.currentTarget.value)}
        onBlur={() => {
          const next = waDraft.trim();
          if (next !== (member.agentWhatsApp ?? '').trim())
            onSave(member, { agentWhatsApp: next || null });
        }}
      />

      <Text size="xs" fw={600} c="dimmed" tt="uppercase" mt="sm" mb={6}>
        Lane qualifications{managerFields ? '' : ' (manager-set)'}
      </Text>
      <Chip.Group
        multiple
        value={lanes}
        onChange={(next) =>
          managerFields &&
          onSave(member, { agentLaneQualifications: next })
        }
      >
        <Group gap="xs">
          {AGENT_LANES.map((lane) => (
            <Chip
              key={lane}
              value={lane}
              size="xs"
              color="red"
              disabled={!managerFields || isSaving}
            >
              {lane}
            </Chip>
          ))}
        </Group>
      </Chip.Group>

      {managerFields && (
        <TagsInput
          mt="sm"
          label="Pool memberships (source keys)"
          placeholder="WHATSAPP, META"
          disabled={isSaving}
          value={pools}
          onChange={(next) => onSave(member, { agentPoolMemberships: next })}
          comboboxProps={{ zIndex: 5000 }}
        />
      )}
    </Card>
  );
};

export const SettingsAgentProfilesTab = () => {
  const { phase, error, members, actingId, canEditAll, savingId, save } =
    useAgentProfiles();
  const [filter, setFilter] = useState('');

  const shown = members.filter((m) =>
    m.name.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed" style={{ lineHeight: 1.5 }}>
        Areas, languages and availability feed the lead matcher; lane qualifications
        decide which company leads an agent can receive. The WhatsApp number is where
        a triage owner gets the new-pool-lead nudge and SLA-breach alerts.
        {!canEditAll &&
          ' You can edit your own areas, languages, availability and WhatsApp number.'}
      </Text>

      <TextInput
        placeholder="Filter agents…"
        value={filter}
        onChange={(e) => setFilter(e.currentTarget.value)}
      />

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
      ) : shown.length === 0 ? (
        <Text size="sm" c="dimmed">
          No agents match.
        </Text>
      ) : (
        <Stack gap="sm">
          {shown.map((m) => (
            <AgentCard
              key={m.id}
              member={m}
              actingId={actingId}
              canEditAll={canEditAll}
              isSaving={savingId === m.id}
              onSave={save}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
};
