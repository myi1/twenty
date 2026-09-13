import type { DeskRailOk, DeskRailSection } from './types';

export const railAvailability = (
  rail: DeskRailOk | null,
  section: DeskRailSection,
) => rail?.sections?.[section]?.status ?? 'unknown';
