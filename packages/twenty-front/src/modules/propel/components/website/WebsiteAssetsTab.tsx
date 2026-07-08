import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Center,
  Chip,
  CopyButton,
  Drawer,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import {
  IconCheck,
  IconCopy,
  IconLink,
  IconPhoto,
  IconSearch,
  IconStar,
  IconTrash,
  IconUpload,
} from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import {
  deleteAsset,
  listAssets,
  toggleFavorite,
  updateAsset,
  WEBSITE_ASSET_SOURCES,
  type WebsiteAsset,
  type WebsiteAssetSource,
} from '@/propel/lib/websiteAssetsCrm';

// H2 — the standalone Website → Assets curation hero. A responsive grid over the
// websiteAsset object with search + source chips + ★ favorites filter; each card
// is image + title + source badge + a quick favorite toggle. Clicking a card
// opens a detail drawer to rename, edit tags, edit alt, toggle favorite, copy the
// gateway path, or delete (confirm). Upload is a disabled stub (needs the engine
// byte-bridge — task #18). Mantine only; no heavy libs (hero-bundle rules).

type SourceChip = 'ALL' | WebsiteAssetSource;

const SOURCE_CHIPS: { value: SourceChip; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'GENERATED', label: 'Generated' },
  { value: 'PROJECT', label: 'Project' },
  { value: 'UPLOADED', label: 'Uploaded' },
  { value: 'BRAND', label: 'Brand' },
  { value: 'TEAM', label: 'Team' },
];

// Source → badge color (matches the O1 SELECT colour posture).
const SOURCE_COLOR: Record<WebsiteAssetSource, string> = {
  GENERATED: 'green',
  ENHANCED: 'teal',
  PROJECT: 'blue',
  UPLOADED: 'indigo',
  BRAND: 'gray',
  TEAM: 'orange',
};

const SOURCE_LABEL: Record<WebsiteAssetSource, string> = {
  GENERATED: 'Generated',
  ENHANCED: 'Enhanced',
  PROJECT: 'Project',
  UPLOADED: 'Uploaded',
  BRAND: 'Brand',
  TEAM: 'Team',
};

const matchesFilter = (
  asset: WebsiteAsset,
  source: SourceChip,
  favoritesOnly: boolean,
  query: string,
): boolean => {
  if (source !== 'ALL' && asset.source !== source) return false;
  if (favoritesOnly && !asset.favorite) return false;
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return (
    asset.name.toLowerCase().includes(q) ||
    asset.tags.toLowerCase().includes(q) ||
    asset.projectName.toLowerCase().includes(q)
  );
};

