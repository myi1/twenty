// OutcomeSheet.tsx: the post-call sheet an agent fills in after hanging up.
// Three fields, one save: outcome, next step, when. This is the screen the
// whole page exists to make fast, because a slow or confusing sheet here is
// exactly what makes agents skip logging the call and the pipeline goes stale.
//
// A few contracts worth stating plainly, since they are easy to get wrong:
//   - The route only ever SUGGESTS a stage. It never writes one. Applying the
//     suggestion goes through moveStage, My Desk's gated action, which can
//     legitimately refuse. On a refusal we show its own `reason`/`error`
//     text verbatim, never invented wording.
//   - clientRequestId is generated once per OPEN of the sheet, not per save
//     attempt, so a double tap on Save (or a retried request) is idempotent.
//     A DUPLICATE_REQUEST response means the first save already worked.
//   - The response's `partial` array means the save partly succeeded; the
//     agent is told which part did not land rather than shown a bare "Saved".
//   - No response-clock / SLA language anywhere. The founder removed the
//     enforced deadline and automatic reassignment on purpose (see words.ts
//     and LeadHeader.tsx). The hints below describe what happens next, never
//     whether the agent was fast enough.

import { useEffect, useState } from 'react';
import { Drawer, Radio, SegmentedControl, Textarea } from '@mantine/core';
import type { PropelHeroHost } from '@/propel/runtime/heroHost';
import { Btn, FONT_UI } from '../_pulse/pulse';
import { draftCallNote, errorText, moveStage, saveOutcome } from './leadApi';
import { OUTCOME_WORDS, dueWords, minutesWords, stageWords, zoneFor, zoneWords } from './words';
import type { LeadDeal, LeadLoad, SaveOutcomeInput } from './types';

type Outcome = SaveOutcomeInput['outcome'];
type NextStep = SaveOutcomeInput['nextStep'];
type When = 'IN_1H' | 'TOMORROW_10' | 'CUSTOM';

const NEXT_STEP_OPTIONS: Array<{ label: string; value: NextStep }> = [
  { label: 'Send files', value: 'SEND_FILES' },
  { label: 'Call back', value: 'CALL_BACK' },
  { label: 'Book a call', value: 'BOOK_CALL' },
  { label: 'Nothing yet', value: 'NOTHING' },
];

const WHEN_OPTIONS: Array<{ label: string; value: When }> = [
  { label: 'In 1 hour', value: 'IN_1H' },
  { label: 'Tomorrow 10:00', value: 'TOMORROW_10' },
  { label: 'Pick a time', value: 'CUSTOM' },
];

// A recent automated "Sent:" WhatsApp event (a files/info card, say) means the
// natural next step is to follow up by phone rather than send more; anything
// else defaults to sending files, since that is usually what a call surfaces.
const SENT_WITHIN_MS = 2 * 60 * 60_000;
const recentlySentWhatsApp = (data: LeadLoad): boolean => {
  const now = Date.now();
  return data.timeline.events.some((e) => {
    if (e.type !== 'WHATSAPP' || !e.title.startsWith('Sent:')) return false;
    const at = Date.parse(e.occurredAt);
    return Number.isFinite(at) && now - at <= SENT_WITHIN_MS;
  });
};

