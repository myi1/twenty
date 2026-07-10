// Pure state reducer for the 5-step pitch wizard — keeps OffplanPitchWizard.tsx
// a thin shell over testable transitions. No React, no IO.
import type {
  PitchClient,
  PitchGenerated,
  PitchSections,
  PitchTheme,
} from './types';

export const WIZARD_STEPS = [
  'Selection',
  'Client',
  'Presentation',
  'Review',
  'Send',
] as const;

export type PitchWizardState = {
  step: number;
  projectIds: number[];
  anchorUnits: Record<number, number | undefined>;
  client: PitchClient | null;
  clientSkipped: boolean;
  theme: PitchTheme;
  language: string;
  currency: string;
  hideDeveloper: boolean;
  sections: PitchSections;
  coverNote: string;
  waMessage: string;
  generated: PitchGenerated[];
};

export function initWizard(
  projectIds: number[],
  anchorUnit?: { projectId: number; unitId?: number },
): PitchWizardState {
  const ids: number[] = [];
  for (const id of projectIds) {
    if (!ids.includes(id)) ids.push(id);
  }
  const anchorUnits: Record<number, number | undefined> = {};
  if (anchorUnit != null && anchorUnit.unitId != null) {
    anchorUnits[anchorUnit.projectId] = anchorUnit.unitId;
  }
  return {
    step: 0,
    projectIds: ids,
    anchorUnits,
    client: null,
    clientSkipped: false,
    theme: 'nocturne',
    language: 'English',
    currency: 'AED',
    hideDeveloper: false,
    sections: {
      cover: true,
      districtIntro: true,
      projectPages: true,
      units: true,
      layouts: true,
      amenities: true,
      paymentPlan: true,
      areaStrength: false,
      investorRoi: false,
    },
    coverNote: '',
    waMessage: '',
    generated: [],
  };
}

export function removeProject(
  s: PitchWizardState,
  id: number,
): PitchWizardState {
  const anchorUnits = { ...s.anchorUnits };
  delete anchorUnits[id];
  return {
    ...s,
    projectIds: s.projectIds.filter((p) => p !== id),
    anchorUnits,
  };
}

export function canProceed(s: PitchWizardState): boolean {
  if (s.step === 0) return s.projectIds.length > 0;
  if (s.step === 1) return s.client != null || s.clientSkipped;
  return true;
}

const clampStep = (n: number) =>
  Math.max(0, Math.min(WIZARD_STEPS.length - 1, n));

export function nextStep(s: PitchWizardState): PitchWizardState {
  return { ...s, step: clampStep(s.step + 1) };
}

export function prevStep(s: PitchWizardState): PitchWizardState {
  return { ...s, step: clampStep(s.step - 1) };
}

export function gotoStep(s: PitchWizardState, n: number): PitchWizardState {
  return { ...s, step: clampStep(n) };
}

// Grounded default WhatsApp message: client first name (when attached), the
// supplied project names and PDF links — nothing invented.
export function defaultWaMessage(
  s: PitchWizardState,
  projectNames: string[],
  urls: string[],
): string {
  const first = s.client?.name?.trim().split(/\s+/)[0];
  const greeting = first ? `Hi ${first},` : 'Hi,';
  const lines: string[] = projectNames.map((name, i) =>
    urls[i] ? `• ${name} — ${urls[i]}` : `• ${name}`,
  );
  for (let i = projectNames.length; i < urls.length; i++) {
    lines.push(`• ${urls[i]}`);
  }
  const plural = Math.max(projectNames.length, urls.length) > 1;
  return [
    greeting,
    '',
    plural
      ? 'Here are the presentations I put together for you:'
      : 'Here is the presentation I put together for you:',
    ...lines,
    '',
    'Happy to walk you through any of them — just reply here.',
  ].join('\n');
}
