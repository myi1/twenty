import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Group,
  Loader,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useState } from 'react';
import {
  IconAlertTriangle,
  IconCheck,
  IconPencil,
  IconPlus,
  IconTrash,
} from 'twenty-ui/icon';

import { useCustomFields } from '@/propel/hooks/useCustomFields';
import {
  CREATABLE_FIELD_TYPES,
  fieldTypeLabel,
  validateNewFieldLabel,
} from '@/propel/lib/settingsHubConfig';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { type CustomField } from '@/propel/types/settingsHub';

// The Custom Fields tab — add / rename / remove a field on any lane object, in-app,
// surviving deploys. Built-in (Propel-owned) fields are locked with a badge; only
// user-created fields are editable. Automation-wired fields (stage / status /
// firstResponseTime / complianceStatus) carry a warning and a confirm-first gate
// (the route warns but never hard-blocks — founder directive). Reuses the UNCHANGED
// /settings/custom-fields route.

const FieldRow = ({
  field,
  object,
  canEdit,
  busy,
  onRename,
  onRemove,
}: {
  field: CustomField;
  object: string;
  canEdit: boolean;
  busy: boolean;
  onRename: (fieldId: string, label: string) => Promise<boolean>;
  onRemove: (fieldId: string) => Promise<void>;
}) => {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(field.label);
  // wired fields require a confirm click before rename/remove arms
  const [armed, setArmed] = useState(false);

  const locked = field.appOwned || !field.isCustom;
  const needsConfirm = field.automationWired;

  return (
    <Group
      justify="space-between"
      wrap="nowrap"
      gap="md"
      py="xs"
      style={{
        borderBottom: '1px solid var(--mantine-color-default-border)',
      }}
    >
      <Box style={{ flex: 1, minWidth: 0 }}>
        {renaming ? (
          <TextInput
            size="xs"
            w={260}
            autoFocus
            disabled={busy}
            value={draft}
            onChange={(e) => setDraft(e.currentTarget.value)}
          />
        ) : (
          <Group gap={8} wrap="wrap">
            <Text size="sm" fw={600}>
              {field.label}
            </Text>
            <Text size="xs" c="dimmed">
              {fieldTypeLabel(field.type)}
            </Text>
            {locked && (
              <Badge size="xs" variant="default" color="gray">
                Built-in
              </Badge>
            )}
            {field.automationWired && (
              <Tooltip label={field.warning} multiline w={280} withinPortal>
                <Badge
                  size="xs"
                  variant="light"
                  color="yellow"
                  leftSection={<IconAlertTriangle size={11} />}
                >
                  Automation
                </Badge>
              </Tooltip>
            )}
          </Group>
        )}
        {field.automationWired &&
          field.warning !== undefined &&
          !renaming && (
            <Text size="xs" c="yellow.7" mt={2} style={{ maxWidth: 560 }}>
              {field.warning}
            </Text>
          )}
        {needsConfirm && armed && !renaming && (
          <Text size="xs" c="red" mt={2}>
            This field powers automation. Editing it can silently break the SLA or
            pipeline. Click again to confirm.
          </Text>
        )}
      </Box>

      {canEdit && (
        <Group gap={4} wrap="nowrap" style={{ flex: 'none' }}>
          {renaming ? (
            <>
              <Button
                size="compact-xs"
                variant="light"
                disabled={busy}
                leftSection={<IconCheck size={13} />}
                onClick={async () => {
                  const ok = await onRename(field.id, draft);
                  if (ok) setRenaming(false);
                }}
              >
                Save
              </Button>
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                disabled={busy}
                onClick={() => {
                  setRenaming(false);
                  setDraft(field.label);
                }}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                disabled={busy || locked}
                leftSection={<IconPencil size={13} />}
                onClick={() => {
                  if (needsConfirm && !armed) {
                    setArmed(true);
                    return;
                  }
                  setArmed(false);
                  setDraft(field.label);
                  setRenaming(true);
                }}
              >
                Rename
              </Button>
              <Button
                size="compact-xs"
                variant="subtle"
                color="red"
                disabled={busy || locked}
                leftSection={<IconTrash size={13} />}
                onClick={async () => {
                  if (needsConfirm && !armed) {
                    setArmed(true);
                    return;
                  }
                  setArmed(false);
                  await onRemove(field.id);
                }}
              >
                Remove
              </Button>
            </>
          )}
        </Group>
      )}
    </Group>
  );
};

