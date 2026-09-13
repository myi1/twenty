import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useA2AStudio } from '@/propel/hooks/useA2AStudio';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';

jest.mock('@/propel/lib/callPropelRoute');
jest.mock('@/propel/lib/a2aCrm', () => ({
  createCounterpartyPerson: jest.fn(),
  linkCounterpartyToAgreement: jest.fn(async () => true),
  searchCounterpartyPeople: jest.fn(async () => []),
}));

const mockCall = callPropelRoute as jest.MockedFunction<typeof callPropelRoute>;
const deferred = () => {
  let resolve!: (value: unknown) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<unknown>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, reject, resolve };
};

const draft = (id: string) => ({
  kind: 'ok',
  ok: true,
  a2aDocumentId: id,
  documensoDocumentId: '19',
  ourRecipientToken: 'our-token',
  counterpartyRecipientToken: 'other-token',
  isRera: true,
});
const activated = {
  kind: 'ok',
  ok: true,
  status: 'OUT_FOR_SIGNATURE',
  counterpartySigningUrl: null,
  primaryChannel: 'email',
  distribution: [{ channel: 'email', ok: false, reason: 'safe' }],
  signingUrlVerified: false,
};

const Harness = ({
  opportunityId,
  memberId,
}: {
  opportunityId: string;
  memberId: string;
}) => {
  const studio = useA2AStudio(opportunityId, 'A', {}, memberId);
  return (
    <>
      <output aria-label="step">{studio.step}</output>
      <output aria-label="status">{studio.status}</output>
      <output aria-label="document">{studio.draft?.a2aDocumentId ?? ''}</output>
      <output aria-label="dispatch">{studio.dispatchState}</output>
      <output aria-label="creating">{String(studio.creating)}</output>
      <output aria-label="finalizing">{String(studio.finalizing)}</output>
      <output aria-label="message">
        {studio.sendMessage ?? studio.errorMessage ?? ''}
      </output>
      <button
        disabled={!studio.canCreateDraft}
        onClick={() => void studio.createDraft()}
      >
        Create
      </button>
      <button onClick={studio.onEmbedCompleted}>Finish our signature</button>
      <button
        disabled={!studio.canSend}
        onClick={() => void studio.send(['email'])}
      >
        Send
      </button>
      <button onClick={studio.reset}>Reset</button>
      <button onClick={() => void studio.refreshStatus()}>Check status</button>
    </>
  );
};

const makeRoute = (options: {
  documentId: string;
  create?: unknown;
  finalize?: unknown;
  send?: unknown | Promise<unknown>;
  dealState?: unknown | Promise<unknown>;
  status?: unknown | Promise<unknown>;
}) => {
  const calls: string[] = [];
  mockCall.mockImplementation(async (path) => {
    calls.push(path);
    if (path === '/a2a/deal-state')
      return (await (options.dealState ?? { agreement: null })) as never;
    if (path === '/a2a/create-draft')
      return (options.create ?? draft(options.documentId)) as never;
    if (path === '/a2a/finalize') return options.finalize as never;
    if (path === '/a2a/send') return (await options.send) as never;
    if (path === '/a2a/status') return (await options.status) as never;
    if (path === '/a2a/discard')
      return {
        kind: 'ok',
        ok: true,
        documensoDeleted: true,
        a2aVoided: true,
      } as never;
    return null;
  });
  return calls;
};

const createReadyDraft = async () => {
  const create = await screen.findByRole('button', { name: 'Create' });
  await waitFor(() => expect(create).toBeEnabled());
  fireEvent.click(create);
  await screen.findByText('signEmbed');
  fireEvent.click(screen.getByRole('button', { name: 'Finish our signature' }));
  await screen.findByText('send');
};

