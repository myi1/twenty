import { useState } from 'react';
import { Modal, TextInput, Textarea, Button, Group, Box, Text, Anchor } from '@mantine/core';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';

export function OffplanGeneratePanel({
  projectExternalId, unitExternalId, onClose,
}: { projectExternalId: number; unitExternalId?: number; onClose: () => void }) {
  const [clientName, setClientName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true); setErr(null);
    const res = await callPropelRoute<{ ok?: boolean; url?: string; error?: string }>('/offplan/pitch-generate',
      { projectExternalId, unitExternalId, clientName: clientName || undefined, note: note || undefined });
    setBusy(false);
    if (res?.ok && res.url) setUrl(res.url); else setErr(res?.error ?? 'Generation failed');
  };

  return (
    <Modal opened onClose={onClose} title="Generate branded pitch" size="lg">
      {!url ? (
        <Box>
          <TextInput label="Client name (optional)" value={clientName} onChange={(e) => setClientName(e.currentTarget.value)} mb="sm" />
          <Textarea label="Your note (optional)" value={note} onChange={(e) => setNote(e.currentTarget.value)} minRows={2} mb="md" />
          {err && <Text c="red" size="sm" mb="sm">{err}</Text>}
          <Group justify="flex-end"><Button color="red" loading={busy} onClick={generate}>Generate PDF</Button></Group>
        </Box>
      ) : (
        <Box>
          <iframe title="pitch" src={url} style={{ width: '100%', height: 460, border: '1px solid var(--mantine-color-default-border)', borderRadius: 8 }} />
          <Group mt="sm" justify="flex-end">
            <Anchor href={url} download><Button variant="default">⭳ Download</Button></Anchor>
            <Button variant="default" onClick={() => navigator.clipboard.writeText(url)}>🔗 Copy link</Button>
            <Button color="red" onClick={onClose}>Done</Button>
          </Group>
        </Box>
      )}
    </Modal>
  );
}
