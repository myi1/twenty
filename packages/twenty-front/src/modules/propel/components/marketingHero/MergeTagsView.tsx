import {
  Badge,
  Box,
  Button,
  Card,
  Center,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useState } from 'react';
import { IconPlus } from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { friendlyError } from '@/propel/lib/friendlyError';
import {
  ALWAYS_AVAILABLE_MERGE_TAGS,
  CUSTOM_FIELD_KEY_RE,
  RESERVED_MERGE_KEYS,
} from '@/propel/lib/mergeTags';
import {
  type CustomFieldOption,
  type MarketingHubPayload,
} from '@/propel/types/marketingHome';

// The "Merge tags & snippets" surface — the built-in merge-tag reference
// (read-only) + the custom-fields (saved snippets) CRUD manager. Lifted verbatim
// out of TemplatesTab (TM#50 dropped its 4th "Merge tags" segmented filter so the
// catalog stays a pure template list) and relocated into the Marketing Settings
// tab (TM#70), where governance config belongs. Writes still go through the same
// coordinator-gated route:
//   • POST /marketing/save-custom-field  (add / edit / remove a snippet)
// Every failure string is routed through friendlyError before it reaches a toast.

// ── Built-in merge tags — READ-ONLY "always available" reference. The
// per-recipient DEFAULT palette every send fills automatically, each with its
// friendly label + a plain-English hint of what real data it pulls from.
// Brand-blue pill mirrors the email composer's built-in insert chips. ──────────
const BuiltInMergeTags = () => (
  <Stack gap="md">
    <Text size="xs" c="dimmed" maw={540}>
      Always available — every email automatically fills these from the
      recipient, their assigned agent, and your office. Insert them from the
      composer; nothing to set up.
    </Text>
    <Stack gap="xs">
      {ALWAYS_AVAILABLE_MERGE_TAGS.map((t) => (
        <Card key={t.key} withBorder radius="md" padding="sm">
          <Group gap="md" wrap="nowrap">
            <Badge
              size="sm"
              variant="light"
              color="blue"
              styles={{
                label: { fontFamily: 'monospace', textTransform: 'none' },
              }}
            >
              {`{{${t.key}}}`}
            </Badge>
            <Box style={{ minWidth: 0, flex: 1 }}>
              <Text size="sm" truncate>
                {t.label}
              </Text>
              <Text size="xs" c="dimmed">
                {t.resolvesFrom}
              </Text>
            </Box>
          </Group>
        </Card>
      ))}
    </Stack>
  </Stack>
);

