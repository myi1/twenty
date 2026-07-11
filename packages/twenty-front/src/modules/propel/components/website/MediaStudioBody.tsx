import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Chip,
  CopyButton,
  Group,
  Loader,
  Modal,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBookmark,
  IconCheck,
  IconChevronLeft,
  IconCopy,
  IconDownload,
  IconLink,
  IconPhoto,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconStar,
  IconTrash,
  IconUpload,
  IconWand,
} from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { ImageWithFallback } from '@/propel/components/shared/ImageWithFallback';
import {
  enhanceImage,
  generateImage,
  improvePrompt,
  projectImages as fetchProjectImages,
  searchProjects,
  type ImageAspect,
  type ProjectImage,
  type ProjectSearchResult,
} from '@/propel/lib/landingPagesCrm';
import {
  createAsset,
  listAssets,
  uploadAsset,
  type WebsiteAsset,
  type WebsiteAssetSource,
} from '@/propel/lib/websiteAssetsCrm';

// Media Studio BODY (LP Builder v2 §4.3 / §5) — the shared image workbench.
// Extracted out of MediaStudioModal so the SAME panels (Library · Generate ·
// Enhance · Project renders · Upload) power two hosts:
//
//   • the in-editor fullScreen Modal (MediaStudioModal) — passes `onPick`, so the
//     panels offer "Use this image" (insert the gatewayPath into the field + close).
//   • the standalone Marketing → Media Studio tab (MediaStudioTab) — NO `onPick`,
//     so there is no insert action: "Save to library" is the primary action on
//     Generate/Enhance, and Library/Renders tiles get Copy URL + Download instead.
//
// Everything below the host boundary is identical between the two; the only
// difference is the presence of `onPick` (→ `insertMode`).
//
// The founder's rule (M0): NOTHING auto-saves. Generate/Enhance land the image on
// the image-service and show it in the preview; it enters the Library ONLY when
// the user clicks "Save to library".
//
// Graceful degrade (mandatory — routes may not be deployed):
//  • sitePublicUrl empty → Generate/Enhance dimmed (no gateway host to preview).
//  • route FEATURE_OFF   → that tab shows a dimmed note (never fabricates output).
//  • transient error     → toast; the surface stays open.

// ── shared project-assets feature latch ───────────────────────────────────────
// One flag shared by every studio instance in the editor: the first project-search
// that comes back FEATURE_OFF marks the Renders tab off for all of them, so a
// marketer never sees a project gallery that can't load. (Re-homed from the retired
// ProjectImagePicker so LandingPagesTab's provider import keeps working.)
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
  // Default latch when a studio is (defensively) rendered outside a provider — it
  // just behaves as its own island rather than crashing. (The standalone tab has no
  // provider, so it uses this island default.)
  useContext(ProjectAssetsContext) ?? { featureOff: false, markFeatureOff: () => {} };

// ── presets (M4) — fork-side prompt assembly ──────────────────────────────────
// GENERATE_PRESETS: label → prompt suffix. Multi-select; the final generate prompt
// is `user prompt + ", " + active suffixes`.
export const GENERATE_PRESETS: { label: string; suffix: string }[] = [
  { label: 'Golden hour', suffix: 'golden-hour lighting' },
  { label: 'Dubai skyline bg', suffix: 'Dubai skyline in the background' },
  { label: 'Dubai waterfront bg', suffix: 'Dubai waterfront in the background' },
  { label: 'Photorealistic', suffix: 'photorealistic, ultra-detailed' },
  { label: 'Twilight exterior', suffix: 'twilight exterior, warm interior glow' },
  { label: 'Bright interior', suffix: 'bright sunlit interior' },
  { label: 'Lifestyle', suffix: 'aspirational lifestyle scene' },
  { label: 'Aerial / community', suffix: 'aerial view of the community' },
];

// ENHANCE_PRESETS: label → edit instruction. Multi-select. The CRM `enhance` route
// assembles the final edit prompt from the selected LABELS + the free-text
// instructions (the `instruction` here is the fallback intent behind each label).
export const ENHANCE_PRESETS: { label: string; instruction: string }[] = [
  { label: 'Upscale 2×', instruction: 'upscale to 2× resolution, sharpen fine detail' },
  { label: 'Brighten', instruction: 'brighten the exposure and lift the shadows' },
  { label: 'Golden-hour relight', instruction: 'relight the scene with warm golden-hour tones' },
  { label: 'Replace sky', instruction: 'replace the sky with a clear blue sky' },
  { label: 'Declutter', instruction: 'remove clutter and distracting objects' },
  { label: 'Photorealistic', instruction: 'make it photorealistic and ultra-detailed' },
];

// ── library filter chips (M5) ─────────────────────────────────────────────────
// Single-select. 'FAVORITES' is a pseudo-source (filters favorite=true); the rest
// match `asset.source`.
type LibraryChip = 'ALL' | WebsiteAssetSource | 'FAVORITES';
const LIBRARY_CHIPS: { value: LibraryChip; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'GENERATED', label: 'Generated' },
  { value: 'ENHANCED', label: 'Enhanced' },
  { value: 'PROJECT', label: 'Project' },
  { value: 'FAVORITES', label: 'Favorites' },
];

