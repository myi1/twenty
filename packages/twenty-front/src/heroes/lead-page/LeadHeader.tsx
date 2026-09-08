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
import { Btn, FONT_DISPLAY, FONT_MONO } from '../_pulse/pulse';
import { Pill } from './styles';
import { errorText, markLost, movePipeline, setName } from './leadApi';
import { LOST_REASONS, STAGE_WORDS, dueWords, timeThere, zoneWords } from './words';
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

const initials = (name: string, hasName: boolean): string => {
  if (!hasName) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase();
};

// words.ts has no relative-time helper (assignedAt / lastTouch.at are the only
// callers), so it lives here rather than growing a shared file for one use.
const formatRelative = (iso: string | null): string | null => {
  if (!iso) return null;
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const abs = Math.abs(ms);
  const MIN = 60_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;
  if (abs < MIN) return 'just now';
  if (abs < HOUR) return `${Math.round(abs / MIN)} min ago`;
  if (abs < DAY) return `${Math.round(abs / HOUR)} h ago`;
  const days = Math.round(abs / DAY);
  return days === 1 ? '1 day ago' : `${days} days ago`;
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

export const LeadHeader = ({
  host,
  data,
  phone,
  onLogOutcome,
  onCallStarted,
  onChanged,
  onFocusComposer,
}: {
  host: PropelHeroHost;
  data: LeadLoad;
  phone: boolean;
  onLogOutcome: () => void;
  onCallStarted: () => void;
  onChanged: () => void;
  onFocusComposer: () => void;
}) => {
  const { person } = data;
  const selectedDeal: LeadDeal | null =
    data.deals.find((d) => d.id === data.selectedDealId) ?? data.deals[0] ?? null;

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
    onChanged();
  };

  // ── call ────────────────────────────────────────────────────────────────
  const handleCall = () => {
    if (!person.phoneE164) return;
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
    if (!r || r.error) {
      host.notify(r?.error ?? 'Could not move this pipeline. Try again.', 'warning');
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
  const assignedRel = formatRelative(person.assignedAt);
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
  const lastTouchRel = formatRelative(person.lastTouch.at);

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
                  <Btn variant="ghost" onClick={() => setNamePopoverOpen((o) => !o)}>
                    Add name
                  </Btn>
                </Popover.Target>
                <Popover.Dropdown>
                  <ModalFieldStack style={{ width: 220 }}>
                    <TextInput label="First name" value={firstName} onChange={(e) => setFirstName(e.currentTarget.value)} />
                    <TextInput label="Last name" value={lastName} onChange={(e) => setLastName(e.currentTarget.value)} />
                    <Btn
                      variant="primary"
                      disabled={savingName || (!firstName.trim() && !lastName.trim())}
                      onClick={() => void saveName()}
                      style={{ justifyContent: 'center' }}
                    >
                      Save
                    </Btn>
                  </ModalFieldStack>
                </Popover.Dropdown>
              </Popover>
            )}
          </IdentityRow>

          <PillsRow>
            {selectedDeal?.stage && <Pill $tone="accent">{STAGE_WORDS[selectedDeal.stage] ?? selectedDeal.stage}</Pill>}
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
                {selectedDeal && <Menu.Item onClick={() => setMoveOpen(true)}>Move to another pipeline</Menu.Item>}
                <Menu.Item onClick={() => setLostOpen(true)}>Mark lost / do not contact</Menu.Item>
                <Menu.Item onClick={() => host.navigate(`/object/person/${person.id}`)}>Open the full record</Menu.Item>
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
              searchable
            />
          )}
        </Banner>
      )}

      <NextLine style={nextDue?.overdue ? { color: 'var(--p-warn)' } : undefined}>{nextLineText}</NextLine>
      {person.lastTouch.at && <NextLine>{`Last touch: ${lastTouchRel}`}</NextLine>}

      <Modal opened={moveOpen} onClose={() => setMoveOpen(false)} title="Move to another pipeline" zIndex={5000} centered>
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
      </Modal>

      <Modal opened={lostOpen} onClose={() => setLostOpen(false)} title="Mark lost / do not contact" zIndex={5000} centered>
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
      </Modal>
    </HeaderWrap>
  );
};
