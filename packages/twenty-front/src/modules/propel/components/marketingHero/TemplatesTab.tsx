import {
  Badge,
  Box,
  Button,
  Card,
  Center,
  Group,
  Loader,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useState } from 'react';
import {
  IconMail,
  IconMessage,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconTrash,
} from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { friendlyError } from '@/propel/lib/friendlyError';
import { titleCase } from '@/propel/lib/campaignRows';
import {
  getTemplatesChannel,
  getTemplatesView,
  type TemplatesChannel,
  type TemplatesView,
} from '@/propel/lib/marketingPrefs';
import {
  type EmailTemplateOption,
  type MarketingHubPayload,
  type WaTemplateOption,
} from '@/propel/types/marketingHome';
import { GrapesEmailBuilder } from '@/propel/components/campaign/GrapesEmailBuilder';
import {
  clickableCard,
  InvitingEmpty,
  KanbanBoard,
  KanbanColumn,
  Seal,
  statusSeal,
  type SealKind,
} from '@/propel/components/desk';
import { WaTemplateModal } from './WaTemplateModal';

// Templates tab of the unified Marketing hero — the email + WhatsApp template
// catalog. TM#50 upgraded it to a proper TABLE (default) with Table · Cards · Board
// view toggles (Board = the WhatsApp lifecycle kanban; Cards = the legacy grid).
// Clicking an EMAIL row/card (or "New email template") opens the full-page GrapesJS
// + MJML editor in place (the one email editor everywhere); WhatsApp keeps its
// lightweight WaTemplateModal (AI draft bench). The old "Merge tags" segmented
// filter RELOCATED to the Marketing Settings tab (TM#70) so this stays a pure
// catalog. Routes reused:
//   • POST /marketing/delete-template
//   • POST /marketing/wa-template-sync
//   • (modals) /marketing/save-email-template, /marketing/save-template,
//     /marketing/wa-template-create
//
// Perf and Updated columns are STUBBED ("—") — there is no per-template stats
// rollup and `updatedAt` isn't in the /marketing/hub payload yet (both are
// backend items in the design ledger §4). The columns exist so the table shape is
// final; they light up when the data lands.

type TplFilter = TemplatesChannel; // 'ALL' | 'EMAIL' | 'WHATSAPP'

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

// APPROVED isn't in the shared status→seal map (WA-specific), so it maps to green
// locally without touching the shared kit. Email is always ready → green.
const waSeal = (status: string): SealKind =>
  status === 'APPROVED' ? 'green' : statusSeal(status);
const EMAIL_SEAL: SealKind = 'green';

// ── WhatsApp template kanban (Board view) — the REAL whatsappTemplate lifecycle. ──
const WA_LANES: { id: string; title: string; empty: string }[] = [
  { id: 'DRAFT', title: 'Draft', empty: 'No drafts — start one, or draft with AI.' },
  { id: 'SUBMITTED', title: 'Submitted', empty: 'Nothing awaiting Meta review.' },
  { id: 'APPROVED', title: 'Approved', empty: 'No approved templates yet.' },
  { id: 'REJECTED', title: 'Rejected', empty: 'No rejections — nice.' },
  { id: 'PAUSED', title: 'Paused', empty: 'No paused templates.' },
];

const WaBoardCard = ({
  t,
  onOpen,
}: {
  t: WaTemplateOption;
  onOpen: () => void;
}) => (
  <Card withBorder radius="md" padding="sm" {...clickableCard(onOpen)}>
    <Stack gap={6}>
      <Group gap={8} wrap="nowrap" align="center">
        <Seal kind={waSeal(t.status)} />
        <Text size="sm" fw={600} ff="monospace" truncate style={{ flex: 1 }}>
          {t.name}
        </Text>
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
        lineClamp={3}
        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
      >
        {t.bodyText || 'Empty body'}
      </Text>
      {t.status === 'REJECTED' && t.rejectionReason ? (
        <Text size="xs" c="red" lineClamp={2}>
          Rejected: {t.rejectionReason}
        </Text>
      ) : null}
    </Stack>
  </Card>
);

