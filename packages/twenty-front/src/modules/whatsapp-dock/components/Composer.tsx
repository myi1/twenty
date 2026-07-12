import styled from '@emotion/styled';
import { useRef, useState } from 'react';

import { dockColor } from '@/ui/theme/dockColorTokens';
import { announceOwnTyping } from '@/whatsapp-dock/utils/waTypingBroadcast';
import {
  outboundKindFromFile,
  type WaApprovedTemplate,
} from '@/whatsapp-dock/utils/whatsAppComposeBridge';
import { useVoiceRecorder } from '@/whatsapp-dock/utils/useVoiceRecorder';

const StyledWrap = styled.div`
  border-top: 1px solid ${dockColor.borderLight};
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 8px;
  padding: 10px 12px;
`;

const StyledRow = styled.div`
  align-items: flex-end;
  display: flex;
  gap: 8px;
`;

const StyledIconButton = styled.button`
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: ${dockColor.radiusSm};
  color: ${dockColor.textSecondary};
  cursor: pointer;
  display: flex;
  flex-shrink: 0;
  font-size: 16px;
  height: 32px;
  justify-content: center;
  width: 32px;

  &:hover:not(:disabled) {
    background: ${dockColor.bgTertiary};
    color: ${dockColor.textPrimary};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.35;
  }
`;

const StyledTextarea = styled.textarea`
  background: ${dockColor.bgSecondary};
  border: 1px solid ${dockColor.borderLight};
  border-radius: ${dockColor.radiusSm};
  color: ${dockColor.textPrimary};
  flex: 1;
  font-family: ${dockColor.fontFamily};
  font-size: 13px;
  max-height: 96px;
  min-height: 36px;
  outline: none;
  padding: 8px 10px;
  resize: none;

  &:focus {
    border-color: ${dockColor.accentGreen};
  }

  &::placeholder {
    color: ${dockColor.textTertiary};
  }
`;

const StyledSendButton = styled.button`
  align-items: center;
  background: ${dockColor.accentGreen};
  border: 0;
  border-radius: ${dockColor.radiusSm};
  color: ${dockColor.textInverted};
  cursor: pointer;
  display: flex;
  flex-shrink: 0;
  font: 600 12px/1 inherit;
  height: 32px;
  justify-content: center;
  padding: 0 12px;

  &:disabled {
    background: ${dockColor.bgTertiary};
    color: ${dockColor.textTertiary};
    cursor: not-allowed;
  }
`;

const StyledHint = styled.div`
  color: ${dockColor.textTertiary};
  font-size: 11px;
`;

const StyledErrorHint = styled(StyledHint)`
  color: ${dockColor.textDanger};
`;

const StyledRecordingRow = styled.div`
  align-items: center;
  background: ${dockColor.dangerBg};
  border-radius: ${dockColor.radiusSm};
  color: ${dockColor.textDanger};
  display: flex;
  font-size: 12px;
  gap: 8px;
  justify-content: space-between;
  padding: 8px 10px;
`;

const StyledDot = styled.span`
  animation: wa-dock-pulse 1s ease-in-out infinite;
  background: currentColor;
  border-radius: 999px;
  display: inline-block;
  height: 8px;
  width: 8px;

  @keyframes wa-dock-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }
`;

const StyledTemplateWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const StyledTemplateCard = styled.button`
  background: ${dockColor.bgSecondary};
  border: 1px solid ${dockColor.borderLight};
  border-radius: ${dockColor.radiusSm};
  color: ${dockColor.textPrimary};
  cursor: pointer;
  font-family: ${dockColor.fontFamily};
  font-size: 12px;
  line-height: 1.4;
  padding: 8px 10px;
  text-align: left;

  &:hover:not(:disabled) {
    border-color: ${dockColor.accentGreen};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const formatElapsed = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

type ComposerProps = {
  conversationId: string | null;
  sessionWindowOpen: boolean;
  canAttach: boolean; // false on OFFICIAL threads — media/voice not supported there
  approvedTemplates: WaApprovedTemplate[];
  suggestedTemplate: WaApprovedTemplate | null;
  sending: boolean;
  errorMessage: string | null;
  onSendText: (text: string) => void;
  onSendFile: (file: File) => void;
  onSendVoiceNote: (file: File) => void;
  onSendTemplate: (templateName: string) => void;
};

export const Composer = ({
  conversationId,
  sessionWindowOpen,
  canAttach,
  approvedTemplates,
  suggestedTemplate,
  sending,
  errorMessage,
  onSendText,
  onSendFile,
  onSendVoiceNote,
  onSendTemplate,
}: ComposerProps) => {
  const [text, setText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorder = useVoiceRecorder();

  const handleTextChange = (value: string) => {
    setText(value);
    if (conversationId) {
      announceOwnTyping(conversationId);
    }
  };

  const submitText = () => {
    const trimmed = text.trim();
    if (!trimmed || sending) {
      return;
    }
    onSendText(trimmed);
    setText('');
  };

  const handleFilePicked = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (file) {
      onSendFile(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleMicClick = async () => {
    if (recorder.state === 'recording') {
      const file = await recorder.stop();
      if (file) {
        onSendVoiceNote(file);
      }
      return;
    }
    await recorder.start();
  };

  // Out-of-window on an OFFICIAL thread — the honest platform-rule fallback:
  // an approved-template chooser instead of a free-text composer. This is not
  // a UI preference; WhatsApp itself rejects free-form sends here.
  if (!sessionWindowOpen) {
    return (
      <StyledWrap>
        <StyledHint>
          It’s been over 24 hours since their last message — WhatsApp only allows an
          approved template now.
        </StyledHint>
        <StyledTemplateWrap>
          {approvedTemplates.length === 0 ? (
            <StyledHint>
              No approved template is available yet — it may still be awaiting WhatsApp
              approval.
            </StyledHint>
          ) : (
            approvedTemplates.map((template) => (
              <StyledTemplateCard
                key={template.name}
                disabled={sending}
                onClick={() => onSendTemplate(template.name)}
              >
                {template.preview}
                {suggestedTemplate?.name === template.name ? ' (suggested)' : ''}
              </StyledTemplateCard>
            ))
          )}
        </StyledTemplateWrap>
        {errorMessage && <StyledErrorHint>{errorMessage}</StyledErrorHint>}
      </StyledWrap>
    );
  }

  if (recorder.state === 'recording') {
    return (
      <StyledWrap>
        <StyledRecordingRow>
          <span>
            <StyledDot /> Recording {formatElapsed(recorder.elapsedMs)}
          </span>
          <span style={{ display: 'flex', gap: 8 }}>
            <StyledIconButton
              aria-label="Cancel recording"
              onClick={() => recorder.cancel()}
              type="button"
            >
              ✕
            </StyledIconButton>
            <StyledIconButton
              aria-label="Send voice note"
              onClick={() => void handleMicClick()}
              type="button"
            >
              ➤
            </StyledIconButton>
          </span>
        </StyledRecordingRow>
      </StyledWrap>
    );
  }

  return (
    <StyledWrap>
      <StyledRow>
        <input
          ref={fileInputRef}
          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
          hidden
          onChange={(event) => handleFilePicked(event.target.files)}
          type="file"
        />
        <StyledIconButton
          aria-label="Attach a file"
          disabled={!canAttach || sending}
          onClick={() => fileInputRef.current?.click()}
          title={canAttach ? 'Attach a file' : 'Attachments aren’t supported on this line yet'}
          type="button"
        >
          📎
        </StyledIconButton>
        <StyledTextarea
          onChange={(event) => handleTextChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submitText();
            }
          }}
          placeholder="Message…"
          rows={1}
          value={text}
        />
        {text.trim().length === 0 ? (
          <StyledIconButton
            aria-label="Record a voice note"
            disabled={!canAttach || sending}
            onClick={() => void handleMicClick()}
            title={canAttach ? 'Record a voice note' : 'Voice notes aren’t supported on this line yet'}
            type="button"
          >
            🎙
          </StyledIconButton>
        ) : (
          <StyledSendButton disabled={sending} onClick={submitText} type="button">
            {sending ? '…' : 'Send'}
          </StyledSendButton>
        )}
      </StyledRow>
      {recorder.error && <StyledErrorHint>{recorder.error}</StyledErrorHint>}
      {!canAttach && (
        <StyledHint>Attachments and voice notes aren’t supported on the campaign number yet.</StyledHint>
      )}
      {errorMessage && <StyledErrorHint>{errorMessage}</StyledErrorHint>}
    </StyledWrap>
  );
};

// Exposed for the attach button's implicit file→kind mapping used by the
// parent when it calls uploadWaMedia/sendWaMedia.
export { outboundKindFromFile };
