import { useEffect, useMemo, useRef, useState } from 'react';
import styled from '@emotion/styled';

import type { PropelHeroHost } from '@/propel/runtime/heroHost';
import { DUR, EASE } from '../_pulse/pulse-tokens';
import { FONT_MONO, FONT_UI } from '../_pulse/pulse';
import { fetchStageGateStatus, runDeskAction } from './deskApi';
import { formatStageLabel } from './format';
import { GateSheet } from './GateSheet';
import { isStageLane, STAGES_BY_LANE } from './gates';
import { deskRecordPath } from './PeekDrawer';
import type { DeskGate, DeskMoveResponse, DeskNudgeResponse, DeskRow } from './types';

const LANE_LABEL = {
  secondaryOpportunity: 'Resale',
  sellOpportunity: 'Seller',
  offplanOpportunity: 'Off-plan',
  rcbiOpportunity: 'RCBI',
  institutionalOpportunity: 'Institutional',
  listing: 'Listing',
  deal: 'Deal',
} as const;

const Shell = styled.div<{ $fading: boolean }>`
  position: fixed;
  z-index: 5000;
  width: min(254px, calc(100vw - 16px));
  max-height: min(560px, calc(100vh - 16px));
  overflow-y: auto;
  border: 1px solid var(--p-line);
  border-radius: var(--p-radius);
  color: var(--p-ink);
  background: var(--p-surface);
  box-shadow: var(--p-shadow-pop);
  opacity: ${({ $fading }) => ($fading ? 0 : 1)};
  transform: ${({ $fading }) => ($fading ? 'translateY(-4px) scale(.98)' : 'none')};
  transform-origin: top right;
  transition: opacity ${DUR.dropdown}ms ${EASE.out}, transform ${DUR.dropdown}ms ${EASE.out};
`;

const StageList = styled.div`
  margin: 12px 16px 12px 23px;
  border-left: 1px solid var(--p-line);
`;

const StageRow = styled.button<{ $current: boolean; $next: boolean; $gated: boolean }>`
  all: unset;
  box-sizing: border-box;
  position: relative;
  display: block;
  width: 100%;
  padding: 6px 12px 6px 16px;
  border-radius: 6px;
  color: ${({ $current, $next }) => ($current ? 'var(--p-ink)' : $next ? 'var(--p-accent)' : 'var(--p-ink-2)')};
  font: ${({ $current, $next }) => ($current || $next ? 500 : 400)} 13px ${FONT_UI};
  cursor: ${({ $current }) => ($current ? 'default' : 'pointer')};
  transition: background ${DUR.tooltip}ms ${EASE.out};

  &:hover:not(:disabled), &:focus-visible { background: var(--p-surface-2); }
  &:focus-visible { box-shadow: var(--p-focus-ring); }
  &:disabled { cursor: default; }

  .stage-dot {
    position: absolute;
    left: -4px;
    top: 13px;
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: ${({ $current, $next }) => ($current ? 'var(--p-accent-strong)' : $next ? 'var(--p-accent)' : 'var(--p-ink-2)')};
    box-shadow: 0 0 0 3px var(--seal-ring);
    opacity: ${({ $gated }) => ($gated ? .45 : 1)};
  }

  .stage-label { opacity: ${({ $gated }) => ($gated ? .45 : 1)}; }
`;

const GateReason = styled.div`
  margin-top: 2px;
  color: var(--p-ink-2);
  font: 400 11px/1.5 ${FONT_UI};

  .gate-link {
    color: var(--p-accent);
    white-space: nowrap;
  }
`;

export type StagePickerAnchor = { x: number; y: number };

type ActiveGate = { toStage: string; requirements: DeskGate[] };

