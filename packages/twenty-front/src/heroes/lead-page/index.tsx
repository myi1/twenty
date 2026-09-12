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
import { useHostBottomInset } from './useHostBottomInset';
import { Columns, LeadNocturne, PhoneBar, PhoneTab, PhoneTabs, Skeleton } from './styles';
import {
  clearAllDrafts,
  draftKey,
  EMPTY_DRAFTS,
  purgeLegacyDrafts,
  readDrafts,
  writeDrafts,
  type DraftStore,
  type LeadDrafts,
} from './leadDrafts';
import {
  CALL_POLL_INTERVAL_MS,
  CALL_STATUS_TEXT,
  callRefused,
  callRequested,
  IDLE_CALL,
  nextCallState,
  shouldOpenOutcomeSheet,
  shouldPollCall,
  type CallState,
} from './callLifecycle';

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

// Drafts live in sessionStorage, not localStorage: per-tab, gone when the tab
// closes. The old localStorage mirror kept an unsent message about a named
// customer on a shared office machine indefinitely, under a key that named only
// the lead. Reading the property itself can THROW in a browser with site data
// blocked, so it is wrapped — a hero must never fail to render over a cache.
const draftStore = (): DraftStore | null => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};
const legacyStore = (): DraftStore | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

// The load failure that means the person at the keyboard is no longer known to
// be the agent who typed. Everything they typed goes with it.
const SESSION_EXPIRED: LeadErr['error'] = 'NOT_AUTHENTICATED';

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
  // The hero's own frame, and how far its bottom edge sits above the viewport's.
  // PhoneBar is `position: fixed`, so without this it would be pinned to the
  // VIEWPORT bottom — the strip Twenty's mobile navigation bar already occupies.
  // See useHostBottomInset.ts.
  const frameRef = useRef<HTMLDivElement>(null);
  const hostBottomInset = useHostBottomInset(frameRef, phone);
  // The call is STATE, not a ref. It used to be
  //   const callStartedAt = useRef<number | null>(null)
  // with `setData((d) => (d ? { ...d } : d))` next to it to nudge the poll effect
  // awake — except that effect depends on `data?.latestCall?.id`, which spreading
  // `data` does not change. Pressing Call therefore did not reliably arm the
  // poll, so the outcome sheet often never opened and the agent logged nothing.
  // See callLifecycle.ts.
  const [call, setCall] = useState<CallState>(IDLE_CALL);

  // Everything the agent has typed and not sent, for the lead on screen. Owned
  // HERE because this component survives the phone tab switch that unmounts the
  // story column — see leadDrafts.ts for what used to happen and why the key
  // includes who is typing.
  const [drafts, setDrafts] = useState<LeadDrafts>(EMPTY_DRAFTS);

  // Tracked explicitly rather than inferred from whatever error happens to be on
  // screen. It gates the call poll, and a poll that keeps running against a CRM
  // refusing every request is the exact behaviour this replaces.
  const [sessionActive, setSessionActive] = useState(true);

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
  // The call state is reset here too: the fourth path of the same wrong-record
  // class in this file. Without it, navigating from a lead with a call in
  // progress to another lead left the poll armed with the FIRST lead's start
  // time, so a call ending on the new lead popped the outcome sheet for the old
  // one. It is also what makes a poll response that lands AFTER the switch
  // harmless: nextCallState returns IDLE untouched. activeDealId is reset alongside it for the same reason: an old
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
    setCall(IDLE_CALL);
    setDrafts(EMPTY_DRAFTS);
    setSessionActive(true);
    setActiveDealId(null);
    setSheet({ open: false, callSeconds: null });
  }, [personId]);

  // One-time cleanup of the OLD draft scheme. Those entries are real message
  // text about named leads, sitting in localStorage on shared machines with no
  // member in the key and no expiry; writing somewhere safer from now on would
  // leave every one of them exactly where it is.
  useEffect(() => {
    purgeLegacyDrafts(legacyStore());
  }, []);

  // Load this lead's drafts once the viewer is known — the key needs the member,
  // and the member arrives with the lead. Keyed reads mean the draft that comes
  // back belongs to THIS agent on THIS lead, never to whoever used the browser
  // before them.
  const viewerId = data?.viewer.workspaceMemberId ?? null;
  const draftId = viewerId ? draftKey(host.serverBaseUrl, viewerId, personId) : null;
  const loadedDraftsFor = useRef<string | null>(null);
  useEffect(() => {
    if (!draftId || loadedDraftsFor.current === draftId) return;
    loadedDraftsFor.current = draftId;
    setDrafts(readDrafts(draftStore(), draftId));
  }, [draftId]);

  // Mirror them, so a refresh mid-sentence is not punished. The parent's own
  // state is what the agent is typing into; this is only the safety net.
  useEffect(() => {
    if (!draftId || loadedDraftsFor.current !== draftId) return;
    writeDrafts(draftStore(), draftId, drafts);
  }, [draftId, drafts]);

  const onDraftsChange = useCallback((next: Partial<LeadDrafts>) => {
    setDrafts((d) => ({ ...d, ...next }));
  }, []);

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
      // The session lapsed. The person at the keyboard is no longer known to be
      // the agent who typed, so the lead's details AND their unsent words come
      // off the screen and out of the store — even on a page that had loaded
      // successfully, which every other failure deliberately leaves alone.
      if (r !== null && r.error === SESSION_EXPIRED) {
        setSessionActive(false);
        setData(null);
        setDrafts(EMPTY_DRAFTS);
        setCall(IDLE_CALL);
        setSheet({ open: false, callSeconds: null });
        loadedFor.current = null;
        loadedDraftsFor.current = null;
        clearAllDrafts(draftStore());
        setError(loadFailure(r));
        return;
      }
      if (loadedFor.current === personId) { host.notify(errorText(r), 'warning'); return; }
      setError(loadFailure(r));
      return;
    }
    loadedFor.current = r.person.id;
    setSessionActive(true);
    setError(null); setData(r); setStoryReload((v) => v + 1);
  }, [host, personId]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void reload(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  // Watch the call the agent just placed. The gate is the CALL STATE, which is
  // real state, so pressing Call actually arms this — and it stops the moment
  // the call ends, the dial goes unconfirmed, the sheet is opened by hand, the
  // component unmounts, or the session expires. It used to have no session term
  // at all: once the session lapsed every request failed, the effect returned,
  // and it tried again ten seconds later for thirty minutes.
  useEffect(() => {
    if (sheet.open) return;
    if (!shouldPollCall(call.status, sessionActive)) return;
    const t = window.setInterval(async () => {
      const seq = ++requestSeq.current;
      const r = await loadLead(host, personId);
      if (seq !== requestSeq.current) return; // a newer request has superseded this one
      if (!r || r.ok === false) {
        // A lapsed session ends the watch here and now: the poll is the thing
        // that notices first, and waiting out a timeout would mean carrying on
        // against a CRM that is refusing every request. reload() does the rest
        // (clearing the lead and the drafts) the next time it runs.
        if (r !== null && r.error === SESSION_EXPIRED) {
          setSessionActive(false);
          setCall(IDLE_CALL);
          return;
        }
        // Anything else: try again next tick, and let nextCallState's timeout
        // end the watch rather than polling a silent CRM forever.
        setCall((c) => nextCallState(c, null, Date.now()));
        return;
      }
      setData(r);
      setCall((c) => nextCallState(c, r.latestCall, Date.now()));
    }, CALL_POLL_INTERVAL_MS);
    return () => window.clearInterval(t);
  }, [host, personId, sheet.open, call.status, sessionActive]);

  // A call that ended owes an outcome. Separated from the poll so the sheet
  // opens from the STATE rather than from inside a timer callback — which is
  // also what lets a late response for a previous lead do nothing at all, since
  // the reset on personId change puts the state back to IDLE.
  useEffect(() => {
    if (!shouldOpenOutcomeSheet(call)) return;
    setSheet({ open: true, callSeconds: call.endedSeconds });
    setCall(IDLE_CALL);
  }, [call]);

  // `placed` is whether the dial MESSAGE went out, not whether a call is being
  // made — window.postMessage cannot fail. REQUESTED says we asked; the poll
  // turns it into CONNECTED only when the CRM can actually see a call.
  const onCallStarted = (placed: boolean) => setCall(placed ? callRequested(Date.now()) : callRefused());
  const openSheet = () => { setCall(IDLE_CALL); setSheet({ open: true, callSeconds: null }); };
  const callStatusText = CALL_STATUS_TEXT[call.status];
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
        {/* flex:1 + minHeight:0 is the link that stops this hero overflowing the
            host's panel. PagePanel is `height:100%; overflow-y:hidden`, and
            PageContainer — its only child — is a plain `flex: 0 1 auto` column,
            so without this pair it sizes to its CONTENT and everything past the
            panel's height is clipped with no way to scroll to it. Inline, not a
            styled wrapper, for the same reason My Desk does it inline
            (heroes/my-desk/index.tsx): PageContainer is a Linaria component and
            an Emotion class wrapping it would be a coin-toss on stylesheet
            order, where an inline style simply wins. */}
        <PageContainer style={{ flex: 1, minHeight: 0 }}>
          <LeadNocturne ref={frameRef} $phone={phone}>
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
                {/* What the page actually knows about the call. "Calling…" while
                    we are waiting, "On a call" only once the CRM can see one,
                    and a plain sentence when we asked and nothing came back —
                    rather than a silent thirty-minute poll for a call that may
                    never have been placed. A toast cannot do this job: it is
                    gone in seconds, and this state can last a minute. */}
                {callStatusText !== null && (
                  <div
                    role="status"
                    style={{
                      padding: '6px 12px',
                      fontSize: 13,
                      opacity: 0.85,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    {callStatusText}
                    {(call.status === 'UNCONFIRMED' || call.status === 'REFUSED') && (
                      <Btn variant="secondary" style={{ minHeight: 32 }} onClick={() => setCall(IDLE_CALL)}>Dismiss</Btn>
                    )}
                  </div>
                )}
                {phone && (
                  <PhoneTabs role="tablist">
                    <PhoneTab role="tab" $active={tab === 'facts'} onClick={() => setTab('facts')}>Facts</PhoneTab>
                    <PhoneTab role="tab" $active={tab === 'story'} onClick={() => setTab('story')}>Story</PhoneTab>
                  </PhoneTabs>
                )}
                <Columns $phone={phone}>
                  {(!phone || tab === 'facts') && (
                    <FactsRail host={host} data={data} activeDealId={activeDealId} onActiveDealChange={setActiveDealId} onChanged={reload} phone={phone} />
                  )}
                  {(!phone || tab === 'story') && (
                    <Story host={host} data={data} reloadToken={storyReload} drafts={drafts} onDraftsChange={onDraftsChange} onChanged={reload} phone={phone} />
                  )}
                </Columns>
                {phone && (
                  <PhoneBar $inset={hostBottomInset}>
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
