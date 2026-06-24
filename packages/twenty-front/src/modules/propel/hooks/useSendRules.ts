import { useCallback, useEffect, useRef, useState } from 'react';

import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import {
  type RouteEnvelopeError,
  type SendRulesPayload,
} from '@/propel/types/campaignBuilder';

// Data plane for the Quiet Hours tab — the marketing send governance the drain
// enforces on EVERY send (weekly per-person caps + the nightly quiet window +
// the Friday pause). Folded into the Settings hub so "quiet hours in the config
// panel" is satisfied here (the same governance the marketing Send-Rules modal
// edits; that modal stays where it is inside Marketing).
//
// Reuses the SAME, UNCHANGED gated CRM routes (no app-side change):
//   • READ  → callPropelRoute('/marketing/hub', {})  → { sendRules, tier }
//             The hub returns the singleton send-rules row for Manager/Admin; a
//             non-coordinator gets tier:'VIEWER_BLOCKED' with no sendRules, so the
//             hero falls back to the spec defaults and shows the group read-only.
//   • WRITE → callPropelRoute('/marketing/save-rules', { …flat fields })
//             Coordinator-gated; validates HH:MM + 0–100 caps; logs a RULES_CHANGED
//             audit event server-side.
//
// IMPORTANT (recipient-local timezone): the quiet/Friday windows are WALL-CLOCK
// times applied in EACH RECIPIENT'S local timezone (resolved from their phone's
// country code; Asia/Dubai fallback) — see CRM shared/send-rules.ts. The UI says so.

// The spec default singleton (CRM marketing-hub-types.DEFAULT_SEND_RULES_PAYLOAD),
// used until the read resolves and as the fallback when the hub blocks the viewer.
export const DEFAULT_SEND_RULES: SendRulesPayload = {
  id: null,
  capPerWeek: 2,
  capPerWeekWhatsapp: 1,
  quietEnabled: true,
  quietStart: '21:00',
  quietEnd: '09:00',
  fridayPauseEnabled: false,
  fridayPauseUntil: '14:00',
};

// Minimal read shape — the only field the Quiet Hours tab needs off /marketing/hub.
type HubReadResponse = {
  tier?: string;
  sendRules?: SendRulesPayload;
};

interface SaveRulesResponse extends RouteEnvelopeError {
  ok?: boolean;
  id?: string;
  rules?: SendRulesPayload;
}

type Phase = 'loading' | 'idle' | 'error';

export const useSendRules = () => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState<SendRulesPayload>(DEFAULT_SEND_RULES);
  // canEdit: the hub only returns sendRules for a coordinator; a blocked viewer
  // gets no row, so we treat "rules present" as the edit gate (the save route
  // re-enforces it regardless).
  const [canEdit, setCanEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    const res = await callPropelRoute<HubReadResponse>('/marketing/hub', {});
    if (res === null) {
      setError('Could not load send rules.');
      setPhase('error');
      return;
    }
    if (res.sendRules !== undefined && res.sendRules !== null) {
      setRules({ ...DEFAULT_SEND_RULES, ...res.sendRules });
      setCanEdit(true);
    } else {
      // VIEWER_BLOCKED (or no row) — show the spec defaults, read-only.
      setRules(DEFAULT_SEND_RULES);
      setCanEdit(false);
    }
    setPhase('idle');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Save the FULL rules payload (the route accepts any subset; we send all 7 fields
  // so a partial edit can't drift the others). Returns a friendly error string on
  // failure, or null on success.
  const save = useCallback(
    async (next: SendRulesPayload): Promise<string | null> => {
      if (busyRef.current) return null;
      busyRef.current = true;
      setSaving(true);
      setError(null);
      try {
        const res = await callPropelRoute<SaveRulesResponse>(
          '/marketing/save-rules',
          {
            capPerWeek: next.capPerWeek,
            capPerWeekWhatsapp: next.capPerWeekWhatsapp,
            quietEnabled: next.quietEnabled,
            quietStart: next.quietStart,
            quietEnd: next.quietEnd,
            fridayPauseEnabled: next.fridayPauseEnabled,
            fridayPauseUntil: next.fridayPauseUntil,
          },
        );
        if (res === null || res.ok !== true || res.error !== undefined) {
          const msg =
            res?.operatorAction ??
            res?.error ??
            'Could not save your send rules.';
          setError(msg);
          return msg;
        }
        if (res.rules !== undefined && res.rules !== null) {
          setRules({ ...DEFAULT_SEND_RULES, ...res.rules });
        } else {
          setRules(next);
        }
        return null;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        return msg;
      } finally {
        busyRef.current = false;
        setSaving(false);
      }
    },
    [],
  );

  return { phase, error, rules, canEdit, saving, reload: load, save };
};
