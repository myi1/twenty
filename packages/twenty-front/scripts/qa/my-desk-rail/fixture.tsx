import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { RightRail } from '../../../src/heroes/my-desk/RightRail';
import { TodayStrip } from '../../../src/heroes/my-desk/TodayStrip';
import { useRail } from '../../../src/heroes/my-desk/useRail';
import { RAIL_PANEL_IDS } from '../../../src/heroes/my-desk/deskState';
import {
  StyledMyDeskNocturne,
  useDeskStackedLayout,
} from '../../../src/heroes/my-desk/responsive';

// Synthetic source-only browser fixture. All route I/O is intercepted by run.mjs.
let session = 'scope-a';
function Fixture() {
  const [scope, setScope] = useState(session);
  const [action, setAction] = useState('');
  const { status, rail, refreshing, load } = useRail(scope, () => session);
  const [arrangement, setArrangement] = useState({
    order: [...RAIL_PANEL_IDS],
    folds: {
      tasks: false,
      viewings: false,
      unreadWa: false,
      priorityLeads: false,
    },
    collapsed: false,
  });
  const phone = useDeskStackedLayout();
  const location = useLocation();
  return (
    <StyledMyDeskNocturne style={{ minHeight: '100vh', padding: 12 }}>
      <button
        onClick={() => {
          session = session === 'scope-a' ? 'scope-b' : 'scope-a';
          setScope(session);
        }}
      >
        Change scope
      </button>
      <button onClick={() => void load()}>Reload fixture</button>
      <output aria-label="Fixture navigation">{location.pathname}</output>
      <output aria-label="Fixture action">{action}</output>
      <TodayStrip
        boardStatus="ready"
        rows={[]}
        railStatus={status}
        rail={rail}
        nowMs={Date.now()}
        activeFilter={null}
        onToggleFilter={(filter) => setAction(filter)}
        onRetryRail={() => void load()}
        railRefreshing={refreshing}
      />
      <RightRail
        status={status}
        rail={rail}
        error={null}
        nowMs={Date.now()}
        onRetry={() => void load()}
        refreshing={refreshing}
        onRowAction={(name, row) => setAction(`${name}:${row.recordId}`)}
        onCompleteTask={async () => {
          throw new Error('No fixture writes allowed');
        }}
        onOpenRow={(row) => setAction(`open:${row.recordId}`)}
        arrangement={arrangement}
        onArrangementChange={setArrangement}
        forceExpanded={phone}
      />
    </StyledMyDeskNocturne>
  );
}
createRoot(document.getElementById('root')!).render(
  <MemoryRouter
    future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
  >
    <Fixture />
  </MemoryRouter>,
);
