import { Anchor, Badge, Box, Group, Image, Stack, Text } from '@mantine/core';
import {
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconDownload,
  IconFile,
  IconVideo,
} from 'twenty-ui/display';
import {
  type InboxChannel,
  type InboxMediaKind,
  type InboxSurface,
} from '@/propel/types/inbox';
import {
  type ExpiryIndicator,
  mediaExpiryIndicator,
} from '@/propel/lib/inboxThread';

// Per-channel identity = a clean colored lettermark (Ig / f / Wa), not a generic
// chat glyph — a megaphone on a Facebook DM reads wrong. Colors are fixed brand
// hues (Mantine's red is the hero primary; these are channel marks, intentionally
// off-palette).
const CHANNEL_META: Record<
  InboxChannel,
  { label: string; mark: string; color: string }
> = {
  FACEBOOK: { label: 'Facebook', mark: 'f', color: '#1877F2' },
  INSTAGRAM: { label: 'Instagram', mark: 'Ig', color: '#C13584' },
  WHATSAPP: { label: 'WhatsApp', mark: 'Wa', color: '#25D366' },
};

export const channelLabel = (channel: InboxChannel): string =>
  CHANNEL_META[channel].label;

export const ChannelBadge = ({
  channel,
  size = 26,
}: {
  channel: InboxChannel;
  size?: number;
}) => {
  const m = CHANNEL_META[channel];
  return (
    <Box
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        display: 'grid',
        placeItems: 'center',
        background: m.color,
        color: '#fff',
        flex: 'none',
        fontWeight: 700,
        fontSize: size * 0.42,
        letterSpacing: '-0.02em',
        lineHeight: 1,
      }}
    >
      {m.mark}
    </Box>
  );
};

// Secondary surface badge: COMMENT vs DM on the FB/IG surface (they route
// differently). WhatsApp threads are always DMs, so the badge renders NOTHING for
// WhatsApp — a "DM" pill on every WhatsApp row would be pure noise.
export const SurfaceBadge = ({
  channel,
  surface,
}: {
  channel: InboxChannel;
  surface: InboxSurface;
}) => {
  if (channel === 'WHATSAPP') return null;
  const isComment = surface === 'COMMENT';
  return (
    <Badge size="xs" variant="default" color="gray">
      {isComment ? 'Comment' : 'DM'}
    </Badge>
  );
};

// Humanize a SELECT enum value for the rail (PROPERTY_FINDER → Property Finder).
export const humanizeEnum = (s: string): string =>
  s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());

// Renders an inbound/outbound attachment inside a message bubble. Image/sticker →
// a constrained thumbnail that opens the full asset in a new tab; video/audio/
// document → a labeled chip with a download affordance. The chip reads on both the
// red OUTBOUND bubble (inherits white) and the neutral INBOUND one (inherits ink).
export const MediaBlock = ({
  kind,
  url,
}: {
  kind: InboxMediaKind;
  url: string;
}) => {
  if (kind === 'IMAGE' || kind === 'STICKER') {
    return (
      <Anchor
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        aria-label={kind === 'STICKER' ? 'Open sticker' : 'Open image'}
        style={{ display: 'block', marginBottom: 5, lineHeight: 0 }}
      >
        <Image
          src={url}
          alt={kind === 'STICKER' ? 'Sticker' : 'Image'}
          radius="md"
          fit="cover"
          loading="lazy"
          mah={280}
          maw={220}
        />
      </Anchor>
    );
  }

  // IMAGE/STICKER returned above as a thumbnail, so this only handles VIDEO/AUDIO/
  // DOCUMENT — a labeled chip.
  const Icon = kind === 'VIDEO' ? IconVideo : IconFile;
  const label =
    kind === 'VIDEO'
      ? 'Video'
      : kind === 'AUDIO'
        ? 'Voice message'
        : kind === 'DOCUMENT'
          ? 'Document'
          : 'Attachment';

  return (
    <Anchor
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`Open ${label.toLowerCase()}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 5,
        padding: '7px 11px',
        borderRadius: 10,
        maxWidth: '100%',
        color: 'inherit',
        textDecoration: 'none',
        fontSize: 12.5,
        fontWeight: 600,
        background: 'color-mix(in oklch, currentColor 12%, transparent)',
      }}
    >
      <Icon size={15} style={{ flex: 'none', opacity: 0.85 }} />
      <span
        style={{
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </span>
      <IconDownload size={13} style={{ flex: 'none', opacity: 0.6, marginLeft: 2 }} />
    </Anchor>
  );
};

// The footer under an UNSAVED FB/IG inbound attachment: a live expiry indicator
// plus a "Save" button that re-hosts the media to B2 + attaches it to the Person.
export const SaveMediaBar = ({
  expiresAtMs,
  nowMs,
  busy,
  error,
  onSave,
}: {
  expiresAtMs: number | null;
  nowMs: number;
  busy: boolean;
  error: string | null;
  onSave: () => void;
}) => {
  const ind: ExpiryIndicator = mediaExpiryIndicator(expiresAtMs, nowMs);
  const expired = ind?.expired === true;
  const hint = expired
    ? 'Link expired'
    : ind && !ind.expired
      ? ind.label
      : 'Save to keep it';
  return (
    <Stack gap={4} mb={5}>
      <Group gap="xs" wrap="nowrap">
        <Text
          size="xs"
          c={expired ? 'red' : 'yellow.7'}
          fw={600}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          {expired ? (
            <IconAlertTriangle size={11} style={{ flex: 'none' }} />
          ) : (
            <IconClock size={11} style={{ flex: 'none' }} />
          )}
          {hint}
        </Text>
        <Box
          component="button"
          type="button"
          onClick={onSave}
          disabled={busy}
          aria-label="Save this media to the contact"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 9px',
            borderRadius: 999,
            border: '1px solid var(--mantine-color-default-border)',
            background: 'var(--mantine-color-body)',
            color: 'var(--mantine-color-text)',
            fontSize: 10.5,
            fontWeight: 700,
            cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? (
            <IconClock size={11} style={{ flex: 'none' }} />
          ) : (
            <IconDownload size={11} style={{ flex: 'none' }} />
          )}
          {busy ? 'Saving…' : 'Save'}
        </Box>
      </Group>
      {error ? (
        <Text size="xs" c="red">
          {error}
        </Text>
      ) : null}
    </Stack>
  );
};

// A "Saved" badge shown once inbound media is durable (replaces the SaveMediaBar).
export const SavedMediaBadge = () => (
  <Text
    size="xs"
    c="green"
    fw={600}
    mb={5}
    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
  >
    <IconCheck size={12} style={{ flex: 'none' }} /> Saved
  </Text>
);
