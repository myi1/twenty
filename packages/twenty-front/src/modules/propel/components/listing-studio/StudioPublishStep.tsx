import { useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Group,
  List,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import {
  IconCheck,
  IconX,
  IconRocket,
  IconAlertTriangle,
  IconCoins,
  IconRefresh,
} from 'twenty-ui/display';
import {
  type StudioDraft,
  type StudioPublishResult,
} from '@/propel/types/listingStudio';
import { lintWriteupClient } from '@/propel/lib/listingStudioLint';
import { runStudioPublish, studioManage } from '@/propel/lib/listingStudioRoutes';

// Step 6 — Publish + manage (lane spec §4.8/§4.9 / §8). The eligibility checklist
// (facts / location / photos / write-up clean / permit validated + attested), the
// credit cost (read via a publish:false preview), Publish (async — 200 != live),
// and the manage card (live status, refresh, unpublish). SANDBOX-only end-to-end.

const STATE_LABEL: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'gray' },
  pending_publishing: { label: 'Publishing…', color: 'yellow' },
  publishing_failed: { label: 'Publish failed', color: 'red' },
  live: { label: 'Live on Property Finder', color: 'teal' },
  unpublished: { label: 'Unpublished', color: 'gray' },
  takendown: { label: 'Taken down', color: 'red' },
};

interface CheckItem {
  ok: boolean;
  label: string;
}

const buildChecklist = (draft: StudioDraft): CheckItem[] => {
  const f = draft.facts;
  const writeup = draft.writeup;
  const lint = writeup ? lintWriteupClient(writeup).filter((l) => l.severity === 'hard') : [];
  return [
    { ok: Boolean(f.propertyType && f.community && (f.sizeSqft || f.plotSqft)), label: 'Property details confirmed' },
    { ok: Boolean(f.askingPriceAed && f.askingPriceAed > 0), label: 'Asking price set' },
    { ok: Boolean(draft.location?.id), label: 'Property Finder location resolved' },
    { ok: (draft.photos?.length ?? 0) > 0, label: 'At least one photo added' },
    { ok: Boolean(writeup?.titleEn && writeup?.descriptionEn) && lint.length === 0, label: 'Write-up generated and compliant' },
    { ok: draft.permit?.validated === true && draft.permit?.userConfirmedDataIsCorrect === true, label: 'Permit validated and attested' },
  ];
};

