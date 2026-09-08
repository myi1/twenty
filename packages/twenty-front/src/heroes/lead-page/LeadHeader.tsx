// LeadHeader.tsx: name/avatar, the pills row (stage, line, source, reply signal),
// the meta line (phone, city, country, local time, who's assigned), the
// lost/snoozed/unassigned banners, the "what's next" line, and the desktop quick
// actions (Call, WhatsApp, Log outcome, More).
//
// Two rules this file must never break (from the task brief, not obvious from the
// data shape alone):
//   1. `lastTouch.by` is a workspace member ID, not a name: it is NEVER rendered.
//      Only the relative time ("Last touch: 2 hours ago") is shown.
//   2. No response-clock / SLA language anywhere. The reply pill states a fact
//      ("Replied in 12 min" / "Not replied yet" / "Unknown"), never a judgement.

import { useState, type ReactNode } from 'react';
import styled from '@emotion/styled';
import { Menu, Modal, Popover, Select, TextInput } from '@mantine/core';
import type { PropelHeroHost } from '@/propel/runtime/heroHost';
import { startPropelCall } from '@/dialer-dock/utils/startPropelCall';
import { assignLead, listInboxAgents } from '@/propel/lib/inboxApi';
import type { InboxAgentOption } from '@/propel/types/inbox';
import { Btn, FONT_DISPLAY, FONT_MONO, NOCTURNE_LIGHT_VARS, PulseScope } from '../_pulse/pulse';
import { Pill } from './styles';
import { errorText, markLost, movePipeline, setName } from './leadApi';
import { LOST_REASONS, dueWords, relativeWords, rotationWords, stageWords, timeThere, zoneWords } from './words';
import type { LeadDeal, LeadLoad } from './types';

// The five lane keys createDeal / movePipeline speak, with the plain-language
// labels used everywhere else on this page (FactsRail's "start a deal" buttons
// use the same four minus institutional, since this page never originates one).
const LANE_KEYS = ['offplan', 'secondary', 'sell', 'rcbi', 'institutional'] as const;
const LANE_LABELS: Record<string, string> = {
  offplan: 'Off-plan',
  secondary: 'Buyer',
  sell: 'Seller',
  rcbi: 'RCBI',
  institutional: 'Institutional',
};

// Plain words for a pipeline move that did not fully work. `failed[].reason`
// (perform-move.ts, the shared orchestrator behind /opportunities/move) is
// written for a developer, not an agent: three of its four branches interpolate
// a raw exception message and one of those also interpolates the new record's
// raw UUID. None of that goes in front of an agent. Every reason that route can
// produce is mapped here:
//   'created in <lane> (<uuid>) but could not remove the original …'
//        THE ONE THAT MATTERS. The copy really was made and the old record
//        really is still sitting in the old pipeline, so this is said in full,
//        in words — suppressing it would leave a duplicate nobody knows to
//        clean up. Named lane, no id, no exception text.
//   'not found (or no access)'      the record is gone, or belongs to someone else.
//   'read failed: …'                nothing was created; nothing changed.
//   'create in <lane> failed: …'    nothing was created; nothing changed.
//   'invalid move (same or unknown lane)'  unreachable through the route (it
//        validates both lanes before calling performMove), mapped rather than echoed.
// Anything a later branch adds falls through to a true, generic sentence that
// claims nothing about what did or did not change.
const movePipelineFailureText = (reason: string | undefined, fromLabel: string, destLabel: string): string => {
  const r = reason ?? '';
  if (r.startsWith('created in')) {
    return `This lead was copied into ${destLabel}, but the old ${fromLabel} one could not be removed — it is still there. Delete it, and tell a manager if you cannot.`;
  }
  if (r.startsWith('not found')) return 'That pipeline is no longer there, or it is not assigned to you.';
  if (r.startsWith('read failed') || r.startsWith('create in') || r.startsWith('invalid move')) {
    return `Could not move this into ${destLabel}. Nothing was changed. Try again, and tell a manager if it keeps happening.`;
  }
  return `Could not move this into ${destLabel}. Try again, and tell a manager if it keeps happening.`;
};

// A refusal BEFORE any record was touched: either a transport failure (null) or
// move-opportunity-route.ts's own top-level `{ error }` for malformed input
// ('invalid lane', 'no records selected'), which is an engineering string and
// never shown. Same shape as FactsRail.tsx's createDealErrorText.
const movePipelineRefusedText = (r: unknown): string =>
  r
    ? 'Could not move this pipeline. Try again, and tell a manager if it keeps happening.'
    : 'The CRM did not answer. Check your connection and try again.';

