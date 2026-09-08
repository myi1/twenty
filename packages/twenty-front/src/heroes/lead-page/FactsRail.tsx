// FactsRail.tsx: the left rail: the deal (stage + off-plan picks), the ad-form
// answers, the five-question lead picture, open follow-ups, and contact details.
// Every write follows the same shape: call the route, toast errorText(...) through
// host.notify(..., 'warning') on failure (leaving the agent's input untouched so
// they can retry without retyping), call onChanged() on success.

import { useEffect, useState } from 'react';
import { Checkbox, Collapse, NumberInput, Popover, SegmentedControl, Select, Textarea, TextInput } from '@mantine/core';
import styled from '@emotion/styled';
import type { PropelHeroHost } from '@/propel/runtime/heroHost';
import { Btn } from '../_pulse/pulse';
import { Group, GroupTitle, Pill, Rail, Row } from './styles';
import {
  completeTask,
  createDeal,
  createFollowUp,
  errorText,
  moveStage,
  savePicture,
  setContactField,
  setDealField,
  setLeadPick,
} from './leadApi';
import {
  BUY_TIMELINE_WORDS,
  MONEY_COMFORT_WORDS,
  OFFPLAN_STAGES,
  PURPOSE_WORDS,
  UNIT_TYPE_WORDS,
  dueWords,
  stageWords,
  timeThere,
  zoneFor,
} from './words';
import type { LeadDeal, LeadLoad } from './types';

const UNIT_TYPE_OPTIONS = Object.entries(UNIT_TYPE_WORDS).map(([value, label]) => ({ value, label }));
const PURPOSE_OPTIONS = Object.entries(PURPOSE_WORDS).map(([value, label]) => ({ value, label }));
const BUY_TIMELINE_OPTIONS = Object.entries(BUY_TIMELINE_WORDS).map(([value, label]) => ({ value, label }));
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
      host.notify(r?.reason ?? r?.error ?? 'That stage is not open yet.', 'warning');
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
const DealMoreFields = ({ host, deal, onChanged }: { host: PropelHeroHost; deal: LeadDeal; onChanged: () => void }) => {
  const [open, setOpen] = useState(false);
  const priceDefault = typeof deal.fields.purchasePrice === 'number' ? deal.fields.purchasePrice : undefined;
  const paymentPlanDefault = typeof deal.fields.paymentPlan === 'string' ? deal.fields.paymentPlan : '';
  const handoverDefault = typeof deal.fields.handoverDate === 'string' ? deal.fields.handoverDate.slice(0, 10) : '';

  const save = async (field: string, value: unknown) => {
    const r = await setDealField(host, deal.id, deal.lane, field, value);
    if (!r || r.ok === false) {
      host.notify(errorText(r), 'warning');
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
              const current = typeof deal.fields.purchasePrice === 'number' ? deal.fields.purchasePrice : null;
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

// ── off-plan-only picks: unit type (deal field) + purpose / buy timeline /
// money comfort (person-level picks) ─────────────────────────────────────────
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
      host.notify(errorText(r), 'warning');
      return;
    }
    onChanged();
  };

  const savePick = async (field: 'purpose' | 'buyTimeline' | 'moneyComfort', value: string | null) => {
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
        <span>Looking to buy</span>
        <Select
          data={BUY_TIMELINE_OPTIONS}
          value={picks.buyTimeline}
          onChange={(v) => void savePick('buyTimeline', v)}
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
      dueIso = new Date(customWhen).toISOString();
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
      </Popover.Dropdown>
    </Popover>
  );
};

export const FactsRail = ({
  host,
  data,
  onChanged,
}: {
  host: PropelHeroHost;
  data: LeadLoad;
  onChanged: () => void;
}) => {
  const { person } = data;
  const [activeDealId, setActiveDealId] = useState<string | null>(
    () => data.selectedDealId ?? data.deals[0]?.id ?? null,
  );
  const [creatingDeal, setCreatingDeal] = useState(false);
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());

  // Fires on the "no deal selected yet, but one now exists" transition (e.g. just
  // created via "Start one…"), and also heals a stale activeDealId that no longer
  // matches anything: /opportunities/move recreates the deal in the destination
  // lane with a NEW id and soft-deletes the source, so after a move the id this
  // rail is holding points at nothing. Either case falls back the same way, and a
  // manual chip pick afterward is never fought because that pick IS a deal that
  // still exists.
  useEffect(() => {
    if (data.deals.length === 0) return;
    const stillExists = activeDealId !== null && data.deals.some((d) => d.id === activeDealId);
    if (activeDealId === null || !stillExists) {
      setActiveDealId(data.selectedDealId ?? data.deals[0]!.id);
    }
  }, [data.deals, data.selectedDealId, activeDealId]);

  const deal = data.deals.find((d) => d.id === activeDealId) ?? null;

  const handleCreateDeal = async (laneKey: 'offplan' | 'secondary' | 'sell' | 'rcbi') => {
    if (creatingDeal) return;
    setCreatingDeal(true);
    const r = await createDeal(host, laneKey, person.id, person.displayName);
    setCreatingDeal(false);
    if (!r || r.error) {
      host.notify(r?.error ?? 'Could not start that pipeline. Try again.', 'warning');
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
    <Rail>
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
                    onClick={() => setActiveDealId(d.id)}
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

      <Group>
        <GroupTitle>FROM THE AD FORM</GroupTitle>
        {person.formAnswers.length === 0 ? (
          <MutedNote>No form answers were captured for this lead. Ask what made them look at Dubai.</MutedNote>
        ) : (
          person.formAnswers.map((a, i) => (
            <Row key={i}>
              <span>{a.label}</span>
              <span style={{ textAlign: 'right' }}>{a.value}</span>
            </Row>
          ))
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
