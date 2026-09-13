import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { fetchRail } from './deskApi';
import type { DeskRailOk } from './types';

type RailState = {
  scope: string;
  status: 'loading' | 'ready' | 'error';
  rail: DeskRailOk | null;
  refreshing: boolean;
};

// Scope values are ephemeral and never written to storage or the wire. The
// getter also rejects a session change while a request is in flight, before
// another render has observed that change.
export const useRail = (scope: string, getScope: () => string) => {
  const sequence = useRef(0);
  const currentScope = useRef(getScope);
  // A suspended/abandoned render must never steal ownership from the committed scope.
  useLayoutEffect(() => {
    currentScope.current = getScope;
  });
  const [state, setState] = useState<RailState>({
    scope,
    status: 'loading',
    rail: null,
    refreshing: false,
  });
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setState((previous) => ({
      scope,
      status: previous.scope === scope && previous.rail ? 'ready' : 'loading',
      rail: previous.scope === scope ? previous.rail : null,
      refreshing: true,
    }));
    try {
      const response = await fetchRail();
      if (request !== sequence.current || currentScope.current() !== scope)
        return;
      setState({
        scope,
        status: response?.ok ? 'ready' : 'error',
        rail: response?.ok ? response : null,
        refreshing: false,
      });
    } catch {
      if (request !== sequence.current || currentScope.current() !== scope)
        return;
      setState({ scope, status: 'error', rail: null, refreshing: false });
    }
  }, [scope]);
  useEffect(() => {
    void load();
    return () => {
      sequence.current += 1;
    };
  }, [load]);
  // Hide the previous identity's rows in the render that changes scope, before
  // effect cleanup or the next request can run.
  return {
    ...(state.scope === scope
      ? state
      : { scope, status: 'loading' as const, rail: null, refreshing: false }),
    load,
  };
};
