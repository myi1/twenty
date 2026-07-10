import { useCallback, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  Popover,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import {
  IconBolt,
  IconPencil,
  IconPlus,
  IconSearch,
  IconSettings,
  IconTrash,
} from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { friendlyError } from '@/propel/lib/friendlyError';
import {
  type QuickReply,
  type QuickReplyLanguage,
  type QuickReplyLibrary,
  type QuickReplyScope,
} from '@/propel/types/inbox';
import { deleteQuickReply, saveQuickReply } from '@/propel/lib/inboxApi';
import {
  CANNED_MERGE_TAGS,
  canManageQuickReply,
  filterQuickReplies,
  groupByCategory,
  validateQuickReplyForm,
} from '@/propel/lib/quickReplyCore';

// The composer's canned-reply picker (TM#91): a ⚡ Popover with a searchable,
// category-grouped list of quick replies. Two open modes:
//   • FREE  — the ⚡ button; the picker owns an internal search box.
//   • SLASH — the composer detects a `/token` draft and drives `slashQuery`; the
//     picker matches on the `shortcut` prefix and hides its own search box.
// Selecting a reply calls onPick(qr); the composer resolves merge tags + inserts.
//
// Managing: a gear opens a modal where the caller edits their OWN personal replies
// (always) and, when canEditShared, the SHARED library too. Saves/deletes go
// straight to the routes here (with friendly errors) and reload via onReload.

// A tiny scope pill so an agent can tell a shared staple from their own snippet.
const ScopeBadge = ({ scope }: { scope: QuickReplyScope }) =>
  scope === 'SHARED' ? (
    <Badge size="xs" variant="light" color="red">
      Shared
    </Badge>
  ) : (
    <Badge size="xs" variant="light" color="gray">
      Personal
    </Badge>
  );

interface EditorState {
  id: string | null;
  title: string;
  body: string;
  shortcut: string;
  category: string;
  scope: QuickReplyScope;
  languageCode: QuickReplyLanguage;
}

const emptyEditor = (canEditShared: boolean): EditorState => ({
  id: null,
  title: '',
  body: '',
  shortcut: '',
  category: '',
  // default to Shared for a manager (they curate the library), Personal otherwise
  scope: canEditShared ? 'SHARED' : 'PERSONAL',
  languageCode: 'EN',
});

export const InboxQuickReplyPicker = ({
  opened,
  onOpenedChange,
  mode,
  slashQuery,
  library,
  loading,
  onReload,
  actingMemberId,
  onPick,
}: {
  opened: boolean;
  onOpenedChange: (open: boolean) => void;
  mode: 'free' | 'slash';
  slashQuery: string;
  library: QuickReplyLibrary;
  loading: boolean;
  onReload: () => void;
  actingMemberId: string;
  onPick: (qr: QuickReply) => void;
}) => {
  const notify = usePropelToast();
  const { items, canEditShared } = library;

  // Free-mode search text (slash-mode uses slashQuery from the composer).
  const [freeQuery, setFreeQuery] = useState('');
  const query = mode === 'slash' ? slashQuery : freeQuery;

  // ── Manage modal ───────────────────────────────────────────────────────────
  const [manageOpen, setManageOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const groups = useMemo<[string, QuickReply[]][]>(() => {
    const visible = filterQuickReplies(items, query, mode);
    return groupByCategory(visible);
  }, [items, query, mode]);

  const startNew = useCallback(() => {
    setEditor(emptyEditor(canEditShared));
    setFormErr(null);
  }, [canEditShared]);

  const startEdit = useCallback((qr: QuickReply) => {
    setEditor({
      id: qr.id,
      title: qr.title,
      body: qr.body,
      shortcut: qr.shortcut ?? '',
      category: qr.category,
      scope: qr.scope,
      languageCode: qr.languageCode,
    });
    setFormErr(null);
  }, []);

  const openManage = useCallback(() => {
    onOpenedChange(false); // close the picker popover
    setManageOpen(true);
    setEditor(null);
    setFormErr(null);
  }, [onOpenedChange]);

  const handleSave = useCallback(async () => {
    if (!editor) return;
    const err = validateQuickReplyForm(editor);
    if (err) {
      setFormErr(err);
      return;
    }
    setSaving(true);
    setFormErr(null);
    const res = await saveQuickReply({
      id: editor.id,
      title: editor.title.trim(),
      body: editor.body.trim(),
      category: editor.category.trim() || null,
      languageCode: editor.languageCode,
      scope: editor.scope,
      shortcut: editor.shortcut.trim() || null,
    }).catch(() => null);
    setSaving(false);
    if (!res || res.ok !== true) {
      const msg = friendlyError(res?.operatorAction || res?.error, 'save');
      setFormErr(msg);
      notify(msg, 'error');
      return;
    }
    notify(editor.id ? 'Quick reply updated.' : 'Quick reply added.', 'success');
    setEditor(null);
    onReload();
  }, [editor, notify, onReload]);

  const handleDelete = useCallback(
    async (qr: QuickReply) => {
      if (deletingId) return;
      setDeletingId(qr.id);
      const res = await deleteQuickReply(qr.id).catch(() => null);
      setDeletingId(null);
      if (!res || res.ok !== true) {
        notify(friendlyError(res?.operatorAction || res?.error, 'generic'), 'error');
        return;
      }
      notify('Quick reply deleted.', 'success');
      if (editor?.id === qr.id) setEditor(null);
      onReload();
    },
    [deletingId, editor, notify, onReload],
  );

  // Rows the caller may manage (own personal + shared when canEditShared), grouped
  // shared-first then by title.
  const manageable = useMemo(
    () =>
      items
        .filter((r) =>
          canManageQuickReply(
            { scope: r.scope, ownerMemberId: r.ownerMemberId },
            actingMemberId,
            canEditShared,
          ),
        )
        .sort((a, b) => {
          if (a.scope !== b.scope) return a.scope === 'SHARED' ? -1 : 1;
          return a.title.localeCompare(b.title);
        }),
    [items, actingMemberId, canEditShared],
  );

  const scopeData = canEditShared
    ? [
        { value: 'SHARED', label: 'Shared' },
        { value: 'PERSONAL', label: 'Personal' },
      ]
    : [{ value: 'PERSONAL', label: 'Personal' }];

  return (
    <>
      <Popover
        opened={opened}
        onChange={onOpenedChange}
        position="top-start"
        offset={8}
        shadow="md"
        width={340}
        withinPortal
      >
        <Popover.Target>
          <ActionIcon
            variant={opened ? 'light' : 'default'}
            color={opened ? 'red' : undefined}
            size={40}
            radius="md"
            onClick={() => onOpenedChange(!opened)}
            aria-label="Quick replies"
            aria-expanded={opened}
            title="Quick replies (type / at the start of a message)"
          >
            <IconBolt size={19} />
          </ActionIcon>
        </Popover.Target>
        <Popover.Dropdown p={0}>
          <Box
            p={8}
            style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
          >
            {mode === 'slash' ? (
              <Group gap={6} justify="space-between" wrap="nowrap">
                <Text size="xs" c="dimmed">
                  Matching{' '}
                  <Text span fw={700} c="red">
                    /{slashQuery}
                  </Text>
                </Text>
                <Text size="xs" c="dimmed">
                  ↑↓ to browse · Esc to dismiss
                </Text>
              </Group>
            ) : (
              <Group gap={6} wrap="nowrap">
                <TextInput
                  value={freeQuery}
                  onChange={(e) => setFreeQuery(e.currentTarget.value)}
                  placeholder="Search quick replies…"
                  aria-label="Search quick replies"
                  size="xs"
                  leftSection={<IconSearch size={14} />}
                  autoFocus
                  style={{ flex: 1 }}
                />
                <ActionIcon
                  variant="default"
                  size="md"
                  onClick={openManage}
                  aria-label="Manage quick replies"
                  title="Manage quick replies"
                >
                  <IconSettings size={16} />
                </ActionIcon>
              </Group>
            )}
          </Box>
          <ScrollArea.Autosize mah={300} type="auto">
            <Box p={6}>
              {loading && items.length === 0 ? (
                <Text size="sm" c="dimmed" ta="center" py="md">
                  Loading…
                </Text>
              ) : groups.length === 0 ? (
                <Stack gap={6} align="center" py="md" px="xs">
                  <Text size="sm" c="dimmed" ta="center">
                    {items.length === 0
                      ? 'No quick replies yet.'
                      : mode === 'slash'
                        ? `No reply matches /${slashQuery}.`
                        : 'No matches.'}
                  </Text>
                  {mode !== 'slash' ? (
                    <Button
                      size="compact-xs"
                      variant="light"
                      color="red"
                      leftSection={<IconPlus size={13} />}
                      onClick={openManage}
                    >
                      Add a quick reply
                    </Button>
                  ) : null}
                </Stack>
              ) : (
                groups.map(([cat, groupItems]) => (
                  <Box key={cat} mb={4}>
                    <Text
                      size="xs"
                      fw={700}
                      c="dimmed"
                      tt="uppercase"
                      px={8}
                      py={4}
                      style={{ letterSpacing: 0.4 }}
                    >
                      {cat}
                    </Text>
                    {groupItems.map((qr) => (
                      <UnstyledButton
                        key={qr.id}
                        onClick={() => onPick(qr)}
                        title={qr.body}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '6px 8px',
                          borderRadius: 8,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background =
                            'var(--mantine-color-default-hover)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <Group gap={6} wrap="nowrap" justify="space-between">
                          <Text size="sm" fw={600} lineClamp={1} style={{ flex: 1 }}>
                            {qr.title || '(untitled)'}
                          </Text>
                          {qr.shortcut ? (
                            <Badge
                              size="xs"
                              variant="outline"
                              color="gray"
                              style={{ flex: 'none', textTransform: 'none' }}
                            >
                              /{qr.shortcut}
                            </Badge>
                          ) : null}
                          <Box style={{ flex: 'none' }}>
                            <ScopeBadge scope={qr.scope} />
                          </Box>
                        </Group>
                        {qr.body ? (
                          <Text size="xs" c="dimmed" lineClamp={2} mt={1}>
                            {qr.body}
                          </Text>
                        ) : null}
                      </UnstyledButton>
                    ))}
                  </Box>
                ))
              )}
            </Box>
          </ScrollArea.Autosize>
          {mode === 'slash' ? (
            <Box
              p={6}
              style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
            >
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                fullWidth
                leftSection={<IconSettings size={13} />}
                onClick={openManage}
              >
                Manage quick replies
              </Button>
            </Box>
          ) : null}
        </Popover.Dropdown>
      </Popover>

      {/* Manage modal — add/edit/delete the caller's own personal replies (always)
          and the shared library (Manager/Admin). */}
      <Modal
        opened={manageOpen}
        onClose={() => {
          setManageOpen(false);
          setEditor(null);
          setFormErr(null);
        }}
        title="Manage quick replies"
        size="lg"
        zIndex={5000}
      >
        <Stack gap="md">
          {editor ? (
            <Stack
              gap="sm"
              p="md"
              style={{
                border: '1px solid var(--mantine-color-default-border)',
                borderRadius: 10,
              }}
            >
              <Group justify="space-between">
                <Text fw={700} size="sm">
                  {editor.id ? 'Edit reply' : 'New reply'}
                </Text>
                <SegmentedControl
                  size="xs"
                  value={editor.scope}
                  onChange={(v) =>
                    setEditor((s) => (s ? { ...s, scope: v as QuickReplyScope } : s))
                  }
                  data={scopeData}
                  disabled={!canEditShared}
                />
              </Group>
              <TextInput
                label="Title"
                placeholder="e.g. Greeting"
                value={editor.title}
                onChange={(e) =>
                  setEditor((s) => (s ? { ...s, title: e.currentTarget.value } : s))
                }
                size="sm"
              />
              <Textarea
                label="Message"
                placeholder="Hi {{firstName}}, thanks for reaching out…"
                value={editor.body}
                onChange={(e) =>
                  setEditor((s) => (s ? { ...s, body: e.currentTarget.value } : s))
                }
                autosize
                minRows={3}
                maxRows={8}
                size="sm"
              />
              <Text size="xs" c="dimmed">
                Merge tags:{' '}
                {CANNED_MERGE_TAGS.map((t) => `{{${t}}}`).join(' · ')} — filled in from
                the contact and agent when inserted.
              </Text>
              <Group grow align="flex-start">
                <TextInput
                  label="Shortcut"
                  placeholder="greeting"
                  description="Type /shortcut to insert"
                  value={editor.shortcut}
                  onChange={(e) =>
                    setEditor((s) =>
                      s ? { ...s, shortcut: e.currentTarget.value } : s,
                    )
                  }
                  size="sm"
                  leftSection={<Text size="sm" c="dimmed">/</Text>}
                />
                <TextInput
                  label="Category"
                  placeholder="General"
                  value={editor.category}
                  onChange={(e) =>
                    setEditor((s) =>
                      s ? { ...s, category: e.currentTarget.value } : s,
                    )
                  }
                  size="sm"
                />
                <Select
                  label="Language"
                  value={editor.languageCode}
                  onChange={(v) =>
                    setEditor((s) =>
                      s ? { ...s, languageCode: (v as QuickReplyLanguage) ?? 'EN' } : s,
                    )
                  }
                  data={[
                    { value: 'EN', label: 'English' },
                    { value: 'AR', label: 'Arabic' },
                  ]}
                  size="sm"
                  comboboxProps={{ zIndex: 5100, withinPortal: true }}
                />
              </Group>
              {formErr ? (
                <Text size="xs" c="red">
                  {formErr}
                </Text>
              ) : null}
              <Group justify="flex-end" gap="sm">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    setEditor(null);
                    setFormErr(null);
                  }}
                >
                  Cancel
                </Button>
                <Button color="red" size="sm" loading={saving} onClick={handleSave}>
                  {editor.id ? 'Save changes' : 'Add reply'}
                </Button>
              </Group>
            </Stack>
          ) : (
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                {manageable.length === 0
                  ? 'You don’t have any editable replies yet.'
                  : `${manageable.length} editable ${manageable.length === 1 ? 'reply' : 'replies'}`}
              </Text>
              <Button
                color="red"
                size="compact-sm"
                leftSection={<IconPlus size={14} />}
                onClick={startNew}
              >
                New reply
              </Button>
            </Group>
          )}

          {!editor ? (
            <Stack gap={6}>
              {manageable.map((qr) => (
                <Group
                  key={qr.id}
                  wrap="nowrap"
                  justify="space-between"
                  p="xs"
                  style={{
                    border: '1px solid var(--mantine-color-default-border)',
                    borderRadius: 8,
                  }}
                >
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Group gap={6} wrap="nowrap">
                      <Text size="sm" fw={600} lineClamp={1}>
                        {qr.title || '(untitled)'}
                      </Text>
                      {qr.shortcut ? (
                        <Badge
                          size="xs"
                          variant="outline"
                          color="gray"
                          style={{ textTransform: 'none' }}
                        >
                          /{qr.shortcut}
                        </Badge>
                      ) : null}
                      <ScopeBadge scope={qr.scope} />
                      <Badge size="xs" variant="light" color="gray">
                        {qr.languageCode}
                      </Badge>
                    </Group>
                    <Text size="xs" c="dimmed" lineClamp={1} mt={2}>
                      {qr.body}
                    </Text>
                  </Box>
                  <Group gap={4} wrap="nowrap" style={{ flex: 'none' }}>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      onClick={() => startEdit(qr)}
                      aria-label={`Edit ${qr.title}`}
                      title="Edit"
                    >
                      <IconPencil size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      loading={deletingId === qr.id}
                      onClick={() => void handleDelete(qr)}
                      aria-label={`Delete ${qr.title}`}
                      title="Delete"
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Group>
              ))}
            </Stack>
          ) : null}
        </Stack>
      </Modal>
    </>
  );
};
