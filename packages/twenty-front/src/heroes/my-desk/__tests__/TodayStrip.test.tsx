import { render, screen, within } from '@testing-library/react';

import { TodayStrip } from '../TodayStrip';
import type { DeskRailOk, DeskUnreadWaItem } from '../types';

const NOW_MS = Date.parse('2026-09-10T11:38:00.000Z');

const unread = (id: string, unreadCount: number): DeskUnreadWaItem => ({
  id,
  name: id,
  unreadCount,
  lastMessageAt: '2026-09-10T11:00:00.000Z',
  contactId: `${id}-contact`,
  laneObject: 'offplanOpportunity',
  recordId: `${id}-record`,
  personId: `${id}-person`,
  contactName: id,
  phoneE164: '+971501234567',
  hasWhatsApp: true,
});

const rail = (unreadWa: DeskUnreadWaItem[]): DeskRailOk => ({
  ok: true,
  tasks: [],
  viewings: [],
  unreadWa,
  priorityLeads: [],
});

const renderStrip = (unreadWa: DeskUnreadWaItem[]) =>
  render(
    <TodayStrip
      boardStatus="ready"
      rows={[]}
      railStatus="ready"
      rail={rail(unreadWa)}
      nowMs={NOW_MS}
      activeFilter={null}
      onToggleFilter={jest.fn()}
    />,
  );

const unreadTile = () => screen.getByText('Unread WhatsApp').closest('button') as HTMLElement;

describe('TodayStrip — Unread WhatsApp tile', () => {
  // Ayoub Merali's screenshot, 2026-09-10: the tile read "4 · conversations waiting
  // on a reply" while the rail beside it listed TWO conversations, holding 1 and 3
  // unread messages. The figure summed messages under a label that said conversations.
  it('counts conversations, not messages', () => {
    renderStrip([unread('Jawed Qureshi', 1), unread('Gaurav Singh', 3)]);

    const tile = unreadTile();
    expect(within(tile).getByText('2')).toBeInTheDocument();
    expect(within(tile).queryByText('4')).not.toBeInTheDocument();
    expect(within(tile).getByText('conversations waiting on a reply')).toBeInTheDocument();
  });

  it('reads in the singular for a lone conversation', () => {
    renderStrip([unread('Jawed Qureshi', 3)]);

    const tile = unreadTile();
    expect(within(tile).getByText('1')).toBeInTheDocument();
    expect(within(tile).getByText('conversation waiting on a reply')).toBeInTheDocument();
  });

  it('says nothing is waiting when every chat is read', () => {
    renderStrip([]);

    const tile = unreadTile();
    expect(within(tile).getByText('0')).toBeInTheDocument();
    expect(within(tile).getByText('all caught up')).toBeInTheDocument();
  });
});
