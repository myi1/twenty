// OutcomeSheet.tsx: the post-call sheet an agent fills in after hanging up.
// Three fields, one save: outcome, next step, when. This is the screen the
// whole page exists to make fast, because a slow or confusing sheet here is
// exactly what makes agents skip logging the call and the pipeline goes stale.
//
// A few contracts worth stating plainly, since they are easy to get wrong:
//   - The route only ever SUGGESTS a stage. It never writes one. Applying the
//     suggestion goes through moveStage, My Desk's gated action, which can
//     legitimately refuse. On a refusal we show its own `reason`/`error`
//     text verbatim, never invented wording. ANY non-success (a refusal, a
//     null transport failure, a bare `{ok:false}` with nothing else) always
//     tells the agent something, never silence.
//   - A stage suggestion is never acted on for a terminal outcome (Not
//     interested / Wrong number / Converted), even if one arrives. The route's
//     nextStageOnOutcome is the PRIMARY guard for this; the check below is the
//     second, so a route regression can never move a lost or already-won deal.
//   - clientRequestId is generated once per OPEN of the sheet, not per save
//     attempt, so a double tap on Save (or a retried request) is idempotent.
//     A DUPLICATE_REQUEST response means the first save already worked, and is
//     told to the agent as a (quiet) success, not swallowed in silence.
//   - The response's `partial` array means the save partly succeeded; the
//     agent is told which part did not land, in plain words, never the raw
//     route field code.
//   - No response-clock / SLA language anywhere. The founder removed the
//     enforced deadline and automatic reassignment on purpose (see words.ts
//     and LeadHeader.tsx). The hints below describe what happens next, never
//     whether the agent was fast enough.

import { useEffect, useRef, useState } from 'react';
import styled from '@emotion/styled';
import { Drawer, Radio, SegmentedControl, Textarea } from '@mantine/core';
import type { PropelHeroHost } from '@/propel/runtime/heroHost';
import { Btn, FONT_UI, NOCTURNE_LIGHT_VARS, PulseScope } from '../_pulse/pulse';
import { draftCallNote, errorText, moveStage, saveOutcome } from './leadApi';
import { OUTCOME_WORDS, dueWords, minutesWords, relativeWords, stageWords, zoneFor, zoneWords } from './words';
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

// The three outcomes where a suggested stage must never be applied: the first two
// end the lead, and the third already won it. Moving it to Contacted (or
// anything else) on top of a call that already closed the loop would be
// nonsense. See the header comment: the route is the primary guard, this is
// the second.
const TERMINAL_OUTCOMES = new Set<Outcome>(['NOT_INTERESTED', 'WRONG_NUMBER', 'CONVERTED']);

// Plain words for each partial-failure code the route can return, never the raw
// code itself. A code the route adds later without a matching update here still
// falls back to a true, if generic, sentence rather than leaking a fresh code.
const PARTIAL_WORDS: Record<string, string> = {
  note: 'the note was not saved',
  followUp: 'the follow-up was not created',
  outcome: 'the call outcome was not recorded',
  lastTouch: 'the last-touch time was not updated',
};
const partialWords = (codes: string[]): string =>
  codes.map((c) => PARTIAL_WORDS[c] ?? 'something else was not saved').join(', ');

// Converts a <input type="datetime-local"> value (digits with no zone attached)
// into the correct absolute instant for those digits read as wall-clock time in
// `zone`, never the agent's own browser zone, which is what
// `new Date(str).toISOString()` alone would give. The caption right under the
// picker names the LEAD's zone ("UK time" / "Dubai time"), so that is what the
// agent means by what they type. Same technique FactsRail.tsx's tomorrowTenAmIn
// already uses (read the offset fresh, so it is correct across the DST edge
// too), just run in the other direction: that one starts from `now` and wants
// the zone's wall clock; this one starts from a typed wall clock and wants it
// treated as the zone's.
const customTimeInZone = (localDateTime: string, zone: string): string => {
  const asBrowserLocal = new Date(localDateTime);
  const inZone = new Date(asBrowserLocal.toLocaleString('en-US', { timeZone: zone }));
  const offsetMs = asBrowserLocal.getTime() - inZone.getTime();
  return new Date(asBrowserLocal.getTime() + offsetMs).toISOString();
};

