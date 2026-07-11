import styled from '@emotion/styled';
import { IconCheck, IconExternalLink } from 'twenty-ui/display';

import { DUR, EASE, SPACE } from '../_pulse/pulse-tokens';
import { FONT_MONO, FONT_UI } from '../_pulse/pulse';
import type { DeskGate } from './types';

const Action = styled.button`
  all: unset;
  box-sizing: border-box;
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 12px;
  border: 1px solid var(--p-accent);
  border-radius: var(--p-radius-sm);
  color: var(--p-bg);
  background: var(--p-accent);
  font: 600 12px ${FONT_UI};
  cursor: pointer;
  transition: opacity ${DUR.tooltip}ms ${EASE.out};
  &:disabled { cursor: wait; opacity: .55; }
`;

export const GateSheet = ({ gate, busy, onComplete, onOpenRecord }: {
  gate: DeskGate;
  busy: boolean;
  onComplete: () => void;
  onOpenRecord: () => void;
}) => (
  <div style={{ margin: `${SPACE[2]}px`, padding: SPACE[3], border: '1px solid var(--p-line)', borderRadius: 'var(--p-radius-sm)', background: 'var(--p-surface)' }}>
    <div style={{ font: `500 9.5px ${FONT_MONO}`, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--p-accent)', marginBottom: 8 }}>
      Move blocked
    </div>
    <div style={{ font: `500 10.5px ${FONT_MONO}`, color: 'var(--p-ink-2)', marginBottom: 8 }}>0 of 1 done</div>
    <div style={{ font: `500 12.5px/1.45 ${FONT_UI}`, color: 'var(--p-ink)' }}>{gate.label}</div>
    <div style={{ font: `12px/1.45 ${FONT_UI}`, color: 'var(--p-ink-2)', marginTop: 4 }}>{gate.fix}</div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
      {gate.type === 'activity' && gate.taskId ? (
        <Action type="button" disabled={busy} onClick={onComplete}><IconCheck size={14} /> Mark done & move</Action>
      ) : (
        <Action type="button" disabled={busy} onClick={onOpenRecord}>Open full record <IconExternalLink size={14} /></Action>
      )}
    </div>
  </div>
);
