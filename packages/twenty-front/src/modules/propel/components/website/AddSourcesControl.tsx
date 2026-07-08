import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Center,
  Checkbox,
  Divider,
  Group,
  Loader,
  Popover,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconFileText, IconSearch, IconX } from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import {
  formatCharCount,
  KIND_COLOR,
  KIND_LABEL,
  listSources,
  type SourceMaterial,
} from '@/propel/lib/sourceMaterialsCrm';
import { SourceQuickAdd } from '@/propel/components/website/SourceQuickAdd';

// "Add sources" (SRC-1 / plan SM6) — the grounding picker that sits on the LP
// brief box (LandingPagesTab) and the Social campaign panel. A popover: pick from
// the source library (search + checkboxes, ≤8 — the SM3 grounding cap) or
// quick-add (the shared Paste · URL · File form) which auto-selects the new
// source. Selected sources render as removable chips next to the trigger; the
// parent passes `value.map(s => s.id)` as `sourceIds` on its generate call.
//
// Controlled + stateless about the selection: the parent owns `value` so it can
// clear it after a successful generate. The library list is fetched lazily on
// first open and kept for the popover's lifetime (refetched after a quick-add).

export const MAX_BRIEF_SOURCES = 8;

export interface SelectedSource {
  id: string;
  name: string;
}

interface AddSourcesControlProps {
  value: SelectedSource[];
  onChange: (next: SelectedSource[]) => void;
  disabled?: boolean;
}

const matchesQuery = (s: SourceMaterial, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return (
    s.name.toLowerCase().includes(q) ||
    s.tags.toLowerCase().includes(q) ||
    s.projectName.toLowerCase().includes(q)
  );
};

export const AddSourcesControl = ({
  value,
  onChange,
  disabled = false,
}: AddSourcesControlProps) => {
  const notify = usePropelToast();

  const [opened, setOpened] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sources, setSources] = useState<SourceMaterial[]>([]);
  const [search, setSearch] = useState('');

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

  const openPopover = () => {
    setOpened((o) => !o);
    if (!loaded && !busy) void load();
  };

  const isSelected = (id: string) => value.some((s) => s.id === id);
  const atCap = value.length >= MAX_BRIEF_SOURCES;

  const toggle = (s: SourceMaterial) => {
    if (isSelected(s.id)) {
      onChange(value.filter((v) => v.id !== s.id));
      return;
    }
    if (atCap) return;
    onChange([...value, { id: s.id, name: s.name || 'Untitled source' }]);
  };

  const remove = (id: string) => {
    if (disabled) return;
    onChange(value.filter((v) => v.id !== id));
  };

  // Quick-add inside the popover: refetch the library, then auto-select the new
  // source (if the cap allows) so "add → grounded" is one gesture.
  const onQuickAdded = async (id: string) => {
    const fresh = await load();
    const added = fresh.find((s) => s.id === id);
    if (added && !isSelected(id) && value.length < MAX_BRIEF_SOURCES) {
      onChange([...value, { id, name: added.name || 'Untitled source' }]);
    }
  };

  const visible = sources.filter((s) => matchesQuery(s, search));

  return (
    <Group gap={6} wrap="wrap" align="center">
      <Popover
        opened={opened}
        onChange={setOpened}
        position="bottom-start"
        width={380}
        shadow="md"
        withinPortal
        zIndex={6000}
        trapFocus
      >
        <Popover.Target>
          <Button
            size="xs"
            variant="light"
            color="gray"
            leftSection={<IconFileText size={14} />}
            onClick={openPopover}
            disabled={disabled}
          >
            Add sources
          </Button>
        </Popover.Target>
        <Popover.Dropdown p="sm">
          <Stack gap="xs">
            <Group gap={6} justify="space-between" wrap="nowrap">
              <Text size="xs" fw={600}>
                Ground this brief in your sources
              </Text>
              <Text size="xs" c="dimmed">
                {value.length}/{MAX_BRIEF_SOURCES}
              </Text>
            </Group>
            <TextInput
              size="xs"
              placeholder="Search sources"
              leftSection={<IconSearch size={13} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            {busy && !loaded ? (
              <Center h={80}>
                <Loader size="xs" color="red" />
              </Center>
            ) : visible.length > 0 ? (
              <ScrollArea.Autosize mah={220}>
                <Stack gap={4}>
                  {visible.map((s) => {
                    const checked = isSelected(s.id);
                    return (
                      <Checkbox
                        key={s.id}
                        size="xs"
                        color="red"
                        checked={checked}
                        disabled={!checked && atCap}
                        onChange={() => toggle(s)}
                        styles={{ body: { alignItems: 'center' } }}
                        label={
                          <Group gap={6} wrap="nowrap">
                            <Text size="xs" fw={500} truncate style={{ maxWidth: 190 }}>
                              {s.name || 'Untitled source'}
                            </Text>
                            <Badge size="xs" variant="light" color={KIND_COLOR[s.kind]}>
                              {KIND_LABEL[s.kind]}
                            </Badge>
                            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                              {formatCharCount(s.charCount)}
                            </Text>
                          </Group>
                        }
                      />
                    );
                  })}
                </Stack>
              </ScrollArea.Autosize>
            ) : (
              <Text size="xs" c="dimmed" ta="center" py={6}>
                {loaded && sources.length > 0
                  ? 'No sources match your search.'
                  : 'No sources yet — add one below.'}
              </Text>
            )}
            <Divider />
            <SourceQuickAdd compact onAdded={(id) => void onQuickAdded(id)} />
          </Stack>
        </Popover.Dropdown>
      </Popover>
      {value.map((s) => (
        <Badge
          key={s.id}
          size="sm"
          variant="light"
          color="gray"
          styles={{ label: { textTransform: 'none', fontWeight: 500 } }}
          rightSection={
            <Box
              component="span"
              onClick={() => remove(s.id)}
              style={{
                cursor: disabled ? 'default' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
              }}
              aria-label={`Remove ${s.name}`}
            >
              <IconX size={11} />
            </Box>
          }
        >
          {s.name}
        </Badge>
      ))}
    </Group>
  );
};

export default AddSourcesControl;