// Mantine's Drawer defaults to withinPortal, mounting its content straight into
// document.body, outside LeadNocturne's `--p-*` token declarations (pulse.tsx).
// Every var(--p-...) inside the drawer would otherwise resolve to nothing: hints
// lose colour, the datetime input loses its border, and worst of all, the
// primary Save button loses its gradient and reads as plain text, identical to
// the ghost "Not now" beside it. PulseScope re-declares the ledger;
// display:contents keeps the wrapper invisible to layout, since custom
// properties still inherit through a display:contents box (only the box itself
// disappears), so nothing here changes flex/gap behaviour. The light-mode
// selector mirrors LeadNocturne's own (styles.ts) since PulseScope's `$light`
// prop has no signal to read inside a portal; duplicated here (and in
// LeadHeader.tsx / FactsRail.tsx) because styles.ts is outside this fix's file
// scope.
const PulsePortalScope = styled(PulseScope)`
  display: contents;
  html[data-mantine-color-scheme='light'] & {
    ${NOCTURNE_LIGHT_VARS}
  }
`;

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
  activeDealId,
  open,
  callSeconds,
  phone,
  onClose,
  onSaved,
}: {
  host: PropelHeroHost;
  data: LeadLoad;
  // The one deal id the whole page agrees on (lifted to index.tsx), so an outcome
  // logged here, and any stage move it triggers, always lands on the same deal
  // FactsRail's chip row shows as active, never a stale `data.selectedDealId`.
  activeDealId: string | null;
  open: boolean;
  callSeconds: number | null;
  phone: boolean;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const { person } = data;
  const selectedDeal: LeadDeal | null = data.deals.find((d) => d.id === activeDealId) ?? null;

  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [nextStep, setNextStep] = useState<NextStep>('SEND_FILES');
  const [when, setWhen] = useState<When>('TOMORROW_10');
  const [custom, setCustom] = useState('');
  const [line, setLine] = useState('');
  const [saving, setSaving] = useState(false);
  const [clientRequestId, setClientRequestId] = useState('');

  // Tracks whether `line`'s current text is still the untouched AI draft (true) or
  // something the agent typed or edited themselves (false). A draft is safe to
  // clear or discard without asking; the agent's own words never are.
  const lineIsDraftRef = useRef(false);
  // Mirrors `outcome` so the async draftCallNote response below, which can land
  // well after the effect that started it, can check the LATEST pick rather than
  // the value captured when the sheet opened.
  const outcomeRef = useRef<Outcome | null>(null);

  // Resets every time the sheet OPENS, not on every re-render while it stays
  // open. clientRequestId in particular must survive a failed save attempt
  // unchanged, since it is what makes a retry (or a duplicate response)
  // idempotent rather than a second write.
  useEffect(() => {
    if (!open) return;
    setOutcome(null);
    outcomeRef.current = null;
    setNextStep(recentlySentWhatsApp(data) ? 'CALL_BACK' : 'SEND_FILES');
    setWhen('TOMORROW_10');
    setCustom('');
    setLine('');
    lineIsDraftRef.current = false;
    setSaving(false);
    setClientRequestId(crypto.randomUUID());

    void draftCallNote(host, person.id).then((r) => {
      if (r && r.ok) {
        // Functional update: never clobber text the agent has already typed
        // while this draft request was still in flight.
        setLine((current) => {
          if (current !== '') return current;
          // The agent already picked a terminal outcome before the draft landed:
          // no call happened worth a note, so do not file one (see the effect
          // below for the more common case of the outcome changing afterward).
          if (outcomeRef.current === 'NO_ANSWER' || outcomeRef.current === 'WRONG_NUMBER') return current;
          lineIsDraftRef.current = true;
          return r.draft;
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset is keyed on `open` only, by design
  }, [open]);

  // "No answer" / "Wrong number" mean no conversation happened, so an AI-drafted
  // note describing one must not sit there ready to be filed as if it did. Only
  // ever clears text that is STILL the untouched draft, never anything the
  // agent typed or edited, which flips lineIsDraftRef false the moment they touch it.
  useEffect(() => {
    outcomeRef.current = outcome;
    if (!open) return;
    if ((outcome === 'NO_ANSWER' || outcome === 'WRONG_NUMBER') && lineIsDraftRef.current) {
      lineIsDraftRef.current = false;
      setLine('');
    }
  }, [outcome, open]);

  const missingCustomTime = when === 'CUSTOM' && !custom;

  const save = async () => {
    if (!outcome || saving || missingCustomTime) return;
    setSaving(true);
    try {
      const zone = zoneFor(person.country);
      const r = await saveOutcome(host, {
        personId: person.id,
        dealId: selectedDeal?.id,
        outcome,
        nextStep,
        when: when === 'CUSTOM' ? customTimeInZone(custom, zone) : when,
        zone,
        line,
        clientRequestId,
      });
      if (!r || r.ok === false) {
        if (r && r.ok === false && r.error === 'DUPLICATE_REQUEST') {
          // The first attempt already went through: this is a success the agent
          // was previously told nothing about, not a failure.
          host.notify(errorText(r), 'success');
          onSaved();
          return;
        }
        host.notify(errorText(r), 'warning');
        return;
      }
      const partial = r.partial ?? [];
      if (partial.length) host.notify(`Saved, except: ${partialWords(partial)}.`, 'warning');
      else host.notify('Saved.', 'success');

      if (r.suggestedStage && selectedDeal && !TERMINAL_OUTCOMES.has(outcome)) {
        const mv = await moveStage(host, selectedDeal.deskLane, selectedDeal.id, r.suggestedStage);
        // Any non-success (a refusal with a reason, one with neither, or no
        // response at all) always tells the agent something true.
        if (mv?.ok) host.notify(`Moved to ${stageWords(r.suggestedStage)}.`, 'info');
        else host.notify(mv?.reason ?? mv?.error ?? 'The stage did not move.', 'info');
      }
      onSaved();
    } catch {
      // Any unexpected input (a malformed custom time, say) must never strand the
      // sheet on "Saving…" forever with the typed note thrown away. The agent
      // gets a plain message, the sheet stays open, and nothing typed is lost.
      host.notify('That did not save. Try again.', 'warning');
    } finally {
      // Waits for the awaited moveStage above too, so Save cannot look pressable
      // again while a stage move is still in flight.
      setSaving(false);
    }
  };

  // Escape, a scrim tap, and the drawer's own header close button all call this
  // same handler. None of the three should silently throw away something the
  // agent already entered. "Not now" below stays a direct, un-confirmed discard
  // since choosing it IS the explicit "throw this away" action: a draft that
  // was never touched doesn't count as something to protect.
  const requestDismiss = () => {
    const hasUnsavedInput = outcome !== null || (line.trim() !== '' && !lineIsDraftRef.current);
    if (hasUnsavedInput && !window.confirm('Discard this outcome and note without saving?')) return;
    onClose();
  };

  const plannedLine =
    data.openTasks.length > 0
      ? `Already planned: ${data.openTasks.map((t) => `${t.title} ${dueWords(t.dueAt).text}`).join(', ')}`
      : null;

  // The subtitle named the actual call, but always said "just now" even when the
  // sheet was opened by hand long after the fact. Prefer the real last-call time
  // when one exists; say nothing extra rather than a guess when there isn't one.
  const callWhenText = data.latestCall?.endedAt ? relativeWords(data.latestCall.endedAt) : null;

  return (
    <Drawer
      opened={open}
      onClose={requestDismiss}
      position={phone ? 'bottom' : 'right'}
      size={phone ? '85%' : 420}
      zIndex={5000}
      radius={phone ? 20 : 0}
      title={
        <PulsePortalScope>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 16, color: 'var(--p-ink)' }}>How did the call go?</div>
            <div style={{ fontFamily: FONT_UI, fontSize: 13, color: 'var(--p-ink-2)' }}>
              {`${person.displayName}${callSeconds != null ? ` · ${minutesWords(callSeconds)} call` : ''}${callWhenText ? ` · ${callWhenText}` : ''}`}
            </div>
          </div>
        </PulsePortalScope>
      }
    >
      <PulsePortalScope>
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
            onChange={(e) => {
              // Any manual edit means this is the agent's own text from now on,
              // even if they happen to retype the draft verbatim or clear it.
              lineIsDraftRef.current = false;
              setLine(e.currentTarget.value);
            }}
            placeholder="What did they say, in their own words"
          />

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={onClose} style={{ minHeight: 44 }}>
              Not now
            </Btn>
            <Btn
              variant="primary"
              disabled={!outcome || saving || missingCustomTime}
              onClick={() => void save()}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </Btn>
          </div>
        </div>
      </PulsePortalScope>
    </Drawer>
  );
};
