import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
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
  IconExternalLink,
  IconInfoCircle,
  IconLoader,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconTarget,
  IconWand,
  IconWorld,
} from 'twenty-ui/display';
import {
  getSeoAiData,
  type AiVisibilityEngineResult,
  type AiVisibilityPromptRow,
  type SeoAiAutomationToggles,
} from '@/propel/mocks/websiteMockData';
import {
  DEFAULT_SEO_BASE_URL,
  relativeScanAge,
  type SeoAuditIssue,
  type SeoIssueSeverity,
} from '@/propel/lib/websiteSeoCrm';
import { useWebsiteSeo } from '@/propel/hooks/useWebsiteSeo';

// SEO and AI sub-tab of the Website tab (WEBSITE-REBUILD-DESIGN.md §6 "SEO and AI").
//
// REAL: the SEO-audit half. "Run audit" hits POST /website/seo-audit (a
// Manager/Admin-gated CRM logic-function route on develop) via useWebsiteSeo →
// websiteSeoCrm.ts. The metric rings and issue list are derived purely from what
// the crawler actually found — no invented scores. "Fix with AI" is surfaced as
// an HONEST per-issue flag: the route reports whether an automated fix WILL be
// available, but no remediation endpoint exists yet, so nothing here simulates a
// fix.
//
// PREVIEW (mock, clearly labelled): the AI-visibility monitor and the automation
// toggles. Those depend on a visibility-check route + tracked-prompt store and a
// config/cron surface that don't exist yet (net-new, gated — see
// WEBSITE-MARKETING-TAB-PLAN.md R2). They read getSeoAiData() and mutate local
// state only, marked as previews so a future wiring pass knows exactly what to
// replace.

// Build the real page URL an issue points at, so a row click opens exactly the
// affected page in a new tab. Tolerates a full URL, a "/path" slug, or a bare
// asset name (e.g. sitemap.xml) — the audit uses all three shapes.
const buildIssuePageUrl = (baseUrl: string, slug: string): string => {
  const s = (slug ?? '').trim();
  if (/^https?:\/\//i.test(s)) return s;
  const b = (baseUrl ?? DEFAULT_SEO_BASE_URL).replace(/\/+$/, '');
  const path = s.startsWith('/') ? s : `/${s}`;
  return `${b}${path}`;
};

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

// A ring gauge + label, for the two derived scores at the top of the audit
// result. Plain Paper per CONVENTIONS.md (not WidgetCard — that shell is for the
// draggable Home dashboard grid).
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
        // Mantine's default label CSS only vertically centers (top:50% +
        // translateY) and horizontally insets by thickness*2 — which reads as
        // off-center in a small ring (the founder's "circles not aligned" bug).
        // Override the label box to fill the ring and flex-center its child so the
        // % sits dead-center at any size; lh={1} removes the line-box drift.
        styles={{
          label: {
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            transform: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          },
        }}
        label={
          <Text size="xs" fw={700} lh={1} ta="center">
            {valuePct}%
          </Text>
        }
      />
      <Stack gap={2} style={{ minWidth: 0 }}>
        <Text size="sm" fw={600} truncate>
          {label}
        </Text>
        <Text size="xs" c="dimmed">
          {detail}
        </Text>
      </Stack>
    </Group>
  </Paper>
);

// A plain count tile (crawl issue counts) — no fake percentage.
const CountCard = ({
  label,
  value,
  color,
  detail,
}: {
  label: string;
  value: number;
  color?: string;
  detail: string;
}) => (
  <Paper withBorder radius="md" p="md">
    <Stack gap={2}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="xl" fw={700} c={value > 0 ? color : undefined}>
        {value}
      </Text>
      <Text size="xs" c="dimmed" truncate>
        {detail}
      </Text>
    </Stack>
  </Paper>
);

