import { Badge, Box, Button, Group, Modal, Paper, Stack, Text, ThemeIcon } from '@mantine/core';
import { useEffect, useState } from 'react';
import { IconSparkles } from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { enumLabel } from '@/propel/lib/enumLabels';
import {
  type CampaignListItem,
  type CampaignSourceKind,
  dismissCampaign,
  listCampaigns,
} from '@/propel/lib/campaignSpineCrm';

// V3 — the scout Proposed-campaigns queue. The landing-scout cron drafts whole
// multi-channel campaigns (sourceKind LISTING / OFFPLAN_LAUNCH / SCOUT, status
// DRAFTING or REVIEW); this pins them above the manual spine panel. Review reuses
// the existing CampaignReviewPanel (via onReview → the tab's spineReview state);
// Dismiss archives through the route's dismiss action. The whole section hides
// when empty or when the route predates the `list` action (unavailable).

const KIND_CHIP: Record<Exclude<CampaignSourceKind, 'MANUAL'>, { label: string; color: string }> = {
  LISTING: { label: 'Listing', color: 'blue' },
  OFFPLAN_LAUNCH: { label: 'Launch', color: 'grape' },
  SCOUT: { label: 'Scout', color: 'teal' },
};

const windowLabel = (a: string | null, b: string | null): string => {
  const d = (s: string | null) => (s ? s.slice(0, 10) : '');
  if (a && b) return `${d(a)} → ${d(b)}`;
  if (a) return `from ${d(a)}`;
  return '';
};

export const ProposedCampaignsQueue = ({
  refreshSignal,
  onReview,
}: {
  /** Bump to force a re-fetch (e.g. after a review closes with changes). */
  refreshSignal: number;
  /** Open the shared CampaignReviewPanel for this campaign id. */
  onReview: (id: string) => void;
}) => {
  const notify = usePropelToast();
  const [items, setItems] = useState<CampaignListItem[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const res = await listCampaigns();
      if (!live) return;
      // Proposed = scout-authored (non-MANUAL) and still awaiting the founder.
      setItems(
        res.ok
          ? res.campaigns.filter(
              (c) => c.sourceKind !== 'MANUAL' && (c.status === 'DRAFTING' || c.status === 'REVIEW'),
            )
          : [],
      );
    })();
    return () => {
      live = false;
    };
  }, [refreshSignal]);

  if (items.length === 0) return null;

  const confirmTarget = items.find((c) => c.id === confirmId) ?? null;

  const doDismiss = async () => {
    if (!confirmId) return;
    setDismissing(true);
    const res = await dismissCampaign(confirmId);
    setDismissing(false);
    if (res.ok) {
      setItems((prev) => prev.filter((c) => c.id !== confirmId));
      setConfirmId(null);
      notify('Proposal dismissed.', 'success');
    } else {
      notify(res.error, 'error');
    }
  };

  return (
    <Paper withBorder radius="md" p="md" mb="md">
      <Group gap="xs" mb="sm">
        <ThemeIcon size="md" variant="light" color="teal">
          <IconSparkles size={16} />
        </ThemeIcon>
        <Text fw={600}>Proposed by Scout</Text>
        <Badge size="sm" variant="light" color="teal">
          {items.length}
        </Badge>
      </Group>
      <Stack gap="xs">
        {items.map((c) => {
          const chip = c.sourceKind === 'MANUAL' ? null : KIND_CHIP[c.sourceKind];
          const win = windowLabel(c.windowStart, c.windowEnd);
          return (
            <Paper key={c.id} withBorder radius="sm" p="sm">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Box style={{ minWidth: 0 }}>
                  <Group gap={6} wrap="nowrap">
                    <Text fw={500} truncate>
                      {c.name || 'Untitled campaign'}
                    </Text>
                    {chip ? (
                      <Badge size="xs" variant="light" color={chip.color}>
                        {chip.label}
                      </Badge>
                    ) : null}
                    <Badge size="xs" variant="outline" color="gray">
                      {enumLabel(c.status)}
                    </Badge>
                  </Group>
                  {c.brief ? (
                    <Text size="xs" c="dimmed" lineClamp={2}>
                      {c.brief}
                    </Text>
                  ) : null}
                  {win ? (
                    <Text size="xs" c="dimmed">
                      {win}
                    </Text>
                  ) : null}
                </Box>
                <Group gap={4} wrap="nowrap">
                  <Button size="compact-xs" variant="light" color="red" onClick={() => onReview(c.id)}>
                    Review
                  </Button>
                  <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setConfirmId(c.id)}>
                    Dismiss
                  </Button>
                </Group>
              </Group>
            </Paper>
          );
        })}
      </Stack>

      <Modal
        opened={confirmId !== null}
        onClose={() => (dismissing ? undefined : setConfirmId(null))}
        title="Dismiss this proposal?"
        centered
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            “{confirmTarget?.name || 'Untitled campaign'}” and its drafted arms will be archived. This
            can’t be undone from here.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="default" size="xs" onClick={() => setConfirmId(null)} disabled={dismissing}>
              Keep
            </Button>
            <Button color="red" size="xs" onClick={doDismiss} loading={dismissing}>
              Dismiss
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
};