const matchesLibraryFilter = (asset: WebsiteAsset, chip: LibraryChip, query: string): boolean => {
  if (chip === 'FAVORITES') {
    if (!asset.favorite) return false;
  } else if (chip !== 'ALL' && asset.source !== chip) {
    return false;
  }
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return (
    asset.name.toLowerCase().includes(q) ||
    asset.tags.toLowerCase().includes(q) ||
    asset.projectName.toLowerCase().includes(q)
  );
};

const ASPECT_DATA: { value: ImageAspect; label: string }[] = [
  { value: 'landscape', label: 'Landscape' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'square', label: 'Square' },
];

type StudioTab = 'library' | 'generate' | 'enhance' | 'renders';
type RenderStage = 'search' | 'images';

const dashedTile: CSSProperties = {
  aspectRatio: '1 / 1',
  overflow: 'hidden',
  borderRadius: 8,
  border: '1px solid var(--mantine-color-gray-3)',
};

// Trigger a browser download of a fully-qualified image URL. Same-origin downloads
// directly; a cross-origin gateway host may open in a new tab instead (the browser
// ignores `download` cross-origin) — an acceptable graceful fallback, no deps.
const triggerDownload = (url: string, gatewayPath: string) => {
  const a = document.createElement('a');
  a.href = url;
  a.download = gatewayPath.split('/').pop() || 'image';
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
};

// ── device upload (SRC-2 / plan SM6) ──────────────────────────────────────────
// The hero is main-thread twenty-front code, so <input type=file> + FileReader
// work today (the old "engine byte-bridge" gate applied to SANDBOXED
// front-components only). Client-side caps mirror the route: image mime, ≤4MB.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

// The image types the image-service accepts (magic-byte verified server-side).
const UPLOAD_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// Main-thread FileReader → bare base64 (data:-URL prefix stripped). Mirrors
// inboxApi.fileToBase64.
const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('unreadable'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });

// ── the studio body ───────────────────────────────────────────────────────────
interface MediaStudioBodyProps {
  sitePublicUrl: string;
  // Editor context passes this → the panels offer "Use this image" (insert + the
  // host closes). Standalone studio omits it → no insert action.
  onPick?: (gatewayPath: string) => void;
  // Best-effort context for the AI guardrail (the page draft's title). Empty is
  // fine — the CRM route only shapes on a non-empty value.
  projectName?: string;
  // Whether this surface is live. The modal passes its `opened` flag so the library
  // only fetches while the modal is open (there is one studio per image field, so a
  // page-load must not fan out N list calls). Standalone defaults to always-active.
  active?: boolean;
}

