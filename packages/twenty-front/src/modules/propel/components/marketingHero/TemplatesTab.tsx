import {
  Badge,
  Box,
  Button,
  Card,
  Center,
  Group,
  Loader,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useState } from 'react';
import {
  IconMail,
  IconMessage,
  IconPlus,
  IconRefresh,
  IconTrash,
} from 'twenty-ui/icon';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { titleCase } from '@/propel/lib/campaignRows';
import {
  ALWAYS_AVAILABLE_MERGE_TAGS,
  CUSTOM_FIELD_KEY_RE,
  RESERVED_MERGE_KEYS,
} from '@/propel/lib/mergeTags';
import {
  type CustomFieldOption,
  type EmailTemplateOption,
  type MarketingHubPayload,
  type WaTemplateOption,
} from '@/propel/types/marketingHome';
import { GrapesEmailBuilder } from '@/propel/components/campaign/GrapesEmailBuilder';
import { WaTemplateModal } from './WaTemplateModal';

// Templates tab of the unified Marketing hero — the email + WhatsApp template
// catalog + the "Merge tags" sub-tab, ported from the legacy Marketing Cloud
// TemplatesView (marketing-cloud-templates.tsx) into Mantine. Cards carry an inline
// two-step delete control + (WhatsApp) a "Sync from Meta" button. Clicking an EMAIL
// card (or "New email template") opens the full-page GrapesJS + MJML editor in
// place (the one email editor everywhere — TM#50; the old EmailTemplateModal is
// retired). WhatsApp keeps its lightweight WaTemplateModal. The "Merge tags" filter
// shows the built-in merge-tag reference (ALWAYS_AVAILABLE_MERGE_TAGS) + the
// custom-fields CRUD manager (saved snippets). Routes reused:
//   • POST /marketing/delete-template
//   • POST /marketing/wa-template-sync
//   • POST /marketing/save-custom-field (merge tags manager)
//   • (modals) /marketing/save-email-template, /marketing/save-template,
//     /marketing/wa-template-create

type TplFilter = 'ALL' | 'EMAIL' | 'WHATSAPP' | 'CUSTOM';

const tplStatusTone = (status: string): 'green' | 'yellow' | 'red' | 'gray' => {
  if (status === 'APPROVED') return 'green';
  if (status === 'REJECTED') return 'red';
  if (status === 'SUBMITTED' || status === 'PAUSED') return 'yellow';
  return 'gray';
};

const snippet = (s: string, n = 220): string =>
  s.length > n ? `${s.slice(0, n).trimEnd()}…` : s;

// A WhatsApp template is locally deletable ONLY as a never-submitted DRAFT (DRAFT
// status + no metaTemplateId) — anything in Meta is managed there. Mirrors the
// route's server-side rule (waDeleteDecision).
const waDeletable = (t: WaTemplateOption): boolean =>
  t.status === 'DRAFT' &&
  (t.metaTemplateId === '' || t.metaTemplateId === undefined);

// Inline two-step delete control: "Delete → Delete? No / Yes".
const DeleteControl = ({
  onConfirm,
}: {
  onConfirm: () => Promise<boolean>;
}) => {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const doDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    const ok = await onConfirm();
    if (!ok) {
      setDeleting(false);
      setConfirming(false);
    }
    // on success the parent reload unmounts this card
  };

  if (!confirming) {
    return (
      <Button
        size="compact-xs"
        variant="subtle"
        color="red"
        leftSection={<IconTrash size={13} />}
        onClick={(e) => {
          e.stopPropagation();
          setConfirming(true);
        }}
      >
        Delete
      </Button>
    );
  }
  return (
    <Group gap={6} onClick={(e) => e.stopPropagation()}>
      <Text size="xs" c="dimmed">
        Delete?
      </Text>
      <Button
        size="compact-xs"
        variant="default"
        disabled={deleting}
        onClick={() => setConfirming(false)}
      >
        No
      </Button>
      <Button
        size="compact-xs"
        color="red"
        loading={deleting}
        onClick={() => void doDelete()}
      >
        Yes, delete
      </Button>
    </Group>
  );
};

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
        res?.operatorAction || res?.error || 'Could not save the custom field.',
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
        res?.operatorAction ||
          res?.error ||
          'Could not remove the custom field.',
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

