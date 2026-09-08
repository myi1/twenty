/* eslint-disable @nx/enforce-module-boundaries */
// ─────────────────────────────────────────────────────────────────────────────
// Lead Page: runtime-loaded HERO ENTRY (layout: facts rail + one story)
// ─────────────────────────────────────────────────────────────────────────────
// Reads via POST /lead-page; WhatsApp through the Inbox routes/components; dials
// via the dialer dock bridge. Reached at /h/lead-page?id=<personId>; the fork's
// /h/:bundle catch-all loads dist-heroes/lead-page/index.js, so no registry
// change and no engine rebuild.

import { useCallback, useEffect, useRef, useState } from 'react';
import { PropelMantineProvider } from '@/propel/components/PropelMantineProvider';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { HeroTypingGuard } from '@/propel/runtime/HeroTypingGuard';
import { type PropelHeroHost } from '@/propel/runtime/heroHost';
import { Btn, PulseFonts } from '../_pulse/pulse';
import { errorText, loadLead } from './leadApi';
import type { LeadErr, LeadLoad } from './types';
import { LeadHeader } from './LeadHeader';
import { FactsRail } from './FactsRail';
import { Story } from './Story';
import { OutcomeSheet } from './OutcomeSheet';
import { usePhoneLayout } from './usePhoneLayout';
import { Columns, LeadNocturne, PhoneBar, PhoneTab, PhoneTabs, Skeleton } from './styles';

// ── The load-failure block's ONE button ──────────────────────────────────────
// My Desk, the agent's own list of leads. Reached through the fork's /h/:bundle
// catch-all (HeroRoute.tsx), the same mechanism this hero itself is reached by;
// prod's mounted nav.config.json registers the bundle at exactly this route (see
// the 2026-07-13/07-14 promotions in the CRM repo's docs/RELEASE-GOVERNANCE.md,
// which record `/h/my-desk` answering 200 live).
const MY_DESK_PATH = '/h/my-desk';

// A load that failed: the words on screen, and where the one button under them
// should go.
type LoadFailure = { text: string; backTo: 'desk' | 'contact' };

// The failures that mean the lead is not reachable BY THIS AGENT. NOT_VISIBLE is
// the database declining the row — the lead is someone else's, or it is gone —
// and NOT_FOUND is the row genuinely being gone. For both, the contact record is
// the ONE destination guaranteed to refuse the agent a second time, so the
// button must not offer it: it goes to My Desk, the list of leads that ARE
// theirs, which is also exactly what the NOT_VISIBLE toast already tells them to
// do ('Go back to My Desk, or ask a manager' — errorText in leadApi.ts).
//
// Every OTHER failure keeps the contact button exactly as it was, because for
// those the record is reachable and opening it is a real next step:
//   UPSTREAM_FAILED   the CRM broke; nothing is wrong with the record.
//   INVALID_INPUT     a malformed request (an unparseable timeline cursor); ditto.
//   FORBIDDEN         the route's own owner check fired — reachable only with RLS
//                     off, and then the record IS readable, so the contact page
//                     works. (It ALSO meant 'no session at all' until the route
//                     split NOT_AUTHENTICATED out of it; see types.ts.)
//   NOT_AUTHENTICATED the login lapsed. Sign-in is the only place either button can
//                     end up, so neither destination is better and there is nothing
//                     to choose. Left on the contact button — which is also what
//                     any code this set does not name gets by default, and that
//                     default is the safe one: My Desk is the better answer ONLY
//                     when the contact record is known to refuse the agent too, so
//                     a code added upstream and not yet handled here can be wordy
//                     but never strands anyone.
//   DUPLICATE_REQUEST `saveOutcome` only — it cannot reach this block.
//   null              a transport failure (callPropelRoute answers null): the
//                     record is not known to be unreachable, and this is the one
//                     case where trying again genuinely can succeed.
const UNREACHABLE_CODES: ReadonlySet<LeadErr['error']> = new Set<LeadErr['error']>(['NOT_VISIBLE', 'NOT_FOUND']);

const loadFailure = (r: LeadErr | null): LoadFailure => ({
  text: errorText(r),
  backTo: r !== null && UNREACHABLE_CODES.has(r.error) ? 'desk' : 'contact',
});