export const StagePicker = ({ row, anchor, host, onClose, onMoved }: {
  row: DeskRow;
  anchor: StagePickerAnchor;
  host: PropelHeroHost;
  onClose: () => void;
  onMoved: (result: Extract<DeskMoveResponse, { ok: true }>, toStage: string) => void;
}) => {
  const [busy, setBusy] = useState(false);
  const [loadingGates, setLoadingGates] = useState(true);
  const [gatesByStage, setGatesByStage] = useState<Record<string, DeskGate[]>>({});
  const [activeGate, setActiveGate] = useState<ActiveGate | null>(null);
  const [view, setView] = useState<'ladder' | 'gate'>('ladder');
  const [fading, setFading] = useState(true);
  const [nudgeSent, setNudgeSent] = useState(false);
  const swapTimer = useRef<number | undefined>(undefined);
  const stages = isStageLane(row.laneObject) ? STAGES_BY_LANE[row.laneObject] : [];
  const currentIndex = stages.indexOf(row.stage);
  const position = useMemo(() => ({
    left: Math.max(8, Math.min(anchor.x, window.innerWidth - 262)),
    top: Math.max(8, Math.min(anchor.y, window.innerHeight - Math.min(560, stages.length * 48 + 82))),
  }), [anchor.x, anchor.y, stages.length]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setFading(false));
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(swapTimer.current);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (!isStageLane(row.laneObject)) return;
    let current = true;
    setLoadingGates(true);
    void Promise.all(stages.map(async (stage, index) => {
      if (index <= currentIndex) return [stage, []] as const;
      const result = await fetchStageGateStatus(row.laneObject, row.recordId, stage);
      return [stage, result?.ok ? result.requirements.filter((gate) => !gate.done) : []] as const;
    })).then((entries) => {
      if (current) setGatesByStage(Object.fromEntries(entries));
    }).finally(() => {
      if (current) setLoadingGates(false);
    });
    return () => { current = false; };
  }, [currentIndex, row.laneObject, row.recordId, stages]);

  const swap = (nextView: 'ladder' | 'gate', nextGate?: ActiveGate) => {
    setFading(true);
    window.clearTimeout(swapTimer.current);
    swapTimer.current = window.setTimeout(() => {
      if (nextGate) setActiveGate(nextGate);
      setView(nextView);
      setNudgeSent(false);
      window.requestAnimationFrame(() => setFading(false));
    }, DUR.dropdown);
  };

  const showGate = (toStage: string, requirements: DeskGate[]) => {
    swap('gate', { toStage, requirements });
  };

  const move = async (toStage: string) => {
    if (!isStageLane(row.laneObject) || toStage === row.stage) return;
    setBusy(true);
    try {
      const result = await runDeskAction('moveStage', {
        laneObject: row.laneObject,
        recordId: row.recordId,
        toStage,
      }) as DeskMoveResponse | null;
      if (!result) {
        host.notify("The stage didn't move. Please try again.", 'error');
        return;
      }
      if (!result.ok) {
        if (result.error === 'GATE_BLOCKED' && result.gate) showGate(toStage, [{ ...result.gate, done: false }]);
        else host.notify("The stage didn't move. Please try again.", 'error');
        return;
      }
      if (result.warnings?.length) {
        host.notify(result.warnings.map((warning) => warning.label).join(' · '), 'info');
      }
      onMoved(result, toStage);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const chooseStage = (toStage: string) => {
    const requirements = gatesByStage[toStage] ?? [];
    if (requirements.length) showGate(toStage, requirements);
    else void move(toStage);
  };

  const applyFieldAndMove = async (gate: DeskGate, value: string | boolean) => {
    if (!gate.setField || !activeGate) return;
    setBusy(true);
    try {
      const saved = await runDeskAction('setLaneField', {
        laneObject: row.laneObject,
        recordId: row.recordId,
        field: gate.setField,
        value,
      });
      if (!saved?.ok) {
        host.notify("That didn't save. The stage stayed where it was.", 'error');
        return;
      }
      await move(activeGate.toStage);
    } finally {
      setBusy(false);
    }
  };

  const completeAndMove = async (gate: DeskGate) => {
    if (!gate.taskId || !activeGate) return;
    setBusy(true);
    try {
      const completed = await runDeskAction('completeTask', {
        laneObject: row.laneObject,
        recordId: row.recordId,
        taskId: gate.taskId,
      });
      if (!completed?.ok) {
        host.notify("That task didn't update. The stage stayed where it was.", 'error');
        return;
      }
      await move(activeGate.toStage);
    } finally {
      setBusy(false);
    }
  };

  const nudgeApproval = async () => {
    if (!activeGate || row.laneObject !== 'rcbiOpportunity') return;
    setBusy(true);
    try {
      const result = await runDeskAction('nudgeApproval', {
        laneObject: row.laneObject,
        recordId: row.recordId,
        toStage: activeGate.toStage,
      }) as DeskNudgeResponse | null;
      if (!result?.ok || result.sent < 1) {
        host.notify("The compliance nudge wasn't sent. Please try again.", 'error');
        return;
      }
      setNudgeSent(true);
      host.notify('Compliance approver nudged.', 'success');
    } finally {
      setBusy(false);
    }
  };

  if (!isStageLane(row.laneObject)) return null;
  return (
    <>
      <button type="button" aria-label="Close stage picker" onClick={onClose} style={{ all: 'unset', position: 'fixed', inset: 0, zIndex: 4999 }} />
      <Shell $fading={fading} role="dialog" aria-label={`Move ${row.name} to another stage`} style={position}>
        {view === 'ladder' ? (
          <>
            <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--p-line)', font: `600 12.5px ${FONT_UI}`, color: 'var(--p-ink)' }}>
              {LANE_LABEL[row.laneObject]} · move stage
            </div>
            <StageList>
              {stages.map((stage, index) => {
                const current = stage === row.stage;
                const next = index === currentIndex + 1;
                const requirements = gatesByStage[stage] ?? [];
                // A WARN gate must not paint the row as hard-blocked — only block-severity dims it.
                const blocking = requirements.filter((gate) => gate.severity !== 'warn');
                const gated = blocking.length > 0;
                const firstGate = blocking[0] ?? requirements[0];
                return (
                  <StageRow
                    key={stage}
                    type="button"
                    $current={current}
                    $next={next && !gated}
                    $gated={gated}
                    disabled={busy || loadingGates || current}
                    onClick={() => chooseStage(stage)}
                  >
                    <span className="stage-dot" />
                    <span className="stage-label">{formatStageLabel(stage)}</span>
                    {current && <span style={{ marginLeft: 8, font: `500 9px ${FONT_MONO}`, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--p-ink-2)' }}>current</span>}
                    {firstGate && (
                      <GateReason>
                        {firstGate.label} <span className="gate-link">→ {firstGate.fix}</span>
                      </GateReason>
                    )}
                  </StageRow>
                );
              })}
            </StageList>
            <div style={{ borderTop: '1px solid var(--p-line)', padding: '9px 16px 11px', font: `400 11px ${FONT_UI}`, color: 'var(--p-ink-2)' }}>
              {loadingGates ? 'Checking move requirements…' : 'Moves are undoable for a few seconds.'}
            </div>
          </>
        ) : activeGate ? (
          <GateSheet
            toStage={activeGate.toStage}
            requirements={activeGate.requirements}
            busy={busy}
            nudgeSent={nudgeSent}
            onBack={() => swap('ladder')}
            onCompleteActivity={(gate) => void completeAndMove(gate)}
            onNudge={() => void nudgeApproval()}
            onOpenRecord={() => host.navigate(deskRecordPath(row))}
            onSaveField={(gate, value) => void applyFieldAndMove(gate, value)}
            onMoveAnyway={() => { if (activeGate) void move(activeGate.toStage); }}
          />
        ) : null}
      </Shell>
    </>
  );
};
