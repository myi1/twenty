// BoardKanban.tsx — the SECONDARY board view (mockup L1128–1197, the Table⇄Kanban
// toggle L901–910). The table stays the centerpiece; this is a quieter glance at
// the same open book laid out across the 5 shared ladder columns.
//
// It renders the SAME already-filtered rows the table shows (BoardTable passes
// its computed visibleRows down), so the lane/going-cold chip, the Today-strip
// tile and "Today's plan" focus mode all carry over unchanged — one filter, two
// layouts. Every lane's native stages collapse onto the ONE shared ladder
// (gates.ts LADDER_MAP — never a mapping invented here); leads sit pre-pipeline
// in New.
//
// DRAG-TO-MOVE-STAGE (spec §4.4): real HTML5 drag (this is a twenty-front hero
// with a real DOM — NOT the in-sandbox React-Flow-crashes case). Dropping a card
// on a column hands the target ladder step back to index.tsx, which resolves it
// to the card's real target stage via LADDER_MAP and drives the EXISTING move /
// gate / undo machinery. This component owns layout + the drag gesture only — it
// never moves a stage itself.

import { useState, type DragEvent as ReactDragEvent } from 'react';
import styled from '@emotion/styled';

import { DUR, EASE, SPACE } from '../_pulse/pulse-tokens';
import { Btn, FONT_MONO, FONT_UI, P } from '../_pulse/pulse';

import { LANE_COLOR, LANE_LABEL } from './BoardTable';
import { bandOf, isGoingCold, needsAttentionToday } from './banding';
import {
  isStageLane,
  ladderStepOf,
  LADDER_LABEL,
  LADDER_STEPS,
  stagesForLadderStep,
  type LadderStep,
} from './gates';
import { formatAedTotal, formatStageLabel, friendlyError } from './format';
import { formatPartialFailureMessage } from './partialFailureLabels';
import { SkeletonStack, Text } from './shared';
import type { DeskPartialFailure, DeskRow } from './types';

// Which ladder column a row belongs in. Leads are pre-pipeline → always New
// (they convert, they don't move stage). A stage-lane row maps by LADDER_MAP; a
// terminal/archived stage that isn't on the active ladder (ON_HOLD / LOST /
// PASSED / COLLAPSED) returns null and is dropped from the board — it doesn't
// belong on an active desk.
const columnOf = (row: DeskRow): LadderStep | null => {
  if (row.laneObject === 'lead') return 'NEW';
  if (!isStageLane(row.laneObject)) return null;
  return ladderStepOf(row.laneObject, row.stage);
};

// A card can be dragged onto a column only if that lane actually reaches it and
// it isn't already sitting there. Leads never move. Mirrors index.tsx's own
// guard so the highlight can never promise a drop the handler will refuse.
const canDropOn = (row: DeskRow, step: LadderStep): boolean => {
  if (row.laneObject === 'lead' || !isStageLane(row.laneObject)) return false;
  if (ladderStepOf(row.laneObject, row.stage) === step) return false;
  return stagesForLadderStep(row.laneObject, step).length > 0;
};

const KanbanWrap = styled.div`
  padding: 16px 20px 22px;
  overflow-x: auto;
`;

const Cols = styled.div`
  display: grid;
  grid-template-columns: repeat(5, minmax(196px, 1fr));
  gap: 14px;
  min-width: 900px;
`;

// $over = a valid card is hovering this column → brass drop-target highlight
// (spec §4.4). The tint + dashed brass edge only appears while a droppable card
// is over it; otherwise the column is a plain lane with no chrome.
const Col = styled.div<{ $over: boolean }>`
  display: flex;
  flex-direction: column;
  border-radius: var(--p-radius-sm);
  padding: 2px;
  outline: ${({ $over }) => ($over ? '1.5px dashed var(--p-accent)' : '1.5px dashed transparent')};
  outline-offset: -1px;
  background: ${({ $over }) =>
    $over ? 'color-mix(in srgb, var(--p-accent) 9%, transparent)' : 'transparent'};
  transition: background ${DUR.tooltip}ms ${EASE.out};
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const ColHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px 12px;
  margin-bottom: 4px;
`;

const ColName = styled.span`
  font-family: ${FONT_MONO};
  font-size: 9.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--p-ink-2);
  font-weight: 500;
`;

const ColCount = styled.span`
  font-family: ${FONT_MONO};
  font-size: 11px;
  color: var(--p-ink-2);
`;

