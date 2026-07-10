import { useState } from 'react';
import { Button, TextInput, Textarea, Stack, Group, CopyButton, Anchor, Alert } from '@mantine/core';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import type { OffplanUnit, RouteEnvelope } from './types';

export function OffplanGeneratePanel({ unit }: { unit: OffplanUnit }) {
  const [clientName, setClientName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true); setError(null); setUrl(null);
    try {
      const res = await callPropelRoute<RouteEnvelope<unknown> & { url?: string }>('/offplan/pitch-generate', {
        projectExternalId: Number(unit.projectId), unitExternalId: unit.externalId,
        clientName: clientName || undefined, note: note || undefined,
      });
      if (!res || !res.ok || !res.url) { setError(res?.error ?? 'generate failed'); return; }
      setUrl(res.url);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <Stack gap="sm">
      <TextInput label="Client name" value={clientName} onChange={(e) => setClientName(e.currentTarget.value)} />
      <Textarea label="Agent note (optional)" value={note} onChange={(e) => setNote(e.currentTarget.value)} autosize minRows={2} />
      <Button onClick={generate} loading={busy}>Generate branded PDF</Button>
      {error && <Alert color="red">{error}</Alert>}
      {url && (
        <>
          <iframe title="pitch-preview" src={url} style={{ width: '100%', height: 360, border: '1px solid #ddd' }} />
          <Group>
            <Anchor href={url} target="_blank" download><Button variant="light">Download</Button></Anchor>
            <CopyButton value={url}>{({ copied, copy }) => <Button variant="default" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</Button>}</CopyButton>
          </Group>
        </>
      )}
    </Stack>
  );
}
