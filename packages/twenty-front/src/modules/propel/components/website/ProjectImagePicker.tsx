import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Box,
  Button,
  Center,
  Chip,
  Group,
  Loader,
  Popover,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { IconBookmark, IconPhoto, IconSearch, IconStar } from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import {
  generateImage,
  projectImages as fetchProjectImages,
  searchProjects,
  type ImageAspect,
  type ProjectImage,
  type ProjectSearchResult,
} from '@/propel/lib/landingPagesCrm';
import {
  createAsset,
  listAssets,
  type WebsiteAsset,
  type WebsiteAssetSource,
} from '@/propel/lib/websiteAssetsCrm';

// LP Builder v2 — Stage 2 project-image picker (B2 / contract C4).
//
// A 🖼 button next to every image-ish landing field. It opens a popover that
// searches the off-plan project catalog (via the CRM landing-assets route),
// lists the project's GenieMap renders as same-domain gateway thumbnails, and
// writes the picked gatewayPath (e.g. /img/gm/…​.webp) into the field.
//
// Graceful degrade (mandatory — the C4 route may not be deployed yet):
//  • sitePublicUrl empty  → render nothing (no gateway host to load thumbs from).
//  • route FEATURE_OFF    → hide EVERY picker (shared context latch) — never
//                           fabricate a gallery.
//  • transient error      → toast + close the popover, keep the button.

// ── shared feature latch ──────────────────────────────────────────────────────
// One flag shared by every picker in the editor: the first call that comes back
// FEATURE_OFF hides them all, so a marketer never sees a button that can't work.
interface ProjectAssetsCtx {
  featureOff: boolean;
  markFeatureOff: () => void;
}
const ProjectAssetsContext = createContext<ProjectAssetsCtx | null>(null);

export const ProjectAssetsProvider = ({ children }: { children: React.ReactNode }) => {
  const [featureOff, setFeatureOff] = useState(false);
  const value = useMemo<ProjectAssetsCtx>(
    () => ({ featureOff, markFeatureOff: () => setFeatureOff(true) }),
    [featureOff],
  );
  return <ProjectAssetsContext.Provider value={value}>{children}</ProjectAssetsContext.Provider>;
};

const useProjectAssets = (): ProjectAssetsCtx =>
  // Default latch when a picker is (defensively) rendered outside a provider — it
  // just behaves as its own island rather than crashing.
  useContext(ProjectAssetsContext) ?? { featureOff: false, markFeatureOff: () => {} };

// ── the picker ────────────────────────────────────────────────────────────────
interface ProjectImagePickerProps {
  sitePublicUrl: string;
  onPick: (gatewayPath: string) => void;
  // When set, the popover target is a labelled Button (A4 thumbnail "Change"
  // affordance) instead of the compact photo ActionIcon (row-editor / rightSection
  // usage). Purely a trigger-styling switch — the popover body is identical.
  triggerLabel?: string;
  // Best-effort context for the AI-generate guardrail (the page draft's title).
  // Empty is fine — the CRM route only shapes on a non-empty value.
  projectName?: string;
}

type Stage = 'search' | 'images';
type PickerTab = 'library' | 'renders' | 'generate' | 'upload';

// Library source filter chips (H1). 'ALL' is the sentinel for no source filter.
type LibrarySourceChip = 'ALL' | WebsiteAssetSource;
const LIBRARY_SOURCE_CHIPS: { value: LibrarySourceChip; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'GENERATED', label: 'Generated' },
  { value: 'PROJECT', label: 'Project' },
  { value: 'UPLOADED', label: 'Uploaded' },
  { value: 'BRAND', label: 'Brand' },
  { value: 'TEAM', label: 'Team' },
];