export const SettingsCustomFieldsTab = () => {
  const {
    phase,
    error,
    objects,
    canEdit,
    activeObject,
    setActiveObject,
    current,
    busy,
    createField,
    renameField,
    removeField,
  } = useCustomFields();
  const notify = usePropelToast();

  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState(CREATABLE_FIELD_TYPES[0].type);

  const onAdd = async () => {
    const v = validateNewFieldLabel(newLabel);
    if (!v.ok) {
      notify(v.error, 'error');
      return;
    }
    const res = await createField(activeObject, newLabel, newType);
    if (res?.ok === true) {
      setNewLabel('');
      setNewType(CREATABLE_FIELD_TYPES[0].type);
      notify('Field added.', 'success');
    }
  };

  // Object picker options — driven entirely by the route's response (real labels).
  const objectOptions = objects.map((o) => ({
    value: o.nameSingular,
    label: o.label,
  }));

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed" style={{ lineHeight: 1.55 }}>
        Add, rename, or remove fields on any pipeline lane — no developer, and they
        survive every deploy. Built-in fields are locked; the ones you add here are
        yours to manage.
      </Text>

      {objectOptions.length > 0 && (
        <Box style={{ overflowX: 'auto' }}>
          <SegmentedControl
            value={activeObject}
            onChange={setActiveObject}
            data={objectOptions}
          />
        </Box>
      )}

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
      ) : current === undefined ? (
        <Text size="sm" c="dimmed">
          Select a lane to manage its fields.
        </Text>
      ) : (
        <Card withBorder radius="md" padding="lg" style={{ opacity: busy ? 0.7 : 1 }}>
          {canEdit && (
            <Group
              align="flex-end"
              gap="sm"
              wrap="wrap"
              pb="md"
              mb="md"
              style={{
                borderBottom: '1px solid var(--mantine-color-default-border)',
              }}
            >
              <TextInput
                label="New field name"
                placeholder="e.g. Budget range"
                disabled={busy}
                style={{ flex: 1, minWidth: 200 }}
                value={newLabel}
                onChange={(e) => setNewLabel(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newLabel.trim()) void onAdd();
                }}
              />
              <Select
                label="Type"
                w={160}
                disabled={busy}
                allowDeselect={false}
                data={CREATABLE_FIELD_TYPES.map((t) => ({
                  value: t.type,
                  label: t.label,
                }))}
                value={newType}
                onChange={(v) => v && setNewType(v)}
                comboboxProps={{ zIndex: 5000 }}
              />
              <Button
                color="red"
                disabled={busy || !newLabel.trim()}
                leftSection={<IconPlus size={15} />}
                onClick={() => void onAdd()}
              >
                Add field
              </Button>
            </Group>
          )}

          {current.fields.length === 0 ? (
            <Text size="sm" c="dimmed">
              No editable fields on this lane yet.
            </Text>
          ) : (
            <Stack gap={0}>
              {current.fields.map((f) => (
                <FieldRow
                  key={f.id}
                  field={f}
                  object={activeObject}
                  canEdit={canEdit}
                  busy={busy}
                  onRename={async (fieldId, label) => {
                    const res = await renameField(activeObject, fieldId, label);
                    if (res?.ok === true) {
                      notify('Field renamed.', 'success');
                      return true;
                    }
                    return false;
                  }}
                  onRemove={async (fieldId) => {
                    const res = await removeField(activeObject, fieldId);
                    if (res?.ok === true) notify('Field removed.', 'success');
                  }}
                />
              ))}
            </Stack>
          )}

          {!canEdit && (
            <Text size="xs" c="dimmed" mt="md">
              A manager can add or change fields here.
            </Text>
          )}
        </Card>
      )}
    </Stack>
  );
};
