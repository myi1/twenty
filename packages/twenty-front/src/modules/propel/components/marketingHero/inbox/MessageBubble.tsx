import { Box, Group, Text } from '@mantine/core';
import { IconAlertTriangle, IconClock } from 'twenty-ui/display';
import { type InboxMessageRow } from '@/propel/types/inbox';
import { messageDeliveryWords } from '@/propel/lib/messageDeliveryWords';
import { hasRenderableMedia, showSaveAffordance } from '@/propel/lib/inboxThread';
import {
  MediaBlock,
  SaveMediaBar,
  SavedMediaBadge,
} from '@/propel/components/marketingHero/inbox/InboxBits';
import { ReactionBar } from '@/propel/components/marketingHero/inbox/ReactionBar';

// A rendered row is either a server message or an optimistic temp. `pending` marks
// an in-flight ("Sending…") bubble; `failed` marks a hard failure ("Not sent").
export type PendingRow = InboxMessageRow & { pending?: boolean; failed?: boolean };

// One rendered bubble (server row OR optimistic pending). Kept as a component so
// the live thread and the pending temps share the exact same chrome.
//
// An UNSAVED FB/IG inbound attachment renders the SaveMediaBar (expiry indicator +
// Save button) under the media; a saved one shows the SavedMediaBadge. `nowMs`
// drives the live countdown, `saveBusy`/`saveError` reflect the in-flight save for
// THIS message, and `onSaveMedia` re-hosts it.
export const MessageBubble = ({
  m,
  nowMs,
  isSocial,
  saveBusy,
  saveError,
  onSaveMedia,
  onReact,
  reactBusy,
}: {
  m: PendingRow;
  nowMs: number;
  isSocial: boolean; // FB/IG thread — save/expiry/saved UI is FB/IG only
  saveBusy: boolean;
  saveError: string | null;
  onSaveMedia: (messageId: string) => void;
  // Absent on a surface that cannot react (FB/IG, or a read-only thread): the bar then
  // still SHOWS reactions that arrived, it just does not offer to add one.
  onReact?: (providerMessageId: string, emoji: string) => void;
  reactBusy?: boolean;
}) => {
  const out = m.direction === 'OUTBOUND';
  const showMedia = hasRenderableMedia(m);
  const isPending = Boolean(m.pending) && !m.failed;
  const delivery = messageDeliveryWords(m.deliveryStatus, m.failureReason);
  const canSave = isSocial && showSaveAffordance(m);
  const showSaved =
    isSocial && m.direction === 'INBOUND' && m.mediaPersisted && showMedia;

  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: out ? 'flex-end' : 'flex-start',
      }}
    >
      <Box
        style={{
          maxWidth: '78%',
          padding: '9px 13px',
          borderRadius: 14,
          borderBottomRightRadius: out ? 4 : 14,
          borderBottomLeftRadius: out ? 14 : 4,
          background: out
            ? 'var(--mantine-color-red-6)'
            : 'var(--mantine-color-default-hover, var(--mantine-color-gray-1))',
          color: out ? '#fff' : 'var(--mantine-color-text)',
          fontSize: 13,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          opacity: m.failed ? 0.6 : isPending ? 0.72 : 1,
        }}
      >
        {showMedia && m.mediaUrl ? (
          <MediaBlock kind={m.mediaKind} url={m.mediaUrl} />
        ) : null}
        {canSave ? (
          <SaveMediaBar
            expiresAtMs={m.mediaExpiresAtMs}
            nowMs={nowMs}
            busy={saveBusy}
            error={saveError}
            onSave={() => onSaveMedia(m.id)}
          />
        ) : showSaved ? (
          <SavedMediaBadge />
        ) : null}
        {m.body ? (
          m.body
        ) : showMedia ? null : (
          <span style={{ opacity: 0.6 }}>(no text)</span>
        )}
      </Box>
      <ReactionBar
        reactions={m.reactions ?? []}
        // A row still in flight has no WhatsApp id yet, so there is nothing to react
        // TO — offering it would fail at the far end for a reason no agent could guess.
        canReact={Boolean(onReact) && !isPending && !m.failed && Boolean(m.providerMessageId)}
        busy={Boolean(reactBusy)}
        onReact={(emoji) => {
          if (m.providerMessageId) onReact?.(m.providerMessageId, emoji);
        }}
        align={out ? 'flex-end' : 'flex-start'}
      />
      <Group gap={4} mt={3} px={4} wrap="nowrap">
        {m.failed ? (
          <Text size="xs" c="red" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <IconAlertTriangle size={11} style={{ flex: 'none' }} /> Not sent
          </Text>
        ) : isPending ? (
          <Text size="xs" c="dimmed" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <IconClock size={11} style={{ flex: 'none' }} /> Sending…
          </Text>
        ) : (
          <>
            <Text size="xs" c="dimmed">
              {`${m.authorName ? `${m.authorName} · ` : ''}${m.whenLabel}`}
            </Text>
            {m.direction === 'OUTBOUND' && delivery !== null ? (
              <Text
                size="xs"
                c={delivery.tone === 'bad' ? 'red' : delivery.tone === 'wait' ? 'orange' : 'dimmed'}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                {delivery.tone === 'bad' ? <IconAlertTriangle size={11} style={{ flex: 'none' }} /> : null}
                {delivery.tone === 'wait' ? <IconClock size={11} style={{ flex: 'none' }} /> : null}
                {`· ${delivery.text}`}
              </Text>
            ) : null}
          </>
        )}
      </Group>
    </Box>
  );
};
