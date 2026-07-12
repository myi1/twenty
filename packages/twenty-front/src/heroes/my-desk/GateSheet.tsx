import { useState } from 'react';
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

const FieldInput = styled.input`
  margin-top: 8px;
  width: 100%;
  min-height: 34px;
  box-sizing: border-box;
  padding: 0 10px;
  border: 1px solid var(--p-line);
  border-radius: var(--p-radius-sm);
  background: transparent;
  color: var(--p-ink);
  font: 500 12px ${FONT_UI};
  &:focus-visible { box-shadow: var(--p-focus-ring); }
`;

const CheckLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font: 500 12px ${FONT_UI};
  color: var(--p-ink);
  cursor: pointer;
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
  onSaveField,
  onMoveAnyway,
}: {
  toStage: string;
  requirements: DeskGate[];
  busy: boolean;
  nudgeSent: boolean;
  onBack: () => void;
  onCompleteActivity: (gate: DeskGate) => void;
  onNudge: (gate: DeskGate) => void;
  onOpenRecord: () => void;
  onSaveField: (gate: DeskGate, value: string | boolean) => void;
  onMoveAnyway: () => void;
}) => {
  const [fieldValue, setFieldValue] = useState('');
  const done = requirements.filter((gate) => gate.done).length;
  const pending = requirements.filter((gate) => !gate.done);
  const only = pending[0];

  // A WARN-only sheet is advisory: nothing hard-blocks the move.
  const warnOnly = pending.length > 0 && pending.every((gate) => gate.severity === 'warn');
  const inlineField = only?.type === 'field' && Boolean(only.inputKind) ? only : undefined;
  const saveDisabled =
    !inlineField ||
    (inlineField.inputKind === 'boolean'
      ? fieldValue !== 'true'
      : inlineField.inputKind === 'number'
        ? !(Number(fieldValue) > 0)
        : fieldValue.trim().length === 0);

  const headerCopy = warnOnly
    ? 'Recommended before moving'
    : `${pending.length} ${pending.length === 1 ? 'thing' : 'things'} needed`;

  const submitField = () => {
    if (!inlineField) return;
    onSaveField(inlineField, inlineField.inputKind === 'boolean' ? fieldValue === 'true' : fieldValue);
  };

  return (
    <>
      <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--p-line)', font: `600 12.5px ${FONT_UI}`, color: 'var(--p-ink)' }}>
        Move to {formatStageLabel(toStage)} — {headerCopy}
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
            {gate === inlineField && gate.inputKind === 'number' && (
              <FieldInput
                type="number"
                min="1"
                inputMode="numeric"
                value={fieldValue}
                onChange={(event) => setFieldValue(event.target.value)}
                placeholder="Enter amount (AED)"
              />
            )}
            {gate === inlineField && gate.inputKind === 'date' && (
              <FieldInput type="date" value={fieldValue} onChange={(event) => setFieldValue(event.target.value)} />
            )}
            {gate === inlineField && gate.inputKind === 'boolean' && (
              <CheckLabel>
                <input type="checkbox" checked={fieldValue === 'true'} onChange={(event) => setFieldValue(event.target.checked ? 'true' : '')} />
                Signed mandate is on file
              </CheckLabel>
            )}
            {gate.type === 'approval' && gate.approverLabel && (
              <div style={{ font: `500 11px/1.45 ${FONT_MONO}`, color: 'var(--p-accent)', marginTop: 6 }}>
                Waiting on {gate.approverLabel}
              </div>
            )}
          </Requirement>
        ))}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <Button type="button" disabled={busy} onClick={onBack}>Back</Button>
          {warnOnly ? (
            <Button $primary type="button" disabled={busy} onClick={onMoveAnyway}>Move anyway</Button>
          ) : inlineField ? (
            <Button $primary type="button" disabled={busy || saveDisabled} onClick={submitField}>
              Save &amp; move
            </Button>
          ) : only?.type === 'activity' && only.taskId ? (
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
