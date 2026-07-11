import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchAiVisibility,
  runAiCheck,
  trackAiPrompt,
  type AiVisibilityBoard,
} from '@/propel/lib/aiVisibilityCrm';

// Fetch + mutate hook for the AI Visibility Monitor. Same `{ phase, error, data,
// reload }` shape as the other live hero hooks, plus the two write actions
// (addPrompt / recheck) and a `busy` flag so the panel can disable its controls
// while a real check is running.

export type AiVisibilityPhase = 'loading' | 'ready' | 'error';

export type UseAiVisibilityResult = {
  phase: AiVisibilityPhase;
  error: string | null;
  data: AiVisibilityBoard | null;
  reload: () => void;
  /** true while a track/run is in flight. */
  busy: boolean;
  /** last mutate error (surfaced as a dismissible alert, distinct from load error). */
  actionError: string | null;
  clearActionError: () => void;
  addPrompt: (prompt: string) => Promise<boolean>;
  recheck: (promptId?: string) => Promise<boolean>;
};

export const useAiVisibility = (): UseAiVisibilityResult => {
  const [phase, setPhase] = useState<AiVisibilityPhase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AiVisibilityBoard | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    const result = await fetchAiVisibility();
    if (!mounted.current) return;
    if (result.ok) {
      setData(result.board);
      setPhase('ready');
    } else {
      setError(result.error);
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  const addPrompt = useCallback(
    async (prompt: string): Promise<boolean> => {
      setBusy(true);
      setActionError(null);
      const added = await trackAiPrompt(prompt);
      if (!added.ok) {
        if (mounted.current) {
          setActionError(added.error);
          setBusy(false);
        }
        return false;
      }
      // Fire an immediate first reading for the new prompt, then refresh.
      await runAiCheck().catch(() => undefined);
      const refreshed = await fetchAiVisibility();
      if (mounted.current) {
        if (refreshed.ok) setData(refreshed.board);
        setBusy(false);
      }
      return true;
    },
    [],
  );

  const recheck = useCallback(async (promptId?: string): Promise<boolean> => {
    setBusy(true);
    setActionError(null);
    const ran = await runAiCheck(promptId);
    if (!ran.ok) {
      if (mounted.current) {
        setActionError(ran.error);
        setBusy(false);
      }
      return false;
    }
    const refreshed = await fetchAiVisibility();
    if (mounted.current) {
      if (refreshed.ok) setData(refreshed.board);
      setBusy(false);
    }
    return true;
  }, []);

  const clearActionError = useCallback(() => setActionError(null), []);

  return { phase, error, data, reload, busy, actionError, clearActionError, addPrompt, recheck };
};
