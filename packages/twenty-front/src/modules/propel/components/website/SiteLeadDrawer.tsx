import {
  Badge,
  Box,
  Button,
  Divider,
  Drawer,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import {
  IconWorld,
  IconExternalLink,
  IconMail,
  IconPhone,
  IconUser,
  IconX,
} from 'twenty-ui/display';
import { getLinkToShowPage } from '@/object-metadata/utils/getLinkToShowPage';
import {
  ageMinutes,
  relativeAge,
  type RelationshipState,
  type SiteLead,
} from '@/propel/lib/websiteCrm';
import { SlaAgeChip } from '@/propel/components/website/SlaAgeChip';

// Right-side detail drawer for one site lead (Website → Site leads). Opens on a
// row click; shows the full lead payload the CRM read returned, formatted, and a
// single "Open contact in CRM" that deep-links to the Person record via the
// canonical helper (getLinkToShowPage → /object/person/<id>).

const SLA_TARGET_MINUTES = 10;

const STATUS_TONE: Record<RelationshipState, string> = {
  PROSPECT: 'gray',
  ACTIVE: 'blue',
  CLIENT: 'green',
  ADVOCATE: 'grape',
  DORMANT: 'orange',
  LOST: 'red',
};

const STATUS_LABEL: Record<RelationshipState, string> = {
  PROSPECT: 'Prospect',
  ACTIVE: 'Active',
  CLIENT: 'Client',
  ADVOCATE: 'Advocate',
  DORMANT: 'Dormant',
  LOST: 'Lost',
};

const formatAed = (value: number): string => `AED ${value.toLocaleString('en-US')}`;

const formatWhen = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <Group gap="md" wrap="nowrap" align="flex-start">
    <Text size="xs" c="dimmed" w={120} style={{ flexShrink: 0 }}>
      {label}
    </Text>
    <Box style={{ minWidth: 0, flex: 1 }}>
      {value === null || value === undefined || value === '' ? (
        <Text size="sm" c="dimmed">
          —
        </Text>
      ) : typeof value === 'string' ? (
        <Text size="sm">{value}</Text>
      ) : (
        value
      )}
    </Box>
  </Group>
);

export const SiteLeadDrawer = ({
  lead,
  onClose,
}: {
  lead: SiteLead | null;
  onClose: () => void;
}) => {
  const navigate = useNavigate();
  const opened = lead !== null;

  if (lead === null) {
    return <Drawer opened={false} onClose={onClose} position="right" />;
  }

  const openInCrm = () => {
    const to = getLinkToShowPage('person', { id: lead.id });
    if (to) {
      onClose();
      navigate(to);
    }
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="min(560px, 94vw)"
      padding={0}
      withCloseButton={false}
      styles={{
        body: { height: '100%', padding: 0 },
        content: { display: 'flex', flexDirection: 'column' },
      }}
    >
      {/* header */}
      <Group
        justify="space-between"
        align="flex-start"
        wrap="nowrap"
        px="lg"
        py="md"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Box style={{ minWidth: 0 }}>
          <Group gap={8} mb={4}>
            {lead.relationshipState ? (
              <Badge
                color={STATUS_TONE[lead.relationshipState]}
                variant="light"
                radius="sm"
              >
                {STATUS_LABEL[lead.relationshipState]}
              </Badge>
            ) : (
              <Badge color="gray" variant="light" radius="sm">
                New
              </Badge>
            )}
            <SlaAgeChip
              ageMinutes={ageMinutes(lead.createdAt)}
              breached={lead.slaBreached}
              targetMinutes={SLA_TARGET_MINUTES}
              ageLabel={relativeAge(lead.createdAt)}
            />
          </Group>
          <Title order={4}>{lead.name}</Title>
        </Box>
        <Button
          size="compact-sm"
          variant="subtle"
          color="gray"
          onClick={onClose}
          leftSection={<IconX size={14} />}
        >
          Close
        </Button>
      </Group>

      <ScrollArea style={{ flex: 1 }} type="auto">
        <Stack gap="lg" p="lg">
          {lead.estimatedValueAed !== null ? (
            <Paper withBorder radius="md" p="md" bg="teal.0">
              <Text size="xs" c="dimmed" mb={2}>
                Estimated property value
              </Text>
              <Text size="xl" fw={700} c="teal.7">
                {formatAed(lead.estimatedValueAed)}
              </Text>
            </Paper>
          ) : null}

          <Paper withBorder radius="md" p="md">
            <Text size="xs" c="dimmed" fw={600} mb="sm">
              CONTACT
            </Text>
            <Stack gap="sm">
              <Field
                label="Phone"
                value={
                  lead.phone ? (
                    <Group gap={6} wrap="nowrap">
                      <IconPhone size={13} />
                      <Text size="sm">{lead.phone}</Text>
                    </Group>
                  ) : null
                }
              />
              <Field
                label="Email"
                value={
                  lead.email ? (
                    <Group gap={6} wrap="nowrap">
                      <IconMail size={13} />
                      <Text size="sm">{lead.email}</Text>
                    </Group>
                  ) : null
                }
              />
              <Field
                label="Assignee"
                value={
                  lead.assigneeName ? (
                    <Group gap={6} wrap="nowrap">
                      <IconUser size={13} />
                      <Text size="sm">{lead.assigneeName}</Text>
                    </Group>
                  ) : (
                    <Text size="sm" c="dimmed" fs="italic">
                      Unassigned
                    </Text>
                  )
                }
              />
            </Stack>
          </Paper>

          <Paper withBorder radius="md" p="md">
            <Text size="xs" c="dimmed" fw={600} mb="sm">
              SOURCE
            </Text>
            <Stack gap="sm">
              <Field label="Form" value={lead.formTypeLabel} />
              <Field
                label="Source page"
                value={
                  lead.pageSlug ? (
                    <Group gap={6} wrap="nowrap">
                      <IconWorld size={13} />
                      <Text size="sm" ff="monospace">
                        {lead.pageSlug}
                      </Text>
                    </Group>
                  ) : null
                }
              />
              <Field label="Campaign" value={lead.utmCampaign} />
              <Field label="UTM source" value={lead.utmSource} />
              <Field label="UTM medium" value={lead.utmMedium} />
              <Field label="Lead intent" value={lead.leadIntent} />
            </Stack>
          </Paper>

          <Paper withBorder radius="md" p="md">
            <Text size="xs" c="dimmed" fw={600} mb="sm">
              TIMING
            </Text>
            <Stack gap="sm">
              <Field label="Submitted" value={formatWhen(lead.createdAt)} />
              <Field
                label="Waiting"
                value={`${relativeAge(lead.createdAt)}${
                  lead.slaBreached ? ' · SLA breached' : ''
                }`}
              />
            </Stack>
          </Paper>
        </Stack>
      </ScrollArea>

      <Divider />
      <Group px="lg" py="md" justify="flex-end">
        <Button
          color="red"
          size="sm"
          rightSection={<IconExternalLink size={14} />}
          onClick={openInCrm}
        >
          Open contact in CRM
        </Button>
      </Group>
    </Drawer>
  );
};
