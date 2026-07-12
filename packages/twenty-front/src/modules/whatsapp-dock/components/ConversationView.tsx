import styled from '@emotion/styled';
import { useEffect, useRef, useState } from 'react';

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
  // A windowClosed outcome from a SEND can be more current than the thread we
  // loaded a moment ago (the window can lapse mid-session) — this override
  // forces the template chooser immediately rather than waiting on a refetch.
  const [forcedClosed, setForcedClosed] = useState<{
    suggestedTemplate: WaThread['suggestedTemplate'];
    message: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  const loadThread = async (conversationId: string) => {
    setLoading(true);
    const result = await fetchWaThread(conversationId);
    setThread(result);
    setForcedClosed(null);
    setLoading(false);
  };

  useEffect(() => {
    setSendError(null);
    setForcedClosed(null);
    if (target.conversationId) {
      void loadThread(target.conversationId);
    } else {
      setThread(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [thread?.messages.length]);

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

  const handleSendText = async (text: string) => {
    setSending(true);
    setSendError(null);
    await applyOutcome(await sendWaText(target, text));
    setSending(false);
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

      <StyledMessages>
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
        onSendText={(text) => void handleSendText(text)}
        onSendVoiceNote={(file) => void handleAttachment(file, true)}
        sending={sending}
        sessionWindowOpen={sessionWindowOpen}
        suggestedTemplate={suggestedTemplate}
      />
    </StyledWrap>
  );
};
