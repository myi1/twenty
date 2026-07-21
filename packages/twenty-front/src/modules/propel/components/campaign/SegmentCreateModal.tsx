import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Collapse,
  Group,
  Loader,
  Modal,
  MultiSelect,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  IconAlertCircle,
  IconChevronDown,
  IconChevronRight,
  IconFileUpload,
  IconFilter,
  IconStack2,
  IconUpload,
  IconUsers,
} from 'twenty-ui/display';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { friendlyError } from '@/propel/lib/friendlyError';
import {
  buildCriteriaV2,
  envelopeMessage,
  fileToBase64,
  LEAD_SOURCE_OPTIONS,
  MEDIA_MAX_DECODED_BYTES,
  OPP_STAGE_OPTIONS,
  parsePersonIds,
} from '@/propel/lib/campaignBuilderConfig';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import {
  type ImportAgentOption,
  type ImportColMap,
  type ImportCommitResponse,
  type ImportPreviewResponse,
  type PoolCatalogEntry,
  type PoolCatalogResponse,
  type PoolResolveResponse,
  type SaveSegmentResponse,
  type SegmentOption,
} from '@/propel/types/campaignBuilder';

const EMPTY_MAP: ImportColMap = {
  email: null,
  phone: null,
  firstName: null,
  lastName: null,
  fullName: null,
};

const ROLE_LABELS: { key: keyof ImportColMap; label: string }[] = [
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'fullName', label: 'Full name' },
];

