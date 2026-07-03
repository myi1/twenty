import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Paper,
  RingProgress,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useState } from 'react';
import {
  IconAlertTriangle,
  IconBrandGoogle,
  IconBrandOpenai,
  IconCheck,
  IconCircleX,
  IconInfoCircle,
  IconLoader,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconTarget,
  IconWand,
} from 'twenty-ui/display';
import {
  getSeoAiData,
  type AiVisibilityEngineResult,
  type AiVisibilityPromptRow,
  type SeoAiAutomationToggles,
  type SeoIssueRow,
  type SeoIssueSeverity,
} from '@/propel/mocks/websiteMockData';

// SEO and AI sub-tab of the Website tab (WEBSITE-REBUILD-DESIGN.md §6 "SEO and AI").
// Mock-data wave (see CONVENTIONS.md "Data-fetching pattern") — no route exists yet,
// so every "action" here (Fix with AI, add a tracked prompt, flip an automation
// toggle) mutates LOCAL component state only. Nothing persists across a reload; a
// clear inline comment marks each stub so a future pass wiring `callPropelRoute`
// knows exactly what to replace.

const SEVERITY_META: Record<
  SeoIssueSeverity,
  { color: string; label: string }
> = {
  CRITICAL: { color: 'red', label: 'Critical' },
  WARNING: { color: 'yellow', label: 'Warning' },
  INFO: { color: 'gray', label: 'Info' },
};

const ENGINE_META: Record<
  AiVisibilityEngineResult['engine'],
  { label: string; Icon: typeof IconBrandOpenai }
> = {
  CHATGPT: { label: 'ChatGPT', Icon: IconBrandOpenai },
  PERPLEXITY: { label: 'Perplexity', Icon: IconSearch },
  GEMINI: { label: 'Gemini', Icon: IconBrandGoogle },
};

// One score card: a ring gauge + label, used for the 4 top-of-tab scores. Plain
// Paper per CONVENTIONS.md (not WidgetCard — that shell is for the draggable Home
// dashboard grid, not a static score strip).
const ScoreCard = ({
  label,
  valuePct,
  color,
  detail,
}: {
  label: string;
  valuePct: number;
  color: string;
  detail: string;
}) => (
  <Paper withBorder radius="md" p="md">
    <Group gap="md" wrap="nowrap" align="center">
      <RingProgress
        size={64}
        thickness={6}
        roundCaps
        sections={[{ value: valuePct, color }]}
        label={
          <Text size="xs" fw={700} ta="center">
            {valuePct}%
          </Text>
        }
      />
      <Stack gap={2} style={{ minWidth: 0 }}>
        <Text size="sm" fw={600} truncate>
          {label}
        </Text>
        <Text size="xs" c="dimmed" truncate>
          {detail}
        </Text>
      </Stack>
    </Group>
  </Paper>
);

// Fix-with-AI button + inline state machine per issue row: idle -> fixing (spinner,
// optimistic) -> fixed (checkmark, disabled). STUB: no real remediation runs; this
// simulates the eventual `/website/seo/fix-issue` call with a short timeout so the
// interaction reads correctly in a demo/QA pass. Real persistence is a follow-up —
// swapping the setTimeout body for a callPropelRoute call is the only change needed.
type FixState = 'idle' | 'fixing' | 'fixed';

const FixWithAiButton = ({
  issueId,
  available,
  state,
  onFix,
}: {
  issueId: string;
  available: boolean;
  state: FixState;
  onFix: (issueId: string) => void;
}) => {
  if (!available) {
    return (
      <Tooltip label="No automated fix available for this issue yet">
        <Text size="xs" c="dimmed">
          Manual fix required
        </Text>
      </Tooltip>
    );
  }
  if (state === 'fixed') {
    return (
      <Badge
        size="sm"
        variant="light"
        color="teal"
        leftSection={<IconCheck size={12} />}
      >
        Fixed
      </Badge>
    );
  }
  return (
    <Button
      size="compact-xs"
      variant="light"
      color="red"
      loading={state === 'fixing'}
      leftSection={state === 'fixing' ? undefined : <IconWand size={13} />}
      onClick={() => onFix(issueId)}
    >
      {state === 'fixing' ? 'Fixing…' : 'Fix with AI'}
    </Button>
  );
};

