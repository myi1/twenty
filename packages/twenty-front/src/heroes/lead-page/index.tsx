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
import type { LeadLoad } from './types';
import { LeadHeader } from './LeadHeader';
import { FactsRail } from './FactsRail';
import { Story } from './Story';
import { OutcomeSheet } from './OutcomeSheet';
import { usePhoneLayout } from './usePhoneLayout';
import { Columns, LeadNocturne, PhoneBar, PhoneTab, PhoneTabs, Skeleton } from './styles';

const LeadPageHero = ({ host }: { host: PropelHeroHost }) => {
  const personId = host.searchParams.get('id') ?? '';
  const [data, setData] = useState<LeadLoad | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  // surviving a navigation to a different lead.
  useEffect(() => {
    setData(null);
    setError(null);
    loadedFor.current = null;
    requestSeq.current += 1;
    callStartedAt.current = null;
    setActiveDealId(null);
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
    if (!personId) { setError('No lead was given. Open this page from a lead.'); return; }
    const seq = ++requestSeq.current;
    const r = await loadLead(host, personId);
    if (seq !== requestSeq.current) return; // a newer request has superseded this one
    if (!r || r.ok === false) {
      if (loadedFor.current === personId) { host.notify(errorText(r), 'warning'); return; }
      setError(errorText(r));
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

  return (
    <PropelMantineProvider>
      <PulseFonts />
      <HeroTypingGuard>
        <PageContainer>
          <LeadNocturne>
            {error && !data && (
              <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
                <div style={{ fontSize: 15 }}>{error}</div>
                <Btn variant="secondary" style={{ minHeight: 44 }} onClick={() => host.navigate(personId ? `/object/person/${personId}` : '/')}>Back to the contact</Btn>
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
                    <Btn variant="secondary" onClick={() => document.getElementById('lead-page-call')?.click()}>Call</Btn>
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
