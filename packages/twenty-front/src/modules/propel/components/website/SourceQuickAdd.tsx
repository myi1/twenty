import { useRef, useState } from 'react';
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Stack,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconFileUpload, IconPlus, IconX } from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import {
  createSource,
  ingestUrl,
  kindForFilename,
} from '@/propel/lib/sourceMaterialsCrm';

// Source quick-add (Sources SRC-1 / plan SM6) — ONE smart box, shared verbatim by
// the moved Sources tab, the "Add sources" popover on the LP + Social brief boxes.
// The founder's call: one input, auto-detect the kind, minimal clicks.
//
//   • A single multiline box + an "Attach file" icon-button (and drag-drop onto the
//     box). Optional Name field.
//   • On Add we auto-detect the kind:
//       – a staged file          → FILE (client-read text, ≤1MB; kind from the ext)
//       – a lone https(s) URL     → URL  (server-side fetch via ingestUrl)
//       – any other non-empty text→ PASTE
//       – empty                   → the button is disabled (no-op)
//
// On success the parent gets the new id and refreshes its own list — this form
// never owns the library state.

const MAX_SOURCE_FILE_BYTES = 1024 * 1024; // 1MB — v1 client-read text files only

// A lone URL (no surrounding whitespace) → treat the box as a URL to fetch.
const SINGLE_URL_RE = /^https?:\/\/\S+$/;

interface SourceQuickAddProps {
  // Called with the created source's id; the parent refetches / auto-selects.
  onAdded: (id: string) => void;
  // Popover-sized paddings (the Add-sources dropdown); default = the Sources tab.
  compact?: boolean;
}

export const SourceQuickAdd = ({ onAdded, compact = false }: SourceQuickAddProps) => {
  const notify = usePropelToast();

  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const reset = () => {
    setName('');
    setText('');
    setFile(null);
  };

  const finish = (id: string) => {
    reset();
    notify('Source added.', 'success');
    onAdded(id);
  };

  const addPaste = async (body: string) => {
    const firstLine = body.split('\n')[0].trim();
    const derived = `${firstLine.slice(0, 60)}${firstLine.length > 60 ? '…' : ''}`;
    const finalName = name.trim() || derived;
    setBusy(true);
    const res = await createSource({ kind: 'PASTE', name: finalName, text: body });
    setBusy(false);
    if (res.ok) {
      finish(res.data.id);
      return;
    }
    notify(res.error, 'error');
  };

  const addUrl = async (u: string) => {
    setBusy(true);
    const res = await ingestUrl(u);
    setBusy(false);
    if (res.ok) {
      finish(res.data.id);
      return;
    }
    notify(res.error, 'error');
  };

  const addFile = async (picked: File) => {
    if (picked.size > MAX_SOURCE_FILE_BYTES) {
      notify(
        'That file is over 1MB — sources are text files (.md / .html / .txt) up to 1MB.',
        'error',
      );
      return;
    }
    setBusy(true);
    try {
      const body = await picked.text();
      if (body.trim() === '') {
        setBusy(false);
        notify('That file is empty.', 'error');
        return;
      }
      const res = await createSource({
        kind: kindForFilename(picked.name),
        name: name.trim() || picked.name,
        text: body,
      });
      setBusy(false);
      if (res.ok) {
        finish(res.data.id);
        return;
      }
      notify(res.error, 'error');
    } catch {
      setBusy(false);
      notify('Could not read that file — try again.', 'error');
    }
  };

  // The single entry point — auto-detect the kind from what the user gave us.
  const onAdd = async () => {
    if (busy) return;
    if (file !== null) {
      await addFile(file);
      return;
    }
    const trimmed = text.trim();
    if (trimmed === '') return;
    if (SINGLE_URL_RE.test(trimmed)) {
      await addUrl(trimmed);
      return;
    }
    await addPaste(trimmed);
  };

  const canAdd = !busy && (file !== null || text.trim() !== '');

  return (
    <Stack gap="xs">
      <Text size="xs" fw={600}>
        Quick add
      </Text>
      <TextInput
        size="xs"
        placeholder="Name (optional)"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        disabled={busy}
      />

      {file !== null ? (
        <Group
          gap={6}
          wrap="nowrap"
          justify="space-between"
          style={{
            borderRadius: 8,
            border: '1px solid var(--mantine-color-default-border)',
            padding: '6px 8px',
          }}
        >
          <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
            <IconFileUpload size={14} />
            <Text size="xs" truncate>
              {file.name}
            </Text>
          </Group>
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            aria-label="Remove file"
            disabled={busy}
            onClick={() => setFile(null)}
          >
            <IconX size={13} />
          </ActionIcon>
        </Group>
      ) : (
        <Box
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) setFile(dropped);
          }}
          style={{
            borderRadius: 8,
            outline: dragOver ? '2px dashed var(--mantine-color-red-5)' : undefined,
          }}
        >
          <Textarea
            size="xs"
            placeholder="Paste text, a link, or drop a file…"
            autosize
            minRows={compact ? 2 : 3}
            maxRows={compact ? 5 : 8}
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            disabled={busy}
          />
        </Box>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".md,.markdown,.html,.htm,.txt"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          // Reset so re-picking the SAME file fires change again (retry).
          e.currentTarget.value = '';
          if (f) setFile(f);
        }}
      />

      <Group justify="space-between" wrap="nowrap">
        <Tooltip label="Attach a file (.md / .html / .txt)" withinPortal zIndex={6100}>
          <ActionIcon
            size="lg"
            variant="light"
            color="gray"
            aria-label="Attach file"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <IconFileUpload size={16} />
          </ActionIcon>
        </Tooltip>
        <Button
          size="xs"
          variant="light"
          color="red"
          leftSection={<IconPlus size={13} />}
          loading={busy}
          disabled={!canAdd}
          onClick={() => void onAdd()}
        >
          Add source
        </Button>
      </Group>
    </Stack>
  );
};

export default SourceQuickAdd;
