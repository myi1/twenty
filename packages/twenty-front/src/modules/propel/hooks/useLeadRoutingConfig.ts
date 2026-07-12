import { useCallback, useEffect, useRef, useState } from 'react';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import {
  type LeadConfigRow,
  type LeadConfigAgent,
  type LeadConfigReadResponse,
  type LeadConfigWriteResponse,
  type LeadConfigSeedResponse,
} from '@/propel/types/leadRouting';

// Data plane for the Lead Routing tab — a Mantine port of the legacy app-sandbox
// front-component (propel-crm-integration src/front-components/lead-source-config.tsx).
// Reuses the SAME, UNCHANGED gated routes (CRM app untouched, live on staging):
//   • READ  → callPropelRoute('/lead/source-config', {})        → { ok, configs, agents }
//   • WRITE → callPropelRoute('/lead/source-config', { upsert }) — FLAT payload, one
//             row keyed on sourceKey; only the changed fields are sent.
//   • SEED  → callPropelRoute('/lead/source-config/seed', {})    — default source rows.
// Edits are OPTIMISTIC (local row patched immediately) with resync-on-error (reload
// from server truth), exactly like the original. Writes fail closed server-side for
// agents, so the optimistic patch is reverted by the reload if the route refuses.

const toStringArray = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];

type Phase = 'loading' | 'idle' | 'error';

export type LeadRoutingPatch = Partial<
  Pick<
    LeadConfigRow,
    | 'assignmentMode'
    | 'defaultPipeline'
    | 'slaBehavior'
    | 'slaMinutes'
    | 'enabled'
    | 'agentPool'
  >
>;

export const useLeadRoutingConfig = () => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<LeadConfigRow[]>([]);
  const [agents, setAgents] = useState<LeadConfigAgent[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    const res = await callPropelRoute<LeadConfigReadResponse>(
      '/lead/source-config',
      {},
    );
    if (!res || !res.ok) {
      setError(
        res?.error ?? 'Could not load — you may not have permission.',
      );
      setPhase('error');
      return;
    }
    setRows(res.configs ?? []);
    setAgents(res.agents ?? []);
    setPhase('idle');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Persist one row's changed fields. Optimistic local update + server upsert keyed
  // on sourceKey; on failure we reload to resync from server truth.
  const saveRow = useCallback(
    async (row: LeadConfigRow, patch: LeadRoutingPatch) => {
      if (busyRef.current || !row.sourceKey) return;
      busyRef.current = true;
      setSavingKey(row.sourceKey);
      setError(null);
      const next = { ...row, ...patch };
      setRows((prev) => prev.map((r) => (r.id === row.id ? next : r)));
      try {
        const res = await callPropelRoute<LeadConfigWriteResponse>(
          '/lead/source-config',
          {
            upsert: {
              sourceKey: row.sourceKey,
              ...('assignmentMode' in patch
                ? { assignmentMode: next.assignmentMode }
                : {}),
              ...('defaultPipeline' in patch
                ? { defaultPipeline: next.defaultPipeline }
                : {}),
              ...('slaBehavior' in patch
                ? { slaBehavior: next.slaBehavior }
                : {}),
              ...('slaMinutes' in patch
                ? { slaMinutes: next.slaMinutes }
                : {}),
              ...('enabled' in patch ? { enabled: next.enabled } : {}),
              ...('agentPool' in patch
                ? { agentPool: toStringArray(next.agentPool) }
                : {}),
            },
          },
        );
        if (!res || !res.ok) {
          setError(res?.error ?? 'Save failed.');
          await load(); // resync from server truth (reverts the optimistic patch)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        await load();
      } finally {
        busyRef.current = false;
        setSavingKey(null);
      }
    },
    [load],
  );

  const onSeed = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSeeding(true);
    setError(null);
    try {
      const res = await callPropelRoute<LeadConfigSeedResponse>(
        '/lead/source-config/seed',
        {},
      );
      if (!res || !res.ok) {
        setError(
          res?.error ?? 'Seed failed — you may not have permission.',
        );
      } else {
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      busyRef.current = false;
      setSeeding(false);
    }
  }, [load]);

  return {
    phase,
    error,
    rows,
    agents,
    savingKey,
    seeding,
    reload: load,
    saveRow,
    onSeed,
  };
};