// Client-side filter predicate for the loaded library (search + source + ★).
// `query` is a case-insensitive substring over name + tags + projectName.
const matchesLibraryFilter = (
  asset: WebsiteAsset,
  source: LibrarySourceChip,
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

export const ProjectImagePicker = ({
  sitePublicUrl,
  onPick,
  triggerLabel,
  projectName,
}: ProjectImagePickerProps) => {
  const notify = usePropelToast();
  const { featureOff, markFeatureOff } = useProjectAssets();

  const [opened, setOpened] = useState(false);
  const [tab, setTab] = useState<PickerTab>('library');
  const [stage, setStage] = useState<Stage>('search');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState<ProjectSearchResult[]>([]);
  const [images, setImages] = useState<ProjectImage[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectSearchResult | null>(null);
  const [searched, setSearched] = useState(false);

  // ── Generate tab (I5) state ──────────────────────────────────────────────
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState<ImageAspect>('landscape');
  const [generating, setGenerating] = useState(false);
  // Latched per-picker when the CRM route answers FEATURE_OFF (OpenAI /
  // image-service not wired) — dims the Generate tab body, never crashes.
  const [genFeatureOff, setGenFeatureOff] = useState(false);

  // ── Library tab (H1) state ────────────────────────────────────────────────
  // Lazy-loaded once on first open of the Library tab (cap 200, newest first).
  // Filtering (search + source chip + ★) is client-side over the loaded set, so
  // typing never refetches. `savingPath` tracks the in-flight "Save to library".
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [assets, setAssets] = useState<WebsiteAsset[]>([]);
  const [librarySearch, setLibrarySearch] = useState('');
  const [librarySource, setLibrarySource] = useState<LibrarySourceChip>('ALL');
  const [libraryFavorites, setLibraryFavorites] = useState(false);
  const [savingPath, setSavingPath] = useState<string | null>(null);
  const [savedPaths, setSavedPaths] = useState<Set<string>>(new Set());

  const loadLibrary = async () => {
    setLibraryBusy(true);
    const res = await listAssets();
    setLibraryBusy(false);
    setLibraryLoaded(true);
    if (res.ok) {
      setAssets(res.data.assets);
      return;
    }
    notify(res.error, 'error');
  };

  // Fetch the library the first time its tab is shown (while the popover is open).
  useEffect(() => {
    if (opened && tab === 'library' && !libraryLoaded && !libraryBusy) {
      void loadLibrary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, tab, libraryLoaded, libraryBusy]);

  const saveRenderToLibrary = async (img: ProjectImage) => {
    if (savingPath !== null || savedPaths.has(img.gatewayPath)) return;
    setSavingPath(img.gatewayPath);
    const res = await createAsset({
      source: 'PROJECT',
      gatewayPath: img.gatewayPath,
      projectExternalId: activeProject?.externalId ?? '',
      projectName: activeProject?.name ?? '',
    });
    setSavingPath(null);
    if (res.ok) {
      setSavedPaths((prev) => new Set(prev).add(img.gatewayPath));
      // Force a re-fetch next time the Library tab opens so the new row shows up.
      setLibraryLoaded(false);
      notify('Saved to library.', 'success');
      return;
    }
    notify(res.error, 'error');
  };

  const visibleAssets = assets.filter((a) =>
    matchesLibraryFilter(a, librarySource, libraryFavorites, librarySearch),
  );

  // No gateway host, or the feature is off for this workspace → no button at all.
  if (sitePublicUrl === '' || featureOff) return null;

  const close = () => {
    setOpened(false);
  };

  const runSearch = async () => {
    const q = query.trim();
    if (q === '') return;
    setBusy(true);
    setSearched(true);
    const res = await searchProjects(q);
    setBusy(false);
    if (res.ok) {
      setProjects(res.data);
      setStage('search');
      return;
    }
    if (res.featureOff) {
      markFeatureOff();
      close();
      return;
    }
    notify(res.error, 'error');
    close();
  };

  const openProject = async (project: ProjectSearchResult) => {
    setActiveProject(project);
    setStage('images');
    setBusy(true);
    const res = await fetchProjectImages(project.externalId);
    setBusy(false);
    if (res.ok) {
      setImages(res.data);
      return;
    }
    if (res.featureOff) {
      markFeatureOff();
      close();
      return;
    }
    notify(res.error, 'error');
    close();
  };

  const pick = (gatewayPath: string) => {
    onPick(gatewayPath);
    close();
  };

  const runGenerate = async () => {
    const p = prompt.trim();
    if (p === '' || generating) return;
    setGenerating(true);
    const res = await generateImage({ prompt: p, aspect, projectName: projectName ?? '' });
    setGenerating(false);
    if (res.ok) {
      onPick(res.gatewayPath);
      notify('Image generated.', 'success');
      close();
      return;
    }
    if (res.featureOff) {
      // Not wired on this workspace → dim the tab body; keep the popover open.
      setGenFeatureOff(true);
      return;
    }
    notify(res.error, 'error');
  };

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      width={320}
      shadow="md"
      zIndex={5000}
      trapFocus
    >
      <Popover.Target>
        {triggerLabel ? (
          <Button
            size="compact-xs"
            variant="light"
            color="red"
            leftSection={<IconPhoto size={14} />}
            onClick={() => setOpened((o) => !o)}
          >
            {triggerLabel}
          </Button>
        ) : (
          <Tooltip label="Browse project images" withinPortal zIndex={5000}>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              aria-label="Browse project images"
              onClick={() => setOpened((o) => !o)}
            >
              <IconPhoto size={15} />
            </ActionIcon>
          </Tooltip>
        )}
      </Popover.Target>
      <Popover.Dropdown>
        <Tabs
          value={tab}
          onChange={(v) => setTab((v as PickerTab | null) ?? 'library')}
          color="red"
          mb="xs"
        >
          <Tabs.List>
            <Tabs.Tab value="library" fz="xs">
              Library
            </Tabs.Tab>
            <Tabs.Tab value="renders" fz="xs">
              Project renders
            </Tabs.Tab>
            <Tabs.Tab value="generate" fz="xs">
              Generate
            </Tabs.Tab>
            {/* Upload (task #18) — disabled shell; needs the engine byte-bridge. */}
            <Tooltip label="Coming soon" withinPortal zIndex={5000}>
              <Box component="span" style={{ display: 'inline-flex' }}>
                <Tabs.Tab value="upload" fz="xs" disabled>
                  Upload
                </Tabs.Tab>
              </Box>
            </Tooltip>
          </Tabs.List>
        </Tabs>
        {tab === 'library' ? (
          <Stack gap="xs">
            <TextInput
              size="xs"
              placeholder="Search saved assets"
              leftSection={<IconSearch size={14} />}
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.currentTarget.value)}
              autoFocus
            />
            <Group gap={4} wrap="wrap">
              {LIBRARY_SOURCE_CHIPS.map((c) => (
                <Chip
                  key={c.value}
                  size="xs"
                  color="red"
                  variant={librarySource === c.value ? 'filled' : 'outline'}
                  checked={librarySource === c.value}
                  onChange={() => setLibrarySource(c.value)}
                >
                  {c.label}
                </Chip>
              ))}
              <Tooltip label="Favorites only" withinPortal zIndex={5000}>
                <ActionIcon
                  size="sm"
                  variant={libraryFavorites ? 'filled' : 'subtle'}
                  color="yellow"
                  aria-label="Toggle favorites only"
                  aria-pressed={libraryFavorites}
                  onClick={() => setLibraryFavorites((f) => !f)}
                >
                  <IconStar size={15} />
                </ActionIcon>
              </Tooltip>
            </Group>
            {libraryBusy ? (
              <Center h={120}>
                <Loader size="sm" color="red" />
              </Center>
            ) : visibleAssets.length > 0 ? (
              <ScrollArea.Autosize mah={300}>
                <SimpleGrid cols={3} spacing={6}>
                  {visibleAssets.map((a) => (
                    <UnstyledButton key={a.id} onClick={() => pick(a.gatewayPath)}>
                      <Box
                        style={{
                          position: 'relative',
                          aspectRatio: '1 / 1',
                          overflow: 'hidden',
                          borderRadius: 6,
                          border: '1px solid var(--mantine-color-gray-3)',
                        }}
                      >
                        <img
                          src={`${sitePublicUrl}${a.gatewayPath}`}
                          alt={a.altText || a.name}
                          loading="lazy"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        {a.favorite ? (
                          <IconStar
                            size={13}
                            style={{
                              position: 'absolute',
                              top: 3,
                              right: 3,
                              color: 'var(--mantine-color-yellow-5)',
                              filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.6))',
                              pointerEvents: 'none',
                            }}
                          />
                        ) : null}
                      </Box>
                    </UnstyledButton>
                  ))}
                </SimpleGrid>
              </ScrollArea.Autosize>
            ) : (
              <Text size="xs" c="dimmed" ta="center" py="md">
                {libraryLoaded && assets.length > 0
                  ? 'No assets match your filters.'
                  : 'No saved assets yet — generate or save a project render.'}
              </Text>
            )}
          </Stack>
        ) : tab === 'generate' ? (
          genFeatureOff ? (
            <Text size="xs" c="dimmed" ta="center" py="md">
              AI image generation isn’t configured yet.
            </Text>
          ) : (
            <Stack gap="xs">
              <Textarea
                size="xs"
                placeholder="Describe the image — e.g. sunlit modern living room with a Dubai skyline view"
                autosize
                minRows={3}
                maxRows={6}
                value={prompt}
                onChange={(e) => setPrompt(e.currentTarget.value)}
              />
              <SegmentedControl
                size="xs"
                fullWidth
                color="red"
                value={aspect}
                onChange={(v) => setAspect(v as ImageAspect)}
                data={[
                  { value: 'landscape', label: 'Landscape' },
                  { value: 'portrait', label: 'Portrait' },
                  { value: 'square', label: 'Square' },
                ]}
              />
              <Button
                size="xs"
                color="red"
                loading={generating}
                disabled={prompt.trim() === '' || generating}
                onClick={() => void runGenerate()}
              >
                Generate
              </Button>
            </Stack>
          )
        ) : stage === 'search' ? (
          <Stack gap="xs">
            <Group gap="xs" wrap="nowrap">
              <TextInput
                size="xs"
                style={{ flex: 1 }}
                placeholder="Search projects"
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void runSearch();
                }}
                autoFocus
              />
              <ActionIcon
                size="lg"
                variant="light"
                color="red"
                aria-label="Search"
                loading={busy}
                onClick={() => void runSearch()}
              >
                <IconSearch size={15} />
              </ActionIcon>
            </Group>
            {busy ? (
              <Center h={80}>
                <Loader size="sm" color="red" />
              </Center>
            ) : projects.length > 0 ? (
              <ScrollArea.Autosize mah={260}>
                <Stack gap={4}>
                  {projects.map((p) => (
                    <UnstyledButton
                      key={p.externalId}
                      onClick={() => void openProject(p)}
                      style={{ padding: '6px 8px', borderRadius: 6 }}
                      className="propel-lp-project-row"
                    >
                      <Text size="sm" fw={500} truncate>
                        {p.name}
                      </Text>
                      <Text size="xs" c="dimmed" truncate>
                        {[p.developerName, p.districtName].filter(Boolean).join(' · ')}
                      </Text>
                    </UnstyledButton>
                  ))}
                </Stack>
              </ScrollArea.Autosize>
            ) : searched ? (
              <Text size="xs" c="dimmed" ta="center" py="sm">
                No projects found.
              </Text>
            ) : (
              <Text size="xs" c="dimmed" ta="center" py="sm">
                Search a project to browse its images.
              </Text>
            )}
          </Stack>
        ) : (
          <Stack gap="xs">
            <Group gap="xs" justify="space-between" wrap="nowrap">
              <Text size="sm" fw={600} truncate>
                {activeProject?.name ?? 'Images'}
              </Text>
              <UnstyledButton onClick={() => setStage('search')}>
                <Text size="xs" c="red">
                  Back
                </Text>
              </UnstyledButton>
            </Group>
            {busy ? (
              <Center h={120}>
                <Loader size="sm" color="red" />
              </Center>
            ) : images.length > 0 ? (
              <ScrollArea.Autosize mah={300}>
                <SimpleGrid cols={3} spacing={6}>
                  {images.map((img) => {
                    const saved = savedPaths.has(img.gatewayPath);
                    return (
                      <Box key={img.id} style={{ position: 'relative' }}>
                        <UnstyledButton
                          onClick={() => pick(img.gatewayPath)}
                          style={{ display: 'block', width: '100%' }}
                        >
                          <Box
                            style={{
                              aspectRatio: '1 / 1',
                              overflow: 'hidden',
                              borderRadius: 6,
                              border: '1px solid var(--mantine-color-gray-3)',
                            }}
                          >
                            <img
                              src={`${sitePublicUrl}${img.gatewayPath}`}
                              alt=""
                              loading="lazy"
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          </Box>
                        </UnstyledButton>
                        <Tooltip
                          label={saved ? 'Saved to library' : 'Save to library'}
                          withinPortal
                          zIndex={5000}
                        >
                          <ActionIcon
                            size="sm"
                            variant="filled"
                            color={saved ? 'green' : 'dark'}
                            aria-label="Save to library"
                            loading={savingPath === img.gatewayPath}
                            disabled={saved}
                            onClick={(e) => {
                              e.stopPropagation();
                              void saveRenderToLibrary(img);
                            }}
                            style={{ position: 'absolute', top: 4, right: 4, opacity: 0.92 }}
                          >
                            <IconBookmark size={13} />
                          </ActionIcon>
                        </Tooltip>
                      </Box>
                    );
                  })}
                </SimpleGrid>
              </ScrollArea.Autosize>
            ) : (
              <Text size="xs" c="dimmed" ta="center" py="sm">
                No images for this project.
              </Text>
            )}
          </Stack>
        )}
      </Popover.Dropdown>
    </Popover>
  );
};

export default ProjectImagePicker;
