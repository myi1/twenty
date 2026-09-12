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
  IconUserPlus,
} from 'twenty-ui/display';
import { type CounterpartyPerson, type SendChannel } from '@/propel/types/a2a';

// The "send" step (design §5 SendPanel / D4).
//
// TASK 38 — LAUNCH MODE (founder decisions 2026-09-12, via the desk: delivery at
// launch is email only; WhatsApp is a later, separate step; the Send step is
// copy-link PRIMARY plus an "Email the link" button). At launch doc-service has
// no WhatsApp line (`WA_SERVICE_*` unset) and cannot email the signing link at
// send time itself — the CRM send route does that through Postmark after the
// service activates the envelope. So the panel offers two actions:
//   · "Get signing link" → /a2a/send with `copyLink`: activates the envelope,
//     marks the agreement Out for signature, stores the counterparty (whose
//     email later receives the signed PDF), hands the agent the link.
//   · "Email the link to <email>" → /a2a/send with `email`: the same, plus the
//     CRM emails the other broker their link (Reply-To our agent).
// The WhatsApp button stays in code behind WHATSAPP_SEND_ENABLED: flipping it
// (+ the service's WhatsApp settings) brings it back with the same honest
// per-leg outcome text.
//
// Whatever the mode, the sentence under the buttons comes from the service's own
// per-leg report (a2aSendOutcome.ts) — never from `ok`, which is true even when
// nothing was delivered.
const WHATSAPP_SEND_ENABLED = false;

export const SendPanel = ({
  counterparty,
  signingUrl,
  sending,
  sent,
  outcomeMessage,
  onOpenContact,
  onSend,
}: {
  counterparty: CounterpartyPerson | null;
  /** Live counterparty link — only valid after send activates the envelope. */
  signingUrl: string | null;
  sending: boolean;
  /** The agreement is Out for signature (the envelope was activated). */
  sent: boolean;
  /** What the last send really did, in one sentence (from the hook). */
  outcomeMessage: string | null;
  onOpenContact: () => void;
  onSend: (channels: SendChannel[]) => Promise<unknown>;
}) => {
  const hasPhone =
    counterparty?.phone != null && counterparty.phone.trim() !== '';
  const hasEmail =
    counterparty?.email != null && counterparty.email.trim() !== '';
  const linkLive = signingUrl != null && signingUrl !== '';

  // No counterparty at all → must capture one before any channel makes sense:
  // their email is where the signed PDF goes once both sides have signed.
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
          Send the signing link
        </Text>
        <Stack gap="sm">
          {WHATSAPP_SEND_ENABLED ? (
            <>
              {/* WhatsApp — the default when a phone exists (needs the
                  service's WhatsApp line; off at launch). */}
              <Button
                color="green"
                variant={hasPhone ? 'filled' : 'default'}
                justify="space-between"
                fullWidth
                leftSection={<IconSend size={16} />}
                rightSection={
                  hasPhone ? <Text size="xs">Recommended</Text> : null
                }
                disabled={!hasPhone}
                loading={sending}
                onClick={() => void onSend(['whatsapp'])}
              >
                {hasPhone
                  ? `WhatsApp ${counterparty.phone}`
                  : 'WhatsApp (no phone on file)'}
              </Button>
            </>
          ) : null}

          {/* Email — the CRM sends the link (task 38). Disabled without an
              email on file; the outcome sentence below says what happened. */}
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

          {/* Copy link — the one leg that always works. The link is only live
              after send activates the envelope, so the first click sends with
              the copyLink channel, then the URL is exposed to copy. */}
          {linkLive ? (
            <CopyButton value={signingUrl}>
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
          color={linkLive ? 'green' : 'yellow'}
          variant="light"
          icon={
            linkLive ? <IconCheck size={16} /> : <IconAlertTriangle size={16} />
          }
        >
          {outcomeMessage}
        </Alert>
      ) : null}
    </Stack>
  );
};
