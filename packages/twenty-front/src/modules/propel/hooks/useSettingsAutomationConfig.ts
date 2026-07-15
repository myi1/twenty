import { useCallback, useEffect, useRef, useState } from 'react';

import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import {
  type SettingsGroup,
} from '@/propel/lib/settingsHubConfig';
import {
  type AutomationConfigReadResponse,
  type AutomationConfigSeedResponse,
  type AutomationConfigWriteResponse,
  type ConfigRow,
  type Member,
} from '@/propel/types/settingsHub';

// Data plane for the Lead Routing + Lane Automations tabs — the SINGLETON configs
// (the brokerage-wide lead-routing record + the 4 per-lane AutomationConfig rows).
// A Mantine port of the legacy app-sandbox SettingsHubPanel.SingletonConfigTabs,
// reusing the SAME, UNCHANGED gated CRM routes:
//   • READ → callPropelRoute('/settings/automation-config', {})
//            → { ok, configs (keyed by group key), members, canEdit }
//   • SAVE → callPropelRoute('/settings/automation-config', { save:{ group, patch } })
//            — FLAT payload; create-or-update the one singleton for that group key.
//   • SEED → callPropelRoute('/settings/automation-config/seed', {})
//            — idempotently create any missing singleton rows.
// Reads are open to any member (the panel renders); writes fail closed server-side
// for non-managers (NOT_FOUND), so an optimistic patch is reverted by the reload.

type Phase = 'loading' | 'idle' | 'error';

export const useSettingsAutomationConfig = () => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [configs, setConfigs] = useState<Record<string, ConfigRow | null>>({});
  const [members, setMembers] = useState<Member[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  // The group key currently saving (or '__seed' during a seed), for per-card busy UI.
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    const res = await callPropelRoute<AutomationConfigReadResponse>(
      '/settings/automation-config',
      {},
    );
    if (!res || !res.ok) {
      setError(res?.error ?? 'Could not load settings — you may not have permission.');
      setPhase('error');
      return;
    }
    setConfigs(res.configs ?? {});
    setMembers(res.members ?? []);
    setCanEdit(Boolean(res.canEdit));
    setPhase('idle');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveGroup = useCallback(
    async (group: SettingsGroup, patch: Record<string, unknown>) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setSavingKey(group.key);
      setError(null);
      // optimistic local merge
      setConfigs((prev) => ({
        ...prev,
        [group.key]: { ...(prev[group.key] ?? {}), ...patch } as ConfigRow,
      }));
      try {
        const res = await callPropelRoute<AutomationConfigWriteResponse>(
          '/settings/automation-config',
          { save: { group: group.key, patch } },
        );
        if (!res || !res.ok) {
          setError(res?.error ?? 'Save failed.');
          await load();
        } else if (res.config) {
          setConfigs((prev) => ({
            ...prev,
            [group.key]: res.config as ConfigRow,
          }));
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

  const seed = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSavingKey('__seed');
    setError(null);
    try {
      const res = await callPropelRoute<AutomationConfigSeedResponse>(
        '/settings/automation-config/seed',
        {},
      );
      if (!res || !res.ok) {
        setError(res?.error ?? 'Setup failed — you may not have permission.');
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      busyRef.current = false;
      setSavingKey(null);
    }
  }, [load]);

  return {
    phase,
    error,
    configs,
    members,
    canEdit,
    savingKey,
    reload: load,
    saveGroup,
    seed,
  };
};
