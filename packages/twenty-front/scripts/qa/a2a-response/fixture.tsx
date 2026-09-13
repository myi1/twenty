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

const Studio = () => {
  const studio = useA2AStudio('browser-opportunity', 'A', {}, 'browser-member');
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 20 }}>
      <h1>A2A response safety fixture</h1>
      <output aria-label="Dispatch state">{studio.dispatchState}</output>
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
    </main>
  );
};

const Fixture = () => {
  const [mounted, setMounted] = useState(true);
  return (
    <MantineProvider>
      <nav style={{ display: 'flex', gap: 8, padding: 12 }}>
        <button onClick={() => setMounted(false)}>Unmount studio</button>
        <button onClick={() => setMounted(true)}>Mount studio</button>
      </nav>
      {mounted ? <Studio /> : <p>Studio unmounted</p>}
    </MantineProvider>
  );
};

createRoot(document.getElementById('root')!).render(<Fixture />);
