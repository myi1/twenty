import { Button, Card, Group, List, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { IconInbox, IconMessage } from 'twenty-ui/display';

// Inbox tab of the unified Marketing hero — STUB.
//
// The legacy Marketing Cloud InboxView (marketing-cloud-inbox.tsx, 700+ LOC) is a
// real-time unified inbox: it unions FB/IG comment + DM threads (socialConversation)
// with WhatsApp threads (whatsAppConversation) over POST /marketing/inbox +
// /marketing/inbox-thread, renders per-thread message timelines with media
// (save-on-demand re-hosting, expiry countdowns), an AI reply/insights rail
// (/marketing/inbox-ai), and an outbound composer that routes by channel/surface
// (comment-reply Graph call vs Messenger Send API vs wa-service /v1/send). That
// full port is the FOLLOW-UP lane for retiring the legacy — it carries enough
// real-time/media logic to deserve its own slice, and is explicitly OUT OF SCOPE
// for this hero-shell lane.
//
// TODO(unified-inbox-port): port the legacy InboxView to a twenty-front Inbox tab —
//   • thread list (presence-aware: only connected channels) via /marketing/inbox
//   • thread timeline + media (save-on-demand) via /marketing/inbox-thread
//   • channel-routed outbound reply composer
//   • AI suggest/improve/insights rail via /marketing/inbox-ai
//   See propel-crm-integration src/shared/marketing-cloud-inbox.tsx +
//   marketing-hub-types.ts (InboxPayload / InboxThreadPayload / InboxAiResponse).
export const InboxTab = () => {
  const navigate = useNavigate();

  return (
    <Stack p="md" gap="lg" maw={620}>
      <Group gap="sm" align="center">
        <ThemeIcon size={44} radius="md" color="red" variant="light">
          <IconInbox size={24} />
        </ThemeIcon>
        <div>
          <Title order={4}>Unified Inbox</Title>
          <Text size="sm" c="dimmed">
            One place for every WhatsApp, Facebook, and Instagram conversation.
          </Text>
        </div>
      </Group>

      <Card withBorder radius="md" padding="lg">
        <Stack gap="sm">
          <Text fw={600} size="sm">
            Coming here soon
          </Text>
          <Text size="sm" c="dimmed">
            The full conversation inbox — unread threads across all channels, message
            history with media, AI-drafted replies, and one composer that sends to the
            right channel — is being brought over from the old Marketing Cloud as the
            next step. For now you can keep replying to each contact from their record.
          </Text>
          <List
            spacing="xs"
            size="sm"
            c="dimmed"
            icon={
              <ThemeIcon size={18} radius="xl" color="gray" variant="light">
                <IconMessage size={12} />
              </ThemeIcon>
            }
          >
            <List.Item>WhatsApp, Facebook & Instagram in one list</List.Item>
            <List.Item>Message timelines with saved media</List.Item>
            <List.Item>AI-suggested replies and thread insights</List.Item>
          </List>
        </Stack>
      </Card>

      <Group>
        <Button
          variant="default"
          leftSection={<IconMessage size={16} />}
          onClick={() => navigate('/objects/people')}
        >
          Open a contact to chat
        </Button>
        <Text size="xs" c="dimmed">
          Each contact’s record has the live WhatsApp chat panel.
        </Text>
      </Group>
    </Stack>
  );
};