const initials = (name: string, hasName: boolean): string => {
  if (!hasName) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase();
};

// ── local styling (page-specific chrome, not shared primitives) ─────────────

const HeaderWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--p-line);

  @media (max-width: 720px) {
    padding: 14px 12px 12px;
  }
`;

const TopRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
`;

const IdentityCol = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
`;

const IdentityRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
`;

const AvatarCircle = styled.div`
  width: 44px;
  height: 44px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: ${FONT_DISPLAY};
  font-size: 17px;
  color: var(--p-ink);
  background: var(--avatar-bg);
  flex: none;
`;

const NameText = styled.div`
  font-family: ${FONT_DISPLAY};
  font-size: 22px;
  color: var(--p-ink);
  line-height: 1.2;
  min-width: 0;
  overflow-wrap: anywhere;
`;

const PillsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
`;

const MetaLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--p-ink-2);
`;

const MetaDot = styled.span`
  color: var(--p-line);
`;

const PhoneTapText = styled.button`
  font-family: ${FONT_MONO};
  font-size: 13px;
  color: var(--p-ink-2);
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  min-height: 44px;
  display: inline-flex;
  align-items: center;

  &:hover {
    color: var(--p-ink);
  }
  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
`;

const Banner = styled.div<{ $tone: 'bad' | 'warn' }>`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 10px;
  min-height: 44px;
  padding: 8px 14px;
  border-radius: var(--p-radius-sm);
  font-size: 13px;
  font-weight: 500;
  background: ${(p) =>
    p.$tone === 'bad'
      ? 'color-mix(in oklab, var(--p-bad) 14%, var(--p-surface))'
      : 'color-mix(in oklab, var(--p-warn) 14%, var(--p-surface))'};
  color: ${(p) => (p.$tone === 'bad' ? 'var(--p-bad)' : 'var(--p-warn)')};
`;

const NextLine = styled.div`
  font-size: 13px;
  color: var(--p-ink-2);
`;

const ActionsRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  flex-wrap: wrap;
`;

const ModalFieldStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
`;

// Mantine's Modal/Menu/Popover all default to withinPortal, mounting straight
// into document.body, outside LeadNocturne's `--p-*` token declarations
// (pulse.tsx). Every var(--p-...) inside would otherwise resolve to nothing:
// most visibly the "Mark lost" button's explicit `var(--p-bad)` background and
// every primary/secondary Btn's gradient. PulseScope re-declares the ledger;
// display:contents keeps the wrapper invisible to layout. The light-mode
// selector mirrors LeadNocturne's own (styles.ts), duplicated here (and in
// OutcomeSheet.tsx / FactsRail.tsx) because styles.ts is outside this fix's
// file scope.
const PulsePortalScope = styled(PulseScope)`
  display: contents;
  html[data-mantine-color-scheme='light'] & {
    ${NOCTURNE_LIGHT_VARS}
  }
`;