const LeadPageHero = ({ host }: { host: PropelHeroHost }) => {
  const personId = host.searchParams.get('id') ?? '';
  const [data, setData] = useState<LeadLoad | null>(null);
  const [error, setError] = useState<LoadFailure | null>(null);
  const [sheet, setSheet] = useState<{ open: boolean; callSeconds: number | null }>({ open: false, callSeconds: null });
  const [tab, setTab] = useState<'facts' | 'story'>('story');
  const [storyReload, setStoryReload] = useState(0);
  const phone = usePhoneLayout();
  const callStartedAt = useRef<number | null>(null);

  // The ONE deal id the whole page agrees on: which chip FactsRail shows as
  // active, and which deal OutcomeSheet writes the outcome and any stage move
  // to. Lifted up from FactsRail (which used to own this locally) because a
  // sheet computing its own answer from `data.selectedDealId` could silently
  // disagree with whatever deal the agent had actually switched to in the
  // rail, logging a call outcome, or moving a stage, against the wrong deal.
  const [activeDealId, setActiveDealId] = useState<string | null>(null);

  // Heals a stale or missing activeDealId: ported from FactsRail.tsx's own
  // effect (same trigger: /opportunities/move recreates a deal with a NEW id
  // and soft-deletes the source, so an id this hero is holding can point at
  // nothing after a move) now that the state itself lives here instead.
  useEffect(() => {
    if (!data || data.deals.length === 0) return;
    const stillExists = activeDealId !== null && data.deals.some((d) => d.id === activeDealId);
    if (activeDealId === null || !stillExists) {
      setActiveDealId(data.selectedDealId ?? data.deals[0]!.id);
    }
  }, [data, activeDealId]);

  // personId comes from host.searchParams, which is live: HeroRoute reads it
  // with react-router's useSearchParams, so changing ?id= re-renders this
  // hero with a new personId WITHOUT remounting it. Without this reset, the
  // previous lead's data and ref would still be on screen and in memory when
  // the new id's load kicks off, so a failed load for the new lead would be
  // mistaken for a refresh of the old one and the old lead's page would stay
  // rendered under the new lead's URL.
  const loadedFor = useRef<string | null>(null);
  const requestSeq = useRef(0);
  // callStartedAt.current is reset here too: the fourth path of the same
  // wrong-record class in this file. Without it, navigating from a lead with a
  // call in progress to another lead left the poll armed with the FIRST lead's
  // start time, so a call ending on the new lead popped the outcome sheet for
  // the old one. activeDealId is reset alongside it for the same reason: an old
  // lead's deal id happening to still look "valid" (it never will, ids are
  // globally unique, but nothing should rely on that) has no business
  // surviving a navigation to a different lead. `sheet` is the fifth path of
  // the same class: navigating away with the outcome drawer open left it open,
  // so it reopened on the new lead still carrying the PREVIOUS lead's call
  // duration into the subtitle. Nothing was written wrong (the drawer itself
  // reloads `data` fresh), but it is the same "the old record survives a
  // navigation" bug the other four resets exist to close, so it closes here too.
  useEffect(() => {
    setData(null);
    setError(null);
    loadedFor.current = null;
    requestSeq.current += 1;
    callStartedAt.current = null;
    setActiveDealId(null);
    setSheet({ open: false, callSeconds: null });
  }, [personId]);

  // A first load with no data yet on screen shows the error block: there is
  // nothing else to show. A background refresh (the visibilitychange listener
  // below fires one every time the agent switches back to this tab) must not
  // blank out a page that already loaded successfully; it surfaces the
  // failure as a toast instead and leaves the page exactly as it was. The
  // guard compares loadedFor to the CURRENT personId, not just truthiness, so
  // a load failure for a newly navigated-to lead is never mistaken for a
  // refresh of the lead that used to be on screen.
  const reload = useCallback(async () => {
    // No lead at all: there is no contact record to go back TO, so this one is
    // always My Desk — which is also where the agent opens a lead page from.
    if (!personId) { setError({ text: 'No lead was given. Open this page from a lead.', backTo: 'desk' }); return; }
    const seq = ++requestSeq.current;
    const r = await loadLead(host, personId);
    if (seq !== requestSeq.current) return; // a newer request has superseded this one
    if (!r || r.ok === false) {
      if (loadedFor.current === personId) { host.notify(errorText(r), 'warning'); return; }
      setError(loadFailure(r));
      return;
    }
    loadedFor.current = r.person.id;
    setError(null); setData(r); setStoryReload((v) => v + 1);
  }, [host, personId]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void reload(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  // After the agent presses Call, poll every 10 s for up to 30 min; when a newer call
  // has ended, open the outcome sheet with its length. Manual open cancels the poll.
  useEffect(() => {
    if (callStartedAt.current === null || sheet.open) return;
    const started = callStartedAt.current;
    const t = window.setInterval(async () => {
      if (Date.now() - started > 30 * 60_000) { callStartedAt.current = null; window.clearInterval(t); return; }
      const seq = ++requestSeq.current;
      const r = await loadLead(host, personId);
      if (seq !== requestSeq.current) return; // a newer request has superseded this one
      if (!r || r.ok === false) return;
      setData(r);
      const c = r.latestCall;
      if (c?.endedAt && Date.parse(c.endedAt) > started) { callStartedAt.current = null; window.clearInterval(t); setSheet({ open: true, callSeconds: c.durationSeconds ?? null }); }
    }, 10_000);
    return () => window.clearInterval(t);
  }, [host, personId, sheet.open, data?.latestCall?.id]);

  const onCallStarted = () => { callStartedAt.current = Date.now(); setData((d) => (d ? { ...d } : d)); };
  const openSheet = () => { callStartedAt.current = null; setSheet({ open: true, callSeconds: null }); };
  // Always lands the agent on the composer area, even for a lead with no
  // textarea to focus (opted out of WhatsApp, or marked lost): scrolling the
  // container into view is unconditional, so a blocked lead still sees the
  // explanation of why they can't be messaged, rather than a dead tap.
  const focusComposer = () => {
    setTab('story');
    window.setTimeout(() => {
      const container = document.getElementById('lead-page-composer');
      container?.scrollIntoView({ block: 'nearest' });
      container?.querySelector('textarea')?.focus();
    }, 50);
  };

  // Label and destination are derived TOGETHER, from one expression, so the two
  // can never disagree: a button that says 'Back to the contact' is by
  // construction the button that goes to the contact.
  const back =
    error === null || error.backTo === 'desk' || !personId
      ? { label: 'Back to My Desk', to: MY_DESK_PATH }
      : { label: 'Back to the contact', to: `/object/person/${personId}` };

  return (
    <PropelMantineProvider>
      <PulseFonts />
      <HeroTypingGuard>
        <PageContainer>
          <LeadNocturne>
            {error && !data && (
              <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
                <div style={{ fontSize: 15 }}>{error.text}</div>
                <Btn variant="secondary" style={{ minHeight: 44 }} onClick={() => host.navigate(back.to)}>{back.label}</Btn>
              </div>
            )}
            {!error && !data && <div style={{ padding: 24, display: 'grid', gap: 12 }}><Skeleton style={{ width: 240, height: 24 }} /><Skeleton style={{ width: 360 }} /><Skeleton style={{ width: 300 }} /></div>}
            {data && (
              <>
                <LeadHeader host={host} data={data} activeDealId={activeDealId} phone={phone} onLogOutcome={openSheet} onCallStarted={onCallStarted} onChanged={reload} onFocusComposer={focusComposer} />
                {phone && (
                  <PhoneTabs role="tablist">
                    <PhoneTab role="tab" $active={tab === 'facts'} onClick={() => setTab('facts')}>Facts</PhoneTab>
                    <PhoneTab role="tab" $active={tab === 'story'} onClick={() => setTab('story')}>Story</PhoneTab>
                  </PhoneTabs>
                )}
                <Columns $phone={phone}>
                  {(!phone || tab === 'facts') && (
                    <FactsRail host={host} data={data} activeDealId={activeDealId} onActiveDealChange={setActiveDealId} onChanged={reload} />
                  )}
                  {(!phone || tab === 'story') && <Story host={host} data={data} reloadToken={storyReload} onChanged={reload} />}
                </Columns>
                {phone && (
                  <PhoneBar>
                    <Btn
                      variant="secondary"
                      onClick={() => {
                        // The proxy button this reaches for is `disabled` when
                        // the lead has no number, and .click() on a disabled
                        // button is a silent no-op. The desktop Call button
                        // already explains itself (LeadHeader.tsx's handleCall);
                        // this path needs the same explanation, in the same
                        // words, rather than looking live and doing nothing.
                        if (!data.person.phoneE164) {
                          host.notify('There is no phone number on this lead.', 'warning');
                          return;
                        }
                        document.getElementById('lead-page-call')?.click();
                      }}
                    >
                      Call
                    </Btn>
                    <Btn variant="secondary" onClick={focusComposer}>WhatsApp</Btn>
                    <Btn variant="primary" onClick={openSheet}>Log outcome</Btn>
                  </PhoneBar>
                )}
                <OutcomeSheet
                  host={host}
                  data={data}
                  activeDealId={activeDealId}
                  open={sheet.open}
                  callSeconds={sheet.callSeconds}
                  phone={phone}
                  onClose={() => setSheet({ open: false, callSeconds: null })}
                  onSaved={() => { setSheet({ open: false, callSeconds: null }); void reload(); }}
                />
              </>
            )}
          </LeadNocturne>
        </PageContainer>
      </HeroTypingGuard>
    </PropelMantineProvider>
  );
};

export default LeadPageHero;