// Honest per-issue "Fix with AI" affordance. The route flags whether an automated
// fix WILL be available for this issue type, but no remediation endpoint exists
// yet — so this reports the flag, it never simulates a fix.
const FixAffordance = ({ issue }: { issue: SeoAuditIssue }) => {
  if (!issue.fixWithAiAvailable) {
    return (
      <Tooltip label="This issue needs a manual fix — no safe automated fix.">
        <Text size="xs" c="dimmed">
          Manual fix
        </Text>
      </Tooltip>
    );
  }
  return (
    <Tooltip label="An automated AI fix for this issue type is planned but not wired yet.">
      <Badge
        size="sm"
        variant="light"
        color="grape"
        leftSection={<IconWand size={12} />}
      >
        AI-fixable
      </Badge>
    </Tooltip>
  );
};

// ── Preview: AI visibility monitor (mock, not wired) ─────────────────────────
const AddPromptRow = ({ onAdd }: { onAdd: (prompt: string) => void }) => {
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

const EngineResultCell = ({ result }: { result: AiVisibilityEngineResult }) => {
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
  // ── Real SEO audit ──────────────────────────────────────────────────────────
  // `baseUrlInput` is what the user is typing; `target` is the committed URL the
  // hook crawls (a live crawl runs on mount + when the target changes / Retry).
  const [baseUrlInput, setBaseUrlInput] = useState(DEFAULT_SEO_BASE_URL);
  const [target, setTarget] = useState(DEFAULT_SEO_BASE_URL);
  const { phase, error, data, reload } = useWebsiteSeo(target);

  const runAudit = () => {
    const next = baseUrlInput.trim();
    if (next === '') return;
    if (next === target) reload();
    else setTarget(next);
  };

  // ── Preview: AI-visibility monitor + automations (mock, local state only) ────
  const [{ visibilityPrompts, automation }, setPreview] = useState(() => {
    const seed = getSeoAiData();
    return {
      visibilityPrompts: seed.visibilityPrompts,
      automation: seed.automation,
    };
  });

  // PREVIEW STUB: appends a "not checked yet" row — no engine is queried. A real
  // wiring pass replaces this with a tracked-prompt store + visibility-check job.
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
    setPreview((prev) => ({
      ...prev,
      visibilityPrompts: [newRow, ...prev.visibilityPrompts],
    }));
  };

  // PREVIEW STUB: local toggle flip only — no automation job is wired yet.
  const handleToggleAutomation = (key: keyof SeoAiAutomationToggles) => {
    setPreview((prev) => ({
      ...prev,
      automation: { ...prev.automation, [key]: !prev.automation[key] },
    }));
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
            Technical health, on-page fixes, and how AI engines see the site.
          </Text>
        </Box>
        <Group gap="xs" wrap="nowrap" align="flex-end">
          <TextInput
            size="xs"
            w={220}
            label="Site to audit"
            placeholder={DEFAULT_SEO_BASE_URL}
            value={baseUrlInput}
            onChange={(e) => setBaseUrlInput(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runAudit();
            }}
            leftSection={<IconWorld size={14} />}
          />
          <Button
            size="xs"
            color="red"
            mt={20}
            leftSection={
              phase === 'loading' ? undefined : <IconRefresh size={14} />
            }
            loading={phase === 'loading'}
            onClick={runAudit}
          >
            {phase === 'loading' ? 'Auditing…' : 'Run audit'}
          </Button>
        </Group>
      </Group>

      {/* ── Real SEO audit result ── */}
      {phase === 'error' ? (
        <Alert
          color="red"
          icon={<IconAlertTriangle size={16} />}
          variant="light"
          mb="lg"
          title="Couldn't run the SEO audit"
        >
          <Stack gap="sm" align="flex-start">
            <Text size="sm">{error}</Text>
            <Button
              size="compact-sm"
              variant="light"
              color="red"
              leftSection={<IconRefresh size={13} />}
              onClick={reload}
            >
              Retry
            </Button>
          </Stack>
        </Alert>
      ) : phase === 'loading' ? (
        <Center h={200} mb="lg">
          <Loader color="red" />
        </Center>
      ) : data !== null ? (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md" mb="md">
            <ScoreCard
              label="SEO health"
              valuePct={data.seoHealthPct}
              color={data.seoHealthPct >= 70 ? 'teal' : 'yellow'}
              detail={
                data.pagesWithIssues === 0
                  ? 'All crawled pages are clean'
                  : `${data.pagesWithIssues} of ${data.pagesAudited} pages have issues`
              }
            />
            <ScoreCard
              label="AI readiness"
              valuePct={data.aiReadinessPct}
              color="grape"
              detail="Pages carrying JSON-LD structured data"
            />
            <CountCard
              label="Critical issues"
              value={data.criticalCount}
              color="red"
              detail="Missing structured data, etc."
            />
            <CountCard
              label="Warnings"
              value={data.warningCount}
              color="yellow"
              detail={`${data.infoCount} info · ${data.pagesReachable}/${data.pagesAudited} pages reached`}
            />
          </SimpleGrid>

          <Text size="xs" c="dimmed" mb="lg">
            Crawled {data.pagesReachable} of {data.pagesAudited} representative
            pages on {data.baseUrl}
            {data.scannedAt ? ` · ${relativeScanAge(data.scannedAt)}` : ''}.
          </Text>

          {data.pagesUnreachable > 0 ? (
            <Alert
              color="yellow"
              variant="light"
              icon={<IconAlertTriangle size={16} />}
              mb="lg"
            >
              {data.pagesUnreachable} of {data.pagesAudited} pages could not be
              crawled — they may not be deployed yet at {data.baseUrl}. Each is
              listed below as an info-level issue.
            </Alert>
          ) : null}

          <Paper withBorder radius="md" p="md" mb="lg">
            <Group gap={8} mb="sm">
              <IconAlertTriangle size={16} />
              <Title order={5}>Issues</Title>
              <Badge size="sm" variant="light" color="gray">
                {data.issues.length}
              </Badge>
            </Group>
            {data.issues.length === 0 ? (
              <Text c="dimmed" size="sm">
                No on-page issues found across the crawled pages — nice.
              </Text>
            ) : (
              <Table verticalSpacing="sm" horizontalSpacing="md" layout="auto">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Severity</Table.Th>
                    <Table.Th>Issue</Table.Th>
                    <Table.Th>Page</Table.Th>
                    <Table.Th w={140}>Fix</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.issues.map((issue) => {
                    const sev = SEVERITY_META[issue.severity];
                    const pageUrl = buildIssuePageUrl(data.baseUrl, issue.pageSlug);
                    return (
                      <Table.Tr
                        key={issue.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() =>
                          window.open(pageUrl, '_blank', 'noopener,noreferrer')
                        }
                      >
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
                          <Tooltip label={`Open ${pageUrl}`} withArrow>
                            <Group gap={4} wrap="nowrap">
                              <Text size="xs" ff="monospace" c="dimmed" truncate maw={180}>
                                {issue.pageSlug}
                              </Text>
                              <IconExternalLink
                                size={13}
                                style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }}
                              />
                            </Group>
                          </Tooltip>
                        </Table.Td>
                        <Table.Td onClick={(e) => e.stopPropagation()}>
                          <FixAffordance issue={issue} />
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            )}
          </Paper>
        </>
      ) : null}

      {/* ── Preview: AI visibility monitor (no backend yet) ── */}
      <Paper withBorder radius="md" p="md" mb="lg">
        <Group justify="space-between" align="flex-start" mb="sm" wrap="nowrap">
          <Group gap={8}>
            <IconSparkles size={16} />
            <Title order={5}>AI visibility monitor</Title>
          </Group>
          <Badge color="gray" variant="light" size="xs">
            Preview
          </Badge>
        </Group>
        <Text c="dimmed" size="sm" mb="sm">
          Preview of the tracked-prompt monitor: buyer prompts checked against
          ChatGPT, Perplexity, and Gemini for a remaxhub.ae mention or citation.
          Not wired to a live checker yet — rows and results below are sample data
          and reset on reload.
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

      {/* ── Preview: automations (no backend yet) ── */}
      <Paper withBorder radius="md" p="md">
        <Group justify="space-between" align="flex-start" mb="sm" wrap="nowrap">
          <Group gap={8}>
            <IconLoader size={16} />
            <Title order={5}>Automations</Title>
          </Group>
          <Badge color="gray" variant="light" size="xs">
            Preview
          </Badge>
        </Group>
        <Text c="dimmed" size="sm" mb="md">
          Preview of the automation controls — toggle state is local only and
          resets on reload. None of these is wired to a real job yet (each needs a
          gated cron logic-function).
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
