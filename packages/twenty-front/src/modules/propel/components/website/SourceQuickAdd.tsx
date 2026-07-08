import { useRef, useState } from 'react';
import {
  Button,
  Group,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { IconFileUpload, IconLink, IconPlus } from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import {
  createSource,
  ingestUrl,
  kindForFilename,
} from '@/propel/lib/sourceMaterialsCrm';

// Source quick-add (Sources SRC-1 / plan SM6) — the ONE segmented Paste · URL ·
// File form, shared verbatim by the Media Studio Sources tab and the "Add sources"
// popover on the LP + Social brief boxes.
//
//   Paste — name (optional; derived from the text when blank) + textarea → create.
//   URL   — server-side fetch via ingestUrl (SSRF-guarded route; BAD_SOURCE /
//           FETCH_FAILED surface as specific errors from the lib).
//   File  — .md / .html / .txt only, ≤1MB, read CLIENT-SIDE (main-thread hero →
//           File.text() works) and sent as text; kind derived from the extension.
//
// On success the parent gets the new id and refreshes its own list — this form
// never owns the library state.

const MAX_SOURCE_FILE_BYTES = 1024 * 1024; // 1MB — v1 client-read text files only

type QuickAddMode = 'paste' | 'url' | 'file';

interface SourceQuickAddProps {
  // Called with the created source's id; the parent refetches / auto-selects.
  onAdded: (id: string) => void;
  // Popover-sized paddings (the Add-sources dropdown); default = the Sources tab.
  compact?: boolean;
}

export const SourceQuickAdd = ({ onAdded, compact = false }: SourceQuickAddProps) => {
  const notify = usePropelToast();

  const [mode, setMode] = useState<QuickAddMode>('paste');
  const [busy, setBusy] = useState(false);
  const [pasteName, setPasteName] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [url, setUrl] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const finish = (id: string) => {
    setPasteName('');
    setPasteText('');
    setUrl('');
    notify('Source added.', 'success');
    onAdded(id);
  };

  const addPaste = async () => {
    const text = pasteText.trim();
    if (text === '' || busy) return;
    const firstLine = text.split('\n')[0].trim();
    const name =
      pasteName.trim() || `${firstLine.slice(0, 60)}${firstLine.length > 60 ? '…' : ''}`;
    setBusy(true);
    const res = await createSource({ kind: 'PASTE', name, text });
    setBusy(false);
    if (res.ok) {
      finish(res.data.id);
      return;
    }
    notify(res.error, 'error');
  };

  const addUrl = async () => {
    const u = url.trim();
    if (u === '' || busy) return;
    setBusy(true);
    const res = await ingestUrl(u);
    setBusy(false);
    if (res.ok) {
      finish(res.data.id);
      return;
    }
    notify(res.error, 'error');
  };

  const addFile = async (file: File) => {
    if (busy) return;
    if (file.size > MAX_SOURCE_FILE_BYTES) {
      notify(
        'That file is over 1MB — sources are text files (.md / .html / .txt) up to 1MB.',
        'error',
      );
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      if (text.trim() === '') {
        setBusy(false);
        notify('That file is empty.', 'error');
        return;
      }
      const res = await createSource({
        kind: kindForFilename(file.name),
        name: file.name,
        text,
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

  return (
    <Stack gap="xs">
      <Group gap="xs" justify="space-between" wrap="nowrap">
        <Text size="xs" fw={600}>
          Quick add
        </Text>
        <SegmentedControl
          size="xs"
          value={mode}
          onChange={(v) => setMode(v as QuickAddMode)}
          data={[
            { value: 'paste', label: 'Paste' },
            { value: 'url', label: 'URL' },
            { value: 'file', label: 'File' },
          ]}
        />
      </Group>
      {mode === 'paste' ? (
        <Stack gap={6}>
          <TextInput
            size="xs"
            placeholder="Name (optional)"
            value={pasteName}
            onChange={(e) => setPasteName(e.currentTarget.value)}
            disabled={busy}
          />
          <Textarea
            size="xs"
            placeholder="Paste facts, figures, project details…"
            autosize
            minRows={compact ? 2 : 3}
            maxRows={compact ? 5 : 8}
            value={pasteText}
            onChange={(e) => setPasteText(e.currentTarget.value)}
            disabled={busy}
          />
          <Group justify="flex-end">
            <Button
              size="xs"
              variant="light"
              color="red"
              leftSection={<IconPlus size={13} />}
              loading={busy}
              disabled={pasteText.trim() === ''}
              onClick={() => void addPaste()}
            >
              Add source
            </Button>
          </Group>
        </Stack>
      ) : mode === 'url' ? (
        <Group gap="xs" wrap="nowrap">
          <TextInput
            size="xs"
            style={{ flex: 1 }}
            placeholder="https://… (public page)"
            leftSection={<IconLink size={13} />}
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addUrl();
            }}
            disabled={busy}
          />
          <Button
            size="xs"
            variant="light"
            color="red"
            loading={busy}
            disabled={url.trim() === ''}
            onClick={() => void addUrl()}
          >
            Fetch
          </Button>
        </Group>
      ) : (
        <Stack gap={6}>
          <input
            ref={fileRef}
            type="file"
            accept=".md,.markdown,.html,.htm,.txt"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              // Reset so re-picking the SAME file fires change again (retry).
              e.currentTarget.value = '';
              if (f) void addFile(f);
            }}
          />
          <Button
            size="xs"
            variant="light"
            color="red"
            leftSection={<IconFileUpload size={13} />}
            loading={busy}
            onClick={() => fileRef.current?.click()}
          >
            Pick a file (.md / .html / .txt)
          </Button>
          <Text size="xs" c="dimmed">
            Text files up to 1MB — read locally, stored as extracted text.
          </Text>
        </Stack>
      )}
    </Stack>
  );
};

export default SourceQuickAdd;
