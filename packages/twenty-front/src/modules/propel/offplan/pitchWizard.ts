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
  'Units',
  'Client',
  'Presentation',
  'Review',
  'Send',
] as const;

// Hand-pick at most this many specific units per project for the deck's unit pages.
export const MAX_PICKED_UNITS = 4;

export type PitchWizardState = {
  step: number;
  projectIds: number[];
  // projectId → the hand-picked unit externalIds (≤ MAX_PICKED_UNITS) featured on
  // that project's deck. Empty/absent = overview-only pitch (still valid).
  pickedUnits: Record<number, number[]>;
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
  // Seed the picked units from a drawer "pitch this unit" launch (single anchor);
  // the Units step lets the agent add up to MAX_PICKED_UNITS more per project.
  const pickedUnits: Record<number, number[]> = {};
  if (anchorUnit != null && anchorUnit.unitId != null) {
    pickedUnits[anchorUnit.projectId] = [anchorUnit.unitId];
  }
  return {
    step: 0,
    projectIds: ids,
    pickedUnits,
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
  const pickedUnits = { ...s.pickedUnits };
  delete pickedUnits[id];
  return {
    ...s,
    projectIds: s.projectIds.filter((p) => p !== id),
    pickedUnits,
  };
}

// Toggle a unit in a project's picks — cap at MAX_PICKED_UNITS; re-ticking removes it.
export function toggleUnit(
  s: PitchWizardState,
  projectId: number,
  unitId: number,
): PitchWizardState {
  const current = s.pickedUnits[projectId] ?? [];
  const has = current.includes(unitId);
  const next = has
    ? current.filter((u) => u !== unitId)
    : current.length >= MAX_PICKED_UNITS
      ? current
      : [...current, unitId];
  return { ...s, pickedUnits: { ...s.pickedUnits, [projectId]: next } };
}

export function canProceed(s: PitchWizardState): boolean {
  if (s.step === 0) return s.projectIds.length > 0; // Selection
  if (s.step === 1) return true; // Units — skippable (overview-only is valid)
  if (s.step === 2) return s.client != null || s.clientSkipped; // Client
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
