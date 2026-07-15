import type { DeskPartialFailure } from './types';

const PARTIAL_SOURCE_LABEL: Record<string, string> = {
  lead: 'Lead',
  secondaryOpportunity: 'Resale',
  sellOpportunity: 'Seller',
  offplanOpportunity: 'Off-plan',
  rcbiOpportunity: 'RCBI',
  institutionalOpportunity: 'Institutional',
  listing: 'Listing',
  deal: 'Deal',
  viewings: 'Viewings',
  notes: 'Notes',
  tasks: 'Tasks',
  calls: 'Calls',
  whatsapp: 'WhatsApp',
};

const fallbackSourceLabel = (source: string): string => {
  const words = source
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return words === ''
    ? 'Unknown source'
    : `${words[0].toUpperCase()}${words.slice(1)}`;
};

const joinSourceLabels = (labels: string[]): string => {
  if (labels.length < 2) return labels[0] ?? '';
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`;
};

export const formatPartialFailureMessage = (
  failures: DeskPartialFailure[],
  suffix: string,
): string | null => {
  const labels = [
    ...new Set(
      failures.map(
        ({ source }) =>
          PARTIAL_SOURCE_LABEL[source] ?? fallbackSourceLabel(source),
      ),
    ),
  ];
  if (labels.length === 0) return null;
  return `Couldn't load ${joinSourceLabels(labels)} — ${suffix}.`;
};