// Add-prompt row for the AI visibility monitor. Appends a mock row (all engines
// "not checked yet") to local state — no real ChatGPT/Perplexity/Gemini calls fire
// this wave. STUB, follow-up = wire a scheduled visibility-checker job per §5.
const AddPromptRow = ({
  onAdd,
}: {
  onAdd: (prompt: string) => void;
}) => {
  const [value, setValue] = useState('');
  const submit = () => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    onAdd(trimmed);
    setValue('');
  };
  return (
    <Group gap="xs" wrap="nowrap">
      <TextInput
        style={{ flex: 1 }}
        placeholder="Track a new buyer prompt, e.g. &quot;best off-plan areas in Dubai 2026&quot;"
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
      />
      <Button
        size="sm"
        variant="default"
        leftSection={<IconPlus size={14} />}
        onClick={submit}
        disabled={value.trim().length === 0}
      >
        Track prompt
      </Button>
    </Group>
  );
};

const EngineResultCell = ({
  result,
}: {
  result: AiVisibilityEngineResult;
}) => {
  const meta = ENGINE_META[result.engine];
  if (result.cited) {
    return (
      <Group gap={6} wrap="nowrap">
        <IconCheck size={15} color="var(--mantine-color-teal-6)" />
        <Text size="xs" c="teal.7" fw={600}>
          Cited
        </Text>
      </Group>
    );
  }
  if (result.rivalCited !== null) {
    return (
      <Tooltip label={`${meta.label} cited ${result.rivalCited} instead`}>
        <Group gap={6} wrap="nowrap">
          <IconAlertTriangle size={15} color="var(--mantine-color-orange-6)" />
          <Text size="xs" c="orange.7" fw={600} truncate maw={110}>
            Rival: {result.rivalCited}
          </Text>
        </Group>
      </Tooltip>
    );
  }
  if (result.mentioned) {
    return (
      <Group gap={6} wrap="nowrap">
        <IconInfoCircle size={15} color="var(--mantine-color-blue-6)" />
        <Text size="xs" c="blue.7">
          Mentioned
        </Text>
      </Group>
    );
  }
  return (
    <Group gap={6} wrap="nowrap">
      <IconCircleX size={15} color="var(--mantine-color-gray-5)" />
      <Text size="xs" c="dimmed">
        Not found
      </Text>
    </Group>
  );
};

const AUTOMATION_LABELS: Record<
  keyof SeoAiAutomationToggles,
  { label: string; detail: string }
> = {
  monthlyDataRefresh: {
    label: 'Monthly data refresh',
    detail: 'Re-render area/project pages with fresh DLD data',
  },
  aiMetaOnPublish: {
    label: 'AI meta on publish',
    detail: 'Auto-generate meta title/description for new pages',
  },
  arAutoTranslate: {
    label: 'AR auto-translate',
    detail: 'Translate published EN content to Arabic automatically',
  },
  sitemapLlmsTxtCurrency: {
    label: 'Sitemap & llms.txt currency',
    detail: 'Keep sitemap.xml and llms.txt in sync with published pages',
  },
  weeklyVisibilityRecheck: {
    label: 'Weekly visibility re-check',
    detail: 'Re-run tracked AI-visibility prompts every week',
  },
};

