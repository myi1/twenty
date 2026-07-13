import { StrictMode } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

import { BriefingCard } from '../BriefingCard';
import { assistBriefing, writeBriefingDisposition } from '../deskApi';

jest.mock('../deskApi');

const brief = jest.mocked(assistBriefing);
const write = jest.mocked(writeBriefingDisposition);

const A = {
  id: 'brief:v1:lead:none:11111111-1111-4111-8111-111111111111:0123456789abcdef',
  kind: 'lead' as const,
  line: 'Follow up with Ahmed.',
};
const B = {
  id: 'brief:v1:whatsapp:none:22222222-2222-4222-8222-222222222222:fedcba9876543210',
  kind: 'whatsapp' as const,
  line: 'Reply to Sara.',
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
};

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('renders an accessible section with visible circular controls for each task and no whole-card dismiss', async () => {
  brief.mockResolvedValue({
    ok: true,
    items: [A, B],
    allCaughtUp: false,
  });

  render(<BriefingCard />);

  const section = await screen.findByRole('region', { name: 'Your day' });
  const dismissA = await screen.findByRole('button', {
    name: `Dismiss ${A.line}`,
  });
  const snoozeB = screen.getByRole('button', { name: `Snooze ${B.line}` });
  expect(section).toBeVisible();
  expect(dismissA).toBeVisible();
  expect(snoozeB).toBeVisible();
  expect(dismissA).toHaveStyle({
    width: '28px',
    height: '28px',
    boxSizing: 'border-box',
  });
  expect(snoozeB).toHaveStyle({ borderRadius: '50%' });
  expect(
    screen.queryByRole('button', { name: 'Dismiss the briefing' }),
  ).not.toBeInTheDocument();
});

it('removes only the chosen item optimistically, then refetches for backfill after the mutation', async () => {
  const mutation = deferred<{ ok: true }>();
  brief
    .mockResolvedValueOnce({
      ok: true,
      items: [A, B],
      allCaughtUp: false,
    })
    .mockResolvedValueOnce({
      ok: true,
      items: [B],
      allCaughtUp: false,
    });
  write.mockReturnValue(mutation.promise);

  render(<BriefingCard />);
  fireEvent.click(
    await screen.findByRole('button', { name: `Dismiss ${A.line}` }),
  );

  expect(screen.queryByText(A.line)).not.toBeInTheDocument();
  expect(screen.getByText(B.line)).toBeVisible();
  expect(write).toHaveBeenCalledWith(A.id, 'dismissed', undefined);
  expect(brief).toHaveBeenCalledTimes(1);

  mutation.resolve({ ok: true });
  await waitFor(() => expect(brief).toHaveBeenCalledTimes(2));
});

it('restores the exact item order and reports a failed write', async () => {
  brief.mockResolvedValue({
    ok: true,
    items: [A, B],
    allCaughtUp: false,
  });
  write.mockResolvedValue({ ok: false, error: 'WRITE_FAILED' });

  render(<BriefingCard />);
  fireEvent.click(
    await screen.findByRole('button', { name: `Dismiss ${A.line}` }),
  );

  expect(await screen.findByText(A.line)).toBeVisible();
  expect(screen.getAllByText(/Follow up with Ahmed|Reply to Sara/)).toEqual([
    screen.getByText(A.line),
    screen.getByText(B.line),
  ]);
  expect(screen.getByRole('alert')).toHaveTextContent(
    "That didn't save. Try again.",
  );
  expect(brief).toHaveBeenCalledTimes(1);
});

it.each([
  ['Later today', 4, '2026-07-13T14:00:00.000Z'],
  ['Tomorrow', 24, '2026-07-14T10:00:00.000Z'],
  ['Next week', 168, '2026-07-20T10:00:00.000Z'],
] as const)('sends %s as %i hours', async (label, _hours, expectedUntil) => {
  jest
    .spyOn(Date, 'now')
    .mockReturnValue(Date.parse('2026-07-13T10:00:00.000Z'));
  brief
    .mockResolvedValueOnce({
      ok: true,
      items: [A],
      allCaughtUp: false,
    })
    .mockResolvedValueOnce({ ok: true, items: [], allCaughtUp: true });
  write.mockResolvedValue({ ok: true });

  render(<BriefingCard />);
  fireEvent.click(
    await screen.findByRole('button', { name: `Snooze ${A.line}` }),
  );
  fireEvent.click(screen.getByRole('menuitem', { name: label }));

  await waitFor(() =>
    expect(write).toHaveBeenCalledWith(A.id, 'snoozed', expectedUntil),
  );
});

