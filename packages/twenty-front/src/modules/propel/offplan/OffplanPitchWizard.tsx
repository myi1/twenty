import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Anchor,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Chip,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core';
import {
  IconCheck,
  IconCopy,
  IconSparkles,
  IconX,
} from 'twenty-ui/display';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { formatAed } from '@/propel/lib/formatMoney';
import { OffplanHeroImage } from './OffplanHeroImage';
import {
  WA_MESSAGE_MAX,
  WIZARD_STEPS,
  canProceed,
  defaultWaMessage,
  ensurePitchLinks,
  gotoStep,
  initWizard,
  nextStep,
  prevStep,
  removeProject,
  type PitchLinkPair,
  type PitchWizardState,
} from './pitchWizard';
import type {
  OffplanMapPoint,
  PitchClient,
  PitchGenerated,
  PitchSections,
  PitchTheme,
} from './types';

const REMAX_RED = '#dc1c2e';
const GOLD = '#d4af37';

const THEMES: Array<{
  key: PitchTheme;
  label: string;
  bg: string;
  accent: string;
  text: string;
}> = [
  { key: 'nocturne', label: 'Nocturne', bg: '#0c1830', accent: GOLD, text: '#ffffff' },
  { key: 'riviera', label: 'Riviera', bg: '#f3ede1', accent: '#9a7b4f', text: '#221a10' },
  { key: 'atlas', label: 'Atlas', bg: '#0e2a3a', accent: '#3fbfb0', text: '#ffffff' },
];

const SECTION_LABELS: Record<keyof PitchSections, string> = {
  cover: 'Cover',
  districtIntro: 'District intro',
  projectPages: 'Project pages',
  units: 'Units',
  layouts: 'Layouts',
  amenities: 'Amenities',
  paymentPlan: 'Payment plan',
  areaStrength: 'Area strength',
  investorRoi: 'Investor ROI',
};

const LANGUAGES = ['English', 'Arabic', 'Russian', 'Hindi', 'Chinese'];
const CURRENCIES = ['AED', 'USD', 'EUR', 'GBP'];

// Scannable rounded AED (shared standard) — off-plan from-prices are estimates.
const aed = (n: number | null | undefined) => formatAed(n) ?? '—';

const Thumb = ({ point, w, h }: { point?: OffplanMapPoint; w: number; h: number }) => (
  <OffplanHeroImage src={point?.heroImageUrl} w={w} h={h} radius="sm" alt={point?.name} />
);

// ── Stepper rail (local — mirrors ManualWizard's PropelStepper, vertical) ────
const OffplanPitchStepper = ({
  active,
  maxReached,
  locked,
  onGoto,
  meta,
}: {
  active: number;
  maxReached: number;
  locked: boolean;
  onGoto: (n: number) => void;
  meta: string;
}) => (
  <Box
    style={{
      width: 210,
      flex: 'none',
      borderRight: '1px solid var(--mantine-color-default-border)',
      display: 'flex',
      flexDirection: 'column',
      padding: '20px 16px',
    }}
  >
    <Text fw={800} size="sm" mb="md">
      Build pitch
    </Text>
    <Stack gap={14} style={{ flex: 1 }}>
      {WIZARD_STEPS.map((label, idx) => {
        const done = idx < active;
        const current = idx === active;
        // One-way door: once generation has started, steps 0-3 are sealed —
        // regenerating from stale state is not a thing.
        const sealed = locked && idx < 4;
        const clickable = idx <= maxReached && idx !== active && !sealed;
        return (
          <Group
            key={label}
            gap={8}
            wrap="nowrap"
            style={{
              cursor: clickable ? 'pointer' : 'default',
              opacity: sealed ? 0.45 : 1,
            }}
            onClick={() => clickable && onGoto(idx)}
          >
            <Box
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                flex: 'none',
                display: 'grid',
                placeItems: 'center',
                fontSize: 12,
                fontWeight: 700,
                background:
                  done || current ? 'var(--mantine-color-red-6)' : 'transparent',
                color: done || current ? '#fff' : 'var(--mantine-color-dimmed)',
                border:
                  done || current
                    ? 'none'
                    : '1.5px solid var(--mantine-color-default-border)',
              }}
            >
              {done ? <IconCheck size={14} /> : idx + 1}
            </Box>
            <Text
              size="sm"
              fw={current ? 700 : 500}
              c={current ? 'var(--mantine-color-text)' : 'dimmed'}
              truncate
            >
              {label}
            </Text>
          </Group>
        );
      })}
    </Stack>
    <Text size="xs" c="dimmed">
      {meta}
    </Text>
  </Box>
);

