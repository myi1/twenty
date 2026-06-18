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
  Title,
} from '@mantine/core';
import { useState } from 'react';
import {
  IconMail,
  IconMessage,
  IconPlus,
  IconRefresh,
  IconTrash,
} from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { titleCase } from '@/propel/lib/campaignRows';
import {
  type EmailTemplateOption,
  type MarketingHubPayload,
  type WaTemplateOption,
} from '@/propel/types/marketingHome';
import { EmailTemplateModal } from './EmailTemplateModal';
import { WaTemplateModal } from './WaTemplateModal';

// Templates tab of the unified Marketing hero — the email + WhatsApp template
// catalog, ported from the legacy Marketing Cloud TemplatesView
// (marketing-cloud-templates.tsx) into Mantine. Cards carry an inline two-step
// delete control + (WhatsApp) a "Sync from Meta" button; clicking a card opens the
// editor modal (EmailTemplateModal / WaTemplateModal). Routes reused:
//   • POST /marketing/delete-template
//   • POST /marketing/wa-template-sync
//   • (modals) /marketing/save-email-template, /marketing/save-template,
//     /marketing/wa-template-create
//
// SCOPED OUT vs legacy: the "Merge tags" sub-tab (built-in merge tags reference +
// the custom-fields manager via /marketing/save-custom-field) is NOT ported here.
// The email editor still offers custom-field snippets as insert chips; only the
// management UI for them is deferred. See the TODO at the bottom.

type TplFilter = 'ALL' | 'EMAIL' | 'WHATSAPP';

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
  t.status === 'DRAFT' && (t.metaTemplateId === '' || t.metaTemplateId === undefined);

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
  const [emailEdit, setEmailEdit] = useState<EmailTemplateOption | 'new' | null>(
    null,
  );

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
        res?.operatorAction || res?.error || 'Could not sync templates from Meta.',
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
    filter === 'EMAIL' ? (
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

  return (
    <Box p="md">
      <Group justify="space-between" align="flex-end" mb="md" wrap="wrap">
        <Stack gap={2}>
          <Title order={4}>Templates</Title>
          <Text size="sm" c="dimmed" maw={560}>
            Reusable email copy and WhatsApp messages. Start a campaign from a saved
            template in the builder. Meta must approve a WhatsApp template before it
            can send.
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
        ]}
      />

      {visibleCount === 0 ? (
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
                    <Text size="sm" fw={600} ff="monospace" truncate style={{ flex: 1 }}>
                      {t.name}
                    </Text>
                    <Badge size="xs" variant="light" color={tplStatusTone(t.status)}>
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

      {emailEdit !== null ? (
        <EmailTemplateModal
          initial={emailEdit === 'new' ? null : emailEdit}
          customFields={customFields}
          onClose={(changed) => {
            setEmailEdit(null);
            if (changed) reload();
          }}
        />
      ) : null}
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

// TODO(templates-merge-tags-port): port the legacy "Merge tags" sub-tab — the
// built-in merge-tags reference (ALWAYS_AVAILABLE_MERGE_TAGS) + the custom-fields
// manager (CRUD via /marketing/save-custom-field). The email editor already offers
// custom-field snippets as insert chips; only the management UI is deferred. See
// propel-crm-integration src/shared/marketing-cloud-templates.tsx.
