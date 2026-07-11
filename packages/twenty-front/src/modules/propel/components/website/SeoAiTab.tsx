import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Paper,
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
  IconMinus,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconSwords,
  IconTarget,
  IconWand,
  IconWorld,
} from 'twenty-ui/display';
import { getSeoAiData, type SeoAiAutomationToggles } from '@/propel/mocks/websiteMockData';
import {
  DEFAULT_SEO_BASE_URL,
  relativeScanAge,
  type SeoAuditIssue,
  type SeoIssueSeverity,
} from '@/propel/lib/websiteSeoCrm';
import { useWebsiteSeo } from '@/propel/hooks/useWebsiteSeo';
import { useAiVisibility } from '@/propel/hooks/useAiVisibility';
import {
  relativeCheckAge,
  type AiBoardPrompt,
  type AiDetectedRival,
  type AiEngine,
  type AiEngineCell,
} from '@/propel/lib/aiVisibilityCrm';
import { friendlyError } from '@/propel/lib/friendlyError';

// Visible build tag (footer) — bump on user-visible fixes so stale-cache
// debates end with a glance.
const HERO_UI_BUILD = 'r7-aivis-real';

// SEO and AI sub-tab of the Website tab (WEBSITE-REBUILD-DESIGN.md §6 "SEO and AI").
//
// REAL: the SEO-audit half hits POST /website/seo-audit (a Manager/Admin-gated
// CRM route) via useWebsiteSeo → websiteSeoCrm.ts. The metric rings and issue list
// are derived purely from what the crawler actually found.
//
// REAL (net-new): the AI-visibility monitor now queries the search-grounded AI
// engines (Perplexity / OpenAI web-search / Gemini grounding) via a Manager-gated
// CRM route and detects whether remaxhub.ae is genuinely cited — replacing the old
// fake "sample data" preview that misled with a fabricated "✓ Cited". Labelled
// "Beta · directional" because API answers differ from the ChatGPT app and vary
// between runs (honest snapshot, not gospel).
//
// PREVIEW (still mock, clearly labelled): only the automation toggles below —
// those depend on config/cron surfaces that don't exist yet.

// Build the real page URL an issue points at.
const buildIssuePageUrl = (baseUrl: string, slug: string): string => {
  const s = (slug ?? '').trim();
  if (/^https?:\/\//i.test(s)) return s;
  const b = (baseUrl ?? DEFAULT_SEO_BASE_URL).replace(/\/+$/, '');
  const path = s.startsWith('/') ? s : `/${s}`;
  return `${b}${path}`;
};

const SEVERITY_META: Record<SeoIssueSeverity, { color: string; label: string }> = {
  CRITICAL: { color: 'red', label: 'Critical' },
  WARNING: { color: 'yellow', label: 'Warning' },
  INFO: { color: 'gray', label: 'Info' },
};

const ENGINE_META: Record<AiEngine, { label: string; Icon: typeof IconBrandOpenai }> = {
  CHATGPT: { label: 'ChatGPT', Icon: IconBrandOpenai },
  PERPLEXITY: { label: 'Perplexity', Icon: IconSearch },
  GEMINI: { label: 'Gemini', Icon: IconBrandGoogle },
};

const ENGINE_ORDER: AiEngine[] = ['CHATGPT', 'PERPLEXITY', 'GEMINI'];

// ── SEO audit score/count tiles (unchanged, honest — derived from the crawl) ──
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
      <svg
        width={78}
        height={78}
        viewBox="0 0 96 96"
        style={{ flex: 'none', display: 'block' }}
        role="img"
        aria-label={`${label}: ${valuePct}%`}
      >
        <circle cx={48} cy={48} r={40} fill="none" stroke="var(--mantine-color-dark-4)" strokeWidth={8} />
        {valuePct > 0 ? (
          <circle
            cx={48}
            cy={48}
            r={40}
            fill="none"
            stroke={`var(--mantine-color-${color}-6)`}
            strokeWidth={8}
            strokeDasharray={`${(valuePct / 100) * 2 * Math.PI * 40} ${2 * Math.PI * 40}`}
            strokeLinecap={valuePct < 100 ? 'round' : 'butt'}
            transform="rotate(-90 48 48)"
          />
        ) : null}
        <text
          x={48}
          y={48}
          dx={6}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--mantine-color-text)"
          style={{ font: '700 17px/1 Inter, sans-serif', fontVariantNumeric: 'tabular-nums' }}
        >
          {valuePct}
          <tspan dx={1} style={{ font: '600 11px/1 Inter, sans-serif' }} fill="var(--mantine-color-dimmed)">
            %
          </tspan>
        </text>
      </svg>
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
      <Badge size="sm" variant="light" color="grape" leftSection={<IconWand size={12} />}>
        AI-fixable
      </Badge>
    </Tooltip>
  );
};

