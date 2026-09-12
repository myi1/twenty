import {
  Alert,
  Box,
  Button,
  CopyButton,
  Group,
  Paper,
  Stack,
  Text,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconLink,
  IconMail,
  IconSend,
} from 'twenty-ui/display';
import { IconUserPlus } from 'twenty-ui/display';
import { type SendOutcome } from '@/propel/lib/a2aSendOutcome';
import { type CounterpartyPerson, type SendChannel } from '@/propel/types/a2a';

// The "send" step (design §5 SendPanel / D4).
//
// TASK 51 (2026-09-12) — WHAT THE PROD TEST FOUND, and what changed here.
// The panel used to show a "Copy signing link" button the moment a draft
// existed, because create-draft returns a counterparty link. That button was
// pure clipboard — no server call — so an agent who copied the link and sent it
// on WhatsApp (the natural thing for a broker to do) left the agreement stuck in
// DRAFT with no counterparty attached, while the caption underneath told them it
// had been marked out for signature. Worse, the link itself was dead: it carried
// a token resolved before our side was baked (task 49).
//
// The rule now: you can only copy a link that a SEND has handed back. Before a
// send there is one primary action and it performs the send; after it, the link
// that came back is copyable and the outcome says what really happened.
//
// LAUNCH MODE (founder, 2026-09-12): delivery is email only; WhatsApp is a later,
// separate step and stays behind WHATSAPP_SEND_ENABLED.
const WHATSAPP_SEND_ENABLED = false;

export const SendPanel = ({
  counterparty,
  shareUrl,
  sending,
  sent,
  outcome,
  outcomeMessage,
  onOpenContact,
  onSend,
}: {
  counterparty: CounterpartyPerson | null;
  /** The counterparty's live signing link — ONLY ever a link a send returned. */
  shareUrl: string | null;
  sending: boolean;
  /** The agreement is out for signature (a send has happened). */
  sent: boolean;
  /** What that send actually did, per channel. */
  outcome: SendOutcome | null;
  outcomeMessage: string | null;
  onOpenContact: () => void;
  onSend: (channels: SendChannel[]) => Promise<unknown>;
}) => {
  const hasPhone =
    counterparty?.phone != null && counterparty.phone.trim() !== '';
  const hasEmail =
    counterparty?.email != null && counterparty.email.trim() !== '';
  const linkReady = shareUrl != null && shareUrl !== '';
  const somethingFailed = outcome != null && outcome.failed.length > 0;

  // No counterparty at all → capture one first: their email is where the signed
  // PDF goes once both sides have signed.
  if (counterparty === null) {
    return (
      <Stack gap="md" maw={560}>
        <Alert
          color="blue"
          variant="light"
          icon={<IconAlertTriangle size={16} />}
          title="Add the other broker first"
        >
          We need the other broker&rsquo;s contact (their email) to deliver the
          signed copy once both sides have signed.
        </Alert>
        <Group>
          <Button
            color="red"
            leftSection={<IconUserPlus size={14} />}
            onClick={onOpenContact}
          >
            Add the other broker
          </Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack gap="lg" maw={560}>
      <Paper
        withBorder
        p="md"
        radius="md"
        style={{ background: 'var(--mantine-color-body)' }}
      >
        <Group justify="space-between" wrap="nowrap">
          <Box style={{ minWidth: 0 }}>
            <Text size="sm" fw={600} truncate>
              {counterparty.name}
            </Text>
            <Text size="xs" c="dimmed" truncate>
              {[counterparty.brokerage, counterparty.email, counterparty.phone]
                .filter((v) => v != null && v !== '')
                .join(' · ') || 'No channels on file'}
            </Text>
          </Box>
          <Button
            variant="subtle"
            color="gray"
            size="xs"
            onClick={onOpenContact}
            style={{ flex: 'none' }}
          >
            Change
          </Button>
        </Group>
      </Paper>

      {!hasEmail ? (
        <Alert
          color="yellow"
          variant="light"
          icon={<IconAlertTriangle size={16} />}
        >
          This broker has no email on file, so they will not receive the signed
          PDF automatically. Add one under &ldquo;Change&rdquo;.
        </Alert>
      ) : null}

      <Box>
        <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb="xs">
          {sent ? 'The signing link' : 'Send the signing link'}
        </Text>
        <Stack gap="sm">
          {WHATSAPP_SEND_ENABLED ? (
            <Button
              color="green"
              variant={hasPhone ? 'filled' : 'default'}
              justify="space-between"
              fullWidth
              leftSection={<IconSend size={16} />}
              disabled={!hasPhone}
              loading={sending}
              onClick={() => void onSend(['whatsapp'])}
            >
              {hasPhone
                ? `WhatsApp ${counterparty.phone}`
                : 'WhatsApp (no phone on file)'}
            </Button>
          ) : null}

          {/* Copy is offered ONLY for a link a send handed back. Before that the
              same position holds the action that actually sends. */}
          {sent && linkReady ? (
            <CopyButton value={shareUrl}>
              {({ copied, copy }) => (
                <Button
                  color="red"
                  variant={copied ? 'light' : 'filled'}
                  justify="flex-start"
                  fullWidth
                  leftSection={
                    copied ? <IconCheck size={16} /> : <IconCopy size={16} />
                  }
                  onClick={copy}
                >
                  {copied ? 'Link copied' : 'Copy signing link'}
                </Button>
              )}
            </CopyButton>
          ) : (
            <Button
              color="red"
              justify="flex-start"
              fullWidth
              leftSection={<IconLink size={16} />}
              loading={sending}
              onClick={() => void onSend(['copyLink'])}
            >
              Get signing link
            </Button>
          )}

          <Button
            variant="default"
            justify="flex-start"
            fullWidth
            leftSection={<IconMail size={16} />}
            disabled={!hasEmail}
            loading={sending}
            onClick={() => void onSend(['email'])}
          >
            {hasEmail
              ? `Email the link to ${counterparty.email}`
              : 'Email the link (no email on file)'}
          </Button>
        </Stack>
      </Box>

      {!sent ? (
        <Text size="xs" c="dimmed">
          This marks the agreement as out for signature and gives you the link
          to send to {counterparty.name}. Once both sides have signed, the
          signed PDF is emailed to them and to you automatically.
        </Text>
      ) : null}

      {sent && outcomeMessage !== null ? (
        <Alert
          color={somethingFailed ? 'yellow' : 'green'}
          variant="light"
          icon={
            somethingFailed ? (
              <IconAlertTriangle size={16} />
            ) : (
              <IconCheck size={16} />
            )
          }
        >
          {outcomeMessage}
        </Alert>
      ) : null}

      {sent && !linkReady ? (
        <Alert
          color="red"
          variant="light"
          icon={<IconAlertTriangle size={16} />}
          title="No signing link came back"
        >
          The agreement is out for signature but we did not get a link to share.
          Open it from the agreement record, or start over.
        </Alert>
      ) : null}
    </Stack>
  );
};