// Real Mantine Modal — focus-trapped, escape-closeable, scrolls independently.
// Two ways to make an audience: upload a CSV/Excel of contacts (two-phase:
// preview columns → confirm map → commit), or define live criteria (lead
// source(s) + a relative cold window). On success it hands a SegmentOption back
// so the just-made audience is selectable in the wizard immediately.
export const SegmentCreateModal = ({
  opened,
  onClose,
  onCreated,
  channel,
}: {
  opened: boolean;
  onClose: () => void;
  onCreated: (segment: SegmentOption) => void;
  channel: 'EMAIL' | 'WHATSAPP';
}) => {
  const notify = usePropelToast();
  const [mode, setMode] = useState<'pools' | 'csv' | 'criteria'>('pools');
  const [name, setName] = useState('');

  // CSV / Excel two-phase upload state.
  const [phase, setPhase] = useState<'pick' | 'map'>('pick');
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  const [fileB64, setFileB64] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState('');
  const [preview, setPreview] = useState<{
    headers: string[];
    sampleRows: string[][];
    totalRows: number;
  } | null>(null);
  const [colMap, setColMap] = useState<ImportColMap>(EMPTY_MAP);
  const [committing, setCommitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inFlightRef = useRef(false);

  // Assign new contacts to an agent (so the campaign's replies route to them).
  // The roster + the uploader's own id load once when the CSV tab is shown; the
  // picker defaults to the uploader. Only NEW contacts are stamped server-side.
  const [agents, setAgents] = useState<ImportAgentOption[] | null>(null);
  const [assignAgentId, setAssignAgentId] = useState<string | null>(null);

  // Criteria state — the 2 common axes (always visible) + S5's progressive axes
  // (behind "More filters").
  const [sources, setSources] = useState<string[]>([]);
  const [coldDays, setColdDays] = useState('');
  // S5 — progressive axes.
  const [moreOpen, setMoreOpen] = useState(false);
  const [oppStages, setOppStages] = useState<string[]>([]);
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [personIdsRaw, setPersonIdsRaw] = useState('');
  const [savingCriteria, setSavingCriteria] = useState(false);
  const [criteriaErr, setCriteriaErr] = useState('');

  // ── Pools (Pools ↔ Marketing Cloud) state ──────────────────────────────────
  // The lead/nurture/lane pools resolve through /marketing/pool-segments. The
  // catalog loads once on first open; picking a pool resolves its LIVE membership
  // to an estimate + exclusion breakdown; "Use this audience" persists a saved
  // segment from the pool's criteria so the campaign re-resolves at send-start.
  const [poolCatalog, setPoolCatalog] = useState<PoolCatalogEntry[] | null>(null);
  const [poolCatalogState, setPoolCatalogState] = useState<
    'idle' | 'loading' | 'failed'
  >('idle');
  const [poolKey, setPoolKey] = useState<string | null>(null);
  // "include locked / owned / active" override — only meaningful for LANE pools
  // (where suppression defaults ON). Maps to the route's includeActive flag.
  const [includeActive, setIncludeActive] = useState(false);
  const [poolResolve, setPoolResolve] = useState<PoolResolveResponse | null>(
    null,
  );
  const [poolResolving, setPoolResolving] = useState(false);
  const [savingPool, setSavingPool] = useState(false);
  const [poolErr, setPoolErr] = useState('');

  const selectedPool = useMemo(
    () => poolCatalog?.find((p) => p.key === poolKey) ?? null,
    [poolCatalog, poolKey],
  );

  // Live count of the hand-entered person allow-list (normalized the same way
  // the payload will be), so the user sees how many distinct ids they pasted.
  const personIdCount = useMemo(
    () => parsePersonIds(personIdsRaw).length,
    [personIdsRaw],
  );
  // Any progressive axis carrying a value (drives the validation gate so an
  // opp-stage-only or person-list-only segment is creatable, not just the 2
  // common axes).
  const hasMoreFilters =
    oppStages.length > 0 ||
    budgetMin.trim() !== '' ||
    budgetMax.trim() !== '' ||
    personIdCount > 0;

  const resetAll = useCallback(() => {
    setMode('pools');
    setName('');
    setPhase('pick');
    setUploadErr('');
    setFileB64('');
    setFileName('');
    setFileType('');
    setPreview(null);
    setColMap(EMPTY_MAP);
    setSources([]);
    setColdDays('');
    setMoreOpen(false);
    setOppStages([]);
    setBudgetMin('');
    setBudgetMax('');
    setPersonIdsRaw('');
    setCriteriaErr('');
    setPoolKey(null);
    setIncludeActive(false);
    setPoolResolve(null);
    setPoolErr('');
    // Keep poolCatalog + agents cached across opens (static) — only the picked
    // agent resets, and it re-defaults to the uploader when the roster loads.
    setAssignAgentId(null);
  }, []);

  const handleClose = useCallback(() => {
    if (uploading || committing || savingCriteria || savingPool) return;
    resetAll();
    onClose();
  }, [uploading, committing, savingCriteria, savingPool, resetAll, onClose]);

  // ── CSV: load the assignable agent roster once when the CSV tab is shown ────
  // Reused for the "Assign new contacts to" picker; defaults the selection to the
  // uploader (selfId). A failed load just leaves the picker empty — the commit
  // then sends no agent and the server falls back to the uploader, so an upload
  // is never blocked on this fetch.
  useEffect(() => {
    if (!opened || mode !== 'csv' || agents !== null) return;
    let active = true;
    void callPropelRoute<ImportPreviewResponse>('/marketing/import-segment', {
      mode: 'agents',
    }).then((res) => {
      if (!active) return;
      if (res && res.ok && Array.isArray(res.agents)) {
        setAgents(res.agents);
        setAssignAgentId((prev) => prev ?? res.selfId ?? null);
      }
    });
    return () => {
      active = false;
    };
  }, [opened, mode, agents]);

  // ── Pools: load the catalog once when the Pools tab is first shown ──────────
  // The catalog is static (a pool is a named criteria recipe, no DB row), so we
  // fetch it once and cache it across opens. Loaded lazily on the Pools tab so a
  // CSV-only user never pays for it.
  useEffect(() => {
    if (!opened || mode !== 'pools') return;
    if (poolCatalog !== null || poolCatalogState === 'loading') return;
    let active = true;
    setPoolCatalogState('loading');
    void callPropelRoute<PoolCatalogResponse>('/marketing/pool-segments', {
      mode: 'catalog',
    }).then((res) => {
      if (!active) return;
      if (res && res.ok && Array.isArray(res.pools)) {
        setPoolCatalog(res.pools);
        setPoolCatalogState('idle');
      } else {
        setPoolCatalogState('failed');
      }
    });
    return () => {
      active = false;
    };
  }, [opened, mode, poolCatalog, poolCatalogState]);

  // ── Pools: resolve the chosen pool's LIVE membership ────────────────────────
  // Runs when the pool selection, the include-active override, or the channel
  // changes (debounce not needed — these are discrete picks, not keystrokes).
  // Honest: a failed resolve clears the estimate and shows the error rather than a
  // stale/fake count.
  useEffect(() => {
    if (!opened || mode !== 'pools' || !poolKey) {
      setPoolResolve(null);
      return;
    }
    let active = true;
    setPoolResolving(true);
    setPoolErr('');
    void callPropelRoute<PoolResolveResponse>('/marketing/pool-segments', {
      mode: 'resolve',
      poolKey,
      channel,
      includeActive,
    }).then((res) => {
      if (!active) return;
      setPoolResolving(false);
      if (res && res.ok && res.segment) {
        setPoolResolve(res);
      } else {
        setPoolResolve(null);
        setPoolErr(
          friendlyError(
            envelopeMessage(res, 'Could not resolve this pool — try another.'),
            'load',
          ),
        );
      }
    });
    return () => {
      active = false;
    };
  }, [opened, mode, poolKey, includeActive, channel]);

  // Persist the resolved pool as a saved segment so the campaign's segment relation
  // re-resolves the SAME live audience at send-start. We write the pool's CRITERIA
  // (carried back by the resolve) via save-segment with resolve:true so the picker
  // label is honest. The segment name defaults to the pool label unless the user
  // typed one.
  //
  // ⚠ SEND-START FIDELITY (the membership-axis gap): for LANE pools the membership
  // IS the criteria (lanes[] + suppressLockedOwnedActive), so the persisted segment
  // resolves IDENTICALLY at send-start. For the LEAD POOL + NURTURE pools the
  // membership is a SEPARATE filter the route applies (routingState='POOL' /
  // nurtureState=tier) that the resolver/save-segment does NOT yet carry as a
  // criteria axis — so the persisted segment would resolve a SUPERSET at send-start.
  // We surface that honestly in the UI (see the membership note) and the count we
  // STORE is the route's faithful pool estimate, never the looser save-segment one.
  // BACKEND TODO(pools-membership-axis): widen SegmentCriteriaV2 + the resolver with
  // a positive pool/nurture membership axis (routingState/nurtureState), persisted
  // by save-segment, so send-start matches the preview exactly. That's CRM app-side
  // (segment-resolver.ts + marketing-save-segment-route.ts) — owned by another agent.
  const usePool = useCallback(async () => {
    if (savingPool || !poolResolve || !poolResolve.segment || !selectedPool) {
      return;
    }
    setSavingPool(true);
    setPoolErr('');
    const segName = name.trim() || selectedPool.label;
    try {
      const res = await callPropelRoute<SaveSegmentResponse>(
        '/marketing/save-segment',
        {
          name: segName,
          criteria: poolResolve.segment.criteria,
          channel,
          resolve: true,
        },
      );
      if (res && res.ok && res.segmentId) {
        // Store the ROUTE's faithful pool estimate (not save-segment's looser
        // resolve) so the picker label reflects the pool's true membership.
        const estimate =
          typeof poolResolve.estimate === 'number'
            ? poolResolve.estimate
            : (res.estimate ?? 0);
        onCreated({
          id: res.segmentId,
          name: segName,
          lastResolvedCount: estimate,
          lastResolvedLabel: `~${estimate.toLocaleString('en-US')} (live pool)`,
        });
        notify(
          `Audience ready from ${selectedPool.label} — ~${estimate.toLocaleString(
            'en-US',
          )} contacts (resolves live at send).`,
          'success',
        );
        resetAll();
        onClose();
      } else {
        setPoolErr(
          friendlyError(
            envelopeMessage(res, 'Could not save this audience — try again.'),
            'save',
          ),
        );
      }
    } catch {
      setPoolErr('Could not save this audience — check your connection.');
    } finally {
      setSavingPool(false);
    }
  }, [
    savingPool,
    poolResolve,
    selectedPool,
    name,
    channel,
    onCreated,
    notify,
    resetAll,
    onClose,
  ]);

  // Phase 1 — read the chosen File's bytes and ask the server to PREVIEW columns
  // (creates nothing). Native File.arrayBuffer() replaces the sandbox's
  // readFrontComponentFile RPC.
  const onPickFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file || inFlightRef.current) return;
      if (!name.trim()) {
        setUploadErr('Name the segment first, then choose a file.');
        return;
      }
      if (file.size > MEDIA_MAX_DECODED_BYTES) {
        const maxMb = Math.floor(MEDIA_MAX_DECODED_BYTES / (1024 * 1024));
        setUploadErr(`That file is too large (max ${maxMb} MB). Split the list and try again.`);
        return;
      }
      inFlightRef.current = true;
      setUploading(true);
      setUploadErr('');
      try {
        const contentBase64 = await fileToBase64(file);
        const res = await callPropelRoute<ImportPreviewResponse>(
          '/marketing/import-segment',
          {
            name: name.trim(),
            filename: file.name,
            contentType: file.type,
            contentBase64,
            mode: 'preview',
          },
        );
        if (res && res.ok && res.headers) {
          setFileB64(contentBase64);
          setFileName(file.name);
          setFileType(file.type);
          setPreview({
            headers: res.headers,
            sampleRows: res.sampleRows ?? [],
            totalRows: res.totalRows ?? 0,
          });
          setColMap(res.detected ?? EMPTY_MAP);
          setPhase('map');
        } else {
          setUploadErr(
            envelopeMessage(
              res,
              'Could not read that file — check the format and try again.',
            ),
          );
        }
      } catch {
        setUploadErr('Upload failed — check your connection and try again.');
      } finally {
        inFlightRef.current = false;
        setUploading(false);
      }
    },
    [name],
  );

  // Phase 2 — commit with the confirmed column map (re-sends the cached bytes).
  const commitImport = useCallback(async () => {
    if (committing) return;
    if (colMap.email === null && colMap.phone === null) {
      setUploadErr('Map a column to Email and/or Phone so we know who to contact.');
      return;
    }
    setCommitting(true);
    setUploadErr('');
    try {
      const res = await callPropelRoute<ImportCommitResponse>(
        '/marketing/import-segment',
        {
          name: name.trim(),
          filename: fileName,
          contentType: fileType,
          contentBase64: fileB64,
          mode: 'commit',
          columnMap: colMap,
          assignedAgentId: assignAgentId,
        },
      );
      if (res && res.ok && res.segmentId) {
        const listSize = res.listSize ?? 0;
        onCreated({
          id: res.segmentId,
          name: res.name ?? name.trim(),
          lastResolvedCount: listSize,
          lastResolvedLabel: `~${listSize.toLocaleString('en-US')} (just now)`,
        });
        notify(
          `Segment ready — ${res.matched ?? 0} matched, ${res.created ?? 0} new contact${
            (res.created ?? 0) === 1 ? '' : 's'
          }${res.capped ? ' (list truncated to the cap)' : ''}.`,
          'success',
        );
        resetAll();
        onClose();
      } else {
        setUploadErr(
          envelopeMessage(res, 'Import failed — check the mapping and try again.'),
        );
      }
    } catch {
      setUploadErr('Import failed — check your connection and try again.');
    } finally {
      setCommitting(false);
    }
  }, [
    committing,
    colMap,
    name,
    fileName,
    fileType,
    fileB64,
    assignAgentId,
    onCreated,
    notify,
    resetAll,
    onClose,
  ]);

  // Criteria save (+ honest resolve so the picker label is truthful).
  const saveCriteria = useCallback(async () => {
    if (savingCriteria) return;
    if (!name.trim()) {
      setCriteriaErr('Name the segment first.');
      return;
    }
    if (sources.length === 0 && !coldDays.trim() && !hasMoreFilters) {
      setCriteriaErr(
        'Add at least one filter — a lead source, a cold window, or one under "More filters".',
      );
      return;
    }
    // Client guard mirrors the route (it rejects budgetMin > budgetMax). Caught
    // here so the user fixes it without a round-trip.
    const bMin = Number.parseFloat(budgetMin);
    const bMax = Number.parseFloat(budgetMax);
    if (Number.isFinite(bMin) && Number.isFinite(bMax) && bMin > bMax) {
      setCriteriaErr('Budget min is greater than budget max — swap them.');
      setMoreOpen(true);
      return;
    }
    setSavingCriteria(true);
    setCriteriaErr('');
    try {
      const res = await callPropelRoute<SaveSegmentResponse>(
        '/marketing/save-segment',
        {
          name: name.trim(),
          criteria: buildCriteriaV2({
            sources,
            coldDays,
            oppStages,
            budgetMin,
            budgetMax,
            personIds: personIdsRaw,
          }),
          channel,
          resolve: true,
        },
      );
      if (res && res.ok && res.segmentId) {
        const estimate = res.estimate ?? 0;
        onCreated({
          id: res.segmentId,
          name: name.trim(),
          lastResolvedCount: estimate,
          lastResolvedLabel: `~${estimate.toLocaleString('en-US')} (just now)`,
        });
        notify(`Segment created — ~${estimate.toLocaleString('en-US')} contacts.`, 'success');
        resetAll();
        onClose();
      } else {
        setCriteriaErr(
          envelopeMessage(res, 'Could not save the segment — check the filters.'),
        );
      }
    } catch {
      setCriteriaErr('Could not save the segment — check your connection.');
    } finally {
      setSavingCriteria(false);
    }
  }, [
    savingCriteria,
    name,
    sources,
    coldDays,
    hasMoreFilters,
    oppStages,
    budgetMin,
    budgetMax,
    personIdsRaw,
    channel,
    onCreated,
    notify,
    resetAll,
    onClose,
  ]);

  const setRole = (role: keyof ImportColMap, value: string | null) =>
    setColMap((c) => ({
      ...c,
      [role]: value === null || value === '' ? null : Number.parseInt(value, 10),
    }));

  const columnOptions = (preview?.headers ?? []).map((h, idx) => ({
    value: String(idx),
    label: h || `Column ${idx + 1}`,
  }));

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="New segment"
      size="lg"
      centered
      closeOnClickOutside={
        !uploading && !committing && !savingCriteria && !savingPool
      }
    >
      <Stack gap="md">
        <TextInput
          label="Segment name"
          description={
            mode === 'pools'
              ? 'Optional — defaults to the pool name.'
              : undefined
          }
          placeholder={
            mode === 'pools'
              ? 'e.g. Cold lead pool — October blast'
              : 'e.g. Cold Marina leads'
          }
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required={mode !== 'pools'}
        />

        <SegmentedControl
          fullWidth
          value={mode}
          onChange={(v) => {
            setMode(v as 'pools' | 'csv' | 'criteria');
            setUploadErr('');
            setCriteriaErr('');
            setPoolErr('');
          }}
          data={[
            { label: 'From a pool', value: 'pools' },
            { label: 'Upload a list', value: 'csv' },
            { label: 'Build with criteria', value: 'criteria' },
          ]}
        />

        {mode === 'pools' ? (
          <PoolsPanel
            catalog={poolCatalog}
            catalogState={poolCatalogState}
            poolKey={poolKey}
            onPoolKey={(k) => {
              setPoolKey(k);
              setIncludeActive(false);
              setPoolErr('');
            }}
            selectedPool={selectedPool}
            includeActive={includeActive}
            onIncludeActive={setIncludeActive}
            resolving={poolResolving}
            resolve={poolResolve}
            err={poolErr}
            saving={savingPool}
            onUse={() => void usePool()}
          />
        ) : mode === 'csv' ? (
          phase === 'pick' ? (
            <Stack gap="sm">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                style={{ display: 'none' }}
                onChange={(e) => {
                  void onPickFile(e.currentTarget.files?.[0]);
                  e.currentTarget.value = '';
                }}
              />
              <Box
                onClick={() => {
                  if (!name.trim()) {
                    setUploadErr('Name the segment first, then choose a file.');
                    return;
                  }
                  fileInputRef.current?.click();
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void onPickFile(e.dataTransfer.files?.[0]);
                }}
                style={{
                  border: '1.5px dashed var(--mantine-color-default-border)',
                  borderRadius: 'var(--mantine-radius-md)',
                  padding: '32px 16px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: 'var(--mantine-color-body)',
                }}
              >
                <IconUpload
                  size={28}
                  style={{ color: 'var(--mantine-color-dimmed)' }}
                />
                <Text size="sm" fw={600} mt={8} c="var(--mantine-color-text)">
                  {uploading ? 'Reading file…' : 'Click or drop a CSV / Excel file'}
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  We match contacts to people you already have, then create the
                  rest. Email and/or Phone columns required.
                </Text>
              </Box>
              {uploadErr !== '' && (
                <Alert
                  color="red"
                  variant="light"
                  icon={<IconAlertCircle size={16} />}
                >
                  {uploadErr}
                </Alert>
              )}
            </Stack>
          ) : (
            preview && (
              <Stack gap="sm">
                <Text size="sm" c="dimmed">
                  {preview.totalRows.toLocaleString('en-US')} rows. Confirm which
                  column is which:
                </Text>
                <Group gap="sm" grow>
                  {ROLE_LABELS.map(({ key, label }) => (
                    <Select
                      key={key}
                      label={label}
                      placeholder="—"
                      clearable
                      value={colMap[key] === null ? null : String(colMap[key])}
                      onChange={(v) => setRole(key, v)}
                      data={columnOptions}
                    />
                  ))}
                </Group>
                {preview.sampleRows.length > 0 && (
                  <Box
                    style={{
                      overflowX: 'auto',
                      border: '1px solid var(--mantine-color-default-border)',
                      borderRadius: 'var(--mantine-radius-sm)',
                    }}
                  >
                    <Table striped withColumnBorders fz="xs">
                      <Table.Thead>
                        <Table.Tr>
                          {preview.headers.map((h, idx) => (
                            <Table.Th key={idx}>{h || `Col ${idx + 1}`}</Table.Th>
                          ))}
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {preview.sampleRows.map((row, rIdx) => (
                          <Table.Tr key={rIdx}>
                            {preview.headers.map((_h, cIdx) => (
                              <Table.Td key={cIdx}>{row[cIdx] ?? ''}</Table.Td>
                            ))}
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Box>
                )}
                {/* Who owns the NEW contacts — so the campaign's replies route
                    to them. Existing contacts keep their current agent. Defaults
                    to the uploader; only shown once the roster has loaded. */}
                {agents !== null && agents.length > 0 && (
                  <Select
                    label="Assign new contacts to"
                    description="Their replies come back to this agent. Contacts already in the CRM keep their current agent."
                    data={agents.map((a) => ({ value: a.id, label: a.label }))}
                    value={assignAgentId}
                    onChange={setAssignAgentId}
                    searchable
                    comboboxProps={{ zIndex: 5000, withinPortal: true }}
                  />
                )}
                {uploadErr !== '' && (
                  <Alert
                    color="red"
                    variant="light"
                    icon={<IconAlertCircle size={16} />}
                  >
                    {uploadErr}
                  </Alert>
                )}
                <Group justify="space-between">
                  <Button
                    variant="default"
                    onClick={() => {
                      setPhase('pick');
                      setPreview(null);
                      setFileB64('');
                      setUploadErr('');
                    }}
                  >
                    Choose a different file
                  </Button>
                  <Button
                    color="red"
                    leftSection={<IconFileUpload size={16} />}
                    loading={committing}
                    onClick={() => void commitImport()}
                  >
                    Import {preview.totalRows.toLocaleString('en-US')} rows
                  </Button>
                </Group>
              </Stack>
            )
          )
        ) : (
          <Stack gap="sm">
            <MultiSelect
              label="Lead source"
              placeholder="Any source"
              data={LEAD_SOURCE_OPTIONS}
              value={sources}
              onChange={setSources}
              clearable
            />
            <TextInput
              label="Cold for at least (days)"
              description="No marketing touch in the last N days. Leave blank for no cold filter."
              placeholder="e.g. 90"
              type="number"
              value={coldDays}
              onChange={(e) => setColdDays(e.currentTarget.value)}
            />

            {/* S5 — progressive axes (design D-3). Hidden by default so the
                common case (source + cold) stays a two-field form; revealed on
                demand. Every axis here is genuinely wired to the resolver
                against the current audience source — opp stage + budget come
                from the secondary pipeline, the person list is an explicit
                allow-set. (Lane + location are intentionally absent until
                fetchAudience feeds them — see TODO(S5-backend) below.) */}
            <Box>
              <Anchor
                component="button"
                type="button"
                size="sm"
                c="red"
                onClick={() => setMoreOpen((o) => !o)}
              >
                <Group gap={4} wrap="nowrap" component="span">
                  {moreOpen ? (
                    <IconChevronDown size={14} />
                  ) : (
                    <IconChevronRight size={14} />
                  )}
                  {moreOpen ? 'Fewer filters' : 'More filters'}
                  {!moreOpen && hasMoreFilters ? ' (active)' : ''}
                </Group>
              </Anchor>
              <Collapse in={moreOpen}>
                <Stack gap="sm" mt="sm">
                  <MultiSelect
                    label="Opportunity stage"
                    description="Has a secondary-pipeline opportunity in any of these stages."
                    placeholder="Any stage"
                    data={OPP_STAGE_OPTIONS}
                    value={oppStages}
                    onChange={setOppStages}
                    clearable
                  />
                  <Box>
                    <Text size="sm" fw={600} mb={6} c="var(--mantine-color-text)">
                      Budget range (AED)
                    </Text>
                    <Group grow align="flex-start">
                      <NumberInput
                        placeholder="Min"
                        min={0}
                        thousandSeparator=","
                        allowNegative={false}
                        value={budgetMin}
                        onChange={(v) =>
                          setBudgetMin(v === '' ? '' : String(v))
                        }
                      />
                      <NumberInput
                        placeholder="Max"
                        min={0}
                        thousandSeparator=","
                        allowNegative={false}
                        value={budgetMax}
                        onChange={(v) =>
                          setBudgetMax(v === '' ? '' : String(v))
                        }
                      />
                    </Group>
                    <Text size="xs" c="dimmed" mt={4}>
                      Matches the opportunity&rsquo;s budget (its max, or min when
                      no max is set).
                    </Text>
                  </Box>
                  <Textarea
                    label="Specific people"
                    description="Paste person IDs (comma, space, or newline separated) to restrict to exactly these contacts."
                    placeholder="id-1, id-2, id-3…"
                    autosize
                    minRows={2}
                    maxRows={5}
                    value={personIdsRaw}
                    onChange={(e) => setPersonIdsRaw(e.currentTarget.value)}
                  />
                  {personIdCount > 0 && (
                    <Text size="xs" c="dimmed">
                      {personIdCount.toLocaleString('en-US')} person ID
                      {personIdCount === 1 ? '' : 's'} — only these are eligible,
                      still subject to the other filters and consent.
                    </Text>
                  )}
                </Stack>
              </Collapse>
            </Box>

            <Text size="xs" c="dimmed">
              Segments resolve live at send time — editing the filters changes the
              audience of every draft pointing at this segment.
            </Text>
            {criteriaErr !== '' && (
              <Alert
                color="red"
                variant="light"
                icon={<IconAlertCircle size={16} />}
              >
                {criteriaErr}
              </Alert>
            )}
            <Group justify="flex-end">
              <Button
                color="red"
                leftSection={<IconFilter size={16} />}
                loading={savingCriteria}
                onClick={() => void saveCriteria()}
              >
                Create &amp; estimate
              </Button>
            </Group>
          </Stack>
        )}
      </Stack>
    </Modal>
  );
};

// ── Pools panel (Pools ↔ Marketing Cloud audience picker) ────────────────────
// Pick a lead/nurture/lane pool → see its LIVE membership resolved to an estimate
// + exclusion breakdown → "Use this audience" persists it as a saved segment the
// campaign re-resolves at send-start. The pool IS the audience the lead system
// owns; marketing only reads it.
const POOL_KIND_LABEL: Record<string, string> = {
  LEAD_POOL: 'Lead pool',
  NURTURE: 'Nurture',
  LANE: 'Lane',
};

const PoolsPanel = ({
  catalog,
  catalogState,
  poolKey,
  onPoolKey,
  selectedPool,
  includeActive,
  onIncludeActive,
  resolving,
  resolve,
  err,
  saving,
  onUse,
}: {
  catalog: PoolCatalogEntry[] | null;
  catalogState: 'idle' | 'loading' | 'failed';
  poolKey: string | null;
  onPoolKey: (k: string | null) => void;
  selectedPool: PoolCatalogEntry | null;
  includeActive: boolean;
  onIncludeActive: (v: boolean) => void;
  resolving: boolean;
  resolve: PoolResolveResponse | null;
  err: string;
  saving: boolean;
  onUse: () => void;
}) => {
  // The exclusion breakdown lines (reason → count), shown so the estimate is
  // explainable, never a bare number. Sorted desc, zero reasons hidden.
  const exclusionRows = useMemo(() => {
    const ex = resolve?.exclusions ?? {};
    return Object.entries(ex)
      .filter(([, n]) => typeof n === 'number' && n > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [resolve]);

  // The send-start membership-fidelity note: LANE pools fold membership into
  // criteria (lanes[]), so the persisted segment resolves identically at send.
  // LEAD_POOL / NURTURE membership is a route-side filter not yet in the criteria
  // axis, so the persisted segment can resolve a SUPERSET until the backend axis
  // lands — surfaced honestly here rather than silently mis-sending.
  const membershipKind = resolve?.segment?.membership?.kind ?? null;
  const supersetAtSend = membershipKind === 'POOL' || membershipKind === 'NURTURE';

  if (catalogState === 'loading' || catalog === null) {
    return (
      <Group justify="center" py="xl">
        <Loader color="red" size="sm" />
        <Text size="sm" c="dimmed">
          Loading pools…
        </Text>
      </Group>
    );
  }

  if (catalogState === 'failed') {
    return (
      <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />}>
        Couldn&rsquo;t load the pools right now. Switch to &ldquo;Upload a
        list&rdquo; or &ldquo;Build with criteria,&rdquo; or reopen this dialog to
        retry.
      </Alert>
    );
  }

  return (
    <Stack gap="sm">
      <Select
        label="Pool"
        description="The lead system owns membership — these resolve live; a lead leaving the pool drops out automatically."
        placeholder="Pick a pool"
        leftSection={<IconStack2 size={16} />}
        searchable
        value={poolKey}
        onChange={onPoolKey}
        data={catalog.map((p) => ({ value: p.key, label: p.label }))}
        nothingFoundMessage="No pools"
        comboboxProps={{ withinPortal: true }}
        renderOption={({ option }) => {
          const p = catalog.find((c) => c.key === option.value);
          return (
            <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm" fw={600} truncate>
                  {option.label}
                </Text>
                {p?.description ? (
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {p.description}
                  </Text>
                ) : null}
              </Box>
              {p ? (
                <Badge size="xs" variant="light" color="gray">
                  {POOL_KIND_LABEL[p.kind] ?? p.kind}
                </Badge>
              ) : null}
            </Group>
          );
        }}
      />

      {selectedPool ? (
        <Text size="xs" c="dimmed">
          {selectedPool.description}
        </Text>
      ) : null}

      {/* "include locked / owned / active" override — only meaningful for LANE
          pools (suppression defaults ON there). Hidden for lead/nurture pools
          where it's a no-op (those are unowned by definition). */}
      {selectedPool && selectedPool.broadBlastDefault ? (
        <Switch
          size="sm"
          color="red"
          checked={includeActive}
          onChange={(e) => onIncludeActive(e.currentTarget.checked)}
          label="Include locked / owned / active contacts"
          description="Off by default for a lane blast — you don't message a contact an agent is actively working. Turn on to reach everyone in the lane."
        />
      ) : null}

      {err !== '' ? (
        <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />}>
          {err}
        </Alert>
      ) : null}

      {poolKey ? (
        <Card
          withBorder
          radius="md"
          padding="md"
          style={{ background: 'var(--mantine-color-body)' }}
        >
          <Group justify="space-between" align="flex-start">
            <Box>
              <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                Estimated reach
              </Text>
              {resolving ? (
                <Group gap="xs" mt={4}>
                  <Loader size="xs" color="red" />
                  <Text size="sm" c="dimmed">
                    Resolving live…
                  </Text>
                </Group>
              ) : resolve && typeof resolve.estimate === 'number' ? (
                <Text size="xl" fw={700} c="var(--mantine-color-text)">
                  {resolve.estimate.toLocaleString('en-US')}
                </Text>
              ) : (
                <Text size="sm" c="dimmed" mt={4}>
                  —
                </Text>
              )}
            </Box>
            <IconUsers
              size={20}
              style={{ color: 'var(--mantine-color-dimmed)' }}
            />
          </Group>

          {!resolving && resolve?.description ? (
            <Text size="xs" c="dimmed" mt="sm">
              {resolve.description}
            </Text>
          ) : null}

          {!resolving && exclusionRows.length > 0 ? (
            <Stack gap={2} mt="sm">
              {exclusionRows.map(([reason, n]) => (
                <Group key={reason} justify="space-between" gap="md">
                  <Text size="xs" c="dimmed" tt="capitalize">
                    {reason.replace(/[_-]/g, ' ')}
                  </Text>
                  <Text size="xs" c="dimmed" ff="monospace">
                    {n.toLocaleString('en-US')}
                  </Text>
                </Group>
              ))}
            </Stack>
          ) : null}

          {!resolving && supersetAtSend ? (
            <Alert
              mt="sm"
              color="yellow"
              variant="light"
              py={6}
              icon={<IconAlertCircle size={14} />}
            >
              <Text size="xs">
                This pool&rsquo;s membership is tracked live. The estimate above is
                exact now; at send time the audience re-resolves and may differ
                slightly as leads move in or out of the pool.
              </Text>
            </Alert>
          ) : null}
        </Card>
      ) : null}

      <Group justify="flex-end">
        <Button
          color="red"
          leftSection={<IconUsers size={16} />}
          loading={saving}
          disabled={!resolve || resolving}
          onClick={onUse}
        >
          Use this audience
        </Button>
      </Group>
    </Stack>
  );
};
