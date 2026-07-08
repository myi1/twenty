import { createContext, useContext, useMemo, useState } from 'react';
import {
  ActionIcon,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Popover,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { IconPhoto, IconSearch } from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import {
  projectImages as fetchProjectImages,
  searchProjects,
  type ProjectImage,
  type ProjectSearchResult,
} from '@/propel/lib/landingPagesCrm';

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
}

type Stage = 'search' | 'images';

export const ProjectImagePicker = ({ sitePublicUrl, onPick, triggerLabel }: ProjectImagePickerProps) => {
  const notify = usePropelToast();
  const { featureOff, markFeatureOff } = useProjectAssets();

  const [opened, setOpened] = useState(false);
  const [stage, setStage] = useState<Stage>('search');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState<ProjectSearchResult[]>([]);
  const [images, setImages] = useState<ProjectImage[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectSearchResult | null>(null);
  const [searched, setSearched] = useState(false);

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
        {stage === 'search' ? (
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
                  {images.map((img) => (
                    <UnstyledButton key={img.id} onClick={() => pick(img.gatewayPath)}>
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
                  ))}
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
