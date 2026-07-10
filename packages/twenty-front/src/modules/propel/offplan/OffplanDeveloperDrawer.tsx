import { useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Card,
  Drawer,
  Group,
  Loader,
  Stack,
  Text,
} from '@mantine/core';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { isoToQuarterLabel } from './handover';
import type { OffplanDeveloperDetail, RouteEnvelope } from './types';

const aed = (n: number | null | undefined) =>
  n == null ? '—' : `AED ${Math.round(n).toLocaleString('en-US')}`;

export function OffplanDeveloperDrawer({
  slug,
  onClose,
  onOpenProject,
  onShowOnMap,
}: {
  slug: string;
  onClose: () => void;
  onOpenProject: (externalId: number) => void;
  onShowOnMap: (slug: string) => void;
}) {
  const [dev, setDev] = useState<OffplanDeveloperDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setDev(null);
    (async () => {
      const res = await callPropelRoute<RouteEnvelope<unknown>>('/offplan/browse', {
        action: 'developerDetail',
        params: { slug },
      });
      if (!alive) return;
      setLoading(false);
      if (!res?.ok || res.data == null) return;
      // Tolerate both payload shapes: the detail directly, or nested under
      // `developer`.
      const raw = res.data as { developer?: OffplanDeveloperDetail } & OffplanDeveloperDetail;
      const detail = raw.developer ?? raw;
      if (typeof (detail as { name?: unknown }).name === 'string') {
        setDev(detail as OffplanDeveloperDetail);
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  return (
    <Drawer
      opened
      position="right"
      size={520}
      onClose={onClose}
      title={
        <Group gap="xs">
          <Text fw={700}>{dev?.name ?? 'Developer'}</Text>
          {dev?.isJointVenture && (
            <Badge variant="light" color="yellow" size="sm">
              Joint venture
            </Badge>
          )}
        </Group>
      }
    >
      {loading && <Loader size="sm" m="md" />}
      {!loading && dev == null && (
        <Text c="dimmed" size="sm">
          Developer details unavailable.
        </Text>
      )}
      {dev != null && (
        <Stack gap="md">
          {dev.description && (
            <Text size="sm" c="dimmed" lineClamp={6}>
              {dev.description}
            </Text>
          )}
          <Group gap="sm">
            <StatBox k="Live projects" v={String(dev.activeProjects)} />
            <StatBox k="Portfolio total" v={String(dev.portfolioTotal)} />
            {(dev.contactName || dev.contactPhone) && (
              <StatBox
                k="Contact"
                v={[dev.contactName, dev.contactPhone].filter(Boolean).join(' · ')}
              />
            )}
          </Group>
          <Box>
            <Text fw={700} size="sm" mb={6}>
              Portfolio
            </Text>
            <Stack gap={6}>
              {dev.portfolio.map((p) => (
                <Card
                  key={p.externalId}
                  withBorder
                  padding="xs"
                  radius="md"
                  onClick={() => onOpenProject(p.externalId)}
                  style={{ cursor: 'pointer' }}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Box style={{ minWidth: 0 }}>
                      <Group gap={6} wrap="nowrap">
                        <Text size="sm" fw={600} lineClamp={1}>
                          {p.name}
                        </Text>
                        {p.isLaunch && (
                          <Badge color="green" size="xs">
                            New launch
                          </Badge>
                        )}
                      </Group>
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {p.districtName}
                        {p.handover
                          ? ` · Handover ${isoToQuarterLabel(p.handover) ?? '—'}`
                          : ''}
                      </Text>
                    </Box>
                    <Text size="xs" fw={700} c="red" style={{ flex: 'none' }}>
                      from {aed(p.minPrice)}
                    </Text>
                  </Group>
                </Card>
              ))}
              {dev.portfolio.length === 0 && (
                <Text size="xs" c="dimmed">
                  No active projects listed.
                </Text>
              )}
            </Stack>
          </Box>
          <Group justify="flex-end">
            <Button variant="default" size="xs" onClick={() => onShowOnMap(slug)}>
              Show on map →
            </Button>
          </Group>
        </Stack>
      )}
    </Drawer>
  );
}

function StatBox({ k, v }: { k: string; v: string }) {
  return (
    <Box
      style={{
        padding: '8px 12px',
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 8,
      }}
    >
      <Text size="xs" c="dimmed">
        {k}
      </Text>
      <Text fw={700} size="sm">
        {v}
      </Text>
    </Box>
  );
}
