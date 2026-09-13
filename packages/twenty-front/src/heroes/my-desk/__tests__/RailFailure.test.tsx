import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode, Suspense, startTransition, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import type { PropelHeroHost } from '@/propel/runtime/heroHost';
import MyDeskHero from '../index';

jest.mock('@/propel/lib/callPropelRoute');
// Host chrome is outside this hero's ownership. All desk components and the
// route client stay real; only authenticated network I/O is a synthetic fixture.
jest.mock('@/propel/components/PropelMantineProvider', () => ({
  PropelMantineProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
jest.mock('@/ui/layout/page/components/PageContainer', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/ui/layout/page/components/PageHeader', () => ({
  PageHeader: () => null,
}));
const mockCall = callPropelRoute as jest.MockedFunction<typeof callPropelRoute>;
const sectionNames = [
  'tasks',
  'viewings',
  'unreadWa',
  'priorityLeads',
] as const;
const titles = [
  "Today's tasks",
  'Viewings today',
  'Unread WhatsApp',
  'Priority leads',
];
const target = {
  laneObject: 'lead',
  recordId: 'person-1',
  personId: 'person-1',
  phoneE164: '+971500000000',
  hasWhatsApp: true,
  contactName: 'Synthetic contact',
};
const healthy = () => ({
  ok: true,
  partial: false,
  sections: Object.fromEntries(
    sectionNames.map((key) => [key, { status: 'available' }]),
  ),
  tasks: [
    {
      ...target,
      id: 'task-1',
      title: 'Synthetic task',
      status: 'TODO',
      slaDueAt: null,
      kind: null,
    },
  ],
  viewings: [
    {
      ...target,
      id: 'viewing-1',
      name: 'Synthetic viewing',
      status: 'SCHEDULED',
      scheduledAt: null,
    },
  ],
  unreadWa: [
    {
      ...target,
      id: 'wa-1',
      name: 'Synthetic chat',
      unreadCount: 2,
      lastMessageAt: null,
      contactId: 'person-1',
    },
  ],
  priorityLeads: [
    {
      ...target,
      id: 'lead:person-1',
      name: 'Synthetic lead',
      stage: 'NEW',
      meta: '',
      valueAed: null,
      nextAction: null,
      nextActionTaskId: null,
      nextActionDueAt: null,
      nextActionSource: 'stageMap',
      lastTouchAt: null,
      slaDeadline: null,
      snoozedUntil: null,
      unreadWa: 0,
      viewingTodayAt: null,
      taskDueToday: false,
    },
  ],
});
const failed = (section: (typeof sectionNames)[number]) => ({
  ...healthy(),
  [section]: [],
  partial: true,
  sections: {
    ...healthy().sections,
    [section]: {
      status: 'unavailable',
      error: 'PRIVATE: never show raw server text',
    },
  },
});
const deferred = () => {
  let resolve!: (data: unknown) => void;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
let responses: unknown[];
let token: string;
const host: PropelHeroHost = {
  getToken: () => token,
  serverBaseUrl: 'http://synthetic.local',
  callPropelRoute,
  navigate: jest.fn(),
  notify: jest.fn(),
  searchParams: new URLSearchParams(),
};
const tree = (hostProps = host) => (
  <MemoryRouter
    future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
  >
    <MyDeskHero host={hostProps} />
  </MemoryRouter>
);
beforeEach(() => {
  localStorage.clear();
  token = 'synthetic-session-a';
  responses = [];
  mockCall.mockReset().mockImplementation(async (_path, body) => {
    const action = (body as { action: string }).action;
    if (action === 'rail') return (await responses.shift()) as never;
    if (action === 'board')
      return {
        ok: true,
        rows: [],
        nextCursor: null,
        partialFailures: [],
      } as never;
    return { ok: false, error: 'UNAVAILABLE' } as never;
  });
});
for (const width of [1440, 390]) {
  describe(`actual MyDeskHero rail at ${width}px`, () => {
    beforeEach(() => {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: width,
      });
    });
    it.each(sectionNames)(
      'shows %s unavailable, keeps healthy sections actionable, and retries the existing read',
      async (section) => {
        responses.push(failed(section), healthy());
        render(tree());
        const retry = await screen.findByRole('button', {
          name: `Retry ${titles[sectionNames.indexOf(section)]}`,
        });
        expect(screen.queryByText(/PRIVATE/)).not.toBeInTheDocument();
        const unrelated =
          section === 'priorityLeads' ? 'Synthetic viewing' : 'Synthetic lead';
        expect(screen.getByText(unrelated)).toBeVisible();
        if (section !== 'priorityLeads')
          expect(
            screen.getByRole('button', { name: 'Call Synthetic lead' }),
          ).toBeEnabled();
        if (section === 'unreadWa')
          expect(screen.queryByText(/all caught up/)).not.toBeInTheDocument();
        if (section === 'tasks')
          expect(
            screen.queryByText('No tasks due today.'),
          ).not.toBeInTheDocument();
        fireEvent.click(retry);
        expect(await screen.findByText('Synthetic task')).toBeVisible();
        expect(await screen.findByText('Synthetic chat')).toBeVisible();
        expect(
          screen.queryByRole('button', { name: /^Retry Today's tasks$/ }),
        ).not.toBeInTheDocument();
      },
    );
    it('retries a full request failure without exposing its raw error', async () => {
      responses.push(
        { ok: false, error: 'PRIVATE upstream failure' },
        healthy(),
      );
      render(tree());
      fireEvent.click(
        await screen.findByRole('button', { name: "Retry Today's tasks" }),
      );
      expect(await screen.findByText('Synthetic task')).toBeVisible();
      expect(screen.queryByText(/PRIVATE/)).not.toBeInTheDocument();
    });
    it('keeps valid empty results distinct from legacy unknown availability', async () => {
      const empty = {
        ...healthy(),
        tasks: [],
        viewings: [],
        unreadWa: [],
        priorityLeads: [],
      };
      responses.push(empty);
      const { unmount } = render(tree());
      expect(await screen.findByText("You're all caught up.")).toBeVisible();
      unmount();
      const { sections: _sections, partial: _partial, ...legacy } = empty;
      responses.push(legacy);
      render(tree());
      expect(
        (await screen.findAllByText(/Availability not reported/)).length,
      ).toBeGreaterThan(0);
      expect(
        screen.queryByText("You're all caught up."),
      ).not.toBeInTheDocument();
    });
    it('ignores an older request from the same scope after StrictMode starts a newer one', async () => {
      const old = deferred();
      const newer = deferred();
      responses.push(old.promise, newer.promise);
      render(<StrictMode>{tree()}</StrictMode>);
      await act(async () => {
        newer.resolve({
          ...healthy(),
          tasks: [{ ...healthy().tasks[0], title: 'Newest task' }],
        });
      });
      expect(await screen.findByText('Newest task')).toBeVisible();
      await act(async () => {
        old.resolve({ ok: false, error: 'Late failure' });
      });
      expect(screen.getByText('Newest task')).toBeVisible();
      expect(
        screen.queryByRole('button', { name: "Retry Today's tasks" }),
      ).not.toBeInTheDocument();
    });
    it('hides already-painted data while a new workspace is loading', async () => {
      const pending = deferred();
      responses.push(healthy(), pending.promise);
      const { rerender } = render(tree());
      expect(await screen.findByText('Synthetic task')).toBeVisible();
      rerender(
        tree({ ...host, serverBaseUrl: 'http://other-synthetic.local' }),
      );
      expect(screen.queryByText('Synthetic task')).not.toBeInTheDocument();
      await act(async () => {
        pending.resolve({ ...healthy(), tasks: [] });
      });
      expect(await screen.findByText('No tasks due today.')).toBeVisible();
    });
    it('clears old scope immediately and ignores its late response', async () => {
      const old = deferred();
      const current = deferred();
      responses.push(old.promise, current.promise);
      const { rerender } = render(tree());
      token = 'synthetic-session-b';
      rerender(tree({ ...host }));
      await act(async () => {
        current.resolve({
          ...healthy(),
          tasks: [{ ...healthy().tasks[0], title: 'Current scope task' }],
        });
      });
      expect(await screen.findByText('Current scope task')).toBeVisible();
      await act(async () => {
        old.resolve({
          ...healthy(),
          tasks: [{ ...healthy().tasks[0], title: 'Old scope task' }],
        });
      });
      expect(screen.queryByText('Old scope task')).not.toBeInTheDocument();
      expect(screen.getByText('Current scope task')).toBeVisible();
    });
  });
}

it('allows the committed request to settle when another scope render suspends and is abandoned', async () => {
  const pending = deferred();
  responses.push(pending.promise);
  const never = new Promise(() => undefined);
  const Suspend = ({ changed }: { changed: boolean }) => {
    if (changed) throw never;
    return null;
  };
  function TransitionHarness() {
    const [changed, setChanged] = useState(false);
    return (
      <>
        <button onClick={() => startTransition(() => setChanged(true))}>
          Speculate scope
        </button>
        <Suspense fallback={<div>Suspended</div>}>
          {tree({
            ...host,
            serverBaseUrl: changed
              ? 'http://speculative.local'
              : host.serverBaseUrl,
          })}
          <Suspend changed={changed} />
        </Suspense>
      </>
    );
  }
  render(<TransitionHarness />);
  fireEvent.click(screen.getByRole('button', { name: 'Speculate scope' }));
  await act(async () => {
    pending.resolve(healthy());
  });
  expect(await screen.findByText('Synthetic task')).toBeVisible();
  expect(screen.queryByText('Suspended')).not.toBeInTheDocument();
});

it('rejects a request whose session changed before another React render observes it', async () => {
  const pending = deferred();
  responses.push(pending.promise, healthy());
  const { rerender } = render(tree());
  token = 'synthetic-session-b';
  await act(async () => {
    pending.resolve({
      ...healthy(),
      tasks: [{ ...healthy().tasks[0], title: 'Old session task' }],
    });
  });
  expect(screen.queryByText('Old session task')).not.toBeInTheDocument();
  rerender(tree({ ...host }));
  expect(await screen.findByText('Synthetic task')).toBeVisible();
});
