import {
  Box,
  Button,
  Card,
  Group,
  MultiSelect,
  NumberInput,
  Stack,
  Switch,
  Text,
} from '@mantine/core';

import {
  type SettingsField,
  type SettingsGroup,
  toIdArray,
} from '@/propel/lib/settingsHubConfig';
import { type ConfigRow, type Member } from '@/propel/types/settingsHub';

// One singleton-config card (used by the Lead Routing tab and each lane in the
// Lane Automations tab). Renders the group's fields as polished in-place Mantine
// controls — a NumberInput with a unit suffix + "(default N)" placeholder, a Switch
// for booleans, and a member MultiSelect for id-list fields (desk owners,
// escalation contacts, compliance authority). Every edit commits straight to the
// route via onSave (the parent hook is optimistic + resyncs on error).
//
// A group with no record yet shows the spec-default placeholders and a "Set up
// editable settings" button (managers only) that seeds the singleton row.

const fieldNumberValue = (raw: unknown): number | '' => {
  if (typeof raw === 'number') return raw;
  if (raw === null || raw === undefined || raw === '') return '';
  const n = Number(raw);
  return Number.isFinite(n) ? n : '';
};

const FieldRow = ({
  field,
  row,
  members,
  disabled,
  onSave,
}: {
  field: SettingsField;
  row: ConfigRow | null;
  members: Member[];
  disabled: boolean;
  onSave: (patch: Record<string, unknown>) => void;
}) => {
  const raw = row?.[field.name];

  const control = (() => {
    if (field.kind === 'number') {
      return (
        <Group gap="xs" wrap="nowrap" align="center">
          <NumberInput
            w={130}
            min={0}
            allowDecimal={false}
            allowNegative={false}
            disabled={disabled}
            placeholder={
              field.defaultValue != null ? `default ${field.defaultValue}` : ''
            }
            value={fieldNumberValue(raw)}
            // Commit on blur (and only when changed) so a half-typed value never saves.
            onBlur={(e) => {
              const text = e.currentTarget.value.trim();
              const next =
                text === '' ? null : Math.max(0, Math.round(Number(text)));
              const nextNorm =
                next != null && Number.isFinite(next) ? next : null;
              const current = typeof raw === 'number' ? raw : null;
              if (nextNorm !== current) onSave({ [field.name]: nextNorm });
            }}
          />
          {field.unit !== undefined && (
            <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {field.unit}
            </Text>
          )}
        </Group>
      );
    }
    if (field.kind === 'boolean') {
      const on = raw == null ? Boolean(field.defaultValue) : Boolean(raw);
      return (
        <Switch
          color="red"
          checked={on}
          disabled={disabled}
          onChange={(e) => onSave({ [field.name]: e.currentTarget.checked })}
        />
      );
    }
    // idList → member MultiSelect
    return (
      <MultiSelect
        w={280}
        searchable
        clearable
        disabled={disabled}
        placeholder="None set"
        nothingFoundMessage="No people found"
        data={members.map((m) => ({ value: m.id, label: m.name }))}
        value={toIdArray(raw)}
        onChange={(next) => onSave({ [field.name]: next })}
        comboboxProps={{ zIndex: 5000 }}
      />
    );
  })();

  return (
    <Group
      align="flex-start"
      justify="space-between"
      wrap="nowrap"
      gap="xl"
      py={4}
    >
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Text size="sm" fw={600}>
          {field.label}
        </Text>
        {field.help !== undefined && (
          <Text size="xs" c="dimmed" mt={2} style={{ lineHeight: 1.45 }}>
            {field.help}
          </Text>
        )}
      </Box>
      <Box style={{ flex: 'none' }}>{control}</Box>
    </Group>
  );
};

export const SettingsConfigGroupCard = ({
  group,
  row,
  members,
  canEdit,
  saving,
  onSave,
  onSeed,
}: {
  group: SettingsGroup;
  row: ConfigRow | null;
  members: Member[];
  canEdit: boolean;
  saving: boolean;
  onSave: (group: SettingsGroup, patch: Record<string, unknown>) => void;
  onSeed: () => void;
}) => {
  const exists = Boolean(row?.id);
  const disabled = !canEdit || saving;

  return (
    <Card
      withBorder
      radius="md"
      padding="lg"
      style={{ opacity: saving ? 0.7 : 1 }}
    >
      <Text fw={700} size="md">
        {group.title}
      </Text>
      <Text size="sm" c="dimmed" mt={4} mb="md" style={{ lineHeight: 1.5 }}>
        {group.blurb}
      </Text>

      {!exists ? (
        <Card withBorder radius="sm" padding="md" bg="var(--mantine-color-default-hover)">
          <Text size="sm" c="dimmed" mb={canEdit ? 'sm' : 0} style={{ lineHeight: 1.5 }}>
            This config has no editable record yet — it’s running on the built-in
            defaults. Set it up to start adjusting the values below.
          </Text>
          {canEdit ? (
            <Button
              variant="default"
              size="xs"
              loading={saving}
              onClick={onSeed}
            >
              Set up editable settings
            </Button>
          ) : (
            <Text size="xs" c="dimmed">
              A manager can set this up.
            </Text>
          )}
        </Card>
      ) : (
        <Stack gap="md">
          {group.fields.map((field) => (
            <FieldRow
              key={field.name}
              field={field}
              row={row}
              members={members}
              disabled={disabled}
              onSave={(patch) => onSave(group, patch)}
            />
          ))}
        </Stack>
      )}
    </Card>
  );
};
