import { useState } from 'react';
import { ActionIcon, Box, Group, Popover, Text, Tooltip } from '@mantine/core';
import { IconMoodSmile } from 'twenty-ui/display';
import { type InboxReactionChip } from '@/propel/types/inbox';

// The six WhatsApp offers by default. Deliberately short: a full emoji keyboard turns a
// one-tap acknowledgement into a decision, and the point of a reaction is that it costs
// nothing.
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '🙏', '🎉'] as const;

/**
 * Reactions under a message, and the way to add one.
 *
 * Drawn BELOW the bubble rather than inside it, the way the WhatsApp app does, so a
 * reaction reads as an annotation on the message rather than part of what was said.
 *
 * Tapping a chip you are already part of REMOVES your reaction — same gesture both
 * ways, which is what people expect and why the route accepts an empty emoji.
 */
export const ReactionBar = ({
  reactions,
  canReact,
  busy,
  onReact,
  align,
}: {
  reactions: InboxReactionChip[];
  /** False on a pending/failed row, or a thread we may not act on: show, don't offer. */
  canReact: boolean;
  busy: boolean;
  /** '' removes the caller's own reaction. */
  onReact: (emoji: string) => void;
  align: 'flex-start' | 'flex-end';
}) => {
  const [open, setOpen] = useState(false);
  const has = reactions.length > 0;
  // Nothing to show and nothing to offer — draw nothing at all rather than an empty
  // row that steals a few pixels from every message in the thread.
  if (!has && !canReact) return null;

  return (
    <Group gap={4} mt={2} px={4} wrap="wrap" justify={align} style={{ maxWidth: '78%' }}>
      {reactions.map((chip) => (
        <Tooltip
          key={chip.emoji}
          label={chip.mine ? 'Tap to remove your reaction' : `React with ${chip.emoji}`}
          openDelay={400}
        >
          <Box
            component="button"
            type="button"
            disabled={!canReact || busy}
            aria-label={
              chip.mine
                ? `Remove your ${chip.emoji} reaction`
                : `React with ${chip.emoji}. ${chip.count} ${chip.count === 1 ? 'person' : 'people'} reacted`
            }
            aria-pressed={chip.mine}
            onClick={() => onReact(chip.mine ? '' : chip.emoji)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              padding: '1px 7px',
              borderRadius: 999,
              fontSize: 12,
              lineHeight: '18px',
              cursor: canReact && !busy ? 'pointer' : 'default',
              // "Mine" is a filled state, not just a border — at 12px a 1px border
              // change is invisible on a phone in daylight.
              background: chip.mine
                ? 'var(--mantine-color-red-light, rgba(215,40,47,0.14))'
                : 'var(--mantine-color-default-hover, rgba(128,128,128,0.14))',
              border: chip.mine
                ? '1px solid var(--mantine-color-red-6)'
                : '1px solid transparent',
              color: 'var(--mantine-color-text)',
              opacity: busy ? 0.6 : 1,
            }}
          >
            <span aria-hidden>{chip.emoji}</span>
            {chip.count > 1 ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>{chip.count}</span> : null}
          </Box>
        </Tooltip>
      ))}

      {canReact ? (
        <Popover opened={open} onChange={setOpen} position="top" withArrow shadow="md" trapFocus>
          <Popover.Target>
            <ActionIcon
              variant="subtle"
              size="sm"
              radius="xl"
              disabled={busy}
              aria-label="Add a reaction"
              onClick={() => setOpen((v) => !v)}
              style={{ opacity: has ? 0.7 : 0.45 }}
            >
              <IconMoodSmile size={14} />
            </ActionIcon>
          </Popover.Target>
          <Popover.Dropdown p={6}>
            <Group gap={2} wrap="nowrap">
              {QUICK_REACTIONS.map((emoji) => (
                <ActionIcon
                  key={emoji}
                  variant="subtle"
                  size="lg"
                  radius="xl"
                  aria-label={`React with ${emoji}`}
                  onClick={() => {
                    setOpen(false);
                    onReact(emoji);
                  }}
                >
                  <Text size="lg" aria-hidden>
                    {emoji}
                  </Text>
                </ActionIcon>
              ))}
            </Group>
          </Popover.Dropdown>
        </Popover>
      ) : null}
    </Group>
  );
};