export const OutcomeSheet = ({
  host,
  data,
  open,
  callSeconds,
  phone,
  onClose,
  onSaved,
}: {
  host: PropelHeroHost;
  data: LeadLoad;
  open: boolean;
  callSeconds: number | null;
  phone: boolean;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const { person } = data;
  const selectedDeal: LeadDeal | null = data.deals.find((d) => d.id === data.selectedDealId) ?? data.deals[0] ?? null;

  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [nextStep, setNextStep] = useState<NextStep>('SEND_FILES');
  const [when, setWhen] = useState<When>('TOMORROW_10');
  const [custom, setCustom] = useState('');
  const [line, setLine] = useState('');
  const [saving, setSaving] = useState(false);
  const [clientRequestId, setClientRequestId] = useState('');

  // Resets every time the sheet OPENS, not on every re-render while it stays
  // open. clientRequestId in particular must survive a failed save attempt
  // unchanged, since it is what makes a retry (or a duplicate response)
  // idempotent rather than a second write.
  useEffect(() => {
    if (!open) return;
    setOutcome(null);
    setNextStep(recentlySentWhatsApp(data) ? 'CALL_BACK' : 'SEND_FILES');
    setWhen('TOMORROW_10');
    setCustom('');
    setLine('');
    setSaving(false);
    setClientRequestId(crypto.randomUUID());

    void draftCallNote(host, person.id).then((r) => {
      if (r && r.ok) {
        // Functional update: never clobber text the agent has already typed
        // while this draft request was still in flight.
        setLine((current) => (current === '' ? r.draft : current));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset is keyed on `open` only, by design
  }, [open]);

  const save = async () => {
    if (!outcome || saving) return;
    setSaving(true);
    const r = await saveOutcome(host, {
      personId: person.id,
      dealId: selectedDeal?.id,
      outcome,
      nextStep,
      when: when === 'CUSTOM' ? new Date(custom).toISOString() : when,
      zone: zoneFor(person.country),
      line,
      clientRequestId,
    });
    if (!r || r.ok === false) {
      if (r && r.ok === false && r.error === 'DUPLICATE_REQUEST') {
        // The first attempt already went through; this is not a failure.
        setSaving(false);
        onSaved();
        return;
      }
      host.notify(errorText(r), 'warning');
      setSaving(false);
      return;
    }
    setSaving(false);
    if (r.partial.length) host.notify(`Saved, except: ${r.partial.join(', ')}.`, 'warning');
    else host.notify('Saved.', 'success');
    if (r.suggestedStage && selectedDeal) {
      const mv = await moveStage(host, selectedDeal.deskLane, selectedDeal.id, r.suggestedStage);
      if (mv?.ok) host.notify(`Moved to ${stageWords(r.suggestedStage)}.`, 'info');
      else if (mv?.reason || mv?.error) host.notify(mv.reason ?? mv.error ?? 'The stage did not move.', 'info');
    }
    onSaved();
  };

  const plannedLine =
    data.openTasks.length > 0
      ? `Already planned: ${data.openTasks.map((t) => `${t.title} ${dueWords(t.dueAt).text}`).join(', ')}`
      : null;

  return (
    <Drawer
      opened={open}
      onClose={onClose}
      position={phone ? 'bottom' : 'right'}
      size={phone ? '85%' : 420}
      zIndex={5000}
      radius={phone ? 20 : 0}
      title={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 16, color: 'var(--p-ink)' }}>How did the call go?</div>
          <div style={{ fontFamily: FONT_UI, fontSize: 13, color: 'var(--p-ink-2)' }}>
            {`${person.displayName}${callSeconds != null ? ` · ${minutesWords(callSeconds)} call` : ''} · just now`}
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 8 }}>
        <Radio.Group value={outcome} onChange={(v) => setOutcome(v as Outcome)} label="Outcome">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
            {(Object.keys(OUTCOME_WORDS) as Outcome[]).map((k) => (
              <Radio
                key={k}
                value={k}
                label={OUTCOME_WORDS[k]!.label}
                description={<span style={{ fontSize: 12, color: 'var(--p-ink-2)' }}>{OUTCOME_WORDS[k]!.hint}</span>}
                styles={{ body: { alignItems: 'flex-start', minHeight: 44 }, radio: { cursor: 'pointer' }, label: { cursor: 'pointer' } }}
              />
            ))}
          </div>
        </Radio.Group>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--p-ink)' }}>Next step</span>
          <SegmentedControl
            fullWidth
            value={nextStep}
            onChange={(v) => setNextStep(v as NextStep)}
            data={NEXT_STEP_OPTIONS}
            styles={{ label: { minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 } }}
          />
        </div>

        {nextStep !== 'NOTHING' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--p-ink)' }}>When</span>
            <SegmentedControl
              fullWidth
              value={when}
              onChange={(v) => setWhen(v as When)}
              data={WHEN_OPTIONS}
              styles={{ label: { minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 } }}
            />
            {when === 'CUSTOM' && (
              <input
                type="datetime-local"
                value={custom}
                onChange={(e) => setCustom(e.currentTarget.value)}
                style={{
                  minHeight: 44,
                  borderRadius: 8,
                  border: '1px solid var(--p-line)',
                  background: 'var(--p-surface)',
                  color: 'var(--p-ink)',
                  padding: '0 10px',
                  fontFamily: FONT_UI,
                  fontSize: 13,
                }}
              />
            )}
            <span style={{ fontSize: 12, color: 'var(--p-ink-2)' }}>{zoneWords(person.country)}</span>
            {plannedLine && <span style={{ fontSize: 12, color: 'var(--p-ink-2)' }}>{plannedLine}</span>}
          </div>
        )}

        <Textarea
          label="One line, in their words · optional"
          autosize
          minRows={2}
          value={line}
          onChange={(e) => setLine(e.currentTarget.value)}
          placeholder="What did they say, in their own words"
        />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={onClose} style={{ minHeight: 44 }}>
            Not now
          </Btn>
          <Btn variant="primary" disabled={!outcome || saving} onClick={() => void save()} style={{ minHeight: 44, justifyContent: 'center' }}>
            {saving ? 'Saving…' : 'Save'}
          </Btn>
        </div>
      </div>
    </Drawer>
  );
};
