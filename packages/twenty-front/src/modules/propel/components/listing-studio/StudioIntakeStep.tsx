import { useRef, useState } from 'react';
import { Badge, Box, Button, Card, Group, Stack, Text, ThemeIcon } from '@mantine/core';
import {
  IconFileText,
  IconPhoto,
  IconUpload,
  IconCheck,
  IconHome,
} from 'twenty-ui/display';

// Step 1 — Intake (the mandate package). Drop the title deed (ready) OR Oqood / SPA
// (off-plan) + Form A + unit photos. We detect the document kind from the filename
// (title-deed vs oqood/spa) to set Ready vs Off-plan, hold the dropped files, and
// let the agent proceed. The AI "read → pre-fill facts" extraction is the next
// lane slice (no extract route exists yet); this step captures the package and the
// completion status, then hands off to Details where the facts are confirmed.
//
// Real DOM (the hero is main-thread), so file inputs + drag-drop work natively.

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

type DocKind = 'deed' | 'oqood-spa' | 'formA' | 'photos';

interface DroppedDoc {
  id: string;
  name: string;
  kind: DocKind;
}

const KIND_META: Record<
  DocKind,
  { label: string; hint: string; icon: React.ReactNode; accept: string; multiple?: boolean }
> = {
  deed: {
    label: 'Title deed',
    hint: 'Ready / secondary — DLD title deed',
    icon: <IconHome size={18} />,
    accept: '.pdf,image/*',
  },
  'oqood-spa': {
    label: 'Oqood or SPA',
    hint: 'Off-plan — Oqood or Sale & Purchase Agreement',
    icon: <IconFileText size={18} />,
    accept: '.pdf,image/*',
  },
  formA: {
    label: 'Form A',
    hint: 'The RERA listing mandate (price + authorization)',
    icon: <IconFileText size={18} />,
    accept: '.pdf,image/*',
  },
  photos: {
    label: 'Unit photos',
    hint: 'The property photos (added in the Photos step too)',
    icon: <IconPhoto size={18} />,
    accept: 'image/*',
    multiple: true,
  },
};

// Guess the completion status from the document kind that was supplied.
const inferCompletion = (docs: DroppedDoc[]): 'READY' | 'OFF_PLAN' | undefined => {
  if (docs.some((d) => d.kind === 'oqood-spa')) return 'OFF_PLAN';
  if (docs.some((d) => d.kind === 'deed')) return 'READY';
  return undefined;
};

const DropRow = ({
  kind,
  docs,
  onFiles,
}: {
  kind: DocKind;
  docs: DroppedDoc[];
  onFiles: (kind: DocKind, files: File[]) => void;
}) => {
  const meta = KIND_META[kind];
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);
  const mine = docs.filter((d) => d.kind === kind);

  return (
    <Card
      withBorder
      radius="md"
      padding="sm"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer?.files ?? []);
        if (files.length > 0) onFiles(kind, files);
      }}
      style={{
        borderColor: over
          ? 'var(--mantine-color-red-6, #e11d2e)'
          : mine.length > 0
            ? 'var(--mantine-color-red-4, #f3a3aa)'
            : undefined,
        background: over ? 'var(--mantine-color-red-light, rgba(225,29,46,0.05))' : undefined,
        transition: `border-color 140ms ${EASE_OUT}, background 140ms ${EASE_OUT}`,
        cursor: 'pointer',
      }}
      onClick={() => inputRef.current?.click()}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <ThemeIcon
            variant="light"
            color={mine.length > 0 ? 'red' : 'gray'}
            size={34}
            radius="md"
          >
            {mine.length > 0 ? <IconCheck size={18} /> : meta.icon}
          </ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <Text fw={600} size="sm">
              {meta.label}
            </Text>
            <Text size="xs" c="dimmed" lineClamp={1}>
              {mine.length > 0 ? mine.map((d) => d.name).join(', ') : meta.hint}
            </Text>
          </Box>
        </Group>
        <Button
          size="xs"
          variant="subtle"
          color="gray"
          leftSection={<IconUpload size={13} />}
          style={{ flexShrink: 0 }}
        >
          {mine.length > 0 ? 'Replace' : 'Add'}
        </Button>
      </Group>
      <input
        ref={inputRef}
        type="file"
        accept={meta.accept}
        multiple={meta.multiple}
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = '';
          if (files.length > 0) onFiles(kind, files);
        }}
      />
    </Card>
  );
};

export const StudioIntakeStep = ({
  onCompletionDetected,
  onSkipToDetails,
}: {
  /** Detected READY/OFF_PLAN from the document kind — pre-fills the facts. */
  onCompletionDetected: (completion: 'READY' | 'OFF_PLAN') => void;
  /** "Fill manually" / "Review the listing" — advance to Details. */
  onSkipToDetails: () => void;
}) => {
  const [docs, setDocs] = useState<DroppedDoc[]>([]);

  const addFiles = (kind: DocKind, files: File[]) => {
    setDocs((cur) => {
      // One doc per kind (except photos, which can be many).
      const kept = kind === 'photos' ? cur : cur.filter((d) => d.kind !== kind);
      const added: DroppedDoc[] = files.map((f, i) => ({
        id: `${kind}-${Date.now()}-${i}`,
        name: f.name,
        kind,
      }));
      const next = [...kept, ...added];
      const completion = inferCompletion(next);
      if (completion) onCompletionDetected(completion);
      return next;
    });
  };

  const hasMandate = docs.some((d) => d.kind === 'deed' || d.kind === 'oqood-spa');
  const completion = inferCompletion(docs);

  return (
    <Stack gap="md">
      <Box>
        <Group gap="xs">
          <Text fw={600}>Intake the mandate</Text>
          {completion && (
            <Badge
              size="sm"
              variant="light"
              color={completion === 'OFF_PLAN' ? 'grape' : 'teal'}
            >
              {completion === 'OFF_PLAN' ? 'Off-plan' : 'Ready'}
            </Badge>
          )}
        </Group>
        <Text size="sm" c="dimmed">
          Drop the owner's mandate package. We detect ready vs off-plan from the
          documents and carry them into the listing.
        </Text>
      </Box>

      <Stack gap="sm">
        <DropRow kind="deed" docs={docs} onFiles={addFiles} />
        <DropRow kind="oqood-spa" docs={docs} onFiles={addFiles} />
        <DropRow kind="formA" docs={docs} onFiles={addFiles} />
        <DropRow kind="photos" docs={docs} onFiles={addFiles} />
      </Stack>

      <Card withBorder radius="md" padding="sm" bg="var(--mantine-color-default-hover)">
        <Text size="xs" c="dimmed">
          Automatic reading of the deed and Form A into the facts is the next step in
          the Studio's roadmap. For now, confirm the details on the next step — your
          documents are captured here as the mandate of record.
        </Text>
      </Card>

      <Group justify="flex-end">
        <Button variant="subtle" color="gray" onClick={onSkipToDetails}>
          Fill manually
        </Button>
        <Button color="red" onClick={onSkipToDetails} disabled={!hasMandate}>
          Review the listing
        </Button>
      </Group>
    </Stack>
  );
};
