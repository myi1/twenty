import { useCallback, useMemo, useState } from 'react';
import { toggleShortlist } from './shortlist';

export function useOffplanShortlist() {
  const [ids, setIds] = useState<number[]>([]);
  const toggle = useCallback((id: number) => setIds((cur) => toggleShortlist(cur, id)), []);
  const clear = useCallback(() => setIds([]), []);
  const favoritedIds = useMemo(() => new Set(ids), [ids]);
  return { ids, favoritedIds, toggle, clear, count: ids.length };
}
