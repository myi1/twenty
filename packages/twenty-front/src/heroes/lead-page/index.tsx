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

  const reload = useCallback(async () => {
    if (!personId) { setError('No lead was given. Open this page from a lead.'); return; }
    const r = await loadLead(host, personId);
    if (!r || r.ok === false) { setError(errorText(r)); return; }
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
      const r = await loadLead(host, personId);
      if (!r || r.ok === false) return;
      setData(r);
      const c = r.latestCall;
      if (c?.endedAt && Date.parse(c.endedAt) > started) { callStartedAt.current = null; window.clearInterval(t); setSheet({ open: true, callSeconds: c.durationSeconds ?? null }); }
    }, 10_000);
    return () => window.clearInterval(t);
  }, [host, personId, sheet.open, data?.latestCall?.id]);

  const onCallStarted = () => { callStartedAt.current = Date.now(); setData((d) => (d ? { ...d } : d)); };
  const openSheet = () => { callStartedAt.current = null; setSheet({ open: true, callSeconds: null }); };
  const focusComposer = () => { setTab('story'); window.setTimeout(() => document.getElementById('lead-page-composer')?.querySelector('textarea')?.focus(), 50); };

  return (
    <PropelMantineProvider>
      <PulseFonts />
      <HeroTypingGuard>
        <PageContainer>
          <LeadNocturne>
            {error && (
              <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
                <div style={{ fontSize: 15 }}>{error}</div>
                <Btn variant="secondary" onClick={() => host.navigate(personId ? `/object/person/${personId}` : '/')}>Back to the contact</Btn>
              </div>
            )}
            {!error && !data && <div style={{ padding: 24, display: 'grid', gap: 12 }}><Skeleton style={{ width: 240, height: 24 }} /><Skeleton style={{ width: 360 }} /><Skeleton style={{ width: 300 }} /></div>}
            {data && (
              <>
                <LeadHeader host={host} data={data} phone={phone} onLogOutcome={openSheet} onCallStarted={onCallStarted} onChanged={reload} onFocusComposer={focusComposer} />
                {phone && (
                  <PhoneTabs role="tablist">
                    <PhoneTab role="tab" $active={tab === 'facts'} onClick={() => setTab('facts')}>Facts</PhoneTab>
                    <PhoneTab role="tab" $active={tab === 'story'} onClick={() => setTab('story')}>Story</PhoneTab>
                  </PhoneTabs>
                )}
                <Columns $phone={phone}>
                  {(!phone || tab === 'facts') && <FactsRail host={host} data={data} onChanged={reload} />}
                  {(!phone || tab === 'story') && <Story host={host} data={data} reloadToken={storyReload} onChanged={reload} />}
                </Columns>
                {phone && (
                  <PhoneBar>
                    <Btn variant="secondary" onClick={() => document.getElementById('lead-page-call')?.click()}>Call</Btn>
                    <Btn variant="secondary" onClick={focusComposer}>WhatsApp</Btn>
                    <Btn variant="primary" onClick={openSheet}>Log outcome</Btn>
                  </PhoneBar>
                )}
                <OutcomeSheet host={host} data={data} open={sheet.open} callSeconds={sheet.callSeconds} phone={phone} onClose={() => setSheet({ open: false, callSeconds: null })} onSaved={() => { setSheet({ open: false, callSeconds: null }); void reload(); }} />
              </>
            )}
          </LeadNocturne>
        </PageContainer>
      </HeroTypingGuard>
    </PropelMantineProvider>
  );
};

export default LeadPageHero;
