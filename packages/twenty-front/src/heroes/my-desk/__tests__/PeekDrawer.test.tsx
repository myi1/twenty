import { act, fireEvent, render, screen } from '@testing-library/react';

import type { PropelHeroHost } from '@/propel/runtime/heroHost';
import { fetchTimeline, fetchWaContext } from '../deskApi';
import { PeekDrawer } from '../PeekDrawer';
import type { DeskRow } from '../types';

jest.mock('../deskApi', () => ({
  assistCallNote: jest.fn(),
  assistNextAction: jest.fn(),
  assistWaDraft: jest.fn(),
  fetchTimeline: jest.fn(),
  fetchWaContext: jest.fn(),
  runDeskAction: jest.fn(),
  sendDeskWhatsApp: jest.fn(),
}));

const mockedFetchTimeline = jest.mocked(fetchTimeline);
const mockedFetchWaContext = jest.mocked(fetchWaContext);

const row: DeskRow = {
  id: 'lead:lead-a',
  laneObject: 'lead',
  recordId: 'lead-a',
  personId: 'person-a',
  phoneE164: '+971501234567',
  hasWhatsApp: true,
  name: 'Lead A',
  meta: 'Dubai · Web lead',
  stage: 'NEW',
  valueAed: null,
  nextAction: 'Review lead',
  nextActionTaskId: null,
  nextActionDueAt: null,
  nextActionSource: 'task',
  lastTouchAt: null,
  slaDeadline: null,
  snoozedUntil: null,
  unreadWa: 0,
  viewingTodayAt: null,
  taskDueToday: false,
};

const host: PropelHeroHost = {
  callPropelRoute: jest.fn(),
  getToken: jest.fn(),
  serverBaseUrl: 'http://localhost',
  navigate: jest.fn(),
  notify: jest.fn(),
  searchParams: new URLSearchParams(),
};

const renderDrawer = (onClose = jest.fn()) => {
  const view = render(
    <PeekDrawer
      row={row}
      mode="overview"
      host={host}
      onClose={onClose}
      onStartCall={jest.fn()}
      onRowPatch={jest.fn()}
      onMoveStage={jest.fn()}
    />,
  );

  return { ...view, onClose };
};

const settleDrawerLoads = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe('PeekDrawer dismissal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFetchTimeline.mockResolvedValue({
      ok: true,
      events: [],
      nextCursor: null,
      partialFailures: [],
    });
    mockedFetchWaContext.mockResolvedValue({
      ok: true,
      conversationId: null,
      withinWindow: false,
      lastInbound: null,
      templates: [],
    });
  });

  it('dismisses on Escape', async () => {
    const { onClose } = renderDrawer();
    await settleDrawerLoads();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dismisses when the scrim is clicked', async () => {
    const { onClose } = renderDrawer();
    await settleDrawerLoads();

    fireEvent.click(
      screen.getByRole('button', { name: 'Close record preview' }),
    );

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dismisses when the close button is clicked', async () => {
    const { onClose } = renderDrawer();
    await settleDrawerLoads();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('removes the Escape listener when the drawer unmounts', async () => {
    const { onClose, unmount } = renderDrawer();
    await settleDrawerLoads();
    unmount();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });
});
