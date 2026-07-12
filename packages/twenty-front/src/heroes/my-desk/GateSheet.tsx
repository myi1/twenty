import styled from '@emotion/styled';

import { DUR, EASE } from '../_pulse/pulse-tokens';
import { FONT_MONO, FONT_UI } from '../_pulse/pulse';
import { formatStageLabel } from './format';
import type { DeskGate } from './types';

const Body = styled.div`
  padding: 14px 16px 16px;
`;

const Requirement = styled.div`
  padding: 9px 0;
  border-bottom: 1px solid var(--p-line);
  &:last-of-type { border-bottom: 0; }
`;

const Button = styled.button<{ $primary?: boolean }>`
  all: unset;
  box-sizing: border-box;
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 13px;
  border: 1px solid ${({ $primary }) => ($primary ? 'var(--p-accent)' : 'var(--p-line)')};
  border-radius: var(--p-radius-sm);
  color: ${({ $primary }) => ($primary ? 'var(--p-bg)' : 'var(--p-ink)')};
  background: ${({ $primary }) => ($primary ? 'var(--p-accent)' : 'transparent')};
  font: 600 12px ${FONT_UI};
  cursor: pointer;
  transition: opacity ${DUR.tooltip}ms ${EASE.out}, background ${DUR.tooltip}ms ${EASE.out};
  &:hover { opacity: .88; }
  &:focus-visible { box-shadow: var(--p-focus-ring); }
  &:disabled { cursor: default; opacity: .5; }
`;

export const GateSheet = ({
  toStage,
  requirements,
  busy,
  nudgeSent,
  onBack,
  onCompleteActivity,
  onNudge,
  onOpenRecord,
}: {
  toStage: string;
  requirements: DeskGate[];
  busy: boolean;
  nudgeSent: boolean;
  onBack: () => void;
  onCompleteActivity: (gate: DeskGate) => void;
  onNudge: (gate: DeskGate) => void;
  onOpenRecord: () => void;
}) => {
  const done = requirements.filter((gate) => gate.done).length;
  const pending = requirements.filter((gate) => !gate.done);
  const only = pending[0];

  return (
    <>
      <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--p-line)', font: `600 12.5px ${FONT_UI}`, color: 'var(--p-ink)' }}>
        Move to {formatStageLabel(toStage)} — {pending.length} {pending.length === 1 ? 'thing' : 'things'} needed
      </div>
      <Body>
        {requirements.length > 1 && (
          <div style={{ font: `500 10px ${FONT_MONO}`, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--p-ink-2)', marginBottom: 5 }}>
            {done} of {requirements.length} done
          </div>
        )}
        {pending.map((gate, index) => (
          <Requirement key={`${gate.type}-${gate.label}-${index}`}>
            <div style={{ font: `500 12px/1.45 ${FONT_UI}`, color: 'var(--p-ink)' }}>{gate.label}</div>
            <div style={{ font: `11.5px/1.5 ${FONT_UI}`, color: 'var(--p-ink-2)', marginTop: 3 }}>{gate.fix}</div>
            {gate.type === 'approval' && gate.approverLabel && (
              <div style={{ font: `500 11px/1.45 ${FONT_MONO}`, color: 'var(--p-accent)', marginTop: 6 }}>
                Waiting on {gate.approverLabel}
              </div>
            )}
          </Requirement>
        ))}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <Button type="button" disabled={busy} onClick={onBack}>Back</Button>
          {only?.type === 'activity' && only.taskId ? (
            <Button $primary type="button" disabled={busy} onClick={() => onCompleteActivity(only)}>
              Mark done &amp; move
            </Button>
          ) : only?.type === 'approval' ? (
            <Button $primary type="button" disabled={busy || nudgeSent} onClick={() => onNudge(only)}>
              {nudgeSent ? 'Nudged' : 'Nudge'}
            </Button>
          ) : (
            <Button $primary type="button" disabled={busy} onClick={onOpenRecord}>Open full record →</Button>
          )}
        </div>
      </Body>
    </>
  );
};