// ── AI visibility monitor (REAL) ──────────────────────────────────────────────
const AddPromptRow = ({
  onAdd,
  disabled,
}: {
  onAdd: (prompt: string) => void;
  disabled: boolean;
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
        disabled={disabled}
      />
      <Button
        size="sm"
        variant="default"
        leftSection={<IconPlus size={14} />}
        onClick={submit}
        disabled={disabled || value.trim().length === 0}
      >
        Track prompt
      </Button>
    </Group>
  );
};

// One engine's status cell — CITED / MENTIONED / NOT_FOUND / never-checked. Never
// fabricates a "Cited": an unchecked engine reads as a dimmed dash.
const EngineStatusCell = ({ cell, available }: { cell: AiEngineCell; available: boolean }) => {
  if (!cell.checked) {
    return (
      <Tooltip label={available ? 'Not checked yet' : 'This engine has no API key configured'}>
        <Group gap={6} wrap="nowrap">
          <IconMinus size={15} color="var(--mantine-color-gray-5)" />
          <Text size="xs" c="dimmed">
            {available ? 'Not checked' : 'No key'}
          </Text>
        </Group>
      </Tooltip>
    );
  }
  if (cell.status === 'CITED') {
    return (
      <Tooltip label={cell.ourUrl ? `Cited: ${cell.ourUrl}` : 'remaxhub.ae cited as a source'}>
        <Group gap={6} wrap="nowrap">
          <IconCheck size={15} color="var(--mantine-color-teal-6)" />
          <Text size="xs" c="teal.7" fw={600}>
            Cited
          </Text>
        </Group>
      </Tooltip>
    );
  }
  if (cell.status === 'MENTIONED') {
    return (
      <Tooltip label="RE/MAX Hub is named in the answer, but not cited as a source">
        <Group gap={6} wrap="nowrap">
          <IconInfoCircle size={15} color="var(--mantine-color-blue-6)" />
          <Text size="xs" c="blue.7">
            Mentioned
          </Text>
        </Group>
      </Tooltip>
    );
  }
  return (
    <Tooltip label="remaxhub.ae was neither cited nor named in this answer">
      <Group gap={6} wrap="nowrap">
        <IconCircleX size={15} color="var(--mantine-color-gray-5)" />
        <Text size="xs" c="dimmed">
          Not found
        </Text>
      </Group>
    </Tooltip>
  );
};

// Union of rivals across all engine cells for a prompt (dedupe by domain, a
// cited detection outranks a text-only mention).
const mergeRivals = (results: AiEngineCell[]): AiDetectedRival[] => {
  const byDomain = new Map<string, AiDetectedRival>();
  for (const cell of results) {
    for (const r of cell.rivals) {
      const prev = byDomain.get(r.domain);
      if (!prev || (r.cited && !prev.cited)) byDomain.set(r.domain, r);
    }
  }
  // cited first, then alphabetical.
  return [...byDomain.values()].sort((a, b) =>
    a.cited === b.cited ? a.name.localeCompare(b.name) : a.cited ? -1 : 1,
  );
};

const RivalBadges = ({ rivals }: { rivals: AiDetectedRival[] }) => {
  if (rivals.length === 0) {
    return (
      <Text size="xs" c="dimmed">
        No tracked rivals cited.
      </Text>
    );
  }
  return (
    <Group gap={4} mt={4}>
      {rivals.map((r) => (
        <Tooltip
          key={r.domain}
          label={r.cited ? `${r.name} cited as a source (${r.domain})` : `${r.name} named in the answer`}
        >
          <Badge
            size="xs"
            variant={r.cited ? 'filled' : 'light'}
            color="orange"
            leftSection={<IconSwords size={10} />}
          >
            {r.name}
          </Badge>
        </Tooltip>
      ))}
    </Group>
  );
};

const AUTOMATION_LABELS: Record<keyof SeoAiAutomationToggles, { label: string; detail: string }> = {
  monthlyDataRefresh: { label: 'Monthly data refresh', detail: 'Re-render area/project pages with fresh DLD data' },
  aiMetaOnPublish: { label: 'AI meta on publish', detail: 'Auto-generate meta title/description for new pages' },
  arAutoTranslate: { label: 'AR auto-translate', detail: 'Translate published EN content to Arabic automatically' },
  sitemapLlmsTxtCurrency: {
    label: 'Sitemap & llms.txt currency',
    detail: 'Keep sitemap.xml and llms.txt in sync with published pages',
  },
  weeklyVisibilityRecheck: {
    label: 'Weekly visibility re-check',
    detail: 'Re-run tracked AI-visibility prompts every week',
  },
};

