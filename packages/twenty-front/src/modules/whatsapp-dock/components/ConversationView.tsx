import styled from '@emotion/styled';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  applyOlderThreadPage,
  beginOlderThreadPageLoad,
  createThreadPageState,
  failOlderThreadPageLoad,
  isCurrentOlderThreadPageRequest,
  mergeLiveThreadPage,
  type InboxThreadPageState,
} from '@/propel/lib/inboxThreadPagination';
import { dockColor } from '@/ui/theme/dockColorTokens';
import { subscribeOwnTyping } from '@/whatsapp-dock/utils/waTypingBroadcast';
import {
  fetchWaThread,
  outboundKindFromFile,
  sendWaMedia,
  sendWaTemplate,
  sendWaText,
  uploadWaMedia,
  type WaSendOutcome,
  type WaTarget,
  type WaThread,
} from '@/whatsapp-dock/utils/whatsAppComposeBridge';

import { Composer } from './Composer';
import { MessageBubble } from './MessageBubble';

const StyledWrap = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
`;

const StyledHeader = styled.div`
  align-items: center;
  border-bottom: 1px solid ${dockColor.borderLight};
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  padding: 8px 10px;
`;

const StyledBack = styled.button`
  background: transparent;
  border: 0;
  color: ${dockColor.textSecondary};
  cursor: pointer;
  font-size: 16px;
  padding: 2px 4px;

  &:hover {
    color: ${dockColor.textPrimary};
  }
`;

const StyledAvatar = styled.div`
  align-items: center;
  background: ${dockColor.outboundBubbleBg};
  border-radius: ${dockColor.radiusPill};
  color: ${dockColor.accentGreenStrong};
  display: flex;
  flex-shrink: 0;
  font: 600 13px/1 ${dockColor.fontFamily};
  height: 30px;
  justify-content: center;
  width: 30px;
`;

const StyledHeaderText = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
`;

const StyledName = styled.div`
  color: ${dockColor.textPrimary};
  font: 600 13px/1.2 ${dockColor.fontFamily};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledWindowState = styled.div<{ tone: 'open' | 'closed' }>`
  color: ${({ tone }) => (tone === 'open' ? dockColor.accentGreenStrong : dockColor.textTertiary)};
  font-size: 11px;
`;

const StyledTypingHint = styled.div`
  color: ${dockColor.textTertiary};
  font-size: 11px;
  font-style: italic;
  padding: 0 12px 4px;
`;

const StyledMessages = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  padding: 12px;
`;

const StyledEmpty = styled.div`
  color: ${dockColor.textTertiary};
  font-size: 12px;
  margin: auto;
  padding: 20px;
  text-align: center;
`;

const StyledLoadOlder = styled.button`
  align-self: center;
  background: transparent;
  border: 0;
  color: ${dockColor.accentGreenStrong};
  cursor: pointer;
  font: 600 12px/1.2 ${dockColor.fontFamily};
  padding: 6px 8px;

  &:disabled {
    color: ${dockColor.textTertiary};
    cursor: default;
  }
`;

const StyledLoadError = styled.div`
  color: ${dockColor.textTertiary};
  font-size: 11px;
  text-align: center;
`;

const initial = (name: string): string => (name.trim()[0] ?? '?').toUpperCase();

const hoursLeftLabel = (endsAtMs: number | null): string => {
  if (endsAtMs === null) {
    return '';
  }
  const msLeft = endsAtMs - Date.now();
  if (msLeft <= 0) {
    return '0h left';
  }
  const hours = Math.round(msLeft / (60 * 60 * 1000));
  return hours < 1 ? '<1h left' : `${hours}h left`;
};

type ConversationViewProps = {
  target: WaTarget;
  onBack: () => void;
  onTargetUpdate: (updated: WaTarget) => void;
};

