import { MantineProvider } from '@mantine/core';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

import { SendPanel } from '../../../src/modules/propel/components/a2a/SendPanel';
import { useA2AStudio } from '../../../src/modules/propel/hooks/useA2AStudio';

const COUNTERPARTY = {
  id: 'person-1',
  name: 'Synthetic Broker',
  email: 'broker@example.test',
  phone: null,
};

type FixtureMode = 'send' | 'finalize' | 'fresh';

const Studio = ({ mode }: { mode: FixtureMode }) => {
  const opportunityId =
    mode === 'send'
      ? 'browser-opportunity'
      : mode === 'finalize'
        ? 'browser-finalize-opportunity'
        : 'browser-fresh-opportunity';
  const studio = useA2AStudio(opportunityId, 'A', {}, 'browser-member');
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 20 }}>
      <h1>A2A response safety fixture</h1>
      <output aria-label="Dispatch state">{studio.dispatchState}</output>
      <output aria-label="Finalization state">
        {studio.finalizationState}
      </output>
      <output aria-label="Document ID">
        {studio.draft?.a2aDocumentId ?? ''}
      </output>
      <output aria-label="Document status">{studio.status}</output>
      <button
        disabled={!studio.canCreateDraft}
        onClick={() => void studio.createDraft()}
      >
        Create fixture draft
      </button>
      <button onClick={studio.onEmbedCompleted}>
        Finish fixture signature
      </button>
      <button onClick={() => void studio.linkCounterparty(COUNTERPARTY)}>
        Add fixture broker
      </button>
      <button onClick={studio.reset}>Reset fixture</button>
      {studio.step === 'send' ? (
        <SendPanel
          counterparty={studio.counterparty}
          shareUrl={studio.shareUrl}
          sending={studio.sending}
          canSend={studio.canSend}
          dispatchState={studio.dispatchState}
          sent={studio.status === 'OUT_FOR_SIGNATURE'}
          outcome={studio.sendOutcome}
          outcomeMessage={studio.sendMessage}
          onOpenContact={() => undefined}
          onSend={(channels) => studio.send(channels)}
          onCheckStatus={() => void studio.refreshStatus()}
        />
      ) : null}
      {studio.step === 'error' && studio.finalizationState !== 'none' ? (
        <section aria-label="Finalize result unconfirmed">
          <p>{studio.errorMessage}</p>
          <button onClick={() => void studio.refreshStatus()}>
            Check document status
          </button>
        </section>
      ) : null}
    </main>
  );
};

const Fixture = () => {
  const [mounted, setMounted] = useState(true);
  const [mode, setMode] = useState<FixtureMode>('send');
  return (
    <MantineProvider>
      <nav style={{ display: 'flex', gap: 8, padding: 12 }}>
        <button onClick={() => setMode('send')}>Show send fixture</button>
        <button onClick={() => setMode('finalize')}>
          Show finalize fixture
        </button>
        <button onClick={() => setMode('fresh')}>Show fresh fixture</button>
        <button onClick={() => setMounted(false)}>Unmount studio</button>
        <button onClick={() => setMounted(true)}>Mount studio</button>
      </nav>
      {mounted ? <Studio mode={mode} /> : <p>Studio unmounted</p>}
    </MantineProvider>
  );
};

createRoot(document.getElementById('root')!).render(<Fixture />);