// The "Merge tags" sub-tab: built-in reference (read-only) + custom-fields manager.
const MergeTagsView = ({
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

export const TemplatesTab = ({
  payload,
  isLoading,
  reload,
}: {
  payload: MarketingHubPayload | null;
  isLoading: boolean;
  reload: () => void;
}) => {
  const notify = usePropelToast();
  const [filter, setFilter] = useState<TplFilter>('ALL');
  const [syncing, setSyncing] = useState(false);
  const [waEdit, setWaEdit] = useState<WaTemplateOption | 'new' | null>(null);
  const [emailEdit, setEmailEdit] = useState<
    EmailTemplateOption | 'new' | null
  >(null);

  const waTemplates = payload?.waTemplates ?? [];
  const emailTemplates = payload?.emailTemplates ?? [];
  const customFields = payload?.customFields ?? [];

  const showEmail = filter === 'ALL' || filter === 'EMAIL';
  const showWa = filter === 'ALL' || filter === 'WHATSAPP';
  const visibleCount =
    (showEmail ? emailTemplates.length : 0) + (showWa ? waTemplates.length : 0);

  const deleteTemplate = async (
    templateId: string,
    channel: 'email' | 'whatsapp',
  ): Promise<boolean> => {
    const res = await callPropelRoute<{
      deleted?: boolean;
      error?: string;
      operatorAction?: string;
    }>('/marketing/delete-template', { templateId, channel });
    if (res === null || res.error !== undefined || res.deleted !== true) {
      notify(
        res?.operatorAction || res?.error || 'Could not delete the template.',
        'error',
      );
      return false;
    }
    notify('Template deleted.', 'success');
    reload();
    return true;
  };

  const onSync = async () => {
    if (syncing) return;
    setSyncing(true);
    const res = await callPropelRoute<{
      ok?: boolean;
      created?: number;
      updated?: number;
      paused?: number;
      error?: string;
      operatorAction?: string;
    }>('/marketing/wa-template-sync', {});
    setSyncing(false);
    if (res === null || res.error !== undefined || res.ok !== true) {
      notify(
        res?.operatorAction ||
          res?.error ||
          'Could not sync templates from Meta.',
        'error',
      );
      return;
    }
    const created = res.created ?? 0;
    const updated = res.updated ?? 0;
    const paused = res.paused ?? 0;
    const changed = created + updated + paused;
    notify(
      changed === 0
        ? 'Templates are already up to date with Meta.'
        : `Synced from Meta — ${created} new, ${updated} updated${paused ? `, ${paused} paused` : ''}.`,
      'success',
    );
    reload();
  };

  const newControl =
    filter === 'CUSTOM' ? null : filter === 'EMAIL' ? (
      <Button
        color="red"
        size="compact-sm"
        leftSection={<IconPlus size={14} />}
        onClick={() => setEmailEdit('new')}
      >
        New email template
      </Button>
    ) : filter === 'WHATSAPP' ? (
      <Button
        color="red"
        size="compact-sm"
        leftSection={<IconPlus size={14} />}
        onClick={() => setWaEdit('new')}
      >
        New WhatsApp template
      </Button>
    ) : (
      <Group gap="xs">
        <Button
          color="red"
          size="compact-sm"
          leftSection={<IconPlus size={14} />}
          onClick={() => setEmailEdit('new')}
        >
          New email
        </Button>
        <Button
          variant="default"
          size="compact-sm"
          leftSection={<IconPlus size={14} />}
          onClick={() => setWaEdit('new')}
        >
          New WhatsApp
        </Button>
      </Group>
    );

  if (isLoading && payload === null) {
    return (
      <Center mih={320}>
        <Loader color="red" />
      </Center>
    );
  }

  // Email templates now author in the full-page GrapesJS + MJML editor (the one
  // email editor everywhere — TM#50). Opening a card or "New email template"
  // swaps the grid for the editor in place; "Close" / a successful save returns
  // to the grid. WhatsApp templates keep their lightweight modal (no rich body).
  if (emailEdit !== null) {
    const seed = emailEdit === 'new' ? null : emailEdit;
    return (
      <Box
        p="md"
        style={{
          height: '100%',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Group justify="space-between" align="flex-end" mb="sm" wrap="wrap">
          <Stack gap={2}>
            <Title order={4}>
              {seed ? `Edit template — ${seed.name}` : 'New email template'}
            </Title>
            <Text size="sm" c="dimmed" maw={560}>
              Design the email by dragging blocks. Save it to reuse in any
              campaign.
            </Text>
          </Stack>
        </Group>
        <GrapesEmailBuilder
          mode="template"
          customFields={customFields}
          initial={
            seed
              ? {
                  id: seed.id,
                  name: seed.name,
                  subject: seed.subject,
                  bodyText: seed.bodyText,
                  languageCode: seed.languageCode === 'AR' ? 'AR' : 'EN',
                  // Seed the editor with the saved GrapesJS project JSON so the
                  // canvas restores the exact node graph (#59), not the starter.
                  designProjectJson: seed.designProjectJson,
                }
              : null
          }
          onSaved={() => {
            setEmailEdit(null);
            reload();
          }}
          onClose={() => setEmailEdit(null)}
        />
      </Box>
    );
  }

  return (
    <Box p="md">
      <Group justify="space-between" align="flex-end" mb="md" wrap="wrap">
        <Stack gap={2}>
          <Title order={4}>Templates</Title>
          <Text size="sm" c="dimmed" maw={560}>
            Reusable email copy and WhatsApp messages. Start a campaign from a
            saved template in the builder. Meta must approve a WhatsApp template
            before it can send.
          </Text>
        </Stack>
        <Group gap="xs" align="flex-end">
          {showWa ? (
            <Button
              variant="default"
              size="compact-sm"
              leftSection={<IconRefresh size={14} />}
              loading={syncing}
              onClick={() => void onSync()}
            >
              Sync from Meta
            </Button>
          ) : null}
          {newControl}
        </Group>
      </Group>

      <SegmentedControl
        mb="md"
        value={filter}
        onChange={(v) => setFilter(v as TplFilter)}
        data={[
          { label: 'All', value: 'ALL' },
          { label: 'Email', value: 'EMAIL' },
          { label: 'WhatsApp', value: 'WHATSAPP' },
          { label: 'Merge tags', value: 'CUSTOM' },
        ]}
      />

      {filter === 'CUSTOM' ? (
        <MergeTagsView payload={payload ?? {}} reload={reload} />
      ) : visibleCount === 0 ? (
        <Center mih={200}>
          <Stack align="center" gap={6} maw={400}>
            <Title order={5}>No templates yet</Title>
            <Text size="sm" c="dimmed" ta="center">
              Save reusable email copy and WhatsApp messages to start campaigns
              faster.
            </Text>
            <Box mt="xs">{newControl}</Box>
          </Stack>
        </Center>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {showEmail &&
            emailTemplates.map((t) => (
              <Card
                key={`e-${t.id}`}
                withBorder
                radius="md"
                padding="md"
                style={{ cursor: 'pointer' }}
                onClick={() => setEmailEdit(t)}
              >
                <Stack gap="xs">
                  <Group gap="xs" wrap="nowrap">
                    <IconMail size={16} color="var(--mantine-color-blue-6)" />
                    <Text size="sm" fw={600} truncate style={{ flex: 1 }}>
                      {t.name}
                    </Text>
                    <Badge size="xs" variant="light" color="gray">
                      {t.languageCode}
                    </Badge>
                  </Group>
                  {t.subject ? (
                    <Text size="xs" fw={600} c="dimmed" truncate>
                      {t.subject}
                    </Text>
                  ) : (
                    <Text size="xs" c="dimmed" fs="italic">
                      No subject
                    </Text>
                  )}
                  <Text
                    size="xs"
                    c="dimmed"
                    style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                  >
                    {snippet(t.bodyText) || 'Empty body'}
                  </Text>
                  <Group justify="flex-end" mt={4}>
                    <DeleteControl
                      onConfirm={() => deleteTemplate(t.id, 'email')}
                    />
                  </Group>
                </Stack>
              </Card>
            ))}
          {showWa &&
            waTemplates.map((t) => (
              <Card
                key={`w-${t.id}`}
                withBorder
                radius="md"
                padding="md"
                style={{ cursor: 'pointer' }}
                onClick={() => setWaEdit(t)}
              >
                <Stack gap="xs">
                  <Group gap="xs" wrap="nowrap">
                    <IconMessage
                      size={16}
                      color="var(--mantine-color-green-6)"
                    />
                    <Text
                      size="sm"
                      fw={600}
                      ff="monospace"
                      truncate
                      style={{ flex: 1 }}
                    >
                      {t.name}
                    </Text>
                    <Badge
                      size="xs"
                      variant="light"
                      color={tplStatusTone(t.status)}
                    >
                      {titleCase(t.status)}
                    </Badge>
                  </Group>
                  <Group gap={6}>
                    <Badge size="xs" variant="light" color="gray">
                      {t.languageCode}
                    </Badge>
                    <Badge size="xs" variant="light" color="gray">
                      {titleCase(t.category)}
                    </Badge>
                  </Group>
                  <Text
                    size="xs"
                    c="dimmed"
                    style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                  >
                    {t.bodyText}
                  </Text>
                  {t.status === 'REJECTED' && t.rejectionReason ? (
                    <Text size="xs" c="red">
                      Rejected: {t.rejectionReason}
                    </Text>
                  ) : null}
                  <Group justify="flex-end" mt={4}>
                    {waDeletable(t) ? (
                      <DeleteControl
                        onConfirm={() => deleteTemplate(t.id, 'whatsapp')}
                      />
                    ) : (
                      <Text size="xs" c="dimmed">
                        Managed in Meta
                      </Text>
                    )}
                  </Group>
                </Stack>
              </Card>
            ))}
        </SimpleGrid>
      )}

      {/* Email templates author in the full-page GrapesJS editor (handled by the
          early return above), not a modal. WhatsApp keeps its modal. */}
      {waEdit !== null ? (
        <WaTemplateModal
          initial={waEdit === 'new' ? null : waEdit}
          onClose={(changed) => {
            setWaEdit(null);
            if (changed) reload();
          }}
        />
      ) : null}
    </Box>
  );
};