// $urgent = slaAtRisk/overdue → the same subtle red wash the table uses. $cold =
// going cold → the lane edge fades back. $won = the Won column reads quieter
// (muted) — and never wears a triage tint (a won deal isn't "at risk"). $dragging
// = the card being dragged dims while it's in flight.
const Card = styled.div<{ $lane: string; $urgent: boolean; $cold: boolean; $won: boolean; $draggable: boolean; $dragging: boolean }>`
  position: relative;
  border: 1px solid var(--p-line);
  border-left: 3px solid ${({ $lane, $cold }) =>
    $cold ? `color-mix(in srgb, ${$lane} 35%, transparent)` : $lane};
  border-radius: var(--p-radius-sm);
  padding: 12px 13px;
  margin-bottom: 10px;
  cursor: ${({ $draggable }) => ($draggable ? 'grab' : 'pointer')};
  opacity: ${({ $won, $dragging }) => ($dragging ? 0.4 : $won ? 0.82 : 1)};
  background: ${({ $urgent, $won }) =>
    $urgent && !$won ? 'color-mix(in srgb, var(--p-bad) 12%, var(--p-surface))' : 'var(--p-surface)'};
  transition: transform ${DUR.tooltip}ms ${EASE.out}, background ${DUR.tooltip}ms ${EASE.out}, opacity ${DUR.tooltip}ms ${EASE.out};
  &:hover {
    background: ${({ $urgent, $won }) =>
      $urgent && !$won ? 'color-mix(in srgb, var(--p-bad) 12%, var(--p-surface-2))' : 'var(--p-surface-2)'};
    transform: translateY(-1px);
  }
  &:active {
    cursor: ${({ $draggable }) => ($draggable ? 'grabbing' : 'pointer')};
    transform: scale(0.99);
  }
  &:focus-visible {
    box-shadow: var(--p-focus-ring);
    outline: none;
  }
  @media (prefers-reduced-motion: reduce) {
    transition: none;
    &:hover,
    &:active {
      transform: none;
    }
  }
`;

