import { useRef, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  Image,
  Stack,
  Switch,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { IconPhoto, IconStar, IconTrash, IconUpload, IconArrowLeft, IconArrowRight, IconShield } from 'twenty-ui/display';
import { type StudioPhoto } from '@/propel/types/listingStudio';
import {
  DEFAULT_WATERMARK_DIALS,
  MAX_PHOTO_BYTES,
  fileToBase64,
  isSupportedPhotoType,
  watermarkPhoto,
} from '@/propel/lib/listingStudioWatermark';

// Step 3 — Photos (lane spec §4.5 / §11). Upload unit photos, apply OUR RE/MAX
// watermark via the EXISTING /listing/watermark/stamp route (reused, not rebuilt),
// reorder (cover = first), and see the PF watermark-off guarantee. The hero runs on
// the main thread, so file bytes are read with FileReader (no front-component RPC).
//
// The single watermark switch (design §11): On = the RE/MAX logo on every photo,
// Off = clean originals. PF's own account watermark is a fixed account setting (off
// for us) surfaced as a one-line guarantee, never a second toggle ("stamped once").

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

const newId = (): string => `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const StudioPhotosStep = ({
  photos,
  onPhotos,
}: {
  photos: StudioPhoto[];
  onPhotos: (photos: StudioPhoto[]) => void;
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [watermark, setWatermark] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [err, setErr] = useState('');
  const [over, setOver] = useState(false);

  const addFiles = async (files: File[]) => {
    setErr('');
    const valid = files.filter((f) => {
      if (!isSupportedPhotoType(f.type)) {
        setErr(`${f.name}: use a JPG, PNG, or WebP image.`);
        return false;
      }
      if (f.size > MAX_PHOTO_BYTES) {
        setErr(`${f.name} is too large — keep each photo under 7 MB.`);
        return false;
      }
      return true;
    });
    if (valid.length === 0) return;

    setBusy(true);
    const added: StudioPhoto[] = [];
    let i = 0;
    for (const file of valid) {
      i += 1;
      setStatus(
        watermark
          ? `Watermarking ${i} of ${valid.length}…`
          : `Adding ${i} of ${valid.length}…`,
      );
      if (watermark) {
        const res = await watermarkPhoto(file, DEFAULT_WATERMARK_DIALS);
        if (res.ok && res.dataUrl) {
          added.push({ id: newId(), name: file.name, dataUrl: res.dataUrl, watermarked: true });
          continue;
        }
        // Watermark failed (service down) — keep the original so the agent isn't blocked.
        setErr(res.error ?? 'Watermark service unavailable — added the original photo.');
      }
      try {
        const base64 = await fileToBase64(file);
        added.push({
          id: newId(),
          name: file.name,
          dataUrl: `data:${file.type};base64,${base64}`,
          watermarked: false,
        });
      } catch {
        setErr(`Couldn't read ${file.name}.`);
      }
    }
    setBusy(false);
    setStatus('');
    if (added.length > 0) onPhotos([...photos, ...added]);
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= photos.length) return;
    const next = [...photos];
    [next[index], next[target]] = [next[target], next[index]];
    onPhotos(next);
  };
  const makeCover = (index: number) => {
    if (index === 0) return;
    const next = [...photos];
    const [picked] = next.splice(index, 1);
    next.unshift(picked);
    onPhotos(next);
  };
  const remove = (id: string) => onPhotos(photos.filter((p) => p.id !== id));

  return (
    <Stack gap="md">
      <Box>
        <Text fw={600}>Photos</Text>
        <Text size="sm" c="dimmed">
          The first photo is the cover. Drag the order with the arrows; pick any photo
          as the cover.
        </Text>
      </Box>

      {/* The single watermark switch + the PF guarantee. */}
      <Card withBorder radius="md" padding="sm">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon variant="light" color="red" size={34} radius="md">
              <IconShield size={18} />
            </ThemeIcon>
            <Box>
              <Text size="sm" fw={600}>
                RE/MAX Hub watermark on every photo
              </Text>
              <Text size="xs" c="dimmed">
                {watermark
                  ? 'Each photo carries the RE/MAX Hub logo.'
                  : 'Photos are uploaded clean, no logo.'}
              </Text>
            </Box>
          </Group>
          <Switch
            checked={watermark}
            onChange={(e) => setWatermark(e.currentTarget.checked)}
            color="red"
            size="md"
          />
        </Group>
        <Text size="xs" c="dimmed" mt="xs">
          Stamped once, never twice — Property Finder's own watermark is off for our
          account, so a photo is never double-stamped.
        </Text>
      </Card>

      {/* Drop zone. */}
      <Card
        withBorder
        radius="md"
        padding="lg"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const files = Array.from(e.dataTransfer?.files ?? []);
          if (files.length > 0) void addFiles(files);
        }}
        style={{
          cursor: 'pointer',
          borderStyle: 'dashed',
          borderColor: over ? 'var(--mantine-color-red-6, #e11d2e)' : undefined,
          background: over ? 'var(--mantine-color-red-light, rgba(225,29,46,0.05))' : undefined,
          transition: `border-color 140ms ${EASE_OUT}, background 140ms ${EASE_OUT}`,
        }}
      >
        <Stack align="center" gap={4} py="sm">
          <ThemeIcon variant="light" color="gray" size={40} radius="xl">
            <IconUpload size={20} />
          </ThemeIcon>
          <Text size="sm" fw={600}>
            {busy ? status || 'Processing…' : 'Drag & drop, or click to add photos'}
          </Text>
          <Text size="xs" c="dimmed">
            JPG, PNG or WebP — up to 7 MB each
          </Text>
        </Stack>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            const files = Array.from(e.currentTarget.files ?? []);
            e.currentTarget.value = '';
            if (files.length > 0) void addFiles(files);
          }}
        />
      </Card>

      {err && (
        <Text size="xs" c="orange">
          {err}
        </Text>
      )}

      {photos.length > 0 && (
        <Box
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: 12,
          }}
        >
          {photos.map((p, index) => (
            <Card key={p.id} withBorder radius="md" padding={6}>
              <Card.Section style={{ position: 'relative' }}>
                <Image src={p.dataUrl} h={110} fit="cover" radius={6} alt={p.name} />
                {index === 0 && (
                  <Badge
                    color="red"
                    size="xs"
                    leftSection={<IconStar size={9} />}
                    style={{ position: 'absolute', top: 6, left: 6 }}
                  >
                    Cover
                  </Badge>
                )}
                {p.watermarked && (
                  <Badge
                    color="gray"
                    variant="filled"
                    size="xs"
                    style={{ position: 'absolute', top: 6, right: 6 }}
                  >
                    RE/MAX
                  </Badge>
                )}
              </Card.Section>
              <Group justify="space-between" mt={6} gap={2} wrap="nowrap">
                <Group gap={2} wrap="nowrap">
                  <Button
                    variant="subtle" color="gray" size="compact-xs"
                    onClick={() => move(index, -1)} disabled={index === 0}
                    px={4}
                  >
                    <IconArrowLeft size={13} />
                  </Button>
                  <Button
                    variant="subtle" color="gray" size="compact-xs"
                    onClick={() => move(index, 1)} disabled={index === photos.length - 1}
                    px={4}
                  >
                    <IconArrowRight size={13} />
                  </Button>
                  {index !== 0 && (
                    <Button variant="subtle" color="gray" size="compact-xs" onClick={() => makeCover(index)} px={4}>
                      <IconStar size={13} />
                    </Button>
                  )}
                </Group>
                <Button variant="subtle" color="red" size="compact-xs" onClick={() => remove(p.id)} px={4}>
                  <IconTrash size={13} />
                </Button>
              </Group>
            </Card>
          ))}
        </Box>
      )}

      {photos.length === 0 && !busy && (
        <Group gap={6} justify="center" c="dimmed">
          <IconPhoto size={14} />
          <Text size="xs">No photos yet — add the unit photos to build the listing.</Text>
        </Group>
      )}
    </Stack>
  );
};