export const ConversationView = ({ target, onBack, onTargetUpdate }: ConversationViewProps) => {
  const [thread, setThread] = useState<WaThread | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isOwnTyping, setIsOwnTyping] = useState(false);
  const [olderThreadPage, setOlderThreadPage] = useState<
    InboxThreadPageState<WaThread['messages'][number]>
  >(() => createThreadPageState<WaThread['messages'][number]>([]));
  // A windowClosed outcome from a SEND can be more current than the thread we
  // loaded a moment ago (the window can lapse mid-session) — this override
  // forces the template chooser immediately rather than waiting on a refetch.
  const [forcedClosed, setForcedClosed] = useState<{
    suggestedTemplate: WaThread['suggestedTemplate'];
    message: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const activeConversationKeyRef = useRef(target.conversationId ?? '');
  activeConversationKeyRef.current = target.conversationId ?? '';
  const olderThreadRequestSeqRef = useRef(0);
  const olderThreadPageRef = useRef<
    InboxThreadPageState<WaThread['messages'][number]>
  >(createThreadPageState<WaThread['messages'][number]>([]));
  const pendingScrollRestoreRef = useRef<{ height: number; top: number } | null>(null);
  const replaceOlderThreadPage = useCallback(
    (next: InboxThreadPageState<WaThread['messages'][number]>) => {
      olderThreadPageRef.current = next;
      setOlderThreadPage(next);
    },
    [],
  );

  const loadThread = async (conversationId: string) => {
    setLoading(true);
    const result = await fetchWaThread(conversationId);
    if (activeConversationKeyRef.current !== conversationId) return;
    setThread((previous) =>
      result.ok && previous
        ? { ...result, messages: mergeLiveThreadPage(previous.messages, result.messages) }
        : result,
    );
    if (result.ok && olderThreadPageRef.current.messages.length === 0) {
      replaceOlderThreadPage(
        createThreadPageState(result.messages, result.nextCursor, result.complete),
      );
    }
    setForcedClosed(null);
    setLoading(false);
  };

  useEffect(() => {
    setSendError(null);
    setForcedClosed(null);
    olderThreadRequestSeqRef.current += 1;
    replaceOlderThreadPage(createThreadPageState<WaThread['messages'][number]>([]));
    if (target.conversationId) {
      void loadThread(target.conversationId);
    } else {
      setThread(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.conversationId, replaceOlderThreadPage]);

  useLayoutEffect(() => {
    const messagesElement = messagesRef.current;
    const restore = pendingScrollRestoreRef.current;
    if (messagesElement && restore) {
      messagesElement.scrollTop = restore.top + (messagesElement.scrollHeight - restore.height);
      pendingScrollRestoreRef.current = null;
      return;
    }
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [thread?.messages.length]);

  const loadOlderMessages = useCallback(() => {
    const conversationId = target.conversationId;
    const page = olderThreadPageRef.current;
    if (!conversationId || page.complete || !page.nextCursor || page.phase === 'loading') return;

    const requestSequence = (olderThreadRequestSeqRef.current += 1);
    const messagesElement = messagesRef.current;
    if (messagesElement) {
      pendingScrollRestoreRef.current = {
        height: messagesElement.scrollHeight,
        top: messagesElement.scrollTop,
      };
    }
    replaceOlderThreadPage(beginOlderThreadPageLoad(page));
    fetchWaThread(conversationId, page.nextCursor)
      .then((response) => {
        if (!isCurrentOlderThreadPageRequest(conversationId, activeConversationKeyRef.current, requestSequence, olderThreadRequestSeqRef.current)) return;
        if (!response.ok) {
          replaceOlderThreadPage(failOlderThreadPageLoad(olderThreadPageRef.current));
          return;
        }
        const nextPage = applyOlderThreadPage(olderThreadPageRef.current, response);
        replaceOlderThreadPage(nextPage);
        setThread((previous) => previous ? { ...previous, messages: nextPage.messages } : previous);
      })
      .catch(() => {
        if (isCurrentOlderThreadPageRequest(conversationId, activeConversationKeyRef.current, requestSequence, olderThreadRequestSeqRef.current)) {
          replaceOlderThreadPage(failOlderThreadPageLoad(olderThreadPageRef.current));
        }
      });
  }, [replaceOlderThreadPage, target.conversationId]);

  useEffect(() => {
    if (!target.conversationId) {
      return;
    }
    return subscribeOwnTyping(target.conversationId, () => {
      setIsOwnTyping(true);
      if (typingTimeoutRef.current !== null) {
        window.clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = window.setTimeout(() => setIsOwnTyping(false), 3000);
    });
  }, [target.conversationId]);

  const applyOutcome = async (outcome: WaSendOutcome) => {
    if (outcome.ok) {
      setForcedClosed(null);
      const resolvedConversationId = outcome.conversationId ?? target.conversationId ?? null;
      if (resolvedConversationId && resolvedConversationId !== target.conversationId) {
        onTargetUpdate({ ...target, conversationId: resolvedConversationId });
      }
      if (resolvedConversationId) {
        await loadThread(resolvedConversationId);
      }
      return;
    }
    if ('windowClosed' in outcome) {
      setForcedClosed({ suggestedTemplate: outcome.suggestedTemplate, message: outcome.message });
      return;
    }
    setSendError(outcome.error);
  };

  // Returns true only once the send is CONFIRMED to have gone out — the
  // Composer relies on this to decide whether it's safe to clear the typed
  // text (never fabricate a completed action; see Composer.tsx submitText).
  const handleSendText = async (text: string): Promise<boolean> => {
    // eslint-disable-next-line no-console
    console.log('[WA-DOCK-TRACE] ConversationView.handleSendText: entry', { target, text });
    setSending(true);
    setSendError(null);
    const outcome = await sendWaText(target, text);
    // eslint-disable-next-line no-console
    console.log('[WA-DOCK-TRACE] ConversationView.handleSendText: sendWaText() outcome', outcome);
    await applyOutcome(outcome);
    setSending(false);
    // eslint-disable-next-line no-console
    console.log('[WA-DOCK-TRACE] ConversationView.handleSendText: returning', {
      resolvedTrue: outcome.ok === true,
    });
    return outcome.ok === true;
  };

  const handleAttachment = async (file: File, isVoiceNote: boolean) => {
    setSending(true);
    setSendError(null);
    const uploaded = await uploadWaMedia(file);
    if (!uploaded.ok) {
      setSendError(uploaded.error);
      setSending(false);
      return;
    }
    const kind = isVoiceNote ? 'AUDIO' : outboundKindFromFile(file);
    await applyOutcome(await sendWaMedia(target, { url: uploaded.url, kind, fileName: file.name }, ''));
    setSending(false);
  };

  const handleSendTemplate = async (templateName: string) => {
    setSending(true);
    setSendError(null);
    await applyOutcome(await sendWaTemplate(target, templateName));
    setSending(false);
  };

  const lineType = thread?.lineType ?? target.lineType ?? 'EVERYDAY';
  const sessionWindowOpen = forcedClosed
    ? false
    : lineType === 'OFFICIAL'
      ? (thread?.sessionWindowOpen ?? true)
      : true;
  const canAttach = Boolean(target.conversationId) && lineType !== 'OFFICIAL';
  const approvedTemplates = thread?.approvedTemplates ?? [];
  const suggestedTemplate = forcedClosed?.suggestedTemplate ?? thread?.suggestedTemplate ?? null;
  const errorMessage = sendError ?? forcedClosed?.message ?? null;

  return (
    <StyledWrap>
      <StyledHeader>
        <StyledBack aria-label="Back to chats" onClick={onBack} type="button">
          ←
        </StyledBack>
        <StyledAvatar>{initial(target.name)}</StyledAvatar>
        <StyledHeaderText>
          <StyledName>{target.name}</StyledName>
          {lineType === 'OFFICIAL' && (
            <StyledWindowState tone={sessionWindowOpen ? 'open' : 'closed'}>
              {sessionWindowOpen
                ? `Window open · ${hoursLeftLabel(thread?.sessionWindowEndsAtMs ?? null)}`
                : 'Reply window closed'}
            </StyledWindowState>
          )}
        </StyledHeaderText>
      </StyledHeader>

      <StyledMessages ref={messagesRef}>
        {!olderThreadPage.complete && olderThreadPage.nextCursor ? (
          <div>
            <StyledLoadOlder disabled={olderThreadPage.phase === 'loading'} onClick={loadOlderMessages} type="button">
              {olderThreadPage.phase === 'loading'
                ? 'Loading older messages…'
                : olderThreadPage.phase === 'error'
                  ? 'Retry older messages'
                  : 'Load older messages'}
            </StyledLoadOlder>
            {olderThreadPage.phase === 'error' ? (
              <StyledLoadError role="alert">
                Older messages are unavailable. The current conversation is still shown.
              </StyledLoadError>
            ) : null}
          </div>
        ) : null}
        {loading ? (
          <StyledEmpty>Loading conversation…</StyledEmpty>
        ) : !thread || thread.messages.length === 0 ? (
          <StyledEmpty>
            {target.conversationId
              ? 'No messages yet.'
              : `No conversation yet with ${target.name.split(' ')[0] || 'this contact'} — send the first message below.`}
          </StyledEmpty>
        ) : (
          thread.messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
        <div ref={messagesEndRef} />
      </StyledMessages>

      {isOwnTyping && <StyledTypingHint>typing… (another session)</StyledTypingHint>}

      <Composer
        approvedTemplates={approvedTemplates}
        canAttach={canAttach}
        conversationId={target.conversationId}
        errorMessage={errorMessage}
        onSendFile={(file) => void handleAttachment(file, false)}
        onSendTemplate={(name) => void handleSendTemplate(name)}
        onSendText={(text) => handleSendText(text)}
        onSendVoiceNote={(file) => void handleAttachment(file, true)}
        sending={sending}
        sessionWindowOpen={sessionWindowOpen}
        suggestedTemplate={suggestedTemplate}
      />
    </StyledWrap>
  );
};