describe('A2A send attempt lifetime', () => {
  it('records pending synchronously, blocks an immediate duplicate, and does not discard on real unmount/remount', async () => {
    const pending = deferred();
    const calls = makeRoute({
      documentId: 'pending-doc',
      send: pending.promise,
    });
    const { unmount } = render(
      <Harness opportunityId="opp-pending" memberId="member-a" />,
    );
    await createReadyDraft();
    const send = screen.getByRole('button', { name: 'Send' });
    fireEvent.click(send);
    fireEvent.click(send);
    await screen.findByText('pending');
    expect(calls.filter((path) => path === '/a2a/send')).toHaveLength(1);
    unmount();
    expect(calls).not.toContain('/a2a/discard');

    render(<Harness opportunityId="opp-pending" memberId="member-a" />);
    await waitFor(() =>
      expect(screen.getByLabelText('dispatch')).toHaveTextContent(
        /pending|unknown/,
      ),
    );
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(calls).not.toContain('/a2a/discard');
    await act(async () => pending.resolve(null));
  });

  it.each([
    ['lost', null],
    ['malformed', { kind: 'ok' }],
    ['error', { error: 'fixed failure' }],
  ])(
    'keeps a %s acknowledgement unknown across reset, retry, and unmount',
    async (name, answer) => {
      const calls = makeRoute({ documentId: `${name}-doc`, send: answer });
      const view = render(
        <Harness opportunityId={`opp-${name}`} memberId="member-a" />,
      );
      await createReadyDraft();
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      await screen.findByText('unknown');
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
      expect(screen.getByLabelText('document')).toHaveTextContent(
        `${name}-doc`,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      expect(calls.filter((path) => path === '/a2a/send')).toHaveLength(1);
      view.unmount();
      expect(calls).not.toContain('/a2a/discard');
    },
  );

  it('keeps never-attempted cleanup and permits another attempt after a proved pre-dispatch refusal', async () => {
    const calls = makeRoute({
      documentId: 'never-doc',
      send: {
        error: 'The document service is not configured.',
        attempted: false,
      },
    });
    const view = render(
      <Harness opportunityId="opp-never" memberId="member-a" />,
    );
    await createReadyDraft();
    view.unmount();
    expect(calls.filter((path) => path === '/a2a/discard')).toHaveLength(1);

    const calls2 = makeRoute({
      documentId: 'known-refusal-doc',
      send: {
        error: 'The document service is not configured.',
        attempted: false,
      },
    });
    render(<Harness opportunityId="opp-known-refusal" memberId="member-a" />);
    await createReadyDraft();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(screen.getByLabelText('message')).toHaveTextContent(
        /not configured/i,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(calls2.filter((path) => path === '/a2a/send')).toHaveLength(2),
    );
  });
});

describe('A2A lookup, reconciliation, and stale responses', () => {
  it('does not let a late create result replace a document resumed after navigation', async () => {
    const pending = deferred();
    mockCall.mockImplementation(async (path, body) => {
      if (path === '/a2a/deal-state') {
        return (
          (body as { opportunityId: string }).opportunityId ===
          'opp-late-create-b'
            ? {
                agreement: {
                  a2aDocumentId: 'late-create-doc-b',
                  documensoDocumentId: '22',
                  status: 'SIGNED',
                },
              }
            : { agreement: null }
        ) as never;
      }
      if (path === '/a2a/create-draft') return (await pending.promise) as never;
      return null;
    });
    const view = render(
      <Harness
        opportunityId="opp-late-create-a"
        memberId="member-late-create"
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    view.rerender(
      <Harness
        opportunityId="opp-late-create-b"
        memberId="member-late-create"
      />,
    );
    await waitFor(() =>
      expect(screen.getByLabelText('document')).toHaveTextContent(
        'late-create-doc-b',
      ),
    );
    await act(async () => pending.resolve(draft('late-create-doc-a')));
    expect(screen.getByLabelText('document')).toHaveTextContent(
      'late-create-doc-b',
    );
    expect(screen.getByLabelText('step')).toHaveTextContent('done');
  });

  it('does not let a late finalize result move a resumed signed document back to send', async () => {
    const pending = deferred();
    mockCall.mockImplementation(async (path, body) => {
      if (path === '/a2a/deal-state') {
        return (
          (body as { opportunityId: string }).opportunityId ===
          'opp-late-finalize-b'
            ? {
                agreement: {
                  a2aDocumentId: 'late-finalize-doc-b',
                  documensoDocumentId: '22',
                  status: 'SIGNED',
                },
              }
            : { agreement: null }
        ) as never;
      }
      if (path === '/a2a/create-draft') {
        return {
          ...draft('late-finalize-doc-a'),
          isRera: false,
        } as never;
      }
      if (path === '/a2a/finalize') return (await pending.promise) as never;
      return null;
    });
    const view = render(
      <Harness
        opportunityId="opp-late-finalize-a"
        memberId="member-late-finalize"
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await screen.findByText('bakeJunior');
    view.rerender(
      <Harness
        opportunityId="opp-late-finalize-b"
        memberId="member-late-finalize"
      />,
    );
    await screen.findByText('done');
    await act(async () => pending.resolve({ kind: 'ok', baked: true }));
    expect(screen.getByLabelText('step')).toHaveTextContent('done');
    expect(screen.getByLabelText('document')).toHaveTextContent(
      'late-finalize-doc-b',
    );
  });

  it('keeps a newer same-scope create pending when an invalidated create rejects and finalizes', async () => {
    const first = deferred();
    const second = deferred();
    let creates = 0;
    mockCall.mockImplementation(async (path) => {
      if (path === '/a2a/deal-state') return { agreement: null } as never;
      if (path === '/a2a/create-draft') {
        creates += 1;
        return (await (creates === 1
          ? first.promise
          : second.promise)) as never;
      }
      return null;
    });
    render(
      <Harness
        opportunityId="opp-replace-create"
        memberId="member-replace-create"
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByLabelText('creating')).toHaveTextContent('true');
    await act(async () => first.reject(new Error('stale create failure')));
    expect(screen.getByLabelText('creating')).toHaveTextContent('true');
    expect(screen.getByLabelText('message')).not.toHaveTextContent(
      /stale create failure/i,
    );
    await act(async () => second.resolve(draft('replacement-create-doc')));
    expect(screen.getByLabelText('document')).toHaveTextContent(
      'replacement-create-doc',
    );
  });

  it('ignores an invalidated same-scope create success without discarding it or clearing newer work', async () => {
    const first = deferred();
    const second = deferred();
    const calls: string[] = [];
    let creates = 0;
    mockCall.mockImplementation(async (path) => {
      calls.push(path);
      if (path === '/a2a/deal-state') return { agreement: null } as never;
      if (path === '/a2a/create-draft') {
        creates += 1;
        return (await (creates === 1
          ? first.promise
          : second.promise)) as never;
      }
      return null;
    });
    render(
      <Harness
        opportunityId="opp-replace-success"
        memberId="member-replace-success"
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await act(async () => first.resolve(draft('invalidated-create-doc')));
    expect(screen.getByLabelText('document')).not.toHaveTextContent(
      'invalidated-create-doc',
    );
    expect(screen.getByLabelText('creating')).toHaveTextContent('true');
    expect(calls).not.toContain('/a2a/discard');
    await act(async () => second.resolve(draft('current-create-doc')));
    expect(screen.getByLabelText('document')).toHaveTextContent(
      'current-create-doc',
    );
  });

  it.each([
    ['success', { kind: 'ok', baked: true }, 'send'],
    ['uncertainty', { error: 'uncertain finalize', attempted: true }, 'error'],
  ])(
    'keeps the exact finalize pending across same-scope reset until %s settles',
    async (name, result, expectedStep) => {
      const pending = deferred();
      const id = `same-scope-finalize-${name}`;
      const calls = makeRoute({
        documentId: id,
        create: { ...draft(id), isRera: false },
        finalize: pending.promise,
      });
      const view = render(
        <Harness
          opportunityId={`opp-${id}`}
          memberId="member-same-scope-finalize"
        />,
      );
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      await screen.findByText('bakeJunior');
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
      expect(screen.getByLabelText('document')).toHaveTextContent(id);
      expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
      expect(screen.getByLabelText('finalizing')).toHaveTextContent('true');
      await act(async () => pending.resolve(result));
      expect(screen.getByLabelText('step')).toHaveTextContent(expectedStep);
      expect(screen.getByLabelText('document')).toHaveTextContent(id);
      view.unmount();
      if (name === 'success') {
        expect(calls.filter((path) => path === '/a2a/discard')).toHaveLength(1);
      } else {
        expect(calls).not.toContain('/a2a/discard');
      }
    },
  );

  it.each([
    ['success', draft('unmounted-create-doc')],
    ['error', { error: 'late unmounted create failure', attempted: true }],
  ])('ignores a late create %s after unmount', async (_name, result) => {
    const pending = deferred();
    const calls: string[] = [];
    mockCall.mockImplementation(async (path) => {
      calls.push(path);
      if (path === '/a2a/deal-state') return { agreement: null } as never;
      if (path === '/a2a/create-draft') return (await pending.promise) as never;
      return null;
    });
    const view = render(
      <Harness
        opportunityId="opp-unmounted-create"
        memberId="member-unmounted-create"
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    view.unmount();
    await act(async () => pending.resolve(result));
    expect(calls).not.toContain('/a2a/discard');
  });

  it('does not discard a draft while finalize is unconfirmed across unmount', async () => {
    const pending = deferred();
    const calls = makeRoute({
      documentId: 'unmounted-finalize-doc',
      create: {
        ...draft('unmounted-finalize-doc'),
        isRera: false,
      },
      finalize: pending.promise,
    });
    const view = render(
      <Harness
        opportunityId="opp-unmounted-finalize"
        memberId="member-unmounted-finalize"
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await screen.findByText('bakeJunior');
    view.unmount();
    expect(calls).not.toContain('/a2a/discard');
    await act(async () => pending.resolve({ kind: 'ok', baked: true }));
    expect(calls).not.toContain('/a2a/discard');
  });

  it.each([
    [
      'returned uncertainty',
      {
        error: 'The document service response is unconfirmed.',
        attempted: true,
        uncertain: true,
      },
    ],
    ['null response', null],
    ['malformed response', { kind: 'ok' }],
  ])(
    'preserves a known draft after finalize %s across reset and unmount',
    async (name, finalize) => {
      const id = `finalize-uncertain-${name}`;
      const calls = makeRoute({
        documentId: id,
        create: { ...draft(id), isRera: false },
        finalize,
      });
      const view = render(
        <Harness
          opportunityId={`opp-${id}`}
          memberId="member-finalize-uncertain"
        />,
      );
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      await screen.findByText('error');
      expect(screen.getByLabelText('message')).toHaveTextContent(
        /not confirmed|unconfirmed|unknown/i,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
      expect(screen.getByLabelText('document')).toHaveTextContent(id);
      expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
      view.unmount();
      expect(calls).not.toContain('/a2a/discard');
    },
  );

  it('preserves a known draft when finalize throws', async () => {
    const id = 'finalize-uncertain-thrown';
    const calls: string[] = [];
    mockCall.mockImplementation(async (path) => {
      calls.push(path);
      if (path === '/a2a/deal-state') return { agreement: null } as never;
      if (path === '/a2a/create-draft') {
        return { ...draft(id), isRera: false } as never;
      }
      if (path === '/a2a/finalize') throw new Error('lost finalize response');
      return null;
    });
    const view = render(
      <Harness
        opportunityId="opp-finalize-uncertain-thrown"
        memberId="member-finalize-uncertain-thrown"
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await screen.findByText('error');
    expect(screen.getByLabelText('message')).toHaveTextContent(
      /not confirmed|unknown/i,
    );
    view.unmount();
    expect(calls).not.toContain('/a2a/discard');
  });

  it('restores the exact known draft and finalize uncertainty after remount', async () => {
    const id = 'finalize-uncertain-remount';
    const calls = makeRoute({
      documentId: id,
      create: { ...draft(id), isRera: false },
      finalize: null,
    });
    const first = render(
      <Harness
        opportunityId="opp-finalize-uncertain-remount"
        memberId="member-finalize-uncertain-remount"
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await screen.findByText('error');
    first.unmount();
    expect(calls).not.toContain('/a2a/discard');

    render(
      <Harness
        opportunityId="opp-finalize-uncertain-remount"
        memberId="member-finalize-uncertain-remount"
      />,
    );
    await waitFor(() =>
      expect(screen.getByLabelText('document')).toHaveTextContent(id),
    );
    expect(screen.getByLabelText('step')).toHaveTextContent('error');
    expect(screen.getByLabelText('message')).toHaveTextContent(
      /not confirmed|unknown/i,
    );
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('preserves a pending finalize and its exact draft across unmount/remount', async () => {
    const pending = deferred();
    const id = 'finalize-pending-remount';
    const calls = makeRoute({
      documentId: id,
      create: { ...draft(id), isRera: false },
      finalize: pending.promise,
    });
    const first = render(
      <Harness
        opportunityId="opp-finalize-pending-remount"
        memberId="member-finalize-pending-remount"
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await screen.findByText('bakeJunior');
    first.unmount();
    expect(calls).not.toContain('/a2a/discard');

    render(
      <Harness
        opportunityId="opp-finalize-pending-remount"
        memberId="member-finalize-pending-remount"
      />,
    );
    await waitFor(() =>
      expect(screen.getByLabelText('document')).toHaveTextContent(id),
    );
    expect(screen.getByLabelText('step')).toHaveTextContent('error');
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    await act(async () => pending.resolve({ kind: 'ok', baked: true }));
    expect(screen.getByLabelText('step')).toHaveTextContent('error');
    expect(calls).not.toContain('/a2a/discard');
  });

  it('does not treat a newer SIGNED status as proof of finalize outcome', async () => {
    const id = 'finalize-unknown-status';
    const calls = makeRoute({
      documentId: id,
      create: { ...draft(id), isRera: false },
      finalize: null,
      status: {
        status: 'SIGNED',
        signedPdfUrl: 'https://files.example/finalize-unknown.pdf',
      },
    });
    const view = render(
      <Harness
        opportunityId="opp-finalize-unknown-status"
        memberId="member-finalize-unknown-status"
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await screen.findByText('error');
    fireEvent.click(screen.getByRole('button', { name: 'Check status' }));
    await screen.findByText('SIGNED');
    expect(screen.getByLabelText('step')).toHaveTextContent('error');
    expect(screen.getByLabelText('message')).toHaveTextContent(
      /not confirmed/i,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByLabelText('document')).toHaveTextContent(id);
    view.unmount();
    expect(calls).not.toContain('/a2a/discard');
  });

  it.each([
    [
      'proved pre-dispatch refusal',
      { error: 'The document service is not configured.', attempted: false },
      'error',
    ],
    ['confirmed bake', { kind: 'ok', baked: true }, 'send'],
    [
      'confirmed embed signing',
      { kind: 'ok', baked: false, reason: 'signs-in-embed' },
      'signEmbed',
    ],
  ])(
    'retains never-sent cleanup after finalize %s',
    async (name, finalize, expectedStep) => {
      const id = `finalize-cleanup-${name}`;
      const calls = makeRoute({
        documentId: id,
        create: { ...draft(id), isRera: false },
        finalize,
      });
      const view = render(
        <Harness
          opportunityId={`opp-${id}`}
          memberId="member-finalize-cleanup"
        />,
      );
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      await screen.findByText(expectedStep);
      view.unmount();
      expect(calls.filter((path) => path === '/a2a/discard')).toHaveLength(1);
    },
  );

  it('does not mistake the legitimate signs-in-embed finalize result for confirmed baking', async () => {
    makeRoute({
      documentId: 'embed-finalize-doc',
      create: {
        ...draft('embed-finalize-doc'),
        isRera: false,
        ourRecipientToken: 'our-token',
      },
      finalize: { kind: 'ok', baked: false, reason: 'signs-in-embed' },
    });
    render(<Harness opportunityId="opp-finalize-branch" memberId="member-a" />);
    const create = await screen.findByRole('button', { name: 'Create' });
    await waitFor(() => expect(create).toBeEnabled());
    fireEvent.click(create);
    await screen.findByText('signEmbed');
    expect(screen.getByLabelText('step')).not.toHaveTextContent('send');
  });

  it('holds creation while lookup is pending, unavailable, or reports an unresolved draft', async () => {
    const pending = deferred();
    makeRoute({ documentId: 'unused', dealState: pending.promise });
    const pendingView = render(
      <Harness opportunityId="opp-lookup-pending" memberId="member-a" />,
    );
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    await act(async () => pending.resolve(null));
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    pendingView.unmount();

    makeRoute({
      documentId: 'unused-2',
      dealState: {
        agreement: {
          a2aDocumentId: 'existing-draft',
          documensoDocumentId: '20',
          status: 'DRAFT',
        },
      },
    });
    render(<Harness opportunityId="opp-existing" memberId="member-a" />);
    await screen.findByText(/prepare|send/);
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('does not let an old send settlement overwrite a newer opportunity', async () => {
    const pending = deferred();
    const calls: string[] = [];
    mockCall.mockImplementation(async (path, body) => {
      calls.push(path);
      const id = (body as { opportunityId?: string }).opportunityId;
      if (path === '/a2a/deal-state') return { agreement: null } as never;
      if (path === '/a2a/create-draft')
        return draft(id === 'opp-new' ? 'new-doc' : 'old-doc') as never;
      if (path === '/a2a/send') return pending.promise as never;
      return null;
    });
    const { rerender } = render(
      <Harness opportunityId="opp-old" memberId="member-a" />,
    );
    await createReadyDraft();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    rerender(<Harness opportunityId="opp-new" memberId="member-a" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await screen.findByText('new-doc');
    await act(async () => pending.resolve(activated));
    expect(screen.getByLabelText('document')).toHaveTextContent('new-doc');
    expect(screen.getByLabelText('dispatch')).toHaveTextContent('never');
  });

  it('reconciles activation without claiming recipient delivery, and a DRAFT read does not clear uncertainty', async () => {
    let status: unknown = { status: 'DRAFT' };
    const calls = makeRoute({
      documentId: 'uncertain-doc',
      send: null,
      get status() {
        return status;
      },
    });
    render(<Harness opportunityId="opp-reconcile" memberId="member-a" />);
    await createReadyDraft();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('unknown');
    fireEvent.click(screen.getByRole('button', { name: 'Check status' }));
    await waitFor(() =>
      expect(calls.filter((path) => path === '/a2a/status')).toHaveLength(1),
    );
    expect(screen.getByLabelText('dispatch')).toHaveTextContent('unknown');

    status = { status: 'OUT_FOR_SIGNATURE', counterpartySigningUrl: null };
    fireEvent.click(screen.getByRole('button', { name: 'Check status' }));
    await screen.findByText('activated');
    expect(screen.getByLabelText('message')).toHaveTextContent(
      /activation.*confirmed/i,
    );
    expect(screen.getByLabelText('message')).not.toHaveTextContent(
      /delivered|sent to/i,
    );
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('does not let a late lost send acknowledgement erase newer activation evidence', async () => {
    const pending = deferred();
    makeRoute({
      documentId: 'reconciled-doc',
      send: pending.promise,
      status: { status: 'OUT_FOR_SIGNATURE', counterpartySigningUrl: null },
    });
    render(<Harness opportunityId="opp-newer-evidence" memberId="member-a" />);
    await createReadyDraft();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('pending');
    fireEvent.click(screen.getByRole('button', { name: 'Check status' }));
    await screen.findByText('activated');
    await act(async () => pending.resolve(null));
    expect(screen.getByLabelText('dispatch')).toHaveTextContent('activated');
    expect(screen.getByLabelText('message')).toHaveTextContent(
      /activation.*confirmed/i,
    );
  });

  it('does not let an older status read replace a newer status result', async () => {
    const first = deferred();
    let reads = 0;
    mockCall.mockImplementation(async (path) => {
      if (path === '/a2a/deal-state') return { agreement: null } as never;
      if (path === '/a2a/create-draft')
        return draft('ordered-status-doc') as never;
      if (path === '/a2a/status') {
        reads += 1;
        return (
          reads === 1
            ? await first.promise
            : {
                status: 'SIGNED',
                signedPdfUrl: 'https://files.example/newer.pdf',
              }
        ) as never;
      }
      return null;
    });
    render(
      <Harness
        opportunityId="opp-ordered-status"
        memberId="member-ordered-status"
      />,
    );
    await createReadyDraft();
    fireEvent.click(screen.getByRole('button', { name: 'Check status' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check status' }));
    await screen.findByText('SIGNED');
    await act(async () => first.resolve({ status: 'DRAFT' }));
    expect(screen.getByLabelText('status')).toHaveTextContent('SIGNED');
    expect(screen.getByLabelText('step')).toHaveTextContent('done');
  });

  it('does not let a successful send acknowledgement downgrade a newer SIGNED observation', async () => {
    const pending = deferred();
    makeRoute({
      documentId: 'signed-during-send-doc',
      send: pending.promise,
      status: {
        status: 'SIGNED',
        signedPdfUrl: 'https://files.example/signed-during-send.pdf',
      },
    });
    render(
      <Harness
        opportunityId="opp-signed-during-send"
        memberId="member-signed-during-send"
      />,
    );
    await createReadyDraft();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('pending');
    fireEvent.click(screen.getByRole('button', { name: 'Check status' }));
    await screen.findByText('SIGNED');
    await act(async () => pending.resolve(activated));
    expect(screen.getByLabelText('status')).toHaveTextContent('SIGNED');
    expect(screen.getByLabelText('step')).toHaveTextContent('done');
  });
});

it.each([
  ['missing agreement', {}],
  ['undefined body', undefined],
  ['array body', []],
  ['primitive body', 'unrelated'],
  ['malformed agreement', { agreement: {} }],
  ['malformed prefill', { agreement: null, prefill: 'unrelated' }],
])('holds create for a %s lookup result', async (name, response) => {
  mockCall.mockResolvedValueOnce(response as never);
  render(
    <Harness
      opportunityId={`opp-malformed-lookup-${name}`}
      memberId="member-malformed-lookup"
    />,
  );
  await act(async () => undefined);
  expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
});

it('enables create for an explicit valid empty agreement lookup', async () => {
  mockCall.mockResolvedValueOnce({ agreement: null } as never);
  render(
    <Harness
      opportunityId="opp-explicit-empty"
      memberId="member-explicit-empty"
    />,
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled(),
  );
});

it('never says a signed status proves both recipients received the PDF', async () => {
  makeRoute({
    documentId: 'signed-doc',
    dealState: {
      agreement: {
        a2aDocumentId: 'signed-doc',
        documensoDocumentId: '21',
        status: 'SIGNED',
        signedPdfUrl: 'https://files.example/signed.pdf',
      },
    },
  });
  render(<Harness opportunityId="opp-signed" memberId="member-a" />);
  await screen.findByText('done');
  expect(document.body.textContent).not.toMatch(
    /both parties.*have|delivered/i,
  );
});