export const SeoAiTab = () => {
  // Mock-backed local state. Per CONVENTIONS.md "Data-fetching pattern": this is a
  // plain `getSeoAiData()` read seeded into useState so actions (fix, add prompt,
  // toggle) can mutate it locally — no useEffect/fetch cycle against nothing.
  const [{ scores, issues, visibilityPrompts, automation }, setData] = useState(
    () => getSeoAiData(),
  );
  const [fixStates, setFixStates] = useState<Record<string, FixState>>({});
  const [auditRunning, setAuditRunning] = useState(false);

  // STUB: optimistic "fixing" -> "fixed" transition, no real remediation. Follow-up:
  // replace the setTimeout with a callPropelRoute('/website/seo/fix-issue', {...}).
  const handleFixWithAi = (issueId: string) => {
    setFixStates((prev) => ({ ...prev, [issueId]: 'fixing' }));
    setTimeout(() => {
      setFixStates((prev) => ({ ...prev, [issueId]: 'fixed' }));
    }, 1400);
  };

  // STUB: appends a mock "not checked yet" row — no engine is actually queried.
  const handleAddPrompt = (prompt: string) => {
    const newRow: AiVisibilityPromptRow = {
      id: `prompt-${Date.now()}`,
      prompt,
      lastCheckedLabel: 'Not checked yet',
      results: [
        { engine: 'CHATGPT', mentioned: false, cited: false, rivalCited: null },
        { engine: 'PERPLEXITY', mentioned: false, cited: false, rivalCited: null },
        { engine: 'GEMINI', mentioned: false, cited: false, rivalCited: null },
      ],
    };
    setData((prev) => ({
      ...prev,
      visibilityPrompts: [newRow, ...prev.visibilityPrompts],
    }));
  };

  // STUB: local-only toggle flip. Comment per CONVENTIONS.md: real persistence
  // (a `/website/seo/automation` upsert route) is a follow-up, not built this wave.
  const handleToggleAutomation = (key: keyof SeoAiAutomationToggles) => {
    setData((prev) => ({
      ...prev,
      automation: { ...prev.automation, [key]: !prev.automation[key] },
    }));
  };

  // STUB: "Run full audit" just re-seeds from the mock module after a short delay
  // to simulate a crawl — no real crawler runs this wave.
  const handleRunAudit = () => {
    setAuditRunning(true);
    setTimeout(() => {
      setData(getSeoAiData());
      setFixStates({});
      setAuditRunning(false);
    }, 1600);
  };

  return (
    <Box p="md">
      <Group justify="space-between" align="flex-start" mb="md" wrap="nowrap">
        <Box>
          <Group gap={8} align="center">
            <IconTarget size={18} />
            <Title order={4}>SEO and AI</Title>
          </Group>
          <Text c="dimmed" size="sm" mt={2}>
            Technical health, on-page fixes, and how AI engines see remaxhub.ae.
          </Text>
        </Box>
        <Button
          size="xs"
          color="red"
          leftSection={
            auditRunning ? undefined : <IconRefresh size={14} />
          }
          loading={auditRunning}
          onClick={handleRunAudit}
        >
          {auditRunning ? 'Running audit…' : 'Run full audit'}
        </Button>
      </Group>

      <Alert
        color="gray"
        variant="light"
        icon={<IconInfoCircle size={16} />}
        mb="md"
      >
        This tab runs on mock data for now — issues, prompts, and toggles are demo
        state only and reset on reload. No real crawl, AI query, or automation is
        wired yet.
      </Alert>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md" mb="lg">
        <ScoreCard
          label="SEO health"
          valuePct={scores.seoHealthPct}
          color="teal"
          detail={`${issues.length} open issue${issues.length === 1 ? '' : 's'}`}
        />
        <ScoreCard
          label="AI readiness"
          valuePct={scores.aiReadinessPct}
          color="grape"
          detail="Schema, llms.txt, structured data"
        />
        <ScoreCard
          label="Indexed"
          valuePct={scores.indexedPct}
          color="blue"
          detail="Share of live pages indexed"
        />
        <ScoreCard
          label="Citations"
          valuePct={Math.min(100, scores.citationCount * 10)}
          color="orange"
          detail={`${scores.citationCount} AI citations tracked`}
        />
      </SimpleGrid>

      <Paper withBorder radius="md" p="md" mb="lg">
        <Group gap={8} mb="sm">
          <IconAlertTriangle size={16} />
          <Title order={5}>Issues</Title>
        </Group>
        {issues.length === 0 ? (
          <Text c="dimmed" size="sm">
            No open issues — nice.
          </Text>
        ) : (
          <Table verticalSpacing="sm" horizontalSpacing="md" layout="auto">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Severity</Table.Th>
                <Table.Th>Issue</Table.Th>
                <Table.Th>Page</Table.Th>
                <Table.Th w={140}>Action</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {issues.map((issue: SeoIssueRow) => {
                const sev = SEVERITY_META[issue.severity];
                const state = fixStates[issue.id] ?? 'idle';
                return (
                  <Table.Tr key={issue.id}>
                    <Table.Td>
                      <Badge size="sm" variant="light" color={sev.color}>
                        {sev.label}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {issue.title}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {issue.detail}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" ff="monospace" c="dimmed">
                        {issue.pageSlug}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <FixWithAiButton
                        issueId={issue.id}
                        available={issue.fixWithAiAvailable}
                        state={state}
                        onFix={handleFixWithAi}
                      />
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      <Paper withBorder radius="md" p="md" mb="lg">
        <Group justify="space-between" align="flex-start" mb="sm" wrap="nowrap">
          <Group gap={8}>
            <IconSparkles size={16} />
            <Title order={5}>AI visibility monitor</Title>
          </Group>
        </Group>
        <Text c="dimmed" size="sm" mb="sm">
          Tracked buyer prompts, checked weekly against ChatGPT, Perplexity, and
          Gemini for a remaxhub.ae mention or citation.
        </Text>
        <Box mb="md">
          <AddPromptRow onAdd={handleAddPrompt} />
        </Box>
        <Table verticalSpacing="sm" horizontalSpacing="md" layout="auto">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Prompt</Table.Th>
              <Table.Th w={130}>ChatGPT</Table.Th>
              <Table.Th w={130}>Perplexity</Table.Th>
              <Table.Th w={130}>Gemini</Table.Th>
              <Table.Th w={110}>Last checked</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visibilityPrompts.map((row) => {
              const byEngine = Object.fromEntries(
                row.results.map((r) => [r.engine, r]),
              ) as Record<
                AiVisibilityEngineResult['engine'],
                AiVisibilityEngineResult
              >;
              return (
                <Table.Tr key={row.id}>
                  <Table.Td>
                    <Text size="sm">{row.prompt}</Text>
                  </Table.Td>
                  <Table.Td>
                    <EngineResultCell result={byEngine.CHATGPT} />
                  </Table.Td>
                  <Table.Td>
                    <EngineResultCell result={byEngine.PERPLEXITY} />
                  </Table.Td>
                  <Table.Td>
                    <EngineResultCell result={byEngine.GEMINI} />
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {row.lastCheckedLabel}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Paper>

      <Paper withBorder radius="md" p="md">
        <Group gap={8} mb="sm">
          <IconLoader size={16} />
          <Title order={5}>Automations</Title>
        </Group>
        <Text c="dimmed" size="sm" mb="md">
          Toggle state only — nothing here is wired to a real job yet (see banner
          above). Flip freely to preview the surface.
        </Text>
        <Stack gap="sm">
          {(Object.keys(AUTOMATION_LABELS) as (keyof SeoAiAutomationToggles)[]).map(
            (key) => {
              const meta = AUTOMATION_LABELS[key];
              return (
                <Group key={key} justify="space-between" wrap="nowrap">
                  <Box style={{ minWidth: 0 }}>
                    <Text size="sm" fw={600}>
                      {meta.label}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {meta.detail}
                    </Text>
                  </Box>
                  <Switch
                    color="red"
                    checked={automation[key]}
                    onChange={() => handleToggleAutomation(key)}
                    aria-label={meta.label}
                  />
                </Group>
              );
            },
          )}
        </Stack>
      </Paper>
    </Box>
  );
};