// One grid card. Its <img> degrades to a placeholder if the byte load fails or
// the gateway host is unknown ('' → no host → placeholder).
const AssetCard = ({
  asset,
  sitePublicUrl,
  onOpen,
  onToggleFavorite,
}: {
  asset: WebsiteAsset;
  sitePublicUrl: string;
  onOpen: () => void;
  onToggleFavorite: () => void;
}) => {
  const [broken, setBroken] = useState(false);
  const src = sitePublicUrl !== '' ? `${sitePublicUrl}${asset.gatewayPath}` : null;
  const showImg = src !== null && !broken;

  return (
    <Paper withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
      <Box style={{ position: 'relative' }}>
        <UnstyledButton onClick={onOpen} style={{ display: 'block', width: '100%' }}>
          <Box
            style={{
              aspectRatio: '4 / 3',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              background: 'var(--mantine-color-gray-0)',
              color: 'var(--mantine-color-dimmed)',
            }}
          >
            {showImg ? (
              <img
                src={src}
                alt={asset.altText || asset.name}
                loading="lazy"
                onError={() => setBroken(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <IconPhoto size={28} />
            )}
          </Box>
        </UnstyledButton>
        <Tooltip
          label={asset.favorite ? 'Unfavorite' : 'Favorite'}
          withinPortal
          zIndex={5000}
        >
          <ActionIcon
            size="sm"
            variant="filled"
            color={asset.favorite ? 'yellow' : 'dark'}
            aria-label="Toggle favorite"
            aria-pressed={asset.favorite}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            style={{ position: 'absolute', top: 6, right: 6, opacity: 0.92 }}
          >
            <IconStar size={14} />
          </ActionIcon>
        </Tooltip>
      </Box>
      <Stack gap={4} p="xs">
        <Text size="sm" fw={600} truncate title={asset.name}>
          {asset.name || 'Untitled asset'}
        </Text>
        <Group gap={6} justify="space-between" wrap="nowrap">
          <Badge size="xs" variant="light" color={SOURCE_COLOR[asset.source]}>
            {SOURCE_LABEL[asset.source]}
          </Badge>
          {asset.usageCount > 0 ? (
            <Text size="xs" c="dimmed">
              {asset.usageCount} use{asset.usageCount === 1 ? '' : 's'}
            </Text>
          ) : null}
        </Group>
      </Stack>
    </Paper>
  );
};

export const WebsiteAssetsTab = () => {
  const notify = usePropelToast();
  const mounted = useRef(true);

  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [assets, setAssets] = useState<WebsiteAsset[]>([]);
  const [sitePublicUrl, setSitePublicUrl] = useState('');

  const [search, setSearch] = useState('');
  const [source, setSource] = useState<SourceChip>('ALL');
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  // Detail drawer (edit) — the selected asset id, plus the editable field buffer.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftTags, setDraftTags] = useState('');
  const [draftAlt, setDraftAlt] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete-confirm modal — the asset pending deletion.
  const [pendingDelete, setPendingDelete] = useState<WebsiteAsset | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setPhase('loading');
    const res = await listAssets();
    if (!mounted.current) return;
    if (res.ok) {
      setAssets(res.data.assets);
      setSitePublicUrl(res.data.sitePublicUrl);
    } else {
      notify(res.error, 'error');
    }
    setPhase('ready');
  }, [notify]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const selected = useMemo(
    () => assets.find((a) => a.id === selectedId) ?? null,
    [assets, selectedId],
  );

  const openDrawer = (asset: WebsiteAsset) => {
    setSelectedId(asset.id);
    setDraftName(asset.name);
    setDraftTags(asset.tags);
    setDraftAlt(asset.altText);
  };

  const closeDrawer = () => setSelectedId(null);

  const doToggleFavorite = async (asset: WebsiteAsset) => {
    const res = await toggleFavorite(asset.id);
    if (!res.ok) {
      notify(res.error, 'error');
      return;
    }
    setAssets((prev) =>
      prev.map((a) => (a.id === asset.id ? { ...a, favorite: res.data.favorite } : a)),
    );
  };

  const saveEdits = async () => {
    if (selected === null || saving) return;
    setSaving(true);
    const res = await updateAsset(selected.id, {
      name: draftName,
      tags: draftTags,
      altText: draftAlt,
    });
    setSaving(false);
    if (!res.ok) {
      notify(res.error, 'error');
      return;
    }
    setAssets((prev) =>
      prev.map((a) =>
        a.id === selected.id
          ? { ...a, name: draftName, tags: draftTags, altText: draftAlt }
          : a,
      ),
    );
    notify('Asset updated.', 'success');
    closeDrawer();
  };

  const confirmDelete = async () => {
    if (pendingDelete === null || deleting) return;
    setDeleting(true);
    const res = await deleteAsset(pendingDelete.id);
    setDeleting(false);
    if (!res.ok) {
      notify(res.error, 'error');
      return;
    }
    const deletedId = pendingDelete.id;
    setAssets((prev) => prev.filter((a) => a.id !== deletedId));
    setPendingDelete(null);
    if (selectedId === deletedId) closeDrawer();
    notify('Asset deleted.', 'success');
  };

  const visible = useMemo(
    () => assets.filter((a) => matchesFilter(a, source, favoritesOnly, search)),
    [assets, source, favoritesOnly, search],
  );

  const drawerImgSrc =
    selected !== null && sitePublicUrl !== '' ? `${sitePublicUrl}${selected.gatewayPath}` : null;

  return (
    <Box p="md" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Header — title + live count + disabled Upload stub. */}
      <Group justify="space-between" align="center" mb="md" wrap="nowrap">
        <Group gap="xs" align="center">
          <Title order={4}>Assets</Title>
          <Badge size="sm" variant="light" color="gray">
            {assets.length}
          </Badge>
        </Group>
        <Tooltip label="Coming with device upload" withinPortal zIndex={5000}>
          <Box component="span" style={{ display: 'inline-flex' }}>
            <Button
              size="xs"
              color="red"
              leftSection={<IconUpload size={14} />}
              disabled
            >
              Upload
            </Button>
          </Box>
        </Tooltip>
      </Group>

      {/* Filters — search + source chips + ★ favorites. */}
      <Stack gap="xs" mb="md">
        <TextInput
          size="xs"
          placeholder="Search assets by name, tag, or project"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <Group gap={6} wrap="wrap">
          {SOURCE_CHIPS.map((c) => (
            <Chip
              key={c.value}
              size="xs"
              color="red"
              variant={source === c.value ? 'filled' : 'outline'}
              checked={source === c.value}
              onChange={() => setSource(c.value)}
            >
              {c.label}
            </Chip>
          ))}
          <Tooltip label="Favorites only" withinPortal zIndex={5000}>
            <ActionIcon
              size="sm"
              variant={favoritesOnly ? 'filled' : 'subtle'}
              color="yellow"
              aria-label="Toggle favorites only"
              aria-pressed={favoritesOnly}
              onClick={() => setFavoritesOnly((f) => !f)}
            >
              <IconStar size={15} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Stack>

      {/* Grid. */}
      {phase === 'loading' ? (
        <Center style={{ flex: 1 }} mih={200}>
          <Loader color="red" />
        </Center>
      ) : visible.length > 0 ? (
        <ScrollArea style={{ flex: 1, minHeight: 0 }}>
          <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="md">
            {visible.map((a) => (
              <AssetCard
                key={a.id}
                asset={a}
                sitePublicUrl={sitePublicUrl}
                onOpen={() => openDrawer(a)}
                onToggleFavorite={() => void doToggleFavorite(a)}
              />
            ))}
          </SimpleGrid>
        </ScrollArea>
      ) : (
        <Center style={{ flex: 1 }} mih={200}>
          <Stack gap={4} align="center">
            <IconPhoto size={32} color="var(--mantine-color-gray-5)" />
            <Text size="sm" c="dimmed" ta="center">
              {assets.length > 0
                ? 'No assets match your filters.'
                : 'No assets yet — generate an image or save a project render from the page editor.'}
            </Text>
          </Stack>
        </Center>
      )}

      {/* Detail / edit drawer. */}
      <Drawer
        opened={selected !== null}
        onClose={closeDrawer}
        position="right"
        size="md"
        title={<Text fw={600}>Edit asset</Text>}
        zIndex={4000}
      >
        {selected !== null ? (
          <Stack gap="md">
            <Box
              style={{
                aspectRatio: '4 / 3',
                borderRadius: 8,
                overflow: 'hidden',
                border: '1px solid var(--mantine-color-gray-3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--mantine-color-gray-0)',
                color: 'var(--mantine-color-dimmed)',
              }}
            >
              {drawerImgSrc !== null ? (
                <img
                  src={drawerImgSrc}
                  alt={selected.altText || selected.name}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              ) : (
                <IconPhoto size={32} />
              )}
            </Box>

            <Group gap="xs">
              <Badge size="sm" variant="light" color={SOURCE_COLOR[selected.source]}>
                {SOURCE_LABEL[selected.source]}
              </Badge>
              <Tooltip
                label={selected.favorite ? 'Unfavorite' : 'Favorite'}
                withinPortal
                zIndex={5000}
              >
                <ActionIcon
                  size="sm"
                  variant={selected.favorite ? 'filled' : 'subtle'}
                  color="yellow"
                  aria-label="Toggle favorite"
                  aria-pressed={selected.favorite}
                  onClick={() => void doToggleFavorite(selected)}
                >
                  <IconStar size={15} />
                </ActionIcon>
              </Tooltip>
            </Group>

            <TextInput
              size="sm"
              label="Name"
              value={draftName}
              onChange={(e) => setDraftName(e.currentTarget.value)}
            />
            <TextInput
              size="sm"
              label="Tags"
              description="Comma-separated"
              value={draftTags}
              onChange={(e) => setDraftTags(e.currentTarget.value)}
            />
            <Textarea
              size="sm"
              label="Alt text"
              autosize
              minRows={2}
              value={draftAlt}
              onChange={(e) => setDraftAlt(e.currentTarget.value)}
            />

            <Group gap="xs" wrap="nowrap" align="flex-end">
              <TextInput
                size="xs"
                label="Gateway path"
                readOnly
                value={selected.gatewayPath}
                style={{ flex: 1 }}
                leftSection={<IconLink size={13} />}
              />
              <CopyButton value={selected.gatewayPath}>
                {({ copied, copy }) => (
                  <Tooltip
                    label={copied ? 'Copied' : 'Copy path'}
                    withinPortal
                    zIndex={5000}
                  >
                    <ActionIcon
                      size="lg"
                      variant="light"
                      color={copied ? 'green' : 'gray'}
                      aria-label="Copy gateway path"
                      onClick={copy}
                    >
                      {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
                    </ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
            </Group>

            <Group justify="space-between" mt="sm">
              <Button
                size="xs"
                variant="light"
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={() => setPendingDelete(selected)}
              >
                Delete
              </Button>
              <Group gap="xs">
                <Button size="xs" variant="subtle" color="gray" onClick={closeDrawer}>
                  Cancel
                </Button>
                <Button size="xs" color="red" loading={saving} onClick={() => void saveEdits()}>
                  Save
                </Button>
              </Group>
            </Group>
          </Stack>
        ) : null}
      </Drawer>

      {/* Delete confirmation. */}
      <Modal
        opened={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title={<Text fw={600}>Delete asset</Text>}
        centered
        zIndex={4100}
      >
        <Stack gap="md">
          <Text size="sm">
            Remove “{pendingDelete?.name || 'this asset'}” from the library? The image file
            itself is not deleted — only this catalog entry.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button size="xs" color="red" loading={deleting} onClick={() => void confirmDelete()}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
};

export default WebsiteAssetsTab;
