import styled from '@emotion/styled';

import { dockColor } from '@/ui/theme/dockColorTokens';
import { type WaMessage } from '@/whatsapp-dock/utils/whatsAppComposeBridge';

// A single message bubble: inbound left/neutral, outbound right/green-tinted.
// Media renders inline (image thumbnail / file chip / audio player); a
// media-only message with a caption shows both. Read/delivery ticks are
// intentionally a single "sent" mark for every outbound message — the
// underlying thread route (marketing-inbox-thread-route.ts) does not
// currently select whatsAppMessage.deliveryStatus, so there is no real
// delivered/read signal to show yet. Rather than invent a fake blue
// double-check, this ships an honest single tick until that field is added
// server-side (a small, additive change to an existing route — flagged in the
// build report, out of scope for this front-only engine-rebuild pass).

const StyledRow = styled.div<{ isOutbound: boolean }>`
  display: flex;
  justify-content: ${({ isOutbound }) => (isOutbound ? 'flex-end' : 'flex-start')};
`;

const StyledBubble = styled.div<{ isOutbound: boolean }>`
  background: ${({ isOutbound }) => (isOutbound ? dockColor.outboundBubbleBg : dockColor.bgSecondary)};
  border-radius: ${dockColor.radiusMd};
  color: ${dockColor.textPrimary};
  display: flex;
  flex-direction: column;
  font-family: ${dockColor.fontFamily};
  font-size: 13px;
  gap: 4px;
  line-height: 1.4;
  max-width: 78%;
  padding: 8px 10px;
  word-break: break-word;
`;

const StyledMeta = styled.div`
  align-items: center;
  align-self: flex-end;
  color: ${dockColor.textTertiary};
  display: flex;
  font-size: 10px;
  gap: 4px;
  margin-top: 2px;
`;

const StyledTick = styled.span`
  color: ${dockColor.accentGreen};
`;

const StyledImage = styled.img`
  border-radius: ${dockColor.radiusSm};
  display: block;
  max-height: 220px;
  max-width: 100%;
  object-fit: cover;
`;

const StyledFileChip = styled.a`
  align-items: center;
  background: ${dockColor.bgTransparentLight};
  border-radius: ${dockColor.radiusSm};
  color: ${dockColor.textPrimary};
  display: flex;
  gap: 8px;
  padding: 8px 10px;
  text-decoration: none;

  &:hover {
    background: ${dockColor.bgTertiary};
  }
`;

const StyledAudio = styled.audio`
  accent-color: ${dockColor.accentGreen};
  height: 32px;
  width: 220px;
`;

const StyledUnavailable = styled.div`
  color: ${dockColor.textTertiary};
  font-size: 11px;
  font-style: italic;
`;

const fileNameFromUrl = (url: string): string => {
  try {
    const path = new URL(url).pathname;
    const last = path.split('/').pop() ?? '';
    return decodeURIComponent(last) || 'File';
  } catch {
    return 'File';
  }
};

const MediaBlock = ({ message }: { message: WaMessage }) => {
  if (!message.mediaUrl || message.mediaKind === 'NONE') {
    return null;
  }
  if (message.mediaKind === 'IMAGE' || message.mediaKind === 'STICKER') {
    return <StyledImage src={message.mediaUrl} alt="Shared image" loading="lazy" />;
  }
  if (message.mediaKind === 'VIDEO') {
    // eslint-disable-next-line jsx-a11y/media-has-caption
    return <video src={message.mediaUrl} controls style={{ borderRadius: 8, maxWidth: '100%' }} />;
  }
  if (message.mediaKind === 'AUDIO') {
    // eslint-disable-next-line jsx-a11y/media-has-caption
    return <StyledAudio src={message.mediaUrl} controls preload="none" />;
  }
  return (
    <StyledFileChip href={message.mediaUrl} target="_blank" rel="noreferrer">
      <span>📎</span>
      <span>{fileNameFromUrl(message.mediaUrl)}</span>
    </StyledFileChip>
  );
};

export const MessageBubble = ({ message }: { message: WaMessage }) => {
  const isOutbound = message.direction === 'OUTBOUND';
  const hasMedia = Boolean(message.mediaUrl) && message.mediaKind !== 'NONE';
  const hasText = message.body.trim().length > 0;
  return (
    <StyledRow isOutbound={isOutbound}>
      <StyledBubble isOutbound={isOutbound}>
        {hasMedia ? (
          <MediaBlock message={message} />
        ) : !hasText ? (
          <StyledUnavailable>Media unavailable</StyledUnavailable>
        ) : null}
        {hasText && <span>{message.body}</span>}
        <StyledMeta>
          <span>{message.whenLabel || 'just now'}</span>
          {isOutbound && <StyledTick>✓</StyledTick>}
        </StyledMeta>
      </StyledBubble>
    </StyledRow>
  );
};
