import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ComponentProps } from 'react';

import { Composer } from '@/whatsapp-dock/components/Composer';

// Regression coverage for the founder-flagged bug: the composer used to clear
// the typed message the instant Send was clicked, before the send actually
// resolved — so a renewal failure / send failure looked exactly like success
// (input gone, no visible reason). The fix: only clear on a CONFIRMED
// success; on any failure, keep the typed text and show the honest error.

type ComposerProps = ComponentProps<typeof Composer>;

const baseProps: ComposerProps = {
  approvedTemplates: [],
  canAttach: true,
  conversationId: 'conversation-1',
  errorMessage: null,
  onSendFile: jest.fn(),
  onSendTemplate: jest.fn(),
  onSendText: jest.fn().mockResolvedValue(true),
  onSendVoiceNote: jest.fn(),
  sending: false,
  sessionWindowOpen: true,
  suggestedTemplate: null,
};

// No JSX prop spreading (repo lint rule) — merge overrides in plain JS, then
// list every prop explicitly on the element.
const renderComposer = (overrides: Partial<ComposerProps> = {}) => {
  const props: ComposerProps = { ...baseProps, ...overrides };
  return render(
    <Composer
      approvedTemplates={props.approvedTemplates}
      canAttach={props.canAttach}
      conversationId={props.conversationId}
      errorMessage={props.errorMessage}
      onSendFile={props.onSendFile}
      onSendTemplate={props.onSendTemplate}
      onSendText={props.onSendText}
      onSendVoiceNote={props.onSendVoiceNote}
      sending={props.sending}
      sessionWindowOpen={props.sessionWindowOpen}
      suggestedTemplate={props.suggestedTemplate}
    />,
  );
};

describe('Composer', () => {
  it('clears the typed text once the send is CONFIRMED successful', async () => {
    const onSendText = jest.fn().mockResolvedValue(true);

    renderComposer({ onSendText });

    const textarea = screen.getByPlaceholderText('Message…');
    fireEvent.change(textarea, { target: { value: 'Hello there' } });

    const sendButton = screen.getByRole('button', { name: 'Send' });
    fireEvent.click(sendButton);

    expect(onSendText).toHaveBeenCalledWith('Hello there');

    await waitFor(() => {
      expect(textarea).toHaveValue('');
    });
  });

  it('does NOT clear the typed text when the send fails — never fabricates success', async () => {
    const onSendText = jest.fn().mockResolvedValue(false);

    const { rerender } = renderComposer({ onSendText });

    const textarea = screen.getByPlaceholderText('Message…');
    fireEvent.change(textarea, { target: { value: 'This must survive' } });

    const sendButton = screen.getByRole('button', { name: 'Send' });
    // act(async) flushes submitText's full microtask chain (the await on
    // onSendText's resolved promise) before we assert — this is the exact
    // regression: the old code cleared synchronously and unconditionally,
    // before ever awaiting the outcome, so this flush would have "raced"
    // right past a bug that cleared too early.
    await act(async () => {
      fireEvent.click(sendButton);
    });

    expect(onSendText).toHaveBeenCalledWith('This must survive');
    expect(textarea).toHaveValue('This must survive');

    // The parent surfaces the honest error via the errorMessage prop once its
    // own state updates (simulated here by a rerender, mirroring
    // ConversationView setting sendError after applyOutcome resolves).
    rerender(
      <Composer
        approvedTemplates={baseProps.approvedTemplates}
        canAttach={baseProps.canAttach}
        conversationId={baseProps.conversationId}
        errorMessage="Could not reach WhatsApp. Try again."
        onSendFile={baseProps.onSendFile}
        onSendTemplate={baseProps.onSendTemplate}
        onSendText={onSendText}
        onSendVoiceNote={baseProps.onSendVoiceNote}
        sending={baseProps.sending}
        sessionWindowOpen={baseProps.sessionWindowOpen}
        suggestedTemplate={baseProps.suggestedTemplate}
      />,
    );

    expect(
      screen.getByText('Could not reach WhatsApp. Try again.'),
    ).toBeInTheDocument();
    expect(textarea).toHaveValue('This must survive');
  });

  it('does not clear the text or call onSendText for a whitespace-only message', () => {
    const onSendText = jest.fn().mockResolvedValue(true);

    renderComposer({ onSendText });

    const textarea = screen.getByPlaceholderText('Message…');
    fireEvent.change(textarea, { target: { value: '   ' } });

    // Whitespace-only text renders the mic button, not Send (see Composer's
    // text.trim().length === 0 branch) — confirm Send never even mounts here.
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
    expect(onSendText).not.toHaveBeenCalled();
  });
});