type GenRow = {
  status: 'pending' | 'busy' | 'done' | 'error';
  url?: string;
  filename?: string;
  error?: string;
};

export function OffplanPitchWizard({
  initialProjectIds,
  initialAnchor,
  byId,
  onClose,
}: {
  initialProjectIds: number[];
  initialAnchor?: { projectId: number; unitId?: number };
  byId: Map<number, OffplanMapPoint>;
  onClose: () => void;
}) {
  const [state, setState] = useState<PitchWizardState>(() =>
    initWizard(initialProjectIds, initialAnchor),
  );
  const [maxReached, setMaxReached] = useState(0);

  // client search
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [people, setPeople] = useState<PitchClient[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // AI copy
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  // generation + send
  const [genRows, setGenRows] = useState<Record<number, GenRow>>({});
  const [generating, setGenerating] = useState(false);
  const [waText, setWaText] = useState('');
  const [waBusy, setWaBusy] = useState(false);
  const [waResult, setWaResult] = useState<'queued' | string | null>(null);
  // Single-shot: after ANY send attempt (success OR failure) the button stays
  // disabled — a failed response may still have queued the message server-side,
  // so a retry risks a duplicate to the client.
  const [sendAttempted, setSendAttempted] = useState(false);
  const [copied, setCopied] = useState(false);
  const genStartedRef = useRef(false);

  // One-way door: once generation has started, the earlier steps are sealed
  // (Back + rail jumps to 0-3 disabled) — the PDFs on the Send step would no
  // longer match a re-edited selection.
  const locked = genStartedRef.current || state.generated.length > 0;

  const points = useMemo(
    () =>
      state.projectIds
        .map((id) => byId.get(id))
        .filter((p): p is OffplanMapPoint => p != null),
    [state.projectIds, byId],
  );

  const advance = (s: PitchWizardState) => {
    setState(s);
    setMaxReached((m) => Math.max(m, s.step));
  };

  // ── Client search (350ms debounce, min 2 chars) ────────────────────────────
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setPeople(null);
      setSearchError(null);
      setSearching(false); // clearing the query mid-flight must not strand the spinner
      return;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await callPropelRoute<{ ok?: boolean; people?: PitchClient[] }>(
        '/offplan/assist',
        { action: 'personSearch', query: q },
      );
      if (!alive) return;
      setSearching(false);
      if (res?.ok) {
        setPeople(res.people ?? []);
        setSearchError(null);
      } else {
        setPeople(null);
        setSearchError('Search failed — try again.');
      }
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query]);

  // ── AI draft (pitchCopy) ───────────────────────────────────────────────────
  const draftWithAi = async () => {
    setAiBusy(true);
    const res = await callPropelRoute<{
      ok?: boolean;
      code?: string;
      coverNote?: string;
      waMessage?: string;
    }>('/offplan/assist', {
      action: 'pitchCopy',
      clientName: state.client?.name,
      language: state.language,
      projects: points.map((p) => ({
        name: p.name,
        district: p.districtName,
        developer: state.hideDeveloper ? undefined : p.developerName ?? undefined,
        priceFromAed: p.priceFromAed,
        handover: p.handover,
      })),
    });
    setAiBusy(false);
    if (res?.ok) {
      setState((s) => ({
        ...s,
        coverNote: res.coverNote ?? s.coverNote,
        waMessage: res.waMessage ?? s.waMessage,
      }));
    } else if (res?.code === 'AI_UNAVAILABLE') {
      setAiUnavailable(true);
    }
  };

  // ── Generation (runs once on entering the Send step) ──────────────────────
  useEffect(() => {
    if (state.step !== 4 || genStartedRef.current) return;
    genStartedRef.current = true;
    let alive = true;
    (async () => {
      setGenerating(true);
      const ids = state.projectIds;
      setGenRows(Object.fromEntries(ids.map((id) => [id, { status: 'pending' as const }])));
      const collected: PitchGenerated[] = [];
      for (const id of ids) {
        if (!alive) return;
        setGenRows((r) => ({ ...r, [id]: { status: 'busy' } }));
        const res = await callPropelRoute<{
          ok?: boolean;
          url?: string;
          filename?: string;
          noteId?: string;
          error?: string;
        }>('/offplan/pitch-generate', {
          projectExternalId: id,
          unitExternalId: state.anchorUnits[id],
          clientName: state.client?.name,
          note: state.coverNote || undefined,
          personId: state.client?.id,
        });
        if (!alive) return;
        if (res?.ok && res.url) {
          collected.push({
            projectExternalId: id,
            url: res.url,
            filename: res.filename,
            noteId: res.noteId,
          });
          setGenRows((r) => ({
            ...r,
            [id]: { status: 'done', url: res.url, filename: res.filename },
          }));
          // Phase 2 — record the client↔project interest as queryable pipeline.
          // Fire-and-forget + non-fatal: the pitch already succeeded; a failed
          // side-record must never surface as a pitch error. Idempotent server-side
          // on (contact, projectId), so a re-pitch just bumps status/lastTouch.
          if (state.client?.id) {
            const pt = byId.get(id);
            void callPropelRoute('/offplan/assist', {
              action: 'saveInterest',
              personId: state.client.id,
              projectId: String(id),
              projectName: pt?.name ?? `Project ${id}`,
              clientName: state.client.name,
              developer: state.hideDeveloper ? undefined : pt?.developerName ?? undefined,
              priceFrom: pt?.priceFromAed ?? undefined,
              status: 'PITCHED',
              source: 'PITCH',
            }).catch(() => {});
          }
        } else {
          setGenRows((r) => ({
            ...r,
            [id]: { status: 'error', error: res?.error ?? 'Generation failed' },
          }));
        }
      }
      setGenerating(false);
      setState((s) => ({ ...s, generated: collected }));
      // Pair each SUCCESSFUL project with ITS url — never zip the full
      // selection against the (possibly shorter) success list.
      const pairs: PitchLinkPair[] = collected.map((g) => ({
        name: byId.get(g.projectExternalId)?.name ?? `Project ${g.projectExternalId}`,
        url: g.url,
      }));
      const base = state.waMessage || defaultWaMessage(state, pairs);
      // An AI-drafted waMessage carries no urls — always ship the links.
      setWaText(ensurePitchLinks(base, pairs));
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step]);

  // ── WhatsApp send ──────────────────────────────────────────────────────────
  const sendWhatsApp = async () => {
    if (!state.client || sendAttempted) return;
    setSendAttempted(true); // single-shot — never invite a resend
    setWaBusy(true);
    setWaResult(null);
    const res = await callPropelRoute<{
      ok?: boolean;
      queued?: boolean;
      code?: string;
      error?: string;
    }>('/offplan/assist', {
      action: 'waSend',
      personId: state.client.id,
      message: waText,
    });
    setWaBusy(false);
    if (res?.ok) {
      setWaResult('queued');
      return;
    }
    const detail =
      res?.code === 'NO_PHONE'
        ? 'client has no valid phone number'
        : res?.code === 'WA_NOT_CONFIGURED'
          ? 'WhatsApp service not configured on this environment'
          : res?.error;
    setWaResult(
      `Send failed — do not resend: the message may still be queued. Check the client's WhatsApp thread first.${
        detail ? ` (${detail})` : ''
      }`,
    );
  };

  const copyAll = async () => {
    await navigator.clipboard.writeText(state.generated.map((g) => g.url).join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  // ── Step bodies ────────────────────────────────────────────────────────────
  const renderSelection = () => {
    const byDistrict = new Map<string, OffplanMapPoint[]>();
    for (const p of points) {
      const key = p.districtName || 'Other';
      const arr = byDistrict.get(key) ?? [];
      arr.push(p);
      byDistrict.set(key, arr);
    }
    return (
      <Stack gap="md">
        <Text fw={700}>Selected projects ({state.projectIds.length})</Text>
        {[...byDistrict.entries()].map(([district, list]) => (
          <Box key={district}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb={6}>
              {district}
            </Text>
            <Stack gap={8}>
              {list.map((p) => (
                <Card key={p.externalId} withBorder padding="xs" radius="md">
                  <Group wrap="nowrap" justify="space-between">
                    <Group wrap="nowrap" gap="sm" style={{ minWidth: 0 }}>
                      <Thumb point={p} w={56} h={44} />
                      <Box style={{ minWidth: 0 }}>
                        <Text fw={600} size="sm" lineClamp={1}>
                          {p.name}
                        </Text>
                        <Text size="xs" c="dimmed" lineClamp={1}>
                          {p.developerName ?? '—'} · from {aed(p.priceFromAed)}
                        </Text>
                      </Box>
                    </Group>
                    <Group gap="xs" wrap="nowrap">
                      {state.anchorUnits[p.externalId] != null && (
                        <Badge variant="light" color="yellow" size="sm">
                          Unit #{state.anchorUnits[p.externalId]}
                        </Badge>
                      )}
                      <Button
                        variant="subtle"
                        color="gray"
                        size="compact-xs"
                        onClick={() => setState((s) => removeProject(s, p.externalId))}
                      >
                        <IconX size={14} />
                      </Button>
                    </Group>
                  </Group>
                </Card>
              ))}
            </Stack>
          </Box>
        ))}
        {state.projectIds.length === 0 && (
          <Text c="dimmed" size="sm">
            No projects selected.
          </Text>
        )}
        <Text size="xs" c="dimmed">
          Add more from the map/list — shortlist then reopen.
        </Text>
      </Stack>
    );
  };

  const renderClient = () => (
    <Stack gap="sm">
      <Text fw={700}>Attach a client</Text>
      <TextInput
        placeholder="Search people by name… (min 2 characters)"
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        rightSection={searching ? <Loader size={14} /> : undefined}
      />
      {searchError && (
        <Text size="xs" c="dimmed">
          {searchError}
        </Text>
      )}
      <Stack gap={6}>
        {(people ?? []).map((person) => {
          const selected = state.client?.id === person.id;
          return (
            <Card
              key={person.id}
              withBorder
              padding="xs"
              radius="md"
              onClick={() =>
                setState((s) => ({ ...s, client: person, clientSkipped: false }))
              }
              style={{
                cursor: 'pointer',
                outline: selected ? `2px solid ${REMAX_RED}` : undefined,
              }}
            >
              <Group wrap="nowrap" justify="space-between">
                <Group wrap="nowrap" gap="sm">
                  <Avatar radius="xl" size="sm" color="red">
                    {person.name.trim().charAt(0).toUpperCase() || '?'}
                  </Avatar>
                  <Text size="sm" fw={600}>
                    {person.name}
                  </Text>
                </Group>
                {person.phoneE164 ? (
                  <Badge variant="light" color="green" size="sm">
                    {person.phoneE164}
                  </Badge>
                ) : (
                  <Text size="xs" c="dimmed">
                    no phone
                  </Text>
                )}
              </Group>
            </Card>
          );
        })}
        {people != null && people.length === 0 && (
          <Text size="xs" c="dimmed">
            No matches — try a different name.
          </Text>
        )}
      </Stack>
      <Card
        withBorder
        padding="xs"
        radius="md"
        onClick={() =>
          setState((s) => ({ ...s, client: null, clientSkipped: true }))
        }
        style={{
          cursor: 'pointer',
          outline: state.clientSkipped ? `2px solid ${REMAX_RED}` : undefined,
        }}
      >
        <Text size="sm" c="dimmed">
          No client / attach later
        </Text>
      </Card>
    </Stack>
  );

  const renderPresentation = () => (
    <Stack gap="md">
      <Box>
        <Text fw={700} mb={8}>
          Theme
        </Text>
        <Group gap="sm">
          {THEMES.map((t) => (
            <Card
              key={t.key}
              padding="sm"
              radius="md"
              onClick={() => setState((s) => ({ ...s, theme: t.key }))}
              style={{
                width: 120,
                cursor: 'pointer',
                background: t.bg,
                outline:
                  state.theme === t.key
                    ? `2px solid ${REMAX_RED}`
                    : '1px solid var(--mantine-color-default-border)',
              }}
            >
              <Box style={{ width: 28, height: 4, background: t.accent, borderRadius: 2 }} />
              <Text size="sm" fw={700} mt={10} style={{ color: t.text }}>
                {t.label}
              </Text>
            </Card>
          ))}
        </Group>
        <Text size="xs" c="dimmed" mt={6}>
          Affects the preview &amp; message copy — PDF theming/sections land in P1.
        </Text>
      </Box>
      <Group gap="sm" align="flex-end">
        <Select
          label="Language"
          data={LANGUAGES}
          value={state.language}
          onChange={(v) => v && setState((s) => ({ ...s, language: v }))}
          maw={160}
        />
        {/* Currency has no effect yet (PDF renders AED) — kept visible, disabled until P1. */}
        <Tooltip label="P1">
          <Box maw={120}>
            <Select
              label="Currency"
              data={CURRENCIES}
              value={state.currency}
              disabled
              onChange={(v) => v && setState((s) => ({ ...s, currency: v }))}
            />
          </Box>
        </Tooltip>
      </Group>
      <Box>
        <Text fw={700} mb={8}>
          Sections
        </Text>
        {/* Section toggles don't reach the PDF renderer yet — kept visible, disabled until P1. */}
        <Tooltip label="P1">
          <Group gap="xs">
            {(Object.keys(SECTION_LABELS) as Array<keyof PitchSections>).map((k) => (
              <Chip
                key={k}
                size="xs"
                color="red"
                disabled
                checked={state.sections[k]}
                onChange={(checked) =>
                  setState((s) => ({ ...s, sections: { ...s.sections, [k]: checked } }))
                }
              >
                {SECTION_LABELS[k]}
              </Chip>
            ))}
          </Group>
        </Tooltip>
        <Text size="xs" c="dimmed" mt={6}>
          Affects the preview &amp; message copy — PDF theming/sections land in P1.
        </Text>
      </Box>
      <Switch
        label="Hide developer"
        checked={state.hideDeveloper}
        onChange={(e) =>
          setState((s) => ({ ...s, hideDeveloper: e.currentTarget.checked }))
        }
      />
      <Box>
        <Group justify="space-between" mb={4}>
          <Text fw={700}>Cover note</Text>
          {!aiUnavailable && (
            <Button
              variant="default"
              size="compact-xs"
              loading={aiBusy}
              leftSection={<IconSparkles size={13} color={GOLD} />}
              onClick={() => void draftWithAi()}
            >
              Draft with AI
            </Button>
          )}
        </Group>
        <Textarea
          value={state.coverNote}
          minRows={3}
          autosize
          placeholder="A short personal note for the cover page…"
          onChange={(e) => {
            const v = e.currentTarget.value;
            setState((s) => ({ ...s, coverNote: v }));
          }}
        />
      </Box>
    </Stack>
  );

  const renderReview = () => {
    const theme = THEMES.find((t) => t.key === state.theme) ?? THEMES[0];
    return (
      <Stack gap="md">
        <Text fw={700}>Preview</Text>
        <ScrollArea>
          <Group gap="sm" wrap="nowrap" pb="xs">
            {/* Cover slide */}
            <Box
              style={{
                width: 180,
                height: 240,
                flex: 'none',
                borderRadius: 10,
                background: theme.bg,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <Text size="xs" fw={800} style={{ color: theme.accent, letterSpacing: 1 }}>
                RE/MAX HUB
              </Text>
              <Box>
                <Text fw={800} size="sm" style={{ color: theme.text }}>
                  Off-Plan Selection
                </Text>
                {state.client && (
                  <Text size="xs" mt={4} style={{ color: theme.text, opacity: 0.85 }}>
                    Prepared for {state.client.name}
                  </Text>
                )}
              </Box>
              <Text size="xs" style={{ color: theme.accent }}>
                Your agent · RE/MAX Hub
              </Text>
            </Box>
            {/* One slide per project */}
            {points.map((p) => (
              <Box
                key={p.externalId}
                style={{
                  width: 180,
                  height: 240,
                  flex: 'none',
                  borderRadius: 10,
                  overflow: 'hidden',
                  background: theme.bg,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <OffplanHeroImage src={p.heroImageUrl} h={110} radius={0} alt={p.name} />
                <Box p={12} style={{ flex: 1 }}>
                  <Text fw={700} size="xs" lineClamp={2} style={{ color: theme.text }}>
                    {p.name}
                  </Text>
                  <Text size="xs" style={{ color: theme.text, opacity: 0.7 }}>
                    {p.districtName}
                    {!state.hideDeveloper && p.developerName ? ` · ${p.developerName}` : ''}
                  </Text>
                  <Text size="xs" fw={700} mt={6} style={{ color: theme.accent }}>
                    from {aed(p.priceFromAed)}
                  </Text>
                </Box>
              </Box>
            ))}
          </Group>
        </ScrollArea>
        <Text size="xs" c="dimmed">
          {state.projectIds.length} branded PDF{state.projectIds.length === 1 ? '' : 's'} will be
          generated — one per project.
        </Text>
      </Stack>
    );
  };

  const renderSend = () => {
    const overLimit = waText.length > WA_MESSAGE_MAX;
    const canSendWa =
      state.client?.phoneE164 != null &&
      state.generated.length > 0 &&
      !sendAttempted &&
      !overLimit;
    return (
      <Stack gap="md">
        <Text fw={700}>Generate & send</Text>
        <Stack gap={6}>
          {state.projectIds.map((id) => {
            const row = genRows[id];
            const name = byId.get(id)?.name ?? `Project ${id}`;
            return (
              <Group key={id} gap="sm" wrap="nowrap">
                {row?.status === 'busy' && <Loader size={14} />}
                {row?.status === 'done' && <IconCheck size={14} color="green" />}
                {row?.status === 'error' && <IconX size={14} color={REMAX_RED} />}
                {(row == null || row.status === 'pending') && (
                  <Box style={{ width: 14 }} />
                )}
                <Text size="sm" style={{ flex: 1 }} lineClamp={1}>
                  {name}
                </Text>
                {row?.status === 'done' && row.url && (
                  <Anchor href={row.url} target="_blank" rel="noopener" size="xs">
                    {row.filename ?? 'Open PDF'}
                  </Anchor>
                )}
                {row?.status === 'error' && (
                  <Text size="xs" c="red">
                    {row.error}
                  </Text>
                )}
              </Group>
            );
          })}
        </Stack>
        {!generating && state.generated.length > 0 && (
          <>
            <Group gap="xs">
              <Button
                variant="default"
                size="compact-xs"
                leftSection={<IconCopy size={13} />}
                onClick={() => void copyAll()}
              >
                {copied ? 'Copied ✓' : 'Copy all links'}
              </Button>
              {state.client && (
                <Text size="xs" c="dimmed">
                  Logged to {state.client.name}&rsquo;s timeline (one note per project)
                </Text>
              )}
            </Group>
            <Box>
              <Text fw={700} size="sm" mb={4}>
                WhatsApp message
              </Text>
              <Textarea
                value={waText}
                minRows={4}
                autosize
                onChange={(e) => setWaText(e.currentTarget.value)}
              />
              <Text size="xs" c={overLimit ? 'red' : 'dimmed'} mt={4}>
                {waText.length} / {WA_MESSAGE_MAX}
                {overLimit &&
                  ' — too long: the server rejects messages over 1500 characters. Shorten it to send.'}
              </Text>
              <Group mt="xs" gap="xs">
                <Button
                  color="red"
                  size="xs"
                  disabled={!canSendWa}
                  loading={waBusy}
                  onClick={() => void sendWhatsApp()}
                >
                  Send on WhatsApp
                </Button>
                <Tooltip label="P1">
                  <Button variant="default" size="xs" data-disabled onClick={(e) => e.preventDefault()}>
                    Send by email
                  </Button>
                </Tooltip>
                {waResult === 'queued' && (
                  <Badge color="green" variant="light">
                    Queued ✓
                  </Badge>
                )}
                {waResult != null && waResult !== 'queued' && (
                  <Text size="xs" c="red" style={{ flex: 1, minWidth: 200 }}>
                    {waResult}
                  </Text>
                )}
                {!canSendWa && state.client != null && state.client.phoneE164 == null && (
                  <Text size="xs" c="dimmed">
                    Client has no valid phone.
                  </Text>
                )}
              </Group>
            </Box>
          </>
        )}
        {!generating &&
          state.generated.length === 0 &&
          Object.values(genRows).some((r) => r.status === 'error') && (
            <Text size="sm" c="red">
              All generations failed — close and retry.
            </Text>
          )}
      </Stack>
    );
  };

  const bodies = [renderSelection, renderClient, renderPresentation, renderReview, renderSend];
  const meta = `${state.projectIds.length} project${state.projectIds.length === 1 ? '' : 's'}${
    state.client ? ` · ${state.client.name}` : state.clientSkipped ? ' · no client' : ''
  }`;

  return (
    <Modal
      opened
      onClose={onClose}
      size={960}
      withCloseButton={false}
      styles={{ body: { padding: 0 } }}
    >
      <Box style={{ display: 'flex', minHeight: 520 }}>
        <OffplanPitchStepper
          active={state.step}
          maxReached={maxReached}
          locked={locked}
          onGoto={(n) => {
            if (locked && n < 4) return; // one-way door after generation
            setState((s) => gotoStep(s, n));
          }}
          meta={meta}
        />
        <Box style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <ScrollArea style={{ flex: 1 }} h={460}>
            <Box p="lg">{bodies[state.step]()}</Box>
          </ScrollArea>
          <Group
            justify="space-between"
            p="md"
            style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
          >
            <Button
              variant="default"
              disabled={state.step === 0 || generating || locked}
              onClick={() => {
                if (locked) return; // one-way door after generation
                setState((s) => prevStep(s));
              }}
            >
              ← Back
            </Button>
            {state.step < 4 ? (
              <Button
                color="red"
                disabled={!canProceed(state)}
                onClick={() => advance(nextStep(state))}
              >
                {state.step === 3
                  ? `Generate ${state.projectIds.length} PDF${
                      state.projectIds.length === 1 ? '' : 's'
                    } →`
                  : 'Next →'}
              </Button>
            ) : (
              <Button color="red" disabled={generating} onClick={onClose}>
                Done
              </Button>
            )}
          </Group>
        </Box>
      </Box>
    </Modal>
  );
}
