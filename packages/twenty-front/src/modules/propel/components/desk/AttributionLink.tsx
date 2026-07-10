import { Anchor, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { attributionLabel, type Attribution } from './deskLogic';

// "→ N leads · N deals · AED X" drilling from the artifact to the people/deals.
// Honest empty ("no leads yet") when nothing is attributed — never faked.
export const AttributionLink = ({
  attribution,
  onDrill,
}: {
  attribution: Attribution;
  onDrill?: () => void;
}): ReactNode => {
  const label = `→ ${attributionLabel(attribution)}`;
  const empty = attributionLabel(attribution) === 'no leads yet';
  if (empty || onDrill === undefined) {
    return (
      <Text fz="xs" c="dimmed">
        {label}
      </Text>
    );
  }
  return (
    <Anchor fz="xs" onClick={onDrill}>
      {label}
    </Anchor>
  );
};
