import { useEffect, useMemo, useState } from 'react';
import styled from '@emotion/styled';
import { IconCheck, IconChevronRight, IconX } from 'twenty-ui/display';

import type { PropelHeroHost } from '@/propel/runtime/heroHost';
import { DUR, EASE, SPACE } from '../_pulse/pulse-tokens';
import { FONT_MONO, FONT_UI } from '../_pulse/pulse';
import { runDeskAction } from './deskApi';
import { formatStageLabel } from './format';
import { GateSheet } from './GateSheet';
import { isStageLane, STAGES_BY_LANE } from './gates';
import { deskRecordPath } from './PeekDrawer';
import type { DeskGate, DeskMoveResponse, DeskRow } from './types';

const Shell = styled.div`
  position: fixed;
  z-index: 5000;
  width: min(330px, calc(100vw - 16px));
  max-height: min(560px, calc(100vh - 16px));
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--p-line);
  border-radius: var(--p-radius);
  color: var(--p-ink);
  background: var(--p-surface-2);
  box-shadow: var(--p-shadow-pop);
`;

const StageButton = styled.button<{ $next: boolean }>`
  all: unset;
  box-sizing: border-box;
  width: 100%;
  min-height: 42px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  border-radius: var(--p-radius-sm);
  color: var(--p-ink);
  font: 500 12.5px ${FONT_UI};
  cursor: pointer;
  background: ${({ $next }) => $next ? 'color-mix(in srgb, var(--p-accent) 12%, transparent)' : 'transparent'};
  &:hover, &:focus-visible { background: var(--p-surface); }
  &:disabled { cursor: default; }
`;

export type StagePickerAnchor = { x: number; y: number };

export const StagePicker = ({ row, anchor, host, onClose, onMoved }: {
  row: DeskRow;
  anchor: StagePickerAnchor;
  host: PropelHeroHost;
  onClose: () => void;
  onMoved: (result: Extract<DeskMoveResponse, { ok: true }>, toStage: string) => void;
}) => {
  const [busy, setBusy] = useState(false);
  const [pendingStage, setPendingStage] = useState<string | null>(null);
  const [gate, setGate] = useState<DeskGate | null>(null);
  const stages = isStageLane(row.laneObject) ? STAGES_BY_LANE[row.laneObject] : [];
  const currentIndex = stages.indexOf(row.stage);
  const nextStage = currentIndex >= 0 ? stages[currentIndex + 1] : null;
  const position = useMemo(() => ({
    left: Math.max(8, Math.min(anchor.x, window.innerWidth - 338)),
    top: Math.max(8, Math.min(anchor.y, window.innerHeight - Math.min(560, stages.length * 42 + 74))),
  }), [anchor.x, anchor.y, stages.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const move = async (toStage: string) => {
    if (!isStageLane(row.laneObject) || toStage === row.stage) return;
    setBusy(true);
    setPendingStage(toStage);
    setGate(null);
    try {
      const result = await runDeskAction('moveStage', { laneObject: row.laneObject, recordId: row.recordId, toStage }) as DeskMoveResponse | null;
      if (!result) {
        host.notify("The stage didn't move. Please try again.", 'error');
        return;
      }
      if (!result.ok) {
        if (result.error === 'GATE_BLOCKED' && result.gate) setGate(result.gate);
        else host.notify("The stage didn't move. Please try again.", 'error');
        return;
      }
      onMoved(result, toStage);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const completeAndMove = async () => {
    if (!gate?.taskId || !pendingStage) return;
    setBusy(true);
    try {
      const completed = await runDeskAction('completeTask', { laneObject: row.laneObject, recordId: row.recordId, taskId: gate.taskId });
      if (!completed?.ok) {
        host.notify("That task didn't update. The stage stayed where it was.", 'error');
        return;
      }
      await move(pendingStage);
    } finally {
      setBusy(false);
    }
  };

  if (!isStageLane(row.laneObject)) return null;
  return (
    <>
      <button type="button" aria-label="Close stage picker" onClick={onClose} style={{ all: 'unset', position: 'fixed', inset: 0, zIndex: 4999 }} />
      <Shell role="dialog" aria-label={`Move ${row.name} to another stage`} style={position}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${SPACE[2]}px ${SPACE[2]}px ${SPACE[2]}px ${SPACE[3]}px` }}>
          <div>
            <div style={{ font: `500 9.5px ${FONT_MONO}`, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--p-ink-2)' }}>Move stage</div>
            <div style={{ font: `500 12.5px ${FONT_UI}`, color: 'var(--p-ink)', marginTop: 3 }}>{row.name}</div>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} style={{ all: 'unset', width: 30, height: 30, display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--p-ink-2)' }}><IconX size={15} /></button>
        </div>
        {stages.map((stage) => {
          const current = stage === row.stage;
          return (
            <StageButton key={stage} type="button" $next={stage === nextStage} disabled={busy || current} onClick={() => void move(stage)}>
              <span style={{ width: 18, display: 'grid', placeItems: 'center', color: current || stage === nextStage ? 'var(--p-accent)' : 'var(--p-ink-2)' }}>
                {current ? <IconCheck size={14} /> : <span style={{ width: 6, height: 6, borderRadius: 999, background: 'currentColor', opacity: .45 }} />}
              </span>
              <span>{formatStageLabel(stage)}</span>
              {stage === nextStage && <span style={{ marginLeft: 'auto', font: `500 9px ${FONT_MONO}`, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--p-accent)' }}>Next</span>}
              {!current && stage !== nextStage && <IconChevronRight size={13} style={{ marginLeft: 'auto', color: 'var(--p-ink-2)' }} />}
            </StageButton>
          );
        })}
        {gate && <GateSheet gate={gate} busy={busy} onComplete={() => void completeAndMove()} onOpenRecord={() => host.navigate(deskRecordPath(row))} />}
      </Shell>
    </>
  );
};
