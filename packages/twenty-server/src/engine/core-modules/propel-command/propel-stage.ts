// The typed lifecycle a Propel record moves through. A STAGE_ADVANCE command
// carries one transition from this closed set; anything else is rejected before
// a row is written, so a receipt can only ever record a known stage.
export const PROPEL_STAGES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
  'LOST',
] as const;

export type PropelStage = (typeof PROPEL_STAGES)[number];

export interface StageTransition {
  from: PropelStage;
  to: PropelStage;
}

export const isPropelStage = (value: unknown): value is PropelStage =>
  typeof value === 'string' &&
  (PROPEL_STAGES as readonly string[]).includes(value);