const CardName = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;
  font-family: ${FONT_UI};
  font-size: 13px;
  font-weight: 500;
  color: var(--p-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const CardStage = styled.div`
  font-family: ${FONT_UI};
  font-size: 11.5px;
  color: var(--p-ink-2);
  margin: 3px 0 9px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const CardFoot = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const CardPrice = styled.span`
  font-family: ${FONT_MONO};
  font-size: 12.5px;
  color: var(--p-accent-strong);
  font-weight: 500;
  white-space: nowrap;
`;

const CardLane = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: ${FONT_MONO};
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--p-ink-2);
  white-space: nowrap;
`;

export const BoardKanban = ({
  status,
  rows,
  error,
  partial,
  partialFailures,
  onRetry,
  nowMs,
  onRowClick,
  onCardDrop,
}: {
  status: 'loading' | 'ready' | 'error';
  /** Already filtered by BoardTable (lane chip · strip tile · focus mode). */
  rows: DeskRow[];
  error: string | null;
  /** Later pages failed after rows painted — keep the board, flag the gap. */
  partial: boolean;
  partialFailures: DeskPartialFailure[];
  onRetry: () => void;
  nowMs: number;
  onRowClick: (row: DeskRow) => void;
  /** Hands the target ladder column back to index.tsx, which resolves it to the
   *  card's real target stage and drives the existing move / gate / undo flow. */
  onCardDrop: (row: DeskRow, step: LadderStep, anchor: { x: number; y: number }) => void;
}) => {
  const [dragging, setDragging] = useState<DeskRow | null>(null);
  const [overStep, setOverStep] = useState<LadderStep | null>(null);

  if (status === 'error') {
    return (
      <div style={{ padding: SPACE[6] }}>
        <Text muted>{friendlyError(error ?? 'DESK_LOAD_FAILED')}</Text>
        <div style={{ marginTop: SPACE[3] }}>
          <Btn type="button" variant="secondary" onClick={onRetry}>
            Retry board load
          </Btn>
        </div>
      </div>
    );
  }
  if (status === 'loading') {
    return (
      <KanbanWrap>
        <Cols>
          {LADDER_STEPS.map((step) => (
            <div key={step}>
              <ColHead>
                <ColName>{LADDER_LABEL[step]}</ColName>
              </ColHead>
              <SkeletonStack rows={2} height={70} />
            </div>
          ))}
        </Cols>
      </KanbanWrap>
    );
  }

  // Bucket the (already filtered) rows into columns, preserving the pre-sorted
  // needs-you-first order within each column.
  const buckets: Record<LadderStep, DeskRow[]> = { NEW: [], WORKING: [], NEGOTIATING: [], CLOSING: [], WON: [] };
  for (const row of rows) {
    const step = columnOf(row);
    if (step) buckets[step].push(row);
  }

  const onCardDragStart = (event: ReactDragEvent<HTMLDivElement>, row: DeskRow) => {
    event.dataTransfer.setData('text/plain', row.id);
    event.dataTransfer.effectAllowed = 'move';
    setDragging(row);
  };
  const onCardDragEnd = () => {
    setDragging(null);
    setOverStep(null);
  };

  const onColDragOver = (event: ReactDragEvent<HTMLDivElement>, step: LadderStep) => {
    if (!dragging || !canDropOn(dragging, step)) return; // invalid → no preventDefault = "no drop" cursor = snap back
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (overStep !== step) setOverStep(step);
  };
  const onColDrop = (event: ReactDragEvent<HTMLDivElement>, step: LadderStep) => {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain');
    const row = rows.find((candidate) => candidate.id === id) ?? dragging;
    setDragging(null);
    setOverStep(null);
    if (row && canDropOn(row, step)) {
      onCardDrop(row, step, { x: event.clientX, y: event.clientY });
    }
  };

  const anyRows = LADDER_STEPS.some((step) => buckets[step].length > 0);

  return (
    <KanbanWrap>
      {!anyRows && (
        <div style={{ padding: `${SPACE[2]}px ${SPACE[1]}px ${SPACE[4]}px` }}>
          <Text muted>Nothing matches this filter.</Text>
        </div>
      )}
      <Cols>
        {LADDER_STEPS.map((step) => {
          const cards = buckets[step];
          const isWon = step === 'WON';
          const highlight = overStep === step && !!dragging && canDropOn(dragging, step);
          return (
            <Col
              key={step}
              $over={highlight}
              onDragOver={(event) => onColDragOver(event, step)}
              onDragLeave={() => setOverStep((prev) => (prev === step ? null : prev))}
              onDrop={(event) => onColDrop(event, step)}
            >
              <ColHead>
                <ColName>{LADDER_LABEL[step]}</ColName>
                <ColCount>{cards.length}</ColCount>
              </ColHead>
              {cards.map((row) => {
                const band = bandOf(row, nowMs);
                const urgent = band === 'slaAtRisk' || band === 'overdue';
                const cold = isGoingCold(row, nowMs);
                const today = needsAttentionToday(row, nowMs);
                const draggable = row.laneObject !== 'lead' && isStageLane(row.laneObject);
                const stageLabel =
                  row.laneObject === 'lead' ? 'Lead · reply now' : formatStageLabel(row.stage);
                return (
                  <Card
                    key={row.id}
                    role="button"
                    tabIndex={0}
                    $lane={LANE_COLOR[row.laneObject]}
                    $urgent={urgent}
                    $cold={cold}
                    $won={isWon}
                    $draggable={draggable}
                    $dragging={dragging?.id === row.id}
                    draggable={draggable}
                    aria-label={`${row.name} — ${stageLabel}. ${draggable ? 'Drag to move stage.' : ''}`}
                    onDragStart={(event) => onCardDragStart(event, row)}
                    onDragEnd={onCardDragEnd}
                    onClick={() => onRowClick(row)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onRowClick(row);
                      }
                    }}
                  >
                    <CardName>
                      {today && !isWon && (
                        <span
                          style={{ width: 5, height: 5, borderRadius: 999, flex: 'none', background: P.accent }}
                          aria-hidden
                        />
                      )}
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {row.name || 'Unnamed'}
                      </span>
                    </CardName>
                    <CardStage>
                      {stageLabel}
                      {cold && !isWon ? ' · going cold' : ''}
                    </CardStage>
                    <CardFoot>
                      <CardPrice>
                        {row.valueAed !== null ? `~${formatAedTotal(row.valueAed)}` : '—'}
                      </CardPrice>
                      <CardLane>
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 999,
                            flex: 'none',
                            background: isWon ? 'var(--p-good)' : LANE_COLOR[row.laneObject],
                          }}
                          aria-hidden
                        />
                        {isWon ? 'Won' : LANE_LABEL[row.laneObject]}
                      </CardLane>
                    </CardFoot>
                  </Card>
                );
              })}
            </Col>
          );
        })}
      </Cols>
      {partial && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: SPACE[3],
            paddingTop: SPACE[3],
          }}
        >
          <Text muted>
            {formatPartialFailureMessage(
              partialFailures,
              'showing what arrived',
            ) ?? "Couldn't load the rest — showing what arrived."}
          </Text>
          <Btn type="button" variant="secondary" onClick={onRetry}>
            Retry board load
          </Btn>
        </div>
      )}
    </KanbanWrap>
  );
};
