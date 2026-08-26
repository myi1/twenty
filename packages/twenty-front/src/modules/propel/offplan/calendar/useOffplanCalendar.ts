import { useCallback, useEffect, useRef, useState } from 'react';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import type { RouteEnvelope } from '@/propel/offplan/types';
import type { CalendarPayload } from './types';

// Data hook for the Launch Calendar tab. State contract (approved design, item 4b):
//   • initial load → skeletons (loading=true, payload=null)
//   • refresh / window change → keep current rows, quiet inline progress
//     (refreshing=true), LAST-REQUEST-WINS (stale responses dropped)
//   • route-absent (old server, code UNKNOWN_ACTION / FEATURE_OFF) → notEnabled
//   • error → error string, retry re-runs the same fetch
//   • tab regains visibility after being left open → silent refetch so buckets
//     never show yesterday (the stale-tab day-flip rule)
export function useOffplanCalendar(enabled: boolean) {
  const [payload, setPayload] = useState<CalendarPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notEnabled, setNotEnabled] = useState(false);
  const [windowDays, setWindowDays] = useState(90);
  const seq = useRef(0);
  const startedRef = useRef(false);

  const fetchNow = useCallback(async (days: number, isRefresh: boolean) => {
    const mySeq = ++seq.current;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const res = await callPropelRoute<RouteEnvelope<CalendarPayload> & { code?: string }>(
      '/offplan/browse',
      { action: 'calendar', params: { windowDays: days } },
    ).catch(() => null);
    if (mySeq !== seq.current) return; // last-request-wins: a newer fetch superseded us
    setLoading(false);
    setRefreshing(false);
    if (res?.ok && res.data) {
      setPayload(res.data);
      setError(null);
      setNotEnabled(false);
      return;
    }
    if (
      res?.code === 'UNKNOWN_ACTION' ||
      res?.code === 'FEATURE_OFF' ||
      /^unknown action/i.test(res?.error ?? '')
    ) {
      // Route-absent: the structured code from the NEW server, or the bare
      // 'unknown action: calendar' string a server that PREDATES this deploy
      // returns (review fix — the deploy-ordering window this state exists for
      // is exactly the one where only the old string exists).
      setNotEnabled(true);
      return;
    }
    // Keep any previously-loaded payload on a failed REFRESH (per-source truth
    // model — never blank a working screen); only surface the error banner.
    setError(res?.error ?? 'Could not load the calendar');
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // First enable → initial load; later windowDays changes → refresh semantics.
    const isRefresh = startedRef.current;
    startedRef.current = true;
    void fetchNow(windowDays, isRefresh);
  }, [enabled, windowDays, fetchNow]);

  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible' && startedRef.current) {
        void fetchNow(windowDays, true);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled, windowDays, fetchNow]);

  const retry = useCallback(() => void fetchNow(windowDays, payload !== null), [fetchNow, windowDays, payload]);

  return { payload, loading, refreshing, error, notEnabled, windowDays, setWindowDays, retry };
}