export const LeadHeader = ({
  host,
  data,
  activeDealId,
  phone,
  onLogOutcome,
  onCallStarted,
  onChanged,
  onFocusComposer,
}: {
  host: PropelHeroHost;
  data: LeadLoad;
  // The one deal id the whole page agrees on (lifted to index.tsx), so "Move to
  // another pipeline" and "Mark lost" always act on the same deal FactsRail's
  // chip row shows as active, never a stale `data.selectedDealId`. No deals[0]
  // fallback: while this has not settled yet (first load) it resolves to no
  // deal below, same as a lead with none, rather than guessing the wrong one.
  activeDealId: string | null;
  phone: boolean;
  onLogOutcome: () => void;
  onCallStarted: () => void;
  onChanged: () => void;
  onFocusComposer: () => void;
}) => {
  const { person } = data;
  const selectedDeal: LeadDeal | null = data.deals.find((d) => d.id === activeDealId) ?? null;

  // ── add name ────────────────────────────────────────────────────────────
  const [namePopoverOpen, setNamePopoverOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const saveName = async () => {
    if (!firstName.trim() && !lastName.trim()) return;
    setSavingName(true);
    const r = await setName(host, person.id, firstName.trim(), lastName.trim());
    setSavingName(false);
    if (!r || r.ok === false) {
      host.notify(errorText(r), 'warning');
      return;
    }
    setNamePopoverOpen(false);
    setFirstName('');
    setLastName('');
    onChanged();
  };

  // ── assign (unassigned banner) ─────────────────────────────────────────
  const [agents, setAgents] = useState<InboxAgentOption[]>([]);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [assigningBusy, setAssigningBusy] = useState(false);

  const loadAgentsOnce = () => {
    if (agentsLoaded) return;
    setAgentsLoaded(true);
    void listInboxAgents().then(setAgents);
  };

  const handleAssign = async (agentWorkspaceMemberId: string | null) => {
    if (!agentWorkspaceMemberId) return;
    setAssigningBusy(true);
    const r = await assignLead({ personId: person.id, agentWorkspaceMemberId });
    setAssigningBusy(false);
    if (!r || r.ok !== true) {
      host.notify(r?.operatorAction || r?.error || 'Could not assign this lead.', 'warning');
      return;
    }
    const who = agents.find((a) => a.id === agentWorkspaceMemberId)?.name ?? 'the agent';
    host.notify(`Assigned to ${who}.`, 'success');
    onChanged();
  };

  // ── call ────────────────────────────────────────────────────────────────
  const handleCall = () => {
    if (!person.phoneE164) {
      host.notify('There is no phone number on this lead.', 'warning');
      return;
    }
    const ok = startPropelCall({
      number: person.phoneE164,
      name: person.displayName,
      leadId: person.id,
      source: 'lead-page',
    });
    if (ok) onCallStarted();
    else host.notify('Could not place the call from here. Dial the number shown.', 'warning');
  };

  // ── move to another pipeline ────────────────────────────────────────────
  // Deliberately a Modal (not a Select embedded straight in the Menu.Dropdown):
  // Mantine's Menu closes on any outside click, and a Select's own dropdown is
  // portal-rendered, so nesting it live inside a Menu risks the menu snapping shut
  // before a destination can be picked. A Modal triggered by the Menu.Item sidesteps
  // that entirely and matches the "Mark lost" pattern right next to it.
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveDest, setMoveDest] = useState<string | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);

  const laneOptions = selectedDeal
    ? LANE_KEYS.filter((k) => k !== selectedDeal.laneKey).map((k) => ({ value: k, label: LANE_LABELS[k] ?? k }))
    : [];

  const confirmMove = async () => {
    if (!selectedDeal || !moveDest) return;
    setMoveBusy(true);
    const r = await movePipeline(host, selectedDeal.laneKey, moveDest, selectedDeal.id);
    setMoveBusy(false);
    const destLabel = LANE_LABELS[moveDest] ?? 'the new pipeline';
    const fromLabel = LANE_LABELS[selectedDeal.laneKey] ?? 'previous';
    if (!r || 'error' in r) {
      host.notify(movePipelineRefusedText(r), 'warning');
      return;
    }
    // move-opportunity-route.ts:56-63 answers `ok: true` even when nothing
    // actually moved: a per-record failure lands in `failed`, not in a
    // top-level `error`. Closing the modal on that would tell the agent the
    // move worked when it did not, so a zero-moved or a non-empty `failed` is
    // treated as a failure — and what actually happened to the record is told
    // in plain words (movePipelineFailureText), never by echoing `reason`.
    if (r.moved.length === 0 || r.failed.length > 0) {
      host.notify(movePipelineFailureText(r.failed[0]?.reason, fromLabel, destLabel), 'warning');
      return;
    }
    setMoveOpen(false);
    setMoveDest(null);
    onChanged();
  };

  // ── mark lost ────────────────────────────────────────────────────────────
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState<string | null>(null);
  const [lostBusy, setLostBusy] = useState(false);

  const confirmLost = async () => {
    if (!lostReason) return;
    setLostBusy(true);
    const r = await markLost(host, person.id, lostReason, selectedDeal?.id, selectedDeal?.lane);
    setLostBusy(false);
    if (!r || r.ok === false) {
      host.notify(errorText(r), 'warning');
      return;
    }
    setLostOpen(false);
    setLostReason(null);
    onChanged();
  };

  // ── pills ────────────────────────────────────────────────────────────────
  const replyMinutes = data.replySignal.minutes;
  const replyTone: 'good' | 'warn' | 'neutral' = replyMinutes != null ? 'good' : person.assignedAgentId ? 'warn' : 'neutral';
  const replyText = replyMinutes != null ? `Replied in ${replyMinutes} min` : person.assignedAgentId ? 'Not replied yet' : 'Unknown';
  const sourceChip = person.campaignName ?? person.sourceLabel;

  // ── meta line ────────────────────────────────────────────────────────────
  const metaSegments: ReactNode[] = [];
  if (person.phoneE164) {
    metaSegments.push(
      <PhoneTapText key="phone" onClick={handleCall} title="Tap to call">
        {person.phoneE164}
      </PhoneTapText>,
    );
  }
  if (person.city) metaSegments.push(<span key="city">{person.city}</span>);
  if (person.country) metaSegments.push(<span key="country">{person.country}</span>);
  metaSegments.push(<span key="time">{`${timeThere(person.country)} ${zoneWords(person.country)}`}</span>);
  const assignedRel = relativeWords(person.assignedAt);
  metaSegments.push(
    <span key="assigned">
      {`Assigned to ${person.assignedAgentName ?? 'nobody yet'}${assignedRel ? ` · ${assignedRel}` : ''}`}
    </span>,
  );

  // ── next / last touch ────────────────────────────────────────────────────
  const soonest = data.openTasks[0];
  const nextDue = soonest ? dueWords(soonest.dueAt) : null;
  const nextLineText = soonest ? `Next: ${soonest.title} · ${nextDue!.text}` : 'Next: nothing planned';
  // Never render lastTouch.by: it is a workspace member ID, not a name.
  const lastTouchRel = relativeWords(person.lastTouch.at);

  // ── rotation ─────────────────────────────────────────────────────────────
  // Replaces the nine identical breach rows and four first-response rows that used to
  // fill the timeline (see rotationWords). `null` renders NOTHING — not an empty
  // container, not reserved space — which is the common, healthy case.
  const rotation = rotationWords(data.rotation);

  const canAssign = data.viewer.role !== 'AGENT';

  return (
    <HeaderWrap>
      <TopRow>
        <IdentityCol>
          <IdentityRow>
            <AvatarCircle>{initials(person.displayName, person.hasName)}</AvatarCircle>
            <NameText>{person.displayName}</NameText>
            {!person.hasName && (
              <Popover opened={namePopoverOpen} onChange={setNamePopoverOpen} zIndex={5000} withinPortal position="bottom-start">
                <Popover.Target>
                  <Btn variant="ghost" onClick={() => setNamePopoverOpen((o) => !o)} style={{ minHeight: 44 }}>
                    Add name
                  </Btn>
                </Popover.Target>
                <Popover.Dropdown>
                  <PulsePortalScope>
                    <ModalFieldStack style={{ width: 220 }}>
                      <TextInput label="First name" value={firstName} onChange={(e) => setFirstName(e.currentTarget.value)} />
                      <TextInput label="Last name" value={lastName} onChange={(e) => setLastName(e.currentTarget.value)} />
                      <Btn
                        variant="primary"
                        disabled={savingName || (!firstName.trim() && !lastName.trim())}
                        onClick={() => void saveName()}
                        style={{ justifyContent: 'center', minHeight: 44 }}
                      >
                        Save
                      </Btn>
                    </ModalFieldStack>
                  </PulsePortalScope>
                </Popover.Dropdown>
              </Popover>
            )}
          </IdentityRow>

          <PillsRow>
            {selectedDeal?.stage && <Pill $tone="accent">{stageWords(selectedDeal.stage)}</Pill>}
            <Pill $tone="neutral">{data.wa.lineLabel}</Pill>
            {sourceChip && <Pill $tone="neutral">{sourceChip}</Pill>}
            <Pill $tone={replyTone}>{replyText}</Pill>
          </PillsRow>

          <MetaLine>
            {metaSegments.map((seg, i) => (
              <span key={i} style={{ display: 'contents' }}>
                {i > 0 && <MetaDot aria-hidden>·</MetaDot>}
                {seg}
              </span>
            ))}
          </MetaLine>
        </IdentityCol>

        {!phone && (
          <ActionsRow>
            <Btn id="lead-page-call" variant="secondary" disabled={!person.phoneE164} onClick={handleCall}>
              Call
            </Btn>
            <Btn variant="secondary" onClick={onFocusComposer}>
              WhatsApp
            </Btn>
            <Btn variant="primary" onClick={onLogOutcome}>
              Log outcome
            </Btn>
            <Menu zIndex={5000} withinPortal position="bottom-end">
              <Menu.Target>
                <Btn variant="ghost">More</Btn>
              </Menu.Target>
              <Menu.Dropdown>
                <PulsePortalScope>
                  {selectedDeal && <Menu.Item onClick={() => setMoveOpen(true)}>Move to another pipeline</Menu.Item>}
                  <Menu.Item onClick={() => setLostOpen(true)}>Mark lost / do not contact</Menu.Item>
                  <Menu.Item onClick={() => host.navigate(`/object/person/${person.id}`)}>Open the full record</Menu.Item>
                </PulsePortalScope>
              </Menu.Dropdown>
            </Menu>
          </ActionsRow>
        )}
      </TopRow>

      {phone && (
        <Btn
          id="lead-page-call"
          variant="secondary"
          disabled={!person.phoneE164}
          onClick={handleCall}
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
        >
          Call
        </Btn>
      )}

      {person.isLost && <Banner $tone="bad">Lost / do not contact</Banner>}
      {person.snoozedUntil && (
        <Banner $tone="warn">{`Snoozed until ${new Date(person.snoozedUntil).toLocaleString('en-GB')}`}</Banner>
      )}
      {!person.assignedAgentId && (
        <Banner $tone="warn">
          <span>Unassigned</span>
          {canAssign && (
            <Select
              placeholder="Assign to…"
              data={agents.map((a) => ({ value: a.id, label: a.available ? a.name : `${a.name} (away)` }))}
              value={null}
              onChange={(v) => void handleAssign(v)}
              onDropdownOpen={loadAgentsOnce}
              disabled={assigningBusy}
              comboboxProps={{ zIndex: 5000 }}
              style={{ minWidth: 200 }}
              nothingFoundMessage={agentsLoaded ? 'Could not load the agent list.' : null}
              searchable
            />
          )}
        </Banner>
      )}

      {/*
        One line, and it picks its stack by severity rather than shouting in both cases.
        A lead nobody has answered is a state that blocks work, so it joins the banners
        directly above it — Lost, Snoozed, Unassigned — which is where the eye already
        goes for lead state, and it is the whole reason this line exists. A lead that
        bounced but HAS been worked is only context, so it joins the quiet lines below
        it beside "Next" and "Last touch". Both are components this header already
        owns; the severity is carried by which company the line keeps, not by a new
        style. It never repeats and never scrolls, which is the entire point.
      */}
      {rotation &&
        (rotation.urgent ? <Banner $tone="warn">{rotation.text}</Banner> : <NextLine>{rotation.text}</NextLine>)}

      <NextLine style={nextDue?.overdue ? { color: 'var(--p-warn)' } : undefined}>{nextLineText}</NextLine>
      {lastTouchRel && <NextLine>{`Last touch: ${lastTouchRel}`}</NextLine>}

      <Modal opened={moveOpen} onClose={() => setMoveOpen(false)} title="Move to another pipeline" zIndex={5000} centered>
        <PulsePortalScope>
          <ModalFieldStack>
            <Select
              label="Move to"
              placeholder="Pick a pipeline"
              data={laneOptions}
              value={moveDest}
              onChange={setMoveDest}
              comboboxProps={{ zIndex: 5000 }}
            />
            <ModalActions>
              <Btn variant="secondary" onClick={() => setMoveOpen(false)}>
                Cancel
              </Btn>
              <Btn variant="primary" disabled={!moveDest || moveBusy} onClick={() => void confirmMove()}>
                Move
              </Btn>
            </ModalActions>
          </ModalFieldStack>
        </PulsePortalScope>
      </Modal>

      <Modal opened={lostOpen} onClose={() => setLostOpen(false)} title="Mark lost / do not contact" zIndex={5000} centered>
        <PulsePortalScope>
          <ModalFieldStack>
            <Select
              label="Reason"
              placeholder="Pick a reason"
              data={LOST_REASONS}
              value={lostReason}
              onChange={setLostReason}
              comboboxProps={{ zIndex: 5000 }}
            />
            <ModalActions>
              <Btn variant="secondary" onClick={() => setLostOpen(false)}>
                Cancel
              </Btn>
              <Btn
                variant="secondary"
                disabled={!lostReason || lostBusy}
                onClick={() => void confirmLost()}
                style={{ background: 'var(--p-bad)', color: '#fff', borderColor: 'var(--p-bad)' }}
              >
                Mark lost
              </Btn>
            </ModalActions>
          </ModalFieldStack>
        </PulsePortalScope>
      </Modal>
    </HeaderWrap>
  );
};
