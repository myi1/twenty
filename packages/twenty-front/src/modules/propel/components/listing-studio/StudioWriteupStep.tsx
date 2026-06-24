import { useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { IconSparkles, IconAlertTriangle, IconCheck, IconLanguage } from 'twenty-ui/display';
import {
  type StudioFacts,
  type StudioLintFinding,
  type StudioTone,
  type StudioWriteup,
} from '@/propel/types/listingStudio';
import { generateStudioWriteup } from '@/propel/lib/listingStudioRoutes';

// Step 4 — Write-up (lane spec §4.6 / §9). Tone selector (Luxury / Friendly /
// Just-the-facts), AI EN + AR title + description (via /listing-studio/writeup —
// the CMA LLM pattern, no new vendor), Regenerate, and the PF compliance lint
// (ASCII / HTML / regulated claims). A hard lint finding blocks Publish (enforced
// again server-side at publish). EN char counts vs the PF title limit are shown.

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const PF_TITLE_MAX = 90;

const TONES: { id: StudioTone; label: string }[] = [
  { id: 'luxury', label: 'Luxury' },
  { id: 'friendly', label: 'Friendly' },
  { id: 'facts', label: 'Just the facts' },
];

const CharCount = ({ value, max }: { value: string; max: number }) => {
  const len = value.length;
  const over = len > max;
  return (
    <Text size="xs" c={over ? 'red' : 'dimmed'}>
      {len}/{max}
    </Text>
  );
};

export const StudioWriteupStep = ({
  facts,
  writeup,
  onWriteup,
}: {
  facts: StudioFacts;
  writeup: StudioWriteup | undefined;
  onWriteup: (writeup: StudioWriteup) => void;
}) => {
  const [tone, setTone] = useState<StudioTone>(writeup?.tone ?? 'friendly');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [lint, setLint] = useState<StudioLintFinding[]>([]);

  const wu = writeup ?? {};

  const generate = async () => {
    setBusy(true);
    setErr('');
    const res = await generateStudioWriteup(facts, tone);
    setBusy(false);
    if (!res) {
      setErr('Could not generate the write-up. Check the AI key on the server, or write it manually below.');
      return;
    }
    setLint(res.lint);
    onWriteup({ ...res.writeup, tone });
  };

  const patch = (p: Partial<StudioWriteup>) => onWriteup({ ...wu, ...p, tone });

  const hardLint = lint.filter((l) => l.severity === 'hard');

  return (
    <Stack gap="md">
      <Box>
        <Text fw={600}>Write-up</Text>
        <Text size="sm" c="dimmed">
          Generate the English + Arabic copy, then edit anything. The compliance lint
          flags whatever Property Finder would reject.
        </Text>
      </Box>

      {/* Tone selector + generate. */}
      <Card withBorder radius="md" padding="sm">
        <Group justify="space-between" wrap="nowrap">
          <Group gap={6}>
            {TONES.map((t) => (
              <Button
                key={t.id}
                size="xs"
                variant={tone === t.id ? 'filled' : 'default'}
                color={tone === t.id ? 'red' : 'gray'}
                onClick={() => setTone(t.id)}
                style={{ transition: `background 160ms ${EASE_OUT}` }}
              >
                {t.label}
              </Button>
            ))}
          </Group>
          <Button
            leftSection={<IconSparkles size={15} />}
            color="red"
            loading={busy}
            onClick={() => void generate()}
          >
            {wu.titleEn ? 'Regenerate' : 'Generate'}
          </Button>
        </Group>
      </Card>

      {err && (
        <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />}>
          {err}
        </Alert>
      )}

      {/* Compliance lint. */}
      {lint.length > 0 && (
        <Alert
          color={hardLint.length > 0 ? 'red' : 'yellow'}
          variant="light"
          icon={hardLint.length > 0 ? <IconAlertTriangle size={16} /> : <IconCheck size={16} />}
          title={
            hardLint.length > 0
              ? `${hardLint.length} issue${hardLint.length === 1 ? '' : 's'} to fix before publishing`
              : 'Looks compliant'
          }
        >
          <Stack gap={4}>
            {lint.map((l, i) => (
              <Group key={i} gap={6} wrap="nowrap">
                <Badge size="xs" color={l.severity === 'hard' ? 'red' : 'yellow'} variant="light">
                  {l.field}
                </Badge>
                <Text size="xs">{l.message}</Text>
              </Group>
            ))}
          </Stack>
        </Alert>
      )}

      {/* EN + AR cards. */}
      <Group align="flex-start" grow gap="md">
        <Card withBorder radius="md" padding="sm">
          <Group gap={6} mb="xs">
            <Badge variant="light" color="blue" size="sm">EN</Badge>
            <Text size="xs" c="dimmed">English</Text>
          </Group>
          <Stack gap="xs">
            <Box>
              <TextInput
                label="Title"
                value={wu.titleEn ?? ''}
                onChange={(e) => patch({ titleEn: e.currentTarget.value })}
                placeholder="Generate or write the English title"
              />
              <Group justify="flex-end" mt={2}>
                <CharCount value={wu.titleEn ?? ''} max={PF_TITLE_MAX} />
              </Group>
            </Box>
            <Textarea
              label="Description"
              autosize
              minRows={6}
              value={wu.descriptionEn ?? ''}
              onChange={(e) => patch({ descriptionEn: e.currentTarget.value })}
              placeholder="Generate or write the English description"
            />
          </Stack>
        </Card>

        <Card withBorder radius="md" padding="sm">
          <Group gap={6} mb="xs">
            <Badge variant="light" color="grape" size="sm" leftSection={<IconLanguage size={10} />}>AR</Badge>
            <Text size="xs" c="dimmed">Arabic</Text>
          </Group>
          <Stack gap="xs">
            <Box>
              <TextInput
                label="العنوان"
                value={wu.titleAr ?? ''}
                onChange={(e) => patch({ titleAr: e.currentTarget.value })}
                placeholder="العنوان بالعربية"
                styles={{ input: { direction: 'rtl' } }}
              />
              <Group justify="flex-end" mt={2}>
                <CharCount value={wu.titleAr ?? ''} max={PF_TITLE_MAX} />
              </Group>
            </Box>
            <Textarea
              label="الوصف"
              autosize
              minRows={6}
              value={wu.descriptionAr ?? ''}
              onChange={(e) => patch({ descriptionAr: e.currentTarget.value })}
              placeholder="الوصف بالعربية"
              styles={{ input: { direction: 'rtl' } }}
            />
          </Stack>
        </Card>
      </Group>
    </Stack>
  );
};
