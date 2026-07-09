import { useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import {
  IconFileText,
  IconLink,
  IconSearch,
  IconTrash,
} from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import {
  deleteSource,
  formatCharCount,
  getSource,
  KIND_COLOR,
  KIND_LABEL,
  listSources,
  updateSource,
  type SourceMaterial,
  type SourceMaterialFull,
} from '@/propel/lib/sourceMaterialsCrm';
import { SourceQuickAdd } from '@/propel/components/website/SourceQuickAdd';

// Sources tab (SRC-1 / plan SM6) — the source-materials curation surface.
// Extracted verbatim from MediaStudioBody's old Sources panel so it can be the
// Website tab's own "Sources" sub-tab (it is the ONLY source-curation surface, so
// this was a MOVE, not a delete). Left: quick-add (the shared smart box) +
// searchable list (kind badge, charCount, tags). Right: preview (truncated
// extractedText) + rename/tags + delete (two-step confirm). Own component so its
// state stays local; the parent lazy-gates it (activeSubTab === 'sources'), so it
// (re)loads on each visit — the list is ≤200 light rows.
const SOURCE_PREVIEW_CHARS = 2000;

const matchesSourceFilter = (s: SourceMaterial, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return (
    s.name.toLowerCase().includes(q) ||
    s.tags.toLowerCase().includes(q) ||
    s.projectName.toLowerCase().includes(q)
  );
};

export const SourcesTab = () => {
  const notify = usePropelToast();

  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sources, setSources] = useState<SourceMaterial[]>([]);
  const [search, setSearch] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SourceMaterialFull | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [editName, setEditName] = useState('');
  const [editTags, setEditTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = async (): Promise<SourceMaterial[]> => {
    setBusy(true);
    const res = await listSources();
    setBusy(false);
    setLoaded(true);
    if (res.ok) {
      setSources(res.data);
      return res.data;
    }
    notify(res.error, 'error');
    return [];
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setConfirmingDelete(false);
    setDetail(null);
    setDetailBusy(true);
    const res = await getSource(id);
    setDetailBusy(false);
    if (res.ok) {
      setDetail(res.data);
      setEditName(res.data.name);
      setEditTags(res.data.tags);
      return;
    }
    notify(res.error, 'error');
    setSelectedId(null);
  };

  const onQuickAdded = async (id: string) => {
    await load();
    void openDetail(id);
  };

  const dirty =
    detail !== null && (editName.trim() !== detail.name || editTags.trim() !== detail.tags);

  const saveEdits = async () => {
    if (selectedId === null || detail === null || saving || !dirty) return;
    const name = editName.trim();
    if (name === '') return;
    setSaving(true);
    const res = await updateSource(selectedId, { name, tags: editTags.trim() });
    setSaving(false);
    if (res.ok) {
      setDetail({ ...detail, name, tags: editTags.trim() });
      setSources((prev) =>
        prev.map((s) => (s.id === selectedId ? { ...s, name, tags: editTags.trim() } : s)),
      );
      notify('Source updated.', 'success');
      return;
    }
    notify(res.error, 'error');
  };

  const removeSelected = async () => {
    if (selectedId === null || deleting) return;
    setDeleting(true);
    const res = await deleteSource(selectedId);
    setDeleting(false);
    if (res.ok) {
      setSources((prev) => prev.filter((s) => s.id !== selectedId));
      setSelectedId(null);
      setDetail(null);
      setConfirmingDelete(false);
      notify('Source deleted.', 'success');
      return;
    }
    notify(res.error, 'error');
  };

  const visible = sources.filter((s) => matchesSourceFilter(s, search));

  const sourceRow = (s: SourceMaterial) => (
    <UnstyledButton
      key={s.id}
      onClick={() => void openDetail(s.id)}
      style={{
        padding: '8px 10px',
        borderRadius: 8,
        border:
          selectedId === s.id
            ? '1px solid var(--mantine-color-red-5)'
            : '1px solid var(--mantine-color-default-border)',
        background:
          selectedId === s.id ? 'var(--mantine-color-red-light)' : undefined,
      }}
    >
      <Group gap={6} wrap="nowrap" justify="space-between">
        <Text size="sm" fw={500} truncate style={{ flex: 1, minWidth: 0 }}>
          {s.name || 'Untitled source'}
        </Text>
        <Badge size="xs" variant="light" color={KIND_COLOR[s.kind]}>
          {KIND_LABEL[s.kind]}
        </Badge>
      </Group>
      <Group gap={6} wrap="nowrap">
        <Text size="xs" c="dimmed">
          {formatCharCount(s.charCount)}
        </Text>
        {s.tags !== '' ? (
          <Text size="xs" c="dimmed" truncate>
            · {s.tags}
          </Text>
        ) : null}
      </Group>
    </UnstyledButton>
  );

  const detailPane = () => {
    if (selectedId === null) {
      return (
        <Center h={260}>
          <Stack gap={8} align="center" c="dimmed">
            <IconFileText size={28} />
            <Text size="sm" c="dimmed" ta="center" maw={320}>
              Select a source to preview and edit it. Sources ground the AI benches —
              pick them per brief via “Add sources”.
            </Text>
          </Stack>
        </Center>
      );
    }
    if (detailBusy || detail === null) {
      return (
        <Center h={260}>
          <Loader size="sm" color="red" />
        </Center>
      );
    }
    const truncated = detail.extractedText.length > SOURCE_PREVIEW_CHARS;
    const preview = truncated
      ? detail.extractedText.slice(0, SOURCE_PREVIEW_CHARS)
      : detail.extractedText;
    return (
      <Stack gap="sm">
        <Group gap="xs" align="flex-end" wrap="nowrap">
          <TextInput
            size="xs"
            label="Name"
            style={{ flex: 1 }}
            value={editName}
            onChange={(e) => setEditName(e.currentTarget.value)}
          />
          <TextInput
            size="xs"
            label="Tags"
            placeholder="comma, separated"
            style={{ flex: 1 }}
            value={editTags}
            onChange={(e) => setEditTags(e.currentTarget.value)}
          />
          <Button
            size="xs"
            variant="light"
            color="red"
            loading={saving}
            disabled={!dirty || editName.trim() === ''}
            onClick={() => void saveEdits()}
          >
            Save
          </Button>
        </Group>
        {detail.rawRef !== '' ? (
          <Text size="xs" c="dimmed" truncate>
            <IconLink size={12} style={{ verticalAlign: 'middle' }} /> {detail.rawRef}
          </Text>
        ) : null}
        <Box
          style={{
            borderRadius: 8,
            border: '1px solid var(--mantine-color-default-border)',
            background:
              'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))',
          }}
        >
          <ScrollArea.Autosize mah={300} p="sm">
            <Text size="xs" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {preview}
            </Text>
            {truncated ? (
              <Text size="xs" c="dimmed" mt="xs">
                … preview truncated — {formatCharCount(detail.charCount)} in total.
              </Text>
            ) : null}
          </ScrollArea.Autosize>
        </Box>
        <Group justify="flex-end" gap="xs">
          {confirmingDelete ? (
            <>
              <Button
                size="xs"
                variant="default"
                disabled={deleting}
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </Button>
              <Button
                size="xs"
                color="red"
                leftSection={<IconTrash size={13} />}
                loading={deleting}
                onClick={() => void removeSelected()}
              >
                Confirm delete
              </Button>
            </>
          ) : (
            <Button
              size="xs"
              variant="light"
              color="red"
              leftSection={<IconTrash size={13} />}
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </Button>
          )}
        </Group>
      </Stack>
    );
  };

  return (
    <Group align="flex-start" gap="xl" wrap="nowrap" p="md" style={{ minHeight: 0 }}>
      <Stack gap="sm" style={{ flex: '0 0 380px', maxWidth: 380 }}>
        <SourceQuickAdd onAdded={(id) => void onQuickAdded(id)} />
        <TextInput
          size="xs"
          placeholder="Search sources"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        {busy && !loaded ? (
          <Center h={140}>
            <Loader size="sm" color="red" />
          </Center>
        ) : visible.length > 0 ? (
          <ScrollArea.Autosize mah={420}>
            <Stack gap={6}>{visible.map(sourceRow)}</Stack>
          </ScrollArea.Autosize>
        ) : (
          <Text size="sm" c="dimmed" ta="center" py="md">
            {loaded && sources.length > 0
              ? 'No sources match your search.'
              : 'No sources yet — paste text, fetch a URL, or add a file above.'}
          </Text>
        )}
      </Stack>
      <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
        {detailPane()}
      </Stack>
    </Group>
  );
};

export default SourcesTab;