// Inline add/edit row for a custom field (saved snippet). Mirrors the route's gate
// (lowercase snake + not a reserved merge field) so the Save button can't offer a
// save the server will reject. Writes via /marketing/save-custom-field.
const CustomFieldEditorRow = ({
  initial,
  onCancel,
  onSaved,
}: {
  initial: CustomFieldOption | null;
  onCancel: () => void;
  onSaved: () => void;
}) => {
  const notify = usePropelToast();
  const [key, setKey] = useState(initial?.key ?? '');
  const [value, setValue] = useState(initial?.value ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [saving, setSaving] = useState(false);
  const isEdit = initial !== null;

  const trimmedKey = key.trim();
  const keyValid =
    CUSTOM_FIELD_KEY_RE.test(trimmedKey) &&
    !RESERVED_MERGE_KEYS.has(trimmedKey);
  const keyHint =
    trimmedKey === ''
      ? ''
      : RESERVED_MERGE_KEYS.has(trimmedKey)
        ? 'That name is a built-in merge field — pick another tag.'
        : !CUSTOM_FIELD_KEY_RE.test(trimmedKey)
          ? 'Lowercase letters, digits and underscores, starting with a letter.'
          : '';
  const canSave = keyValid && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const res = await callPropelRoute<{
      ok?: boolean;
      customFieldId?: string;
      error?: string;
      operatorAction?: string;
    }>('/marketing/save-custom-field', {
      ...(isEdit ? { customFieldId: initial.id } : {}),
      // an edit only sends the key when it changed (a stable key needn't re-validate)
      ...(!isEdit || trimmedKey !== initial.key ? { key: trimmedKey } : {}),
      value,
      label,
    });
    setSaving(false);
    if (
      res === null ||
      (res.error !== undefined && res.error !== '') ||
      res.customFieldId === undefined
    ) {
      notify(
        res?.operatorAction ||
          friendlyError(res?.error, 'save'),
        'error',
      );
      return;
    }
    notify(
      isEdit ? 'Custom field updated.' : 'Custom field created.',
      'success',
    );
    onSaved();
  };

  return (
    <Card withBorder radius="md" padding="md">
      <Stack gap="sm">
        <Group gap="md" grow align="flex-start">
          <TextInput
            label="Merge tag"
            value={key}
            onChange={(e) => setKey(e.currentTarget.value)}
            placeholder="office_phone"
            disabled={saving}
            styles={{ input: { fontFamily: 'monospace' } }}
            error={keyHint || undefined}
            description={
              keyHint
                ? undefined
                : `Used as {{${trimmedKey || 'tag'}}} in emails.`
            }
          />
          <TextInput
            label="Friendly name"
            value={label}
            onChange={(e) => setLabel(e.currentTarget.value)}
            placeholder="Office phone"
            disabled={saving}
          />
        </Group>
        <TextInput
          label="Value"
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          placeholder="+971 4 123 4567"
          disabled={saving}
        />
        <Group justify="space-between">
          <Button variant="default" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button
            color="red"
            onClick={() => void save()}
            loading={saving}
            disabled={!canSave}
          >
            {isEdit ? 'Save' : 'Add custom field'}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
};

// Custom fields manager — SAVED SNIPPETS (workspace-global {{key}} → fixed value,
// EMAIL only). A list with an inline add/edit row + inline delete confirm. Writes
// via /marketing/save-custom-field, then reload().
const CustomFieldsManager = ({
  payload,
  reload,
}: {
  payload: MarketingHubPayload;
  reload: () => void;
}) => {
  const notify = usePropelToast();
  const fields = payload.customFields ?? [];
  const [editing, setEditing] = useState<CustomFieldOption | 'new' | null>(
    null,
  );
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const remove = async (id: string) => {
    setRemovingId(id);
    const res = await callPropelRoute<{
      ok?: boolean;
      error?: string;
      operatorAction?: string;
    }>('/marketing/save-custom-field', { customFieldId: id, remove: true });
    setRemovingId(null);
    setConfirmingId(null);
    if (res === null || (res.error !== undefined && res.error !== '')) {
      notify(
        res?.operatorAction || friendlyError(res?.error, 'save'),
        'error',
      );
      return;
    }
    notify('Custom field removed.', 'success');
    reload();
  };

  return (
    <Stack gap="md">
      <Group align="flex-start" wrap="nowrap">
        <Text size="xs" c="dimmed" maw={540} style={{ flex: 1 }}>
          Saved snippets: name a merge tag once, give it a fixed value, and
          every email fills it automatically — so it’s never blank. For email
          only (WhatsApp uses numbered fields).
        </Text>
        {editing === null ? (
          <Button
            color="red"
            size="compact-sm"
            leftSection={<IconPlus size={14} />}
            onClick={() => setEditing('new')}
          >
            New custom field
          </Button>
        ) : null}
      </Group>

      {editing === 'new' ? (
        <CustomFieldEditorRow
          initial={null}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      ) : null}

      {fields.length === 0 && editing === null ? (
        <Center mih={140}>
          <Stack align="center" gap={6} maw={420}>
            <Title order={6}>No custom fields yet</Title>
            <Text size="sm" c="dimmed" ta="center">
              Add a saved snippet — like your office phone or address — and
              reuse it in any email with one tag.
            </Text>
          </Stack>
        </Center>
      ) : (
        <Stack gap="xs">
          {fields.map((f) =>
            editing !== 'new' && editing?.id === f.id ? (
              <CustomFieldEditorRow
                key={f.id}
                initial={f}
                onCancel={() => setEditing(null)}
                onSaved={() => {
                  setEditing(null);
                  reload();
                }}
              />
            ) : (
              <Card key={f.id} withBorder radius="md" padding="sm">
                <Group gap="md" wrap="nowrap">
                  <Badge
                    size="sm"
                    variant="light"
                    color="blue"
                    styles={{
                      label: { fontFamily: 'monospace', textTransform: 'none' },
                    }}
                  >
                    {`{{${f.key}}}`}
                  </Badge>
                  <Box style={{ minWidth: 0, flex: 1 }}>
                    <Text size="sm" truncate>
                      {f.value || (
                        <Text span c="dimmed" fs="italic" inherit>
                          No value
                        </Text>
                      )}
                    </Text>
                    {f.label ? (
                      <Text size="xs" c="dimmed">
                        {f.label}
                      </Text>
                    ) : null}
                  </Box>
                  {confirmingId === f.id ? (
                    <Group gap={6} wrap="nowrap">
                      <Text size="xs" c="dimmed">
                        Remove?
                      </Text>
                      <Button
                        size="compact-xs"
                        variant="default"
                        disabled={removingId === f.id}
                        onClick={() => setConfirmingId(null)}
                      >
                        No
                      </Button>
                      <Button
                        size="compact-xs"
                        color="red"
                        loading={removingId === f.id}
                        onClick={() => void remove(f.id)}
                      >
                        Yes, remove
                      </Button>
                    </Group>
                  ) : (
                    <Group gap={4} wrap="nowrap">
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        onClick={() => {
                          setConfirmingId(null);
                          setEditing(f);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        color="red"
                        onClick={() => setConfirmingId(f.id)}
                      >
                        Delete
                      </Button>
                    </Group>
                  )}
                </Group>
              </Card>
            ),
          )}
        </Stack>
      )}
    </Stack>
  );
};

// The "Merge tags" surface: built-in reference (read-only) + custom-fields manager.
export const MergeTagsView = ({
  payload,
  reload,
}: {
  payload: MarketingHubPayload;
  reload: () => void;
}) => (
  <Stack gap="xl">
    <Stack gap="sm">
      <Box>
        <Title order={5}>Built-in merge tags</Title>
        <Text size="sm" c="dimmed">
          Filled automatically on every send — read-only.
        </Text>
      </Box>
      <BuiltInMergeTags />
    </Stack>
    <Stack gap="sm">
      <Box>
        <Title order={5}>Your custom fields</Title>
        <Text size="sm" c="dimmed">
          Snippets you define once and reuse as merge tags in emails.
        </Text>
      </Box>
      <CustomFieldsManager payload={payload} reload={reload} />
    </Stack>
  </Stack>
);
