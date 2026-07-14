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
  initialClient?: PitchClient | null,
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
    // Pre-attached when the Studio was launched "for this client" from a Person
    // record — the agent skips the client-search step and every pitch is addressed
    // to them. Falls back to null (normal in-Studio flow: pick a client in step 2).
    client: initialClient ?? null,
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

// The WhatsApp send route rejects messages longer than this — surfaced in the
// wizard as a character counter + send block.
export const WA_MESSAGE_MAX = 1500;

// A successfully generated pitch: the project's display name paired with ITS
// PDF url. Built only from successes — never zip the full selection against a
// shorter url list (that mispairs names and links on partial failure).
export type PitchLinkPair = { name: string; url: string };

export function pitchLinksBlock(pairs: PitchLinkPair[]): string {
  return pairs.map((p) => `• ${p.name} — ${p.url}`).join('\n');
}

// Grounded default WhatsApp message: client first name (when attached) and
// one bullet per successful pair — nothing invented.
export function defaultWaMessage(
  s: PitchWizardState,
  pairs: PitchLinkPair[],
): string {
  const first = s.client?.name?.trim().split(/\s+/)[0];
  const greeting = first ? `Hi ${first},` : 'Hi,';
  return [
    greeting,
    '',
    pairs.length > 1
      ? 'Here are the presentations I put together for you:'
      : 'Here is the presentation I put together for you:',
    pitchLinksBlock(pairs),
    '',
    'Happy to walk you through any of them — just reply here.',
  ].join('\n');
}

// Never send a linkless pitch message: when the chosen base copy (e.g. the AI
// waMessage) carries no link, append the PDF links block.
export function ensurePitchLinks(
  message: string,
  pairs: PitchLinkPair[],
): string {
  if (pairs.length === 0 || message.includes('http')) return message;
  return `${message}\n\n${pitchLinksBlock(pairs)}`;
}
