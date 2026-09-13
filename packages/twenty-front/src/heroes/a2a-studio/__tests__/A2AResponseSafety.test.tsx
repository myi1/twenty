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
  const promise = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { promise, resolve };
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
      <output aria-label="document">{studio.draft?.a2aDocumentId ?? ''}</output>
      <output aria-label="dispatch">{studio.dispatchState}</output>
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
