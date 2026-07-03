import { Badge, Tooltip } from '@mantine/core';

// Shared SLA-colored age chip — used by SiteLeadsTab's queue rows (spec §6: "rows
// with SLA-colored age chips"). Semantic color follows the Website CONVENTIONS.md
// idiom (red = breached, yellow/orange = at-risk, teal/green = healthy), same
// palette as AttentionRow's `kind` styling on the Home tab.
//
// "At risk" (orange) is a UI-only extra state: age past 70% of the SLA target but
// not yet breached, so an agent can act before it turns red. Not a mock-data field —
// derived here from `ageMinutes` / `targetMinutes` so it stays correct if the mock
// SLA target ever changes.

interface SlaAgeChipProps {
  ageMinutes: number;
  breached: boolean;
  targetMinutes: number;
  ageLabel: string;
}

const formatAge = (minutes: number): string => {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
};

export const SlaAgeChip = ({
  ageMinutes,
  breached,
  targetMinutes,
  ageLabel,
}: SlaAgeChipProps) => {
  const atRisk = !breached && ageMinutes >= targetMinutes * 0.7;
  const color = breached ? 'red' : atRisk ? 'orange' : 'teal';
  const tooltip = breached
    ? `Breached — SLA target is ${targetMinutes}m`
    : atRisk
      ? `At risk — approaching the ${targetMinutes}m SLA target`
      : `Within the ${targetMinutes}m SLA target`;

  return (
    <Tooltip label={tooltip} withArrow position="top">
      <Badge color={color} variant="light" radius="sm">
        {ageLabel ?? formatAge(ageMinutes)}
      </Badge>
    </Tooltip>
  );
};