export const StudioPublishStep = ({
  draft,
  onPublished,
}: {
  draft: StudioDraft;
  onPublished: (result: StudioPublishResult) => void;
}) => {
  const [busy, setBusy] = useState<'idle' | 'cost' | 'publish' | 'manage'>('idle');
  const [err, setErr] = useState('');
  const [cost, setCost] = useState<{ name?: string; credits?: number } | null>(
    draft.publish?.cost ?? null,
  );
  const [result, setResult] = useState<StudioPublishResult | null>(draft.publish ?? null);

  const checklist = buildChecklist(draft);
  const allReady = checklist.every((c) => c.ok);

  const commonArgs = {
    facts: draft.facts,
    writeup: draft.writeup,
    permit: draft.permit,
    imageUrls: (draft.photos ?? []).map((p) => p.hosted).filter((u): u is string => Boolean(u)),
    locationId: draft.location?.id,
    reference: draft.publish?.reference,
  };

  const previewCost = async () => {
    setBusy('cost');
    setErr('');
    const res = await runStudioPublish({ ...commonArgs, publish: false });
    setBusy('idle');
    if (!res) {
      setErr('Could not reach Property Finder. Make sure the sandbox keys are configured on the server.');
      return;
    }
    if (!res.ok) {
      setErr(res.errorMessage ?? 'Property Finder rejected the listing.');
      return;
    }
    setCost(res.result?.cost ?? null);
  };

  const publish = async () => {
    setBusy('publish');
    setErr('');
    const res = await runStudioPublish({ ...commonArgs, publish: true });
    setBusy('idle');
    if (!res) {
      setErr('Could not reach Property Finder. Make sure the sandbox keys are configured on the server.');
      return;
    }
    if (!res.ok || !res.result) {
      setErr(res.errorMessage ?? 'Property Finder could not publish the listing.');
      return;
    }
    setResult(res.result);
    setCost(res.result.cost ?? cost);
    onPublished(res.result);
  };

  const refreshStatus = async () => {
    if (!result) return;
    setBusy('manage');
    const res = await studioManage({
      action: 'status',
      listingId: result.listingId,
      reference: result.reference,
    });
    setBusy('idle');
    if (res?.ok && res.state) {
      const next = { ...result, state: res.state };
      setResult(next);
      onPublished(next);
    }
  };

  const unpublish = async () => {
    if (!result) return;
    setBusy('manage');
    setErr('');
    const res = await studioManage({ action: 'unpublish', listingId: result.listingId });
    setBusy('idle');
    if (!res?.ok) {
      setErr(res?.message ?? 'Could not unpublish — the listing may not be live yet.');
      return;
    }
    const next = { ...result, state: res.state ?? 'unpublished' };
    setResult(next);
    onPublished(next);
  };

  // ── Manage card (already published) ─────────────────────────────────────────
  if (result?.published) {
    const stateMeta = STATE_LABEL[result.state ?? ''] ?? { label: result.state ?? 'Submitted', color: 'blue' };
    return (
      <Stack gap="md">
        <Box>
          <Text fw={600}>Live on Property Finder</Text>
          <Text size="sm" c="dimmed">
            Publishing is asynchronous — refresh the status until it shows live.
          </Text>
        </Box>
        <Card withBorder radius="md" padding="lg">
          <Group justify="space-between" mb="md">
            <Badge color={stateMeta.color} variant="light" size="lg">
              {stateMeta.label}
            </Badge>
            {result.reference && (
              <Text size="sm" c="dimmed">
                Ref {result.reference}
              </Text>
            )}
          </Group>
          <Stack gap={6}>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">PF listing id</Text>
              <Text size="sm" fw={500}>{result.listingId}</Text>
            </Group>
            {result.cost?.credits !== undefined && (
              <Group justify="space-between">
                <Text size="sm" c="dimmed">Credits used</Text>
                <Text size="sm" fw={500}>{result.cost.credits}</Text>
              </Group>
            )}
          </Stack>
          {err && (
            <Alert color="orange" variant="light" mt="md" icon={<IconAlertTriangle size={16} />}>
              {err}
            </Alert>
          )}
          <Group mt="lg">
            <Button
              variant="default"
              leftSection={<IconRefresh size={15} />}
              loading={busy === 'manage'}
              onClick={() => void refreshStatus()}
            >
              Refresh status
            </Button>
            <Button
              variant="subtle"
              color="red"
              loading={busy === 'manage'}
              onClick={() => void unpublish()}
            >
              Unpublish
            </Button>
          </Group>
        </Card>
        <Text size="xs" c="dimmed">
          Sandbox publish — this proves the end-to-end flow. Going live on the real
          Property Finder needs the production write API (a separate founder request).
        </Text>
      </Stack>
    );
  }

  // ── Pre-publish (checklist + cost + publish) ────────────────────────────────
  return (
    <Stack gap="md">
      <Box>
        <Text fw={600}>Publish</Text>
        <Text size="sm" c="dimmed">
          Confirm everything is ready, check the credit cost, then go live on Property
          Finder.
        </Text>
      </Box>

      <Card withBorder radius="md" padding="lg">
        <Text size="sm" fw={600} mb="sm">
          Eligibility
        </Text>
        <List spacing={8} size="sm" center>
          {checklist.map((c) => (
            <List.Item
              key={c.label}
              icon={
                <ThemeIcon color={c.ok ? 'teal' : 'gray'} variant="light" size={20} radius="xl">
                  {c.ok ? <IconCheck size={12} /> : <IconX size={12} />}
                </ThemeIcon>
              }
            >
              <Text size="sm" c={c.ok ? undefined : 'dimmed'}>
                {c.label}
              </Text>
            </List.Item>
          ))}
        </List>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Group justify="space-between">
          <Group gap="sm">
            <ThemeIcon variant="light" color="yellow" size={34} radius="md">
              <IconCoins size={18} />
            </ThemeIcon>
            <Box>
              <Text size="sm" fw={600}>
                {cost?.credits !== undefined ? `${cost.credits} credit${cost.credits === 1 ? '' : 's'}` : 'Credit cost'}
              </Text>
              <Text size="xs" c="dimmed">
                {cost?.name ?? 'Check the cost before publishing.'}
              </Text>
            </Box>
          </Group>
          <Button variant="default" loading={busy === 'cost'} onClick={() => void previewCost()}>
            Check cost
          </Button>
        </Group>
      </Card>

      {err && (
        <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />}>
          {err}
        </Alert>
      )}

      <Button
        size="md"
        color="red"
        leftSection={<IconRocket size={18} />}
        loading={busy === 'publish'}
        disabled={!allReady}
        onClick={() => void publish()}
      >
        {allReady ? 'Publish to Property Finder (sandbox)' : 'Complete every step to publish'}
      </Button>
    </Stack>
  );
};