it('exposes menu state, focuses the first option, supports keyboard navigation, and restores trigger focus on Escape', async () => {
  brief.mockResolvedValue({
    ok: true,
    items: [A],
    allCaughtUp: false,
  });
  const trigger = await render(<BriefingCard />).findByRole('button', {
    name: `Snooze ${A.line}`,
  });

  expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(trigger);

  const menu = screen.getByRole('menu', { name: `Snooze ${A.line}` });
  const options = screen.getAllByRole('menuitem');
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await waitFor(() => expect(options[0]).toHaveFocus());

  fireEvent.keyDown(menu, { key: 'ArrowDown' });
  expect(options[1]).toHaveFocus();
  fireEvent.keyDown(menu, { key: 'End' });
  expect(options[2]).toHaveFocus();
  fireEvent.keyDown(menu, { key: 'Home' });
  expect(options[0]).toHaveFocus();
  fireEvent.keyDown(menu, { key: 'ArrowUp' });
  expect(options[2]).toHaveFocus();
  fireEvent.keyDown(window, { key: 'Escape' });

  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(trigger).toHaveFocus();
});

it('closes the snooze menu on an outside click', async () => {
  brief.mockResolvedValue({
    ok: true,
    items: [A],
    allCaughtUp: false,
  });
  render(<BriefingCard />);
  const trigger = await screen.findByRole('button', {
    name: `Snooze ${A.line}`,
  });

  fireEvent.click(trigger);
  expect(screen.getByRole('menu')).toBeVisible();
  fireEvent.mouseDown(document.body);

  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

it('normalizes a successful empty item array to all caught up without controls', async () => {
  brief.mockResolvedValue({ ok: true, items: [], allCaughtUp: false });

  render(<BriefingCard />);

  expect(
    await screen.findByText(
      "You're all caught up — nothing needs you right now.",
    ),
  ).toBeVisible();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('renders nonempty validated items even when the server says all caught up', async () => {
  brief.mockResolvedValue({ ok: true, items: [A], allCaughtUp: true });

  render(<BriefingCard />);

  expect(await screen.findByText(A.line)).toBeVisible();
  expect(
    screen.getByRole('button', { name: `Dismiss ${A.line}` }),
  ).toBeVisible();
  expect(
    screen.queryByText("You're all caught up — nothing needs you right now."),
  ).not.toBeInTheDocument();
});

it.each([
  { ok: true, lines: [A.line] },
  {
    ok: true,
    items: [{ id: '', kind: 'other', line: '' }],
    allCaughtUp: false,
  },
])(
  'hides safely for a malformed successful initial response',
  async (response) => {
    brief.mockResolvedValue(response as never);
    const { container } = render(<BriefingCard />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  },
);

it('retains the optimistic sibling state when backfill is malformed', async () => {
  brief
    .mockResolvedValueOnce({
      ok: true,
      items: [A, B],
      allCaughtUp: false,
    })
    .mockResolvedValueOnce({ ok: true, lines: [A.line] } as never);
  write.mockResolvedValue({ ok: true });

  render(<BriefingCard />);
  fireEvent.click(
    await screen.findByRole('button', { name: `Dismiss ${A.line}` }),
  );

  await waitFor(() => expect(brief).toHaveBeenCalledTimes(2));
  expect(screen.queryByText(A.line)).not.toBeInTheDocument();
  expect(screen.getByText(B.line)).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('does not refetch after an in-flight write resolves post-unmount', async () => {
  const mutation = deferred<{ ok: true }>();
  brief.mockResolvedValue({
    ok: true,
    items: [A],
    allCaughtUp: false,
  });
  write.mockReturnValue(mutation.promise);
  const { unmount } = render(<BriefingCard />);

  fireEvent.click(
    await screen.findByRole('button', { name: `Dismiss ${A.line}` }),
  );
  unmount();
  await act(async () => mutation.resolve({ ok: true }));

  expect(brief).toHaveBeenCalledTimes(1);
});

it('ignores an older StrictMode load after a newer load and disposition backfill', async () => {
  const firstInitial = deferred<{
    ok: true;
    items: Array<typeof A>;
    allCaughtUp: false;
  }>();
  const secondInitial = deferred<{
    ok: true;
    items: Array<typeof A | typeof B>;
    allCaughtUp: false;
  }>();
  const backfill = deferred<{
    ok: true;
    items: Array<typeof B>;
    allCaughtUp: false;
  }>();
  brief
    .mockReturnValueOnce(firstInitial.promise)
    .mockReturnValueOnce(secondInitial.promise)
    .mockReturnValueOnce(backfill.promise);
  write.mockResolvedValue({ ok: true });

  render(
    <StrictMode>
      <BriefingCard />
    </StrictMode>,
  );
  await waitFor(() => expect(brief).toHaveBeenCalledTimes(2));

  await act(async () =>
    secondInitial.resolve({
      ok: true,
      items: [A, B],
      allCaughtUp: false,
    }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: `Dismiss ${A.line}` }),
  );
  await waitFor(() => expect(brief).toHaveBeenCalledTimes(3));
  await act(async () =>
    backfill.resolve({ ok: true, items: [B], allCaughtUp: false }),
  );
  expect(screen.queryByText(A.line)).not.toBeInTheDocument();
  expect(screen.getByText(B.line)).toBeVisible();

  await act(async () =>
    firstInitial.resolve({ ok: true, items: [A], allCaughtUp: false }),
  );
  expect(screen.queryByText(A.line)).not.toBeInTheDocument();
  expect(screen.getByText(B.line)).toBeVisible();
});