const VisibilityRow = ({
  row,
  availByEngine,
  onRecheck,
  busy,
}: {
  row: AiBoardPrompt;
  availByEngine: Record<AiEngine, boolean>;
  onRecheck: (id: string) => void;
  busy: boolean;
}) => {
  const byEngine = Object.fromEntries(row.results.map((r) => [r.engine, r])) as Record<AiEngine, AiEngineCell>;
  const rivals = mergeRivals(row.results);
  return (
    <Table.Tr>
      <Table.Td>
        <Text size="sm" fw={500}>
          {row.prompt}
        </Text>
        <RivalBadges rivals={rivals} />
      </Table.Td>
      {ENGINE_ORDER.map((engine) => {
        const cell =
          byEngine[engine] ??
          ({ engine, checked: false, status: null, ourUrl: null, rivals: [], checkedAt: null } as AiEngineCell);
        return (
          <Table.Td key={engine}>
            <EngineStatusCell cell={cell} available={availByEngine[engine] ?? true} />
          </Table.Td>
        );
      })}
      <Table.Td>
        <Text size="xs" c="dimmed">
          {relativeCheckAge(row.lastCheckedAt)}
        </Text>
      </Table.Td>
      <Table.Td>
        <Tooltip label="Re-run this prompt against the engines now">
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            leftSection={<IconRefresh size={12} />}
            onClick={() => onRecheck(row.id)}
            disabled={busy}
          >
            Re-check
          </Button>
        </Tooltip>
      </Table.Td>
    </Table.Tr>
  );
};