// Inline two-step delete control: "Delete → Delete? No / Yes". Withholds row-click
// so it acts inline inside a clickable table row / card.
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
    // on success the parent reload unmounts this row
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
    <Group gap={6} onClick={(e) => e.stopPropagation()} wrap="nowrap">
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
  // Channel filter + view default seed from the agent's My-preferences (localStorage,
  // Settings → My preferences). Table is the catalog default.
  const [filter, setFilter] = useState<TplFilter>(() => getTemplatesChannel());
  const [langFilter, setLangFilter] = useState<string>('ALL');
  const [view, setView] = useState<TemplatesView>(() => getTemplatesView());
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

  // Board is WhatsApp-only (the lifecycle is WhatsApp's); if the channel filter
  // excludes WhatsApp while Board is selected, fall back to the table.
  const effectiveView: TemplatesView =
    view === 'BOARD' && !showWa ? 'TABLE' : view;

  // Distinct languages present across the loaded templates, powering the language
  // filter. Client-side only — no extra fetch.
  const languageOptions = Array.from(
    new Set(
      [...emailTemplates, ...waTemplates]
        .map((t) => t.languageCode)
        .filter((c): c is string => typeof c === 'string' && c !== ''),
    ),
  ).sort();

  const matchesLang = (code: string): boolean =>
    langFilter === 'ALL' || code === langFilter;

  const visibleEmail = emailTemplates.filter((t) => matchesLang(t.languageCode));
  const visibleWa = waTemplates.filter((t) => matchesLang(t.languageCode));
  const visibleCount =
    (showEmail ? visibleEmail.length : 0) + (showWa ? visibleWa.length : 0);

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
        res?.operatorAction || friendlyError(res?.error, 'generic'),
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
        res?.operatorAction || friendlyError(res?.error, 'generic'),
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

  // Email templates author in the full-page GrapesJS + MJML editor (the one email
  // editor everywhere — TM#50). Opening a row/card or "New email template" swaps
  // the catalog for the editor in place; "Close" / a successful save returns.
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

  // ── The table (default view). Email + WhatsApp rows share one Mantine table
  // grammar (sticky header, striped) — the same shape LeadRoutingTab uses. A row
  // click opens the channel's builder; inner action controls withhold the click. ──
  const emailRows = showEmail
    ? visibleEmail.map((t) => (
        <Table.Tr
          key={`e-${t.id}`}
          style={{ cursor: 'pointer' }}
          onClick={() => setEmailEdit(t)}
        >
          <Table.Td>
            <Group gap={8} wrap="nowrap">
              <Seal kind={EMAIL_SEAL} />
              <Text size="sm" fw={600} truncate>
                {t.name}
              </Text>
            </Group>
          </Table.Td>
          <Table.Td>
            <Group gap={6} wrap="nowrap">
              <IconMail size={15} color="var(--mantine-color-blue-6)" />
              <Text size="sm">Email</Text>
            </Group>
          </Table.Td>
          <Table.Td>
            <Badge size="sm" variant="light" color="green">
              Ready
            </Badge>
          </Table.Td>
          <Table.Td>
            <Text size="sm" c="dimmed">
              —
            </Text>
          </Table.Td>
          <Table.Td>
            <Badge size="sm" variant="light" color="gray">
              {t.languageCode}
            </Badge>
          </Table.Td>
          <Table.Td>
            <Text size="sm" c="dimmed">
              —
            </Text>
          </Table.Td>
          <Table.Td>
            <Text size="sm" c="dimmed">
              —
            </Text>
          </Table.Td>
          <Table.Td>
            <Group gap={4} wrap="nowrap" justify="flex-end">
              <Button
                size="compact-xs"
                variant="subtle"
                leftSection={<IconPencil size={13} />}
                onClick={(e) => {
                  e.stopPropagation();
                  setEmailEdit(t);
                }}
              >
                Edit
              </Button>
              <DeleteControl onConfirm={() => deleteTemplate(t.id, 'email')} />
            </Group>
          </Table.Td>
        </Table.Tr>
      ))
    : [];

  const waRows = showWa
    ? visibleWa.map((t) => (
        <Table.Tr
          key={`w-${t.id}`}
          style={{ cursor: 'pointer' }}
          onClick={() => setWaEdit(t)}
        >
          <Table.Td>
            <Group gap={8} wrap="nowrap">
              <Seal kind={waSeal(t.status)} />
              <Text size="sm" fw={600} ff="monospace" truncate>
                {t.name}
              </Text>
            </Group>
          </Table.Td>
          <Table.Td>
            <Group gap={6} wrap="nowrap">
              <IconMessage size={15} color="var(--mantine-color-green-6)" />
              <Text size="sm">WhatsApp</Text>
            </Group>
          </Table.Td>
          <Table.Td>
            <Badge size="sm" variant="light" color={tplStatusTone(t.status)}>
              {titleCase(t.status)}
            </Badge>
          </Table.Td>
          <Table.Td>
            <Badge size="sm" variant="light" color="gray">
              {titleCase(t.category)}
            </Badge>
          </Table.Td>
          <Table.Td>
            <Badge size="sm" variant="light" color="gray">
              {t.languageCode}
            </Badge>
          </Table.Td>
          <Table.Td>
            <Text size="sm" c="dimmed">
              —
            </Text>
          </Table.Td>
          <Table.Td>
            <Text size="sm" c="dimmed">
              —
            </Text>
          </Table.Td>
          <Table.Td>
            <Group gap={4} wrap="nowrap" justify="flex-end">
              <Button
                size="compact-xs"
                variant="subtle"
                leftSection={<IconPencil size={13} />}
                onClick={(e) => {
                  e.stopPropagation();
                  setWaEdit(t);
                }}
              >
                Edit
              </Button>
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
          </Table.Td>
        </Table.Tr>
      ))
    : [];

  // The view toggle: Table · Cards, plus Board only when WhatsApp is in scope.
  const viewOptions = [
    { label: 'Table', value: 'TABLE' },
    { label: 'Cards', value: 'CARDS' },
    ...(showWa ? [{ label: 'Board', value: 'BOARD' }] : []),
  ];

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

      <Group gap="sm" mb="md" align="center" wrap="wrap">
        <SegmentedControl
          value={filter}
          onChange={(v) => setFilter(v as TplFilter)}
          data={[
            { label: 'All', value: 'ALL' },
            { label: 'Email', value: 'EMAIL' },
            { label: 'WhatsApp', value: 'WHATSAPP' },
          ]}
        />
        <SegmentedControl
          value={effectiveView}
          onChange={(v) => setView(v as TemplatesView)}
          data={viewOptions}
        />
        {languageOptions.length > 0 ? (
          <Select
            size="sm"
            w={170}
            aria-label="Filter by language"
            value={langFilter}
            onChange={(v) => setLangFilter(v ?? 'ALL')}
            data={[
              { value: 'ALL', label: 'All languages' },
              ...languageOptions.map((c) => ({ value: c, label: c })),
            ]}
          />
        ) : null}
      </Group>

      {effectiveView === 'BOARD' ? (
        <KanbanBoard cols={{ base: 1, sm: 2, lg: 5 }}>
          {WA_LANES.map((lane) => {
            const laneRows = visibleWa.filter((t) => t.status === lane.id);
            return (
              <KanbanColumn
                key={lane.id}
                title={lane.title}
                count={laneRows.length}
                icon={<Seal kind={waSeal(lane.id)} />}
                empty={<InvitingEmpty compact title={lane.empty} />}
              >
                {laneRows.map((t) => (
                  <WaBoardCard key={t.id} t={t} onOpen={() => setWaEdit(t)} />
                ))}
              </KanbanColumn>
            );
          })}
        </KanbanBoard>
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
      ) : effectiveView === 'TABLE' ? (
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
              <Table.Th>Name</Table.Th>
              <Table.Th>Channel</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Category</Table.Th>
              <Table.Th>Language</Table.Th>
              <Table.Th>Perf</Table.Th>
              <Table.Th>Updated</Table.Th>
              <Table.Th ta="right">Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {emailRows}
            {waRows}
          </Table.Tbody>
        </Table>
      ) : (
        // Cards view — the legacy grid.
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {showEmail &&
            visibleEmail.map((t) => (
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
            visibleWa.map((t) => (
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
