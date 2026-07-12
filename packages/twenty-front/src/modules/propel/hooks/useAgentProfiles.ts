import { useCallback, useEffect, useRef, useState } from 'react';

import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import {
  type AgentProfileMember,
  type AgentProfilePatch,
  type AgentProfileReadResponse,
  type AgentProfileWriteResponse,
} from '@/propel/types/settingsHub';

// Data plane for the Agent Profiles tab — each agent's matcher inputs (areas /
// languages / lane-qualifications / pool-memberships / availability / WhatsApp).
// A Mantine port of the legacy app-sandbox LeadAgentProfilePanel, reusing the SAME,
// UNCHANGED gated CRM route:
//   • READ → callPropelRoute('/lead/agent-profile', {})
//            → { ok, members, actingMemberId, canEditAll }
//   • SAVE → callPropelRoute('/lead/agent-profile', { upsert:{ memberId, …fields } })
// Two-tier gate (server-enforced): Manager/Admin edit anyone + every field; an
// Agent may edit only their OWN areas/languages/availability/WhatsApp. Manager-only
// writes by an agent are silently dropped server-side, so the optimistic patch is
// reverted by the resync-on-error reload.

const toStringArray = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];

type Phase = 'loading' | 'idle' | 'error';

export const useAgentProfiles = () => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<AgentProfileMember[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);
  const [canEditAll, setCanEditAll] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    const res = await callPropelRoute<AgentProfileReadResponse>(
      '/lead/agent-profile',
      {},
    );
    if (!res || !res.ok) {
      setError(res?.error ?? 'Could not load agent profiles.');
      setPhase('error');
      return;
    }
    setMembers(res.members ?? []);
    setActingId(res.actingMemberId ?? null);
    setCanEditAll(Boolean(res.canEditAll));
    setPhase('idle');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (member: AgentProfileMember, patch: AgentProfilePatch) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setSavingId(member.id);
      setError(null);
      const next = { ...member, ...patch };
      setMembers((prev) => prev.map((m) => (m.id === member.id ? next : m)));
      try {
        const upsert: Record<string, unknown> = { memberId: member.id };
        if ('agentAreas' in patch)
          upsert.agentAreas = toStringArray(next.agentAreas);
        if ('agentLanguages' in patch)
          upsert.agentLanguages = toStringArray(next.agentLanguages);
        if ('agentLaneQualifications' in patch)
          upsert.agentLaneQualifications = toStringArray(
            next.agentLaneQualifications,
          );
        if ('agentPoolMemberships' in patch)
          upsert.agentPoolMemberships = toStringArray(next.agentPoolMemberships);
        if ('agentAvailability' in patch)
          upsert.agentAvailability = next.agentAvailability;
        if ('agentWhatsApp' in patch)
          upsert.agentWhatsApp = next.agentWhatsApp;

        const res = await callPropelRoute<AgentProfileWriteResponse>(
          '/lead/agent-profile',
          { upsert },
        );
        if (!res || !res.ok) {
          setError(res?.error ?? 'Save failed.');
          await load();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        await load();
      } finally {
        busyRef.current = false;
        setSavingId(null);
      }
    },
    [load],
  );

  return {
    phase,
    error,
    members,
    actingId,
    canEditAll,
    savingId,
    reload: load,
    save,
  };
};
