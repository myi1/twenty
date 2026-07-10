import { Badge, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { freshness } from './deskLogic';

// "updated Nd ago" + a stale state past a per-surface threshold. Fits
// whatsappTemplate.lastSyncedAt, landingPage/sitePage lastPublishedAt, etc.
export const FreshnessFlag = ({
  at,
  thresholdDays,
}: {
  at: string | null | undefined;
  thresholdDays: number;
}): ReactNode => {
  const { label, stale } = freshness(at, thresholdDays);
  if (stale) {
    return (
      <Badge size="sm" color="orange" variant="light">
        {label}
      </Badge>
    );
  }
  return (
    <Text fz="xs" c="dimmed">
      {label}
    </Text>
  );
};