const AiVisibilityPanel = () => {
  const { phase, error, data, reload, busy, actionError, clearActionError, addPrompt, recheck } = useAiVisibility();

  const availByEngine = {
    CHATGPT: true,
    PERPLEXITY: true,
    GEMINI: true,
  } as Record<AiEngine, boolean>;
  for (const e of data?.engines ?? []) availByEngine[e.engine] = e.available;
  const unavailable = (data?.engines ?? []).filter((e) => !e.available);

  return (
    <Paper withBorder radius="md" p="md" mb="lg">
      <Group justify="space-between" align="flex-start" mb="sm" wrap="nowrap">
        <Group gap={8}>
          <IconSparkles size={16} />
          <Title order={5}>AI visibility monitor</Title>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Tooltip label="Live API answers can differ from the ChatGPT app and vary between runs — treat this as a directional scoreboard, not gospel.">
            <Badge color="orange" variant="light" size="xs">
              Beta · directional
            </Badge>
          </Tooltip>
          <Button
            size="compact-xs"
            variant="light"
            color="grape"
            leftSection={<IconRefresh size={12} />}
            loading={busy}
            onClick={() => void recheck()}
            disabled={phase !== 'ready'}
          >
            Re-check all
          </Button>
        </Group>
      </Group>

      <Text c="dimmed" size="sm" mb="sm">
        Buyer prompts run against ChatGPT, Perplexity and Gemini to see whether{' '}
        <Text span fw={600}>
          remaxhub.ae
        </Text>{' '}
        is cited — and which rivals are cited instead. These are real, search-grounded API answers; they can differ
        from the ChatGPT app and shift run-to-run, so read the grid as a snapshot, not a verdict.
      </Text>

      {unavailable.length > 0 ? (
        <Alert color="gray" variant="light" icon={<IconInfoCircle size={16} />} mb="md">
          {unavailable.map((e) => `${ENGINE_META[e.engine].label} (needs ${e.missingEnv})`).join(', ')} not configured —
          that column stays "No key" until the API key is set.
        </Alert>
      ) : null}

      {actionError ? (
        <Alert
          color="red"
          variant="light"
          icon={<IconAlertTriangle size={16} />}
          mb="md"
          withCloseButton
          onClose={clearActionError}
        >
          {friendlyError(actionError, 'generic')}
        </Alert>
      ) : null}

      <Box mb="md">
        <AddPromptRow onAdd={(p) => void addPrompt(p)} disabled={busy} />
      </Box>

      {phase === 'error' ? (
        <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} title="Couldn't load the monitor">
          <Stack gap="sm" align="flex-start">
            <Text size="sm">{error ? friendlyError(error, 'load') : 'Unknown error.'}</Text>
            <Button size="compact-sm" variant="light" color="red" leftSection={<IconRefresh size={13} />} onClick={reload}>
              Retry
            </Button>
          </Stack>
        </Alert>
      ) : phase === 'loading' ? (
        <Center h={140}>
          <Loader color="grape" />
        </Center>
      ) : (data?.prompts.length ?? 0) === 0 ? (
        <Text c="dimmed" size="sm">
          No prompts tracked yet. Add a buyer prompt above (e.g. "best real estate agency in Dubai for off-plan
          investment") to see whether AI engines cite remaxhub.ae.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={720}>
          <Table verticalSpacing="sm" horizontalSpacing="md" layout="auto">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Prompt &amp; rivals cited</Table.Th>
                <Table.Th w={120}>ChatGPT</Table.Th>
                <Table.Th w={120}>Perplexity</Table.Th>
                <Table.Th w={120}>Gemini</Table.Th>
                <Table.Th w={90}>Checked</Table.Th>
                <Table.Th w={110} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(data?.prompts ?? []).map((row) => (
                <VisibilityRow key={row.id} row={row} availByEngine={availByEngine} onRecheck={(id) => void recheck(id)} busy={busy} />
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Paper>
  );
};

export const SeoAiTab = () => {
  const [baseUrlInput, setBaseUrlInput] = useState(DEFAULT_SEO_BASE_URL);
  const [target, setTarget] = useState(DEFAULT_SEO_BASE_URL);
  const { phase, error, data, reload } = useWebsiteSeo(target);

  const runAudit = () => {
    const next = baseUrlInput.trim();
    if (next === '') return;
    if (next === target) reload();
    else setTarget(next);
  };

  // Automations preview stays mock (out of scope; separate config/cron surface).
  const [automation, setAutomation] = useState<SeoAiAutomationToggles>(() => getSeoAiData().automation);
  const handleToggleAutomation = (key: keyof SeoAiAutomationToggles) =>
    setAutomation((prev) => ({ ...prev, [key]: !prev[key] }));

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
            leftSection={phase === 'loading' ? undefined : <IconRefresh size={14} />}
            loading={phase === 'loading'}
            onClick={runAudit}
          >
            {phase === 'loading' ? 'Auditing…' : 'Run audit'}
          </Button>
        </Group>
      </Group>

      {/* ── Real SEO audit result ── */}
      {phase === 'error' ? (
        <Alert color="red" icon={<IconAlertTriangle size={16} />} variant="light" mb="lg" title="Couldn't run the SEO audit">
          <Stack gap="sm" align="flex-start">
            <Text size="sm">{friendlyError(error, 'load')}</Text>
            <Button size="compact-sm" variant="light" color="red" leftSection={<IconRefresh size={13} />} onClick={reload}>
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
            <ScoreCard label="AI readiness" valuePct={data.aiReadinessPct} color="grape" detail="Pages carrying JSON-LD structured data" />
            <CountCard label="Critical issues" value={data.criticalCount} color="red" detail="Missing structured data, etc." />
            <CountCard
              label="Warnings"
              value={data.warningCount}
              color="yellow"
              detail={`${data.infoCount} info · ${data.pagesReachable}/${data.pagesAudited} pages reached`}
            />
          </SimpleGrid>

          <Text size="xs" c="dimmed" mb="lg">
            Crawled {data.pagesReachable} of {data.pagesAudited} representative pages on {data.baseUrl}
            {data.scannedAt ? ` · ${relativeScanAge(data.scannedAt)}` : ''}.
            {' · ui '}
            {HERO_UI_BUILD}
          </Text>

          {data.pagesUnreachable > 0 ? (
            <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} mb="lg">
              {data.pagesUnreachable} of {data.pagesAudited} pages could not be crawled — they may not be deployed yet at{' '}
              {data.baseUrl}. Each is listed below as an info-level issue.
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
                        onClick={() => window.open(pageUrl, '_blank', 'noopener,noreferrer')}
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
                              <IconExternalLink size={13} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
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

      {/* ── AI visibility monitor (REAL) ── */}
      <AiVisibilityPanel />

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
          Preview of the automation controls — toggle state is local only and resets on reload. None of these is wired
          to a real job yet (each needs a gated cron logic-function).
        </Text>
        <Stack gap="sm">
          {(Object.keys(AUTOMATION_LABELS) as (keyof SeoAiAutomationToggles)[]).map((key) => {
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
                <Switch color="red" checked={automation[key]} onChange={() => handleToggleAutomation(key)} aria-label={meta.label} />
              </Group>
            );
          })}
        </Stack>
      </Paper>
    </Box>
  );
};