export const MediaStudioBody = ({
  sitePublicUrl,
  onPick,
  projectName,
  active = true,
}: MediaStudioBodyProps) => {
  const notify = usePropelToast();
  const { featureOff: rendersFeatureOff, markFeatureOff } = useProjectAssets();

  // The single behavioural switch between the two hosts.
  const insertMode = typeof onPick === 'function';

  const [tab, setTab] = useState<StudioTab>('library');

  // Upload moved out of a tab into a Modal opened from the Library toolbar (and
  // the Enhance "Upload new" button). The upload panel UI is unchanged.
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  // No gateway host → previews can't render; Generate/Enhance degrade to a note.
  const gatewayReady = sitePublicUrl !== '';

  // ── Library state (harvested from the old picker) ───────────────────────────
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [assets, setAssets] = useState<WebsiteAsset[]>([]);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryChip, setLibraryChip] = useState<LibraryChip>('ALL');

  // ── Generate state ──────────────────────────────────────────────────────────
  const [genPrompt, setGenPrompt] = useState('');
  const [genPresets, setGenPresets] = useState<string[]>([]);
  const [genAspect, setGenAspect] = useState<ImageAspect>('landscape');
  const [generating, setGenerating] = useState(false);
  const [improving, setImproving] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);
  const [genFeatureOff, setGenFeatureOff] = useState(false);
  const [genSaving, setGenSaving] = useState(false);
  const [genSaved, setGenSaved] = useState(false);

  // ── Enhance state ───────────────────────────────────────────────────────────
  const [enhSourceUrl, setEnhSourceUrl] = useState(''); // fully-qualified https
  const [enhUrlInput, setEnhUrlInput] = useState('');
  const [enhPickerOpen, setEnhPickerOpen] = useState(false);
  const [enhPresets, setEnhPresets] = useState<string[]>([]);
  const [enhInstructions, setEnhInstructions] = useState('');
  const [enhancing, setEnhancing] = useState(false);
  const [enhResult, setEnhResult] = useState<string | null>(null);
  const [enhFeatureOff, setEnhFeatureOff] = useState(false);
  const [enhSaving, setEnhSaving] = useState(false);
  const [enhSaved, setEnhSaved] = useState(false);

  // ── Upload state (SRC-2 / plan SM6) ─────────────────────────────────────────
  const [upBusy, setUpBusy] = useState(false);
  const [upError, setUpError] = useState<string | null>(null);
  const [upResult, setUpResult] = useState<{ gatewayPath: string; filename: string } | null>(null);
  const [upFeatureOff, setUpFeatureOff] = useState(false);
  const [upDragOver, setUpDragOver] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  // ── Project renders state (harvested) ───────────────────────────────────────
  const [stage, setStage] = useState<RenderStage>('search');
  const [query, setQuery] = useState('');
  const [renderBusy, setRenderBusy] = useState(false);
  const [projects, setProjects] = useState<ProjectSearchResult[]>([]);
  const [renderImages, setRenderImages] = useState<ProjectImage[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectSearchResult | null>(null);
  const [searched, setSearched] = useState(false);
  const [savingPath, setSavingPath] = useState<string | null>(null);
  const [savedPaths, setSavedPaths] = useState<Set<string>>(new Set());

  // In insert mode this hands the gatewayPath to the host (which then closes). In
  // studio mode there is no insert, so `pick` is never wired to a control.
  const pick = (gatewayPath: string) => {
    onPick?.(gatewayPath);
  };

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

  // Fetch the library lazily the first time it's needed (Library tab OR the Enhance
  // inline source picker), while the surface is active.
  useEffect(() => {
    const needsLibrary = active && (tab === 'library' || (tab === 'enhance' && enhPickerOpen));
    if (needsLibrary && !libraryLoaded && !libraryBusy) {
      void loadLibrary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, tab, enhPickerOpen, libraryLoaded, libraryBusy]);

  const visibleAssets = assets.filter((a) => matchesLibraryFilter(a, libraryChip, librarySearch));

  // ── Generate ────────────────────────────────────────────────────────────────
  const assembledPrompt = (): string => {
    const suffixes = GENERATE_PRESETS.filter((p) => genPresets.includes(p.label)).map((p) => p.suffix);
    return [genPrompt.trim(), ...suffixes].filter((s) => s !== '').join(', ');
  };

  const runImprovePrompt = async () => {
    if (improving) return;
    const idea = genPrompt.trim();
    if (idea === '') {
      notify('Type a rough idea first, then improve it.', 'info');
      return;
    }
    setImproving(true);
    const res = await improvePrompt({ idea, presets: genPresets, projectName: projectName ?? '' });
    setImproving(false);
    if (res.ok) {
      setGenPrompt(res.prompt);
      notify('Prompt improved.', 'success');
      return;
    }
    if (res.featureOff) {
      setGenFeatureOff(true);
      return;
    }
    notify(res.error, 'error');
  };

  const runGenerate = async () => {
    if (generating) return;
    const prompt = assembledPrompt();
    if (prompt === '') return;
    setGenerating(true);
    setGenSaved(false);
    const res = await generateImage({ prompt, aspect: genAspect, projectName: projectName ?? '' });
    setGenerating(false);
    if (res.ok) {
      setGenResult(res.gatewayPath);
      notify('Image generated.', 'success');
      return;
    }
    if (res.featureOff) {
      setGenFeatureOff(true);
      return;
    }
    notify(res.error, 'error');
  };

  const saveGeneratedToLibrary = async () => {
    if (genResult === null || genSaving || genSaved) return;
    setGenSaving(true);
    const res = await createAsset({
      source: 'GENERATED',
      gatewayPath: genResult,
      prompt: assembledPrompt(),
      projectName: projectName ?? '',
    });
    setGenSaving(false);
    if (res.ok) {
      setGenSaved(true);
      setLibraryLoaded(false); // force a refetch so the Library tab shows the new row
      notify('Saved to library.', 'success');
      return;
    }
    notify(res.error, 'error');
  };

  // ── Enhance ─────────────────────────────────────────────────────────────────
  const pickEnhanceSource = (fullUrl: string) => {
    setEnhSourceUrl(fullUrl);
    setEnhResult(null);
    setEnhSaved(false);
    setEnhPickerOpen(false);
  };

  const applyPastedUrl = () => {
    const u = enhUrlInput.trim();
    if (u === '') return;
    pickEnhanceSource(u);
  };

  const runEnhance = async () => {
    if (enhancing) return;
    if (enhSourceUrl === '') {
      notify('Pick a source image first.', 'info');
      return;
    }
    setEnhancing(true);
    setEnhSaved(false);
    const res = await enhanceImage({
      sourceUrl: enhSourceUrl,
      enhancements: enhPresets,
      instructions: enhInstructions,
      aspect: 'landscape',
      projectName: projectName ?? '',
    });
    setEnhancing(false);
    if (res.ok) {
      setEnhResult(res.gatewayPath);
      notify('Image enhanced.', 'success');
      return;
    }
    if (res.featureOff) {
      setEnhFeatureOff(true);
      return;
    }
    notify(res.error, 'error');
  };

  const saveEnhancedToLibrary = async () => {
    if (enhResult === null || enhSaving || enhSaved) return;
    setEnhSaving(true);
    const res = await createAsset({
      source: 'ENHANCED',
      gatewayPath: enhResult,
      prompt: enhInstructions,
      projectName: projectName ?? '',
    });
    setEnhSaving(false);
    if (res.ok) {
      setEnhSaved(true);
      setLibraryLoaded(false);
      notify('Saved to library.', 'success');
      return;
    }
    notify(res.error, 'error');
  };

  // ── Project renders (harvested) ─────────────────────────────────────────────
  const runSearch = async () => {
    const q = query.trim();
    if (q === '') return;
    setRenderBusy(true);
    setSearched(true);
    const res = await searchProjects(q);
    setRenderBusy(false);
    if (res.ok) {
      setProjects(res.data);
      setStage('search');
      return;
    }
    if (res.featureOff) {
      markFeatureOff();
      return;
    }
    notify(res.error, 'error');
  };

  const openProject = async (project: ProjectSearchResult) => {
    setActiveProject(project);
    setStage('images');
    setRenderBusy(true);
    const res = await fetchProjectImages(project.externalId);
    setRenderBusy(false);
    if (res.ok) {
      setRenderImages(res.data);
      return;
    }
    if (res.featureOff) {
      markFeatureOff();
      setStage('search');
      return;
    }
    notify(res.error, 'error');
    setStage('search');
  };

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
      setLibraryLoaded(false);
      notify('Saved to library.', 'success');
      return;
    }
    notify(res.error, 'error');
  };

  // ── Upload (SRC-2) ──────────────────────────────────────────────────────────
  // Client-side validation mirrors the route caps (image mime, ≤4MB) so the user
  // gets an instant, specific error instead of a round-trip 4xx. On success the
  // asset is ALREADY in the library (the route creates the UPLOADED row) — we just
  // invalidate the cached list so the Library tab refetches.
  const handleUploadFile = async (file: File) => {
    if (upBusy) return;
    setUpError(null);
    if (!UPLOAD_MIME_TYPES.includes(file.type)) {
      setUpError('That file isn’t a supported image — use JPEG, PNG, WebP, or GIF.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUpError(
        `That image is ${(file.size / (1024 * 1024)).toFixed(1)}MB — the limit is 4MB.`,
      );
      return;
    }
    setUpBusy(true);
    setUpResult(null);
    try {
      const dataBase64 = await fileToBase64(file);
      const res = await uploadAsset(file.name, dataBase64);
      if (res.ok) {
        setUpResult({ gatewayPath: res.gatewayPath, filename: file.name });
        setLibraryLoaded(false); // the Library tab refetches and shows the new row
        notify('Image uploaded to the library.', 'success');
      } else if (res.featureOff) {
        setUpFeatureOff(true);
      } else {
        setUpError(res.error);
      }
    } catch {
      setUpError('Could not read that file — try again.');
    }
    setUpBusy(false);
  };

  const onUploadInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    // Reset so picking the SAME file again re-fires change (retry after an error).
    e.currentTarget.value = '';
    if (file) void handleUploadFile(file);
  };

  // ── shared UI fragments ─────────────────────────────────────────────────────
  const dimmedNote = (msg: string) => (
    <Center h={220}>
      <Text size="sm" c="dimmed" ta="center" maw={360}>
        {msg}
      </Text>
    </Center>
  );

  const presetChips = (
    all: { label: string }[],
    selected: string[],
    onToggle: (label: string) => void,
  ) => (
    <Group gap={6} wrap="wrap">
      {all.map((p) => (
        <Chip
          key={p.label}
          size="xs"
          color="red"
          variant={selected.includes(p.label) ? 'filled' : 'outline'}
          checked={selected.includes(p.label)}
          onChange={() => onToggle(p.label)}
        >
          {p.label}
        </Chip>
      ))}
    </Group>
  );

  const toggleFrom =
    (setter: React.Dispatch<React.SetStateAction<string[]>>) => (label: string) =>
      setter((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]));

  // Studio-mode tile overlay: Copy URL + Download, replacing the insert action a
  // tile would carry in the editor. Rendered top-right, matching the renders tiles.
  const copyDownloadActions = (gatewayPath: string) => {
    const fullUrl = `${sitePublicUrl}${gatewayPath}`;
    return (
      <Group gap={4} style={{ position: 'absolute', top: 4, right: 4 }} wrap="nowrap">
        <CopyUrlAction url={fullUrl} />
        <Tooltip label="Download" zIndex={6000}>
          <ActionIcon
            size="sm"
            variant="filled"
            color="dark"
            aria-label="Download"
            disabled={sitePublicUrl === ''}
            onClick={() => triggerDownload(fullUrl, gatewayPath)}
            style={{ opacity: 0.92 }}
          >
            <IconDownload size={13} />
          </ActionIcon>
        </Tooltip>
      </Group>
    );
  };

  // The library grid — reused by the Library tab and the Enhance inline picker.
  // `onTile` (when provided) makes each tile a clickable button; `tileActions`
  // overlays per-tile controls (studio-mode Copy URL + Download).
  const libraryGrid = (
    onTile?: (a: WebsiteAsset) => void,
    tileActions?: (a: WebsiteAsset) => React.ReactNode,
  ) => {
    const tileInner = (a: WebsiteAsset) => (
      <Box style={{ ...dashedTile, position: 'relative' }}>
        <ImageWithFallback
          src={`${sitePublicUrl}${a.gatewayPath}`}
          alt={a.altText || a.name}
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        {a.favorite ? (
          <IconStar
            size={14}
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              color: 'var(--mantine-color-yellow-5)',
              filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.6))',
              pointerEvents: 'none',
            }}
          />
        ) : null}
      </Box>
    );

    return (
      <Stack gap="sm" style={{ minHeight: 0 }}>
        <Group gap="xs" wrap="wrap">
          <TextInput
            size="xs"
            style={{ flex: 1, minWidth: 180 }}
            placeholder="Search saved assets"
            leftSection={<IconSearch size={14} />}
            value={librarySearch}
            onChange={(e) => setLibrarySearch(e.currentTarget.value)}
          />
        </Group>
        <Group gap={6} wrap="wrap">
          {LIBRARY_CHIPS.map((c) => (
            <Chip
              key={c.value}
              size="xs"
              color="red"
              variant={libraryChip === c.value ? 'filled' : 'outline'}
              checked={libraryChip === c.value}
              onChange={() => setLibraryChip(c.value)}
            >
              {c.label}
            </Chip>
          ))}
        </Group>
        {libraryBusy ? (
          <Center h={200}>
            <Loader size="sm" color="red" />
          </Center>
        ) : visibleAssets.length > 0 ? (
          <ScrollArea.Autosize mah={460}>
            <SimpleGrid cols={{ base: 3, md: 4, lg: 5 }} spacing={8}>
              {visibleAssets.map((a) =>
                onTile ? (
                  <UnstyledButton key={a.id} onClick={() => onTile(a)}>
                    {tileInner(a)}
                  </UnstyledButton>
                ) : (
                  <Box key={a.id} style={{ position: 'relative' }}>
                    {tileInner(a)}
                    {tileActions ? tileActions(a) : null}
                  </Box>
                ),
              )}
            </SimpleGrid>
          </ScrollArea.Autosize>
        ) : (
          <Text size="sm" c="dimmed" ta="center" py="xl">
            {libraryLoaded && assets.length > 0
              ? 'No assets match your filters.'
              : 'No saved assets yet — generate, enhance, or save a project render.'}
          </Text>
        )}
      </Stack>
    );
  };

  const previewBox = (
    gatewayPath: string | null,
    emptyMsg: string,
    opts?: { busy?: boolean; hint?: string },
  ) => (
    <Box
      style={{
        aspectRatio: '4 / 3',
        borderRadius: 12,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))',
        border: gatewayPath
          ? '1px solid var(--mantine-color-default-border)'
          : '1.5px dashed var(--mantine-color-default-border)',
      }}
    >
      {gatewayPath ? (
        <ImageWithFallback
          src={`${sitePublicUrl}${gatewayPath}`}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      ) : opts?.busy ? (
        <Stack gap={10} align="center" c="dimmed">
          <Loader size="sm" color="red" />
          <Text size="sm" fw={500}>
            Creating your image…
          </Text>
          <Text size="xs">This usually takes around 20 seconds</Text>
        </Stack>
      ) : (
        <Stack gap={10} align="center" px="md" style={{ textAlign: 'center' }}>
          <ThemeIcon size={54} radius="xl" variant="light" color="red">
            <IconSparkles size={26} />
          </ThemeIcon>
          <Text size="sm" fw={500} c="dimmed">
            {emptyMsg}
          </Text>
          {opts?.hint ? (
            <Text size="xs" c="dimmed" maw={240}>
              {opts.hint}
            </Text>
          ) : null}
        </Stack>
      )}
    </Box>
  );

  // Result actions under a Generate/Enhance preview. Insert mode: Save (secondary)
  // + Use this image (primary). Studio mode: Save to library is the primary action
  // (no insert).
  const resultActions = (
    gatewayPath: string | null,
    saving: boolean,
    saved: boolean,
    onSave: () => void,
  ) => (
    <Group gap="xs">
      <Button
        size="sm"
        variant={insertMode ? 'light' : 'filled'}
        color={insertMode ? 'dark' : 'red'}
        leftSection={<IconBookmark size={15} />}
        loading={saving}
        disabled={gatewayPath === null || saved}
        onClick={onSave}
      >
        {saved ? 'Saved' : 'Save to library'}
      </Button>
      {insertMode ? (
        <Button
          size="sm"
          color="red"
          rightSection={<IconArrowRight size={15} />}
          disabled={gatewayPath === null}
          onClick={() => gatewayPath && pick(gatewayPath)}
        >
          Use this image
        </Button>
      ) : null}
    </Group>
  );

  // ── panels ──────────────────────────────────────────────────────────────────
  const generatePanel = () => {
    if (genFeatureOff)
      return dimmedNote('AI image generation isn’t configured on this workspace yet.');
    if (!gatewayReady)
      return dimmedNote(
        'Generate needs a published site host (SITE_PUBLIC_URL) to preview results. Ask an admin to configure it.',
      );
    return (
      <Group align="flex-start" gap="xl" wrap="nowrap" style={{ minHeight: 0 }}>
        <Stack gap="sm" style={{ flex: '0 0 380px', maxWidth: 380 }}>
          <Textarea
            label="Describe the image"
            size="sm"
            placeholder="e.g. sunlit modern living room with a Dubai skyline view"
            autosize
            minRows={4}
            maxRows={8}
            value={genPrompt}
            onChange={(e) => setGenPrompt(e.currentTarget.value)}
          />
          <Button
            size="xs"
            variant="light"
            color="grape"
            leftSection={<IconSparkles size={15} />}
            loading={improving}
            onClick={() => void runImprovePrompt()}
          >
            Improve prompt
          </Button>
          <Box>
            <Text size="xs" fw={500} mb={4}>
              Style presets
            </Text>
            {presetChips(GENERATE_PRESETS, genPresets, toggleFrom(setGenPresets))}
          </Box>
          <Box>
            <Text size="xs" fw={500} mb={4}>
              Aspect
            </Text>
            <SegmentedControl
              size="xs"
              fullWidth
              color="red"
              value={genAspect}
              onChange={(v) => setGenAspect(v as ImageAspect)}
              data={ASPECT_DATA}
            />
          </Box>
          <Button
            size="sm"
            color="red"
            leftSection={<IconWand size={16} />}
            loading={generating}
            disabled={assembledPrompt() === '' || generating}
            onClick={() => void runGenerate()}
          >
            Generate
          </Button>
        </Stack>
        <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
          {previewBox(genResult, 'Your image will appear here', {
            busy: generating,
            hint: 'Describe it, pick a style, then hit Generate.',
          })}
          <Group gap="xs" justify="space-between">
            <Button
              size="sm"
              variant="default"
              leftSection={<IconRefresh size={15} />}
              loading={generating}
              disabled={genResult === null || assembledPrompt() === ''}
              onClick={() => void runGenerate()}
            >
              Regenerate
            </Button>
            {resultActions(genResult, genSaving, genSaved, () => void saveGeneratedToLibrary())}
          </Group>
        </Stack>
      </Group>
    );
  };

  const enhancePanel = () => {
    if (enhFeatureOff)
      return dimmedNote('Image enhancement isn’t configured on this workspace yet.');
    if (!gatewayReady)
      return dimmedNote(
        'Enhance needs a published site host (SITE_PUBLIC_URL) to preview results. Ask an admin to configure it.',
      );
    return (
      <Group align="flex-start" gap="xl" wrap="nowrap" style={{ minHeight: 0 }}>
        <Stack gap="sm" style={{ flex: '0 0 380px', maxWidth: 380 }}>
          <Box>
            <Text size="xs" fw={500} mb={4}>
              Source image
            </Text>
            <Group gap="xs" wrap="wrap">
              <Button
                size="xs"
                variant="light"
                color="red"
                leftSection={<IconPhoto size={14} />}
                onClick={() => setEnhPickerOpen((o) => !o)}
              >
                {enhPickerOpen ? 'Close library' : 'Pick from library'}
              </Button>
              <Button
                size="xs"
                variant="default"
                leftSection={<IconUpload size={14} />}
                onClick={() => setUploadModalOpen(true)}
              >
                Upload new
              </Button>
            </Group>
            <Group gap="xs" wrap="nowrap" mt="xs">
              <TextInput
                size="xs"
                style={{ flex: 1 }}
                placeholder="…or paste an image URL"
                leftSection={<IconLink size={14} />}
                value={enhUrlInput}
                onChange={(e) => setEnhUrlInput(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyPastedUrl();
                }}
              />
              <Button size="xs" variant="light" onClick={applyPastedUrl} disabled={enhUrlInput.trim() === ''}>
                Set
              </Button>
            </Group>
          </Box>
          {enhPickerOpen ? (
            <Box>{libraryGrid((a) => pickEnhanceSource(`${sitePublicUrl}${a.gatewayPath}`))}</Box>
          ) : null}
          <Box>
            <Text size="xs" fw={500} mb={4}>
              Enhancements
            </Text>
            {presetChips(ENHANCE_PRESETS, enhPresets, toggleFrom(setEnhPresets))}
          </Box>
          <Textarea
            label="Instructions (optional)"
            size="sm"
            placeholder="e.g. warm up the lighting, keep the furniture layout"
            autosize
            minRows={2}
            maxRows={5}
            value={enhInstructions}
            onChange={(e) => setEnhInstructions(e.currentTarget.value)}
          />
          <Button
            size="sm"
            color="red"
            leftSection={<IconWand size={16} />}
            loading={enhancing}
            disabled={enhSourceUrl === '' || enhancing}
            onClick={() => void runEnhance()}
          >
            Enhance
          </Button>
        </Stack>
        <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
          <SimpleGrid cols={2} spacing="sm">
            <Stack gap={4}>
              <Text size="xs" fw={500} c="dimmed">
                Before
              </Text>
              <Box
                style={{
                  aspectRatio: '4 / 3',
                  borderRadius: 10,
                  border: '1px solid var(--mantine-color-gray-3)',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--mantine-color-gray-0)',
                }}
              >
                {enhSourceUrl !== '' ? (
                  <ImageWithFallback
                    src={enhSourceUrl}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <Stack gap={6} align="center" c="dimmed">
                    <IconPhoto size={24} />
                    <Text size="xs">Pick a source</Text>
                  </Stack>
                )}
              </Box>
            </Stack>
            <Stack gap={4}>
              <Text size="xs" fw={500} c="dimmed">
                After
              </Text>
              {previewBox(enhResult, 'Enhanced result', {
                busy: enhancing,
                hint: 'Pick a source, choose enhancements, then Enhance.',
              })}
            </Stack>
          </SimpleGrid>
          <Group justify="flex-end">
            {resultActions(enhResult, enhSaving, enhSaved, () => void saveEnhancedToLibrary())}
          </Group>
        </Stack>
      </Group>
    );
  };

  const rendersPanel = () => {
    if (rendersFeatureOff)
      return dimmedNote('Project renders aren’t configured on this workspace.');
    return (
      <Stack gap="sm" style={{ minHeight: 0 }}>
        {stage === 'search' ? (
          <>
            <Group gap="xs" wrap="nowrap" maw={520}>
              <TextInput
                size="sm"
                style={{ flex: 1 }}
                placeholder="Search projects"
                leftSection={<IconSearch size={15} />}
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void runSearch();
                }}
              />
              <Button size="sm" color="red" loading={renderBusy} onClick={() => void runSearch()}>
                Search
              </Button>
            </Group>
            {renderBusy ? (
              <Center h={160}>
                <Loader size="sm" color="red" />
              </Center>
            ) : projects.length > 0 ? (
              <ScrollArea.Autosize mah={460}>
                <Stack gap={4} maw={520}>
                  {projects.map((p) => (
                    <UnstyledButton
                      key={p.externalId}
                      onClick={() => void openProject(p)}
                      style={{ padding: '8px 10px', borderRadius: 6 }}
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
              <Text size="sm" c="dimmed" py="md">
                No projects found.
              </Text>
            ) : (
              <Text size="sm" c="dimmed" py="md">
                Search a project to browse its renders.
              </Text>
            )}
          </>
        ) : (
          <>
            <Group gap="xs" justify="space-between" wrap="nowrap">
              <Group gap={6} wrap="nowrap">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  aria-label="Back to search"
                  onClick={() => setStage('search')}
                >
                  <IconChevronLeft size={16} />
                </ActionIcon>
                <Text size="sm" fw={600} truncate>
                  {activeProject?.name ?? 'Renders'}
                </Text>
              </Group>
            </Group>
            {renderBusy ? (
              <Center h={200}>
                <Loader size="sm" color="red" />
              </Center>
            ) : renderImages.length > 0 ? (
              <ScrollArea.Autosize mah={460}>
                <SimpleGrid cols={{ base: 3, md: 4, lg: 5 }} spacing={8}>
                  {renderImages.map((img) => {
                    const saved = savedPaths.has(img.gatewayPath);
                    return (
                      <Box key={img.id} style={{ position: 'relative' }}>
                        <Box style={dashedTile}>
                          <ImageWithFallback
                            src={`${sitePublicUrl}${img.gatewayPath}`}
                            alt=""
                            loading="lazy"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </Box>
                        <Group
                          gap={4}
                          style={{ position: 'absolute', top: 4, right: 4 }}
                          wrap="nowrap"
                        >
                          <Tooltip label={saved ? 'Saved' : 'Save to library'} zIndex={6000}>
                            <ActionIcon
                              size="sm"
                              variant="filled"
                              color={saved ? 'green' : 'dark'}
                              aria-label="Save to library"
                              loading={savingPath === img.gatewayPath}
                              disabled={saved}
                              onClick={() => void saveRenderToLibrary(img)}
                              style={{ opacity: 0.92 }}
                            >
                              <IconBookmark size={13} />
                            </ActionIcon>
                          </Tooltip>
                          {insertMode ? (
                            <Tooltip label="Use this image" zIndex={6000}>
                              <ActionIcon
                                size="sm"
                                variant="filled"
                                color="red"
                                aria-label="Use this image"
                                onClick={() => pick(img.gatewayPath)}
                                style={{ opacity: 0.92 }}
                              >
                                <IconArrowRight size={13} />
                              </ActionIcon>
                            </Tooltip>
                          ) : (
                            <>
                              <CopyUrlAction url={`${sitePublicUrl}${img.gatewayPath}`} />
                              <Tooltip label="Download" zIndex={6000}>
                                <ActionIcon
                                  size="sm"
                                  variant="filled"
                                  color="dark"
                                  aria-label="Download"
                                  disabled={sitePublicUrl === ''}
                                  onClick={() =>
                                    triggerDownload(
                                      `${sitePublicUrl}${img.gatewayPath}`,
                                      img.gatewayPath,
                                    )
                                  }
                                  style={{ opacity: 0.92 }}
                                >
                                  <IconDownload size={13} />
                                </ActionIcon>
                              </Tooltip>
                            </>
                          )}
                        </Group>
                      </Box>
                    );
                  })}
                </SimpleGrid>
              </ScrollArea.Autosize>
            ) : (
              <Text size="sm" c="dimmed" py="md">
                No renders for this project.
              </Text>
            )}
          </>
        )}
      </Stack>
    );
  };

  const uploadPanel = () => {
    if (upFeatureOff)
      return dimmedNote('Device uploads aren’t configured on this workspace yet.');
    if (!gatewayReady)
      return dimmedNote(
        'Uploads need a published site host (SITE_PUBLIC_URL) to preview results. Ask an admin to configure it.',
      );
    return (
      <Group align="flex-start" gap="xl" wrap="nowrap" style={{ minHeight: 0 }}>
        <Stack gap="sm" style={{ flex: '0 0 380px', maxWidth: 380 }}>
          <input
            ref={uploadInputRef}
            type="file"
            accept={UPLOAD_MIME_TYPES.join(',')}
            style={{ display: 'none' }}
            onChange={onUploadInputChange}
          />
          <UnstyledButton
            onClick={() => uploadInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setUpDragOver(true);
            }}
            onDragLeave={() => setUpDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setUpDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void handleUploadFile(file);
            }}
            style={{
              borderRadius: 12,
              border: upDragOver
                ? '2px dashed var(--mantine-color-red-5)'
                : '1.5px dashed var(--mantine-color-default-border)',
              background: upDragOver
                ? 'var(--mantine-color-red-light)'
                : 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))',
              padding: '36px 16px',
            }}
          >
            <Stack gap={10} align="center" style={{ textAlign: 'center' }}>
              <ThemeIcon size={54} radius="xl" variant="light" color="red">
                <IconUpload size={26} />
              </ThemeIcon>
              <Text size="sm" fw={500}>
                Drag an image here, or click to browse
              </Text>
              <Text size="xs" c="dimmed">
                JPEG · PNG · WebP · GIF — up to 4MB
              </Text>
            </Stack>
          </UnstyledButton>
          {upBusy ? (
            <Group gap="xs">
              <Loader size="xs" color="red" />
              <Text size="xs" c="dimmed">
                Uploading…
              </Text>
            </Group>
          ) : null}
          {upError ? (
            <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
              {upError}
            </Alert>
          ) : null}
        </Stack>
        <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
          {previewBox(upResult?.gatewayPath ?? null, 'Your uploaded image will appear here', {
            busy: upBusy,
            hint: 'Uploads land in the Library automatically.',
          })}
          {upResult ? (
            <Group gap="xs" justify="space-between" wrap="wrap">
              <Group gap={6}>
                <IconCheck size={14} style={{ color: 'var(--mantine-color-teal-6)' }} />
                <Text size="xs" c="dimmed">
                  {upResult.filename} — saved to your library.
                </Text>
              </Group>
              {insertMode ? (
                <Button
                  size="sm"
                  color="red"
                  rightSection={<IconArrowRight size={15} />}
                  onClick={() => pick(upResult.gatewayPath)}
                >
                  Use this image
                </Button>
              ) : (
                <Group gap="xs">
                  <CopyButton value={`${sitePublicUrl}${upResult.gatewayPath}`}>
                    {({ copied, copy }) => (
                      <Button
                        size="sm"
                        variant="default"
                        leftSection={copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
                        onClick={copy}
                      >
                        {copied ? 'Copied' : 'Copy URL'}
                      </Button>
                    )}
                  </CopyButton>
                  <Button
                    size="sm"
                    variant="default"
                    leftSection={<IconDownload size={15} />}
                    onClick={() =>
                      triggerDownload(
                        `${sitePublicUrl}${upResult.gatewayPath}`,
                        upResult.gatewayPath,
                      )
                    }
                  >
                    Download
                  </Button>
                </Group>
              )}
            </Group>
          ) : null}
        </Stack>
      </Group>
    );
  };

  return (
    <Tabs
      value={tab}
      onChange={(v) => setTab((v as StudioTab | null) ?? 'library')}
      color="red"
      keepMounted={false}
    >
      <Tabs.List mb="md">
        <Tabs.Tab value="library" leftSection={<IconPhoto size={15} />}>
          Library
        </Tabs.Tab>
        <Tabs.Tab value="generate" leftSection={<IconWand size={15} />}>
          Generate
        </Tabs.Tab>
        <Tabs.Tab value="enhance" leftSection={<IconSparkles size={15} />}>
          Enhance
        </Tabs.Tab>
        <Tabs.Tab value="renders" leftSection={<IconSearch size={15} />}>
          Project renders
        </Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="library">
        <Stack gap="sm" style={{ minHeight: 0 }}>
          <Group justify="flex-end">
            <Button
              size="xs"
              color="red"
              leftSection={<IconUpload size={14} />}
              onClick={() => setUploadModalOpen(true)}
            >
              Upload
            </Button>
          </Group>
          {insertMode
            ? libraryGrid((a) => pick(a.gatewayPath))
            : libraryGrid(undefined, (a) => copyDownloadActions(a.gatewayPath))}
        </Stack>
      </Tabs.Panel>
      <Tabs.Panel value="generate">{generatePanel()}</Tabs.Panel>
      <Tabs.Panel value="enhance">{enhancePanel()}</Tabs.Panel>
      <Tabs.Panel value="renders">{rendersPanel()}</Tabs.Panel>

      <Modal
        opened={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        title="Upload an image"
        size="xl"
        zIndex={6100}
      >
        {uploadPanel()}
      </Modal>
    </Tabs>
  );
};


// A small Copy-URL overlay button (studio-mode). Uses Mantine's CopyButton so the
// clipboard write + copied affordance come for free; no extra deps.
const CopyUrlAction = ({ url }: { url: string }) => (
  <CopyButton value={url}>
    {({ copied, copy }) => (
      <Tooltip label={copied ? 'Copied' : 'Copy URL'} zIndex={6000}>
        <ActionIcon
          size="sm"
          variant="filled"
          color={copied ? 'green' : 'dark'}
          aria-label="Copy URL"
          onClick={copy}
          style={{ opacity: 0.92 }}
        >
          {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
        </ActionIcon>
      </Tooltip>
    )}
  </CopyButton>
);

export default MediaStudioBody;
