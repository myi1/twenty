// FactsRail.tsx: the left rail: the deal (stage + off-plan picks), the ad-form
// answers, the five-question lead picture, open follow-ups, and contact details.
// Every write follows the same shape: call the route, toast a plain-words helper
// through host.notify(..., 'warning') on failure (leaving the agent's input
// untouched so they can retry without retyping), call onChanged() on success.
// Most writes are person-scoped and use leadApi.ts's errorText; the three that
// are not use their own helper instead, because errorText's wording would be
// wrong for them: moveStage (moveStageErrorText, a stage-gate refusal), the two
// setDealField calls (dealFieldErrorText, a deal-ownership refusal), and
// createDeal (createDealErrorText, an envelope that can carry a raw message).

import { useState } from 'react';
import { Checkbox, Collapse, NumberInput, Popover, SegmentedControl, Select, Textarea, TextInput } from '@mantine/core';
import styled from '@emotion/styled';
import type { PropelHeroHost } from '@/propel/runtime/heroHost';
import { Btn, NOCTURNE_LIGHT_VARS, PulseScope } from '../_pulse/pulse';
import { Group, GroupTitle, Pill, Rail, Row } from './styles';
import {
  completeTask,
  createDeal,
  createFollowUp,
  errorText,
  moveStage,
  moveStageErrorText,
  savePicture,
  setContactField,
  setDealField,
  setLeadPick,
} from './leadApi';
import {
  BUYING_TIMELINE_WORDS,
  MONEY_COMFORT_WORDS,
  OFFPLAN_STAGES,
  PURPOSE_WORDS,
  UNIT_TYPE_WORDS,
  customTimeInZone,
  dueWords,
  stageWords,
  timeThere,
  zoneFor,
  zoneWords,
} from './words';
import type { LeadDeal, LeadErr, LeadLoad } from './types';

const UNIT_TYPE_OPTIONS = Object.entries(UNIT_TYPE_WORDS).map(([value, label]) => ({ value, label }));
const PURPOSE_OPTIONS = Object.entries(PURPOSE_WORDS).map(([value, label]) => ({ value, label }));
const BUYING_TIMELINE_OPTIONS = Object.entries(BUYING_TIMELINE_WORDS).map(([value, label]) => ({ value, label }));
const MONEY_COMFORT_OPTIONS = Object.entries(MONEY_COMFORT_WORDS).map(([value, label]) => ({ value, label }));
const LANGUAGE_OPTIONS = ['English', 'Arabic', 'Hindi', 'Urdu', 'Russian', 'French', 'Farsi', 'Other'];

// The four lanes an agent can START from this page. Institutional deals are not
// originated here (mirrors the CRM's own My Desk "new deal" surface).
const CREATE_LANES: Array<{ key: 'offplan' | 'secondary' | 'sell' | 'rcbi'; label: string }> = [
  { key: 'offplan', label: 'Off-plan' },
  { key: 'secondary', label: 'Buyer' },
  { key: 'sell', label: 'Seller' },
  { key: 'rcbi', label: 'RCBI' },
];

const KIND_OPTIONS = [
  { label: 'Call', value: 'CALL' },
  { label: 'WhatsApp', value: 'WHATSAPP' },
  { label: 'Other', value: 'FOLLOW_UP' },
];
const WHEN_OPTIONS = [
  { label: 'In 1 hour', value: 'IN_1H' },
  { label: 'Tomorrow 10:00', value: 'TOMORROW_10' },
  { label: 'Pick a time', value: 'CUSTOM' },
];

// "Tomorrow at 10:00, the lead's local wall-clock time" without a timezone library:
// read what `now` displays as in `zone`, measure the gap to the real UTC instant,
// then apply that same gap to a wall-clock 10:00 built the next calendar day. Good
// enough for a reminder (not a legal deadline) and correct across the DST edge too,
// since the offset is read fresh at call time.
const tomorrowTenAmIn = (zone: string): string => {
  const now = new Date();
  const inZoneNow = new Date(now.toLocaleString('en-US', { timeZone: zone }));
  const offsetMs = now.getTime() - inZoneNow.getTime();
  const tomorrow = new Date(inZoneNow);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  return new Date(tomorrow.getTime() + offsetMs).toISOString();
};

const TaskRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 44px;
`;

const FieldStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const MutedNote = styled.div`
  font-size: 13px;
  color: var(--p-ink-2);
`;

// Mantine's Popover defaults to withinPortal, mounting its Dropdown straight into
// document.body, outside LeadNocturne's `--p-*` token declarations (pulse.tsx).
// Every var(--p-...) inside would otherwise resolve to nothing: the "All stages"
// list's primary/ghost Btns and AddFollowUp's datetime input both rely on the
// ledger. PulseScope re-declares it; display:contents keeps the wrapper invisible
// to layout. The light-mode selector mirrors LeadNocturne's own (styles.ts),
// duplicated here (and in OutcomeSheet.tsx / LeadHeader.tsx) because styles.ts is
// outside this fix's file scope.
const PulsePortalScope = styled(PulseScope)`
  display: contents;
  html[data-mantine-color-scheme='light'] & {
    ${NOCTURNE_LIGHT_VARS}
  }
`;

// ── the stage stepper (off-plan: prev / current / next + "+N more"; other
// lanes: the current stage word only, per the brief) ─────────────────────────
const StageStepper = ({ host, deal, onChanged }: { host: PropelHeroHost; deal: LeadDeal; onChanged: () => void }) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [moveBusy, setMoveBusy] = useState(false);
  const isOffplan = deal.lane === 'offPlanOpportunity';
  const idx = isOffplan && deal.stage ? OFFPLAN_STAGES.indexOf(deal.stage) : -1;

  const moveTo = async (stage: string) => {
    if (moveBusy) return;
    setPopoverOpen(false);
    setMoveBusy(true);
    const r = await moveStage(host, deal.deskLane, deal.id, stage);
    setMoveBusy(false);
    if (!r || r.ok === false) {
      // A refusal here is routinely GATE_BLOCKED (a stage task not yet done, an
      // RCBI compliance check not cleared): moveStageErrorText names the reason
      // (gate.label) and the remedy (gate.fix) instead of the raw code.
      // 'warning', not the 'info' OutcomeSheet.tsx uses for the same text: the
      // agent pressed a stage button here, so the action they asked for failed;
      // there, the save landed and only the suggested follow-on move was refused.
      host.notify(moveStageErrorText(r), 'warning');
      return;
    }
    onChanged();
  };

  if (!isOffplan || idx === -1) {
    return <Pill $tone="accent">{deal.stage ? stageWords(deal.stage) : 'No stage set'}</Pill>;
  }

  const prev = idx > 0 ? OFFPLAN_STAGES[idx - 1]! : null;
  const next = idx < OFFPLAN_STAGES.length - 1 ? OFFPLAN_STAGES[idx + 1]! : null;
  const shownCount = [prev, OFFPLAN_STAGES[idx], next].filter(Boolean).length;
  const moreCount = OFFPLAN_STAGES.length - shownCount;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {prev && (
        <Btn variant="ghost" disabled={moveBusy} onClick={() => void moveTo(prev)} style={{ minHeight: 44 }}>
          {stageWords(prev)}
        </Btn>
      )}
      <Pill $tone="accent">{stageWords(deal.stage!)}</Pill>
      {next && (
        <Btn variant="secondary" disabled={moveBusy} onClick={() => void moveTo(next)} style={{ minHeight: 44 }}>
          {stageWords(next)}
        </Btn>
      )}
      {moreCount > 0 && (
        <Popover zIndex={5000} withinPortal opened={popoverOpen} onChange={setPopoverOpen} position="bottom-start">
          <Popover.Target>
            <Btn variant="ghost" onClick={() => setPopoverOpen((o) => !o)} style={{ minHeight: 44 }}>
              All stages
            </Btn>
          </Popover.Target>
          <Popover.Dropdown>
            <PulsePortalScope>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 170 }}>
                {OFFPLAN_STAGES.map((s) => (
                  <Btn
                    key={s}
                    variant={s === deal.stage ? 'primary' : 'ghost'}
                    disabled={s === deal.stage || moveBusy}
                    onClick={() => void moveTo(s)}
                    style={{ justifyContent: 'flex-start', minHeight: 44 }}
                  >
                    {stageWords(s)}
                  </Btn>
                ))}
              </div>
            </PulsePortalScope>
          </Popover.Dropdown>
        </Popover>
      )}
    </div>
  );
};

// ── deal-scoped "more details" (price / payment plan / handover) ────────────
// Rendered keyed by deal.id from the parent so switching the active deal (via the
// chip row) remounts these uncontrolled fields fresh; otherwise a stale buffered
// value from the PREVIOUS deal would stay on screen after switching.
// purchasePrice is a CURRENCY field: the route answers it as
// `{ amountMicros, currencyCode }`, never a bare number. This reads the AED
// amount back out of that shape (currencyCode is always AED here, see
// validateDealFieldValue in lead-page-core.ts); the write side already sends a
// plain AED number, which that same validator turns into micros server-side, so
// only the read direction needed that unwrap.
//
// amountMicros is COERCED rather than type-checked. This is HARDENING, not a bug
// fix: it reaches the client as a NUMBER, and the plain `typeof === 'number'`
// read this replaced did work. Two server layers coerce it, and both were read
// rather than assumed: the ORM's formatCompositeFieldValue
// (twenty-server/src/engine/twenty-orm/utils/format-result.util.ts) parseInt()s a
// non-empty DB string, and the BigFloat scalar
// (.../graphql-types/scalars/big-float.scalar.ts) serialises with parseFloat().
// Sibling modules that say otherwise are NOT evidence, and it is worth knowing
// why: lane-move.ts's `amountMicros: string | null` is a hand-written mirror,
// its Number(...) is a defensive coercion (written BECAUSE the author was
// unsure), and lane-move.test.ts's string fixtures are authored, never captured
// from the wire. Five files agreeing can all be downstream of one guess.
// Coercing is kept because it is correct under BOTH shapes, so it cannot break
// if the scalar ever changes.
// Number('') is 0, not NaN, so an empty string is rejected up front alongside
// null and an absent field: an unset price must read as "nothing recorded",
// never as a price of AED 0.
const purchasePriceAed = (deal: LeadDeal): number | null => {
  const money = deal.fields.purchasePrice as { amountMicros?: unknown } | null | undefined;
  const raw = money?.amountMicros;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n / 1_000_000 : null;
};

// setDealField refuses when the DEAL (not the lead) belongs to another agent: an
// off-plan opportunity can be reassigned independently of the person it is linked
// to. errorText's lead-scoped sentences are correct for the person-scoped actions
// elsewhere on this page but would tell the agent something untrue here, so this
// call site gets its own accurate wording instead of changing errorText.
//
// Both refusal codes need covering, and NOT_VISIBLE is the one that actually
// fires: the route reads the deal with the caller's own credentials, so row-level
// security refuses it in the database and the route's FORBIDDEN owner check on
// the next line never runs (see types.ts). NOT_VISIBLE cannot distinguish "not
// yours" from "deleted", so it says both — and the remedy is deliberately NOT the
// lead-scoped one. The page around this chip loaded fine, so the agent is not
// stranded and has no reason to leave for My Desk; what they have is one stale or
// foreign deal chip, and the commonest cause by far is a deal deleted or handed to
// someone else while this page sat open. Refreshing redraws the chips from what
// they can actually see. That is not the retry errorText's fallback invites: it
// does not re-send the write that was refused.
//
// NOT_AUTHENTICATED deliberately gets NO sentence here and falls through to
// errorText. A lapsed session is not deal-scoped — it is not about this chip, this
// deal or this page, and there is no truer thing to say about it from inside a
// deal field than 'You need to sign in again.' The two overrides above exist only
// because errorText's LEAD-scoped wording would state something untrue about a
// DEAL; that reason does not apply to a session, and inventing a third sentence
// for one condition is how a codebase ends up saying the same thing three ways.
const dealFieldErrorText = (r: LeadErr | null): string => {
  if (r?.error === 'FORBIDDEN') return 'This deal is not assigned to you.';
  if (r?.error === 'NOT_VISIBLE') return 'This deal is no longer there, or it is not assigned to you. Refresh the page, or ask a manager.';
  return errorText(r);
};

const DealMoreFields = ({ host, deal, onChanged }: { host: PropelHeroHost; deal: LeadDeal; onChanged: () => void }) => {
  const [open, setOpen] = useState(false);
  const priceDefault = purchasePriceAed(deal) ?? undefined;
  const paymentPlanDefault = typeof deal.fields.paymentPlan === 'string' ? deal.fields.paymentPlan : '';
  const handoverDefault = typeof deal.fields.handoverDate === 'string' ? deal.fields.handoverDate.slice(0, 10) : '';

  const save = async (field: string, value: unknown) => {
    const r = await setDealField(host, deal.id, deal.lane, field, value);
    if (!r || r.ok === false) {
      host.notify(dealFieldErrorText(r), 'warning');
      return;
    }
    onChanged();
  };

  return (
    <div>
      <Btn variant="ghost" onClick={() => setOpen((o) => !o)} style={{ alignSelf: 'flex-start', minHeight: 44 }}>
        {open ? 'Hide details' : 'More details'}
      </Btn>
      <Collapse in={open}>
        <FieldStack style={{ paddingTop: 8 }}>
          <NumberInput
            label="Price (AED)"
            thousandSeparator=","
            allowNegative={false}
            allowDecimal={false}
            defaultValue={priceDefault}
            onBlur={(e) => {
              const raw = e.currentTarget.value.replace(/[^0-9.-]/g, '');
              const next = raw === '' ? null : Number(raw);
              const current = purchasePriceAed(deal);
              if (next !== current) void save('purchasePrice', next);
            }}
          />
          <TextInput
            label="Payment plan"
            defaultValue={paymentPlanDefault}
            onBlur={(e) => {
              const next = e.currentTarget.value;
              const current = typeof deal.fields.paymentPlan === 'string' ? deal.fields.paymentPlan : '';
              if (next !== current) void save('paymentPlan', next);
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--p-ink-2)' }}>Handover</span>
            <input
              type="date"
              defaultValue={handoverDefault}
              onChange={(e) => void save('handoverDate', e.currentTarget.value || null)}
              style={{
                minHeight: 44,
                borderRadius: 8,
                border: '1px solid var(--p-line)',
                background: 'var(--p-surface)',
                color: 'var(--p-ink)',
                padding: '0 10px',
              }}
            />
          </div>
        </FieldStack>
      </Collapse>
    </div>
  );
};

// ── off-plan-only picks: unit type (deal field) + purpose / money comfort
// (person-level picks). The buying timeline used to sit in here too; it moved
// out to its own group (TimelinePick, below) because it is neither off-plan nor
// deal-scoped — the other three really are off-plan qualification questions. ──
const OffplanPicks = ({
  host,
  deal,
  personId,
  picks,
  onChanged,
}: {
  host: PropelHeroHost;
  deal: LeadDeal;
  personId: string;
  picks: LeadLoad['person']['picks'];
  onChanged: () => void;
}) => {
  const unitType = typeof deal.fields.unitType === 'string' ? deal.fields.unitType : null;

  const saveUnitType = async (value: string | null) => {
    const r = await setDealField(host, deal.id, deal.lane, 'unitType', value);
    if (!r || r.ok === false) {
      // setDealField is deal-scoped: a refusal here (NOT_VISIBLE in practice,
      // FORBIDDEN if RLS is ever off) is about who owns the DEAL, not the
      // lead, so it needs dealFieldErrorText, not errorText.
      host.notify(dealFieldErrorText(r), 'warning');
      return;
    }
    onChanged();
  };

  const savePick = async (field: 'purpose' | 'moneyComfort', value: string | null) => {
    const r = await setLeadPick(host, personId, field, value);
    if (!r || r.ok === false) {
      host.notify(errorText(r), 'warning');
      return;
    }
    onChanged();
  };

  return (
    <>
      <Row>
        <span>Unit type</span>
        <Select
          data={UNIT_TYPE_OPTIONS}
          value={unitType}
          onChange={(v) => void saveUnitType(v)}
          placeholder="Not set"
          clearable
          comboboxProps={{ zIndex: 5000 }}
          style={{ minWidth: 170 }}
        />
      </Row>
      <Row>
        <span>Purpose</span>
        <Select
          data={PURPOSE_OPTIONS}
          value={picks.purpose}
          onChange={(v) => void savePick('purpose', v)}
          placeholder="Not set"
          clearable
          comboboxProps={{ zIndex: 5000 }}
          style={{ minWidth: 170 }}
        />
      </Row>
      <Row>
        <span>Money comfort</span>
        <Select
          data={MONEY_COMFORT_OPTIONS}
          value={picks.moneyComfort}
          onChange={(v) => void savePick('moneyComfort', v)}
          placeholder="Not set"
          clearable
          comboboxProps={{ zIndex: 5000 }}
          style={{ minWidth: 170 }}
        />
      </Row>
      <DealMoreFields key={deal.id} host={host} deal={deal} onChanged={onChanged} />
    </>
  );
};

// ── the buying timeline: every lead, every lane, deal or no deal ─────────────
// Deliberately OUTSIDE OffplanPicks. It used to render in there, beside the
// off-plan qualification questions, which meant an agent could only correct it
// when the ACTIVE DEAL happened to be off-plan — and a lead straight off the
// Meta form has no deal at all, which is exactly the call on which an agent
// learns the real timing. Leads on secondary / sell / RCBI / institutional
// could not be corrected either. Nothing about the write was ever deal-shaped:
// setLeadPick posts a personId, and the route gates it with gatePerson and
// writes it with updatePerson (lead-page-route.ts, action `setLeadPick`) — no
// deal is read on either side. Nor is the value decoration: buying-timeline.ts
// turns it into the URGENCY of the WhatsApp alert the owner gets ("🔥 HOT …
// Call NOW" for READY_NOW, "🟠 Warm … within 10 min" for WITHIN_3_MONTHS), and
// on-lead-reassigned.ts reads it again when a lead changes hands, so a stale
// value misdirects a real alert. Same Row/label/Select shape as its former
// neighbours, on purpose: the rail should not show that it moved.
const TimelinePick = ({
  host,
  personId,
  value,
  onChanged,
}: {
  host: PropelHeroHost;
  personId: string;
  value: string | null;
  onChanged: () => void;
}) => {
  const savePick = async (next: string | null) => {
    const r = await setLeadPick(host, personId, 'buyingTimeline', next);
    if (!r || r.ok === false) {
      host.notify(errorText(r), 'warning');
      return;
    }
    onChanged();
  };

  return (
    <Row>
      <span>Buying timeline</span>
      <Select
        data={BUYING_TIMELINE_OPTIONS}
        value={value}
        onChange={(v) => void savePick(v)}
        placeholder="Not set"
        clearable
        comboboxProps={{ zIndex: 5000 }}
        style={{ minWidth: 170 }}
      />
    </Row>
  );
};

// ── "add a follow-up" popover ────────────────────────────────────────────────
const AddFollowUp = ({
  host,
  personId,
  country,
  onChanged,
}: {
  host: PropelHeroHost;
  personId: string;
  country: 'UK' | 'UAE' | null;
  onChanged: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<'CALL' | 'WHATSAPP' | 'FOLLOW_UP'>('FOLLOW_UP');
  const [when, setWhen] = useState<'IN_1H' | 'TOMORROW_10' | 'CUSTOM'>('IN_1H');
  const [customWhen, setCustomWhen] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setTitle('');
    setKind('FOLLOW_UP');
    setWhen('IN_1H');
    setCustomWhen('');
  };

  const save = async () => {
    if (!title.trim()) return;
    let dueIso: string;
    if (when === 'IN_1H') dueIso = new Date(Date.now() + 3_600_000).toISOString();
    else if (when === 'TOMORROW_10') dueIso = tomorrowTenAmIn(zoneFor(country));
    else {
      if (!customWhen) return;
      // customTimeInZone (words.ts) reads the typed digits as wall-clock
      // time in the LEAD's zone, not the agent's own browser zone. A bare
      // `new Date(customWhen).toISOString()` here (the previous bug) meant this
      // control and the outcome sheet's own "Pick a time" disagreed by up to
      // four hours for a Dubai-based agent booking a UK lead.
      dueIso = customTimeInZone(customWhen, zoneFor(country));
    }
    setBusy(true);
    const r = await createFollowUp(host, personId, kind, title.trim(), dueIso, zoneFor(country));
    setBusy(false);
    if (!r || r.ok === false) {
      host.notify(errorText(r), 'warning');
      return;
    }
    setOpen(false);
    reset();
    onChanged();
  };

  return (
    <Popover zIndex={5000} withinPortal opened={open} onChange={setOpen} position="bottom-start">
      <Popover.Target>
        <Btn variant="ghost" onClick={() => setOpen((o) => !o)} style={{ alignSelf: 'flex-start', minHeight: 44 }}>
          Add a follow-up
        </Btn>
      </Popover.Target>
      <Popover.Dropdown>
        <PulsePortalScope>
          <FieldStack style={{ width: 260 }}>
            <TextInput
              label="What"
              placeholder="e.g. Call back about the villa"
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
            />
            <SegmentedControl fullWidth data={KIND_OPTIONS} value={kind} onChange={(v) => setKind(v as typeof kind)} />
            <SegmentedControl fullWidth data={WHEN_OPTIONS} value={when} onChange={(v) => setWhen(v as typeof when)} />
            {when === 'CUSTOM' && (
              <>
                <input
                  type="datetime-local"
                  value={customWhen}
                  onChange={(e) => setCustomWhen(e.currentTarget.value)}
                  style={{
                    minHeight: 44,
                    borderRadius: 8,
                    border: '1px solid var(--p-line)',
                    background: 'var(--p-surface)',
                    color: 'var(--p-ink)',
                    padding: '0 10px',
                  }}
                />
                {/* Names the zone the typed digits are read in, same caption as
                    the outcome sheet's own "Pick a time": this page must never
                    let the two controls disagree silently. */}
                <span style={{ fontSize: 12, color: 'var(--p-ink-2)' }}>{zoneWords(country)}</span>
              </>
            )}
            <Btn
              variant="primary"
              disabled={busy || !title.trim() || (when === 'CUSTOM' && !customWhen)}
              onClick={() => void save()}
              style={{ justifyContent: 'center', minHeight: 44 }}
            >
              Save
            </Btn>
          </FieldStack>
        </PulsePortalScope>
      </Popover.Dropdown>
    </Popover>
  );
};

// Plain words for a failed deal creation. lead-create-opportunity-route.ts fails
// through an envelope (marketing-io.ts's `envelope`) whose `error` can carry a
// raw GraphQL message appended verbatim ("Couldn't create the opportunity:
// <whatever the mutation threw>"), which does not belong in front of an agent.
// Distinguishes a null transport failure (leadApi.ts's own wording for that
// case) from a real server-side refusal; never repeats `r.error` itself. In the
// spirit of errorText in leadApi.ts and StoryComposer.tsx's sendFailureText.
const createDealErrorText = (r: { error?: string } | null): string =>
  r
    ? 'Could not start that pipeline. Try again, and tell a manager if it keeps happening.'
    : 'The CRM did not answer. Check your connection and try again.';

export const FactsRail = ({
  host,
  data,
  activeDealId,
  onActiveDealChange,
  onChanged,
  phone,
}: {
  host: PropelHeroHost;
  data: LeadLoad;
  // Lifted to index.tsx (and shared with OutcomeSheet) so the deal a chip click
  // makes active here is the SAME deal an outcome logged from this page writes
  // to: a local, rail-only activeDealId let the sheet silently disagree with
  // whatever the agent had actually switched to. The healing effect that used
  // to live here (fires on the "no deal selected yet, but one now exists"
  // transition, and after /opportunities/move recreates a deal under a NEW id)
  // now lives alongside the lifted state in index.tsx.
  activeDealId: string | null;
  onActiveDealChange: (dealId: string) => void;
  onChanged: () => void;
  // Layout only. On desktop the rail is its own scroller; on phone it is one
  // tab of a page that scrolls as a whole, so it must not scroll internally.
  // Comes from index.tsx's usePhoneLayout — the page's single breakpoint —
  // rather than a second media query of the rail's own.
  phone: boolean;
}) => {
  const { person } = data;
  const [creatingDeal, setCreatingDeal] = useState(false);
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());

  const deal = data.deals.find((d) => d.id === activeDealId) ?? null;

  const handleCreateDeal = async (laneKey: 'offplan' | 'secondary' | 'sell' | 'rcbi') => {
    if (creatingDeal) return;
    setCreatingDeal(true);
    const r = await createDeal(host, laneKey, person.id, person.displayName);
    setCreatingDeal(false);
    if (!r || r.error) {
      host.notify(createDealErrorText(r), 'warning');
      return;
    }
    onChanged();
  };

  const handleComplete = async (taskId: string) => {
    if (completingIds.has(taskId)) return;
    setCompletingIds((s) => new Set(s).add(taskId));
    const r = await completeTask(host, taskId);
    if (!r || r.ok === false) {
      setCompletingIds((s) => {
        const next = new Set(s);
        next.delete(taskId);
        return next;
      });
      host.notify(errorText(r), 'warning');
      return;
    }
    onChanged();
  };

  const blurPicture = async (
    field: 'situation' | 'motivation' | 'want' | 'decision' | 'concern',
    value: string,
    original: string | null,
  ) => {
    if (value === (original ?? '')) return;
    const r = await savePicture(host, person.id, { [field]: value });
    if (!r || r.ok === false) {
      host.notify(errorText(r), 'warning');
      return;
    }
    onChanged();
  };

  const blurEmail = async (value: string) => {
    if (value === (person.email ?? '')) return;
    const r = await setContactField(host, person.id, 'email', value);
    if (!r || r.ok === false) {
      host.notify(errorText(r), 'warning');
      return;
    }
    onChanged();
  };

  const changeLanguage = async (value: string | null) => {
    const r = await setContactField(host, person.id, 'preferredLanguage', value ?? '');
    if (!r || r.ok === false) {
      host.notify(errorText(r), 'warning');
      return;
    }
    onChanged();
  };

  return (
    <Rail $phone={phone}>
      <Group>
        <GroupTitle>THE DEAL</GroupTitle>
        {data.deals.length === 0 ? (
          <>
            <MutedNote>Start one when you know what they want.</MutedNote>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CREATE_LANES.map((l) => (
                <Btn
                  key={l.key}
                  variant="secondary"
                  disabled={creatingDeal}
                  onClick={() => void handleCreateDeal(l.key)}
                  style={{ minHeight: 44 }}
                >
                  {l.label}
                </Btn>
              ))}
            </div>
          </>
        ) : (
          <>
            {data.deals.length > 1 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {data.deals.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => onActiveDealChange(d.id)}
                    style={{
                      border: 0,
                      background: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      minHeight: 44,
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    <Pill $tone={d.id === activeDealId ? 'accent' : 'neutral'}>{d.name ?? d.laneLabel}</Pill>
                  </button>
                ))}
              </div>
            )}
            {deal && <StageStepper host={host} deal={deal} onChanged={onChanged} />}
            {deal?.lane === 'offPlanOpportunity' && (
              <OffplanPicks host={host} deal={deal} personId={person.id} picks={person.picks} onChanged={onChanged} />
            )}
          </>
        )}
      </Group>

      {/*
        Its own group, directly above FROM THE AD FORM, because the two belong in
        one glance: this row is the answer the CRM acts on, and the "Buying timeline
        (from the form)" row just below is where that answer came from. It is
        deliberately NOT inside THE DEAL — it is a person field, it is already
        answered before any deal exists, and every lane needs it. It shares its
        label with the CRM field ("Buying timeline") on purpose; the form row
        carries "(from the form)" and stays as it arrived, so the pair reads as
        answer-and-origin rather than as a duplicate. Clearing it is how the agent
        says "they did not tell me": there is no "Not captured" option, because that
        would be a second way to say nothing.
      */}
      <Group>
        <GroupTitle>HOW SOON THEY WILL BUY</GroupTitle>
        <MutedNote>
          The ad form fills this in. Correct it if the call says something different — it sets how urgently the owner is
          told to call.
        </MutedNote>
        <TimelinePick host={host} personId={person.id} value={person.picks.buyingTimeline} onChanged={onChanged} />
      </Group>

      <Group>
        <GroupTitle>FROM THE AD FORM</GroupTitle>
        {person.formAnswers.length === 0 ? (
          <MutedNote>No form answers were captured for this lead. Ask what made them look at Dubai.</MutedNote>
        ) : (
          <>
            {/*
              This group is the PROVENANCE, not a second copy of the deal fields
              above. It is what the lead themselves put on the ad, kept exactly as it
              arrived — including "Buying timeline (from the form)", which is the
              same question as the editable Buying timeline in the group directly
              above (shown for every lead, on every lane) and is meant to differ from
              it once an agent has corrected it on a call. Saying so in one line is
              what stops the pair reading as a bug. The value is never
              translated either: a bare `opt3` is Meta's option POSITION, not the
              lead's words, so it is left looking exactly as unresolved as it is.
            */}
            <MutedNote>
              Their own answers on the ad, kept as they arrived. Correcting something after a call never rewrites what
              they first said here.
            </MutedNote>
            {person.formAnswers.map((a, i) => (
              <Row key={i}>
                <span>{a.label}</span>
                <span style={{ textAlign: 'right' }}>{a.value}</span>
              </Row>
            ))}
          </>
        )}
      </Group>

      <Group>
        <GroupTitle>WHAT THE LEAD TOLD YOU</GroupTitle>
        <FieldStack>
          <Textarea
            autosize
            minRows={1}
            placeholder="Where are they based? Bought abroad before?"
            defaultValue={person.picture.situation ?? ''}
            onBlur={(e) => void blurPicture('situation', e.currentTarget.value, person.picture.situation)}
          />
          <Textarea
            autosize
            minRows={1}
            placeholder="Why Dubai, why now?"
            defaultValue={person.picture.motivation ?? ''}
            onBlur={(e) => void blurPicture('motivation', e.currentTarget.value, person.picture.motivation)}
          />
          <Textarea
            autosize
            minRows={1}
            placeholder="Studio or one-bed? To let or to live in? How did the numbers sit?"
            defaultValue={person.picture.want ?? ''}
            onBlur={(e) => void blurPicture('want', e.currentTarget.value, person.picture.want)}
          />
          <Textarea
            autosize
            minRows={1}
            placeholder="Deciding alone or with someone? By when?"
            defaultValue={person.picture.decision ?? ''}
            onBlur={(e) => void blurPicture('decision', e.currentTarget.value, person.picture.decision)}
          />
          <Textarea
            autosize
            minRows={1}
            placeholder="The one thing that would stop them"
            defaultValue={person.picture.concern ?? ''}
            onBlur={(e) => void blurPicture('concern', e.currentTarget.value, person.picture.concern)}
          />
        </FieldStack>
      </Group>

      <Group>
        <GroupTitle>FOLLOW-UPS</GroupTitle>
        {data.openTasks.length === 0 ? (
          <MutedNote>Nothing planned.</MutedNote>
        ) : (
          data.openTasks.map((t) => {
            const due = dueWords(t.dueAt);
            return (
              <TaskRow key={t.id}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, flex: 1, cursor: 'pointer' }}>
                  <Checkbox
                    checked={completingIds.has(t.id)}
                    disabled={completingIds.has(t.id)}
                    onChange={() => void handleComplete(t.id)}
                    aria-label={`Complete ${t.title}`}
                  />
                  <span style={{ flex: 1 }}>{t.title}</span>
                </label>
                <Pill $tone={due.overdue ? 'warn' : 'neutral'}>{due.text}</Pill>
              </TaskRow>
            );
          })
        )}
        <AddFollowUp host={host} personId={person.id} country={person.country} onChanged={onChanged} />
      </Group>

      <Group>
        <GroupTitle>CONTACT</GroupTitle>
        <FieldStack>
          <TextInput label="Email" defaultValue={person.email ?? ''} onBlur={(e) => void blurEmail(e.currentTarget.value)} />
          <Select
            label="Language"
            data={LANGUAGE_OPTIONS}
            value={person.preferredLanguage}
            onChange={(v) => void changeLanguage(v)}
            placeholder="Not set"
            clearable
            comboboxProps={{ zIndex: 5000 }}
          />
          <Row>
            <span>Time there</span>
            <span>{timeThere(person.country)}</span>
          </Row>
        </FieldStack>
      </Group>
    </Rail>
  );
};
