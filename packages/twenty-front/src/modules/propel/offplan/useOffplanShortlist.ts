import { useCallback, useState } from 'react';
import { toggleShortlist } from './shortlist';

export function useOffplanShortlist() {
  const [ids, setIds] = useState<number[]>([]);
  const toggle = useCallback((id: number) => setIds((cur) => toggleShortlist(cur, id)), []);
  const clear = useCallback(() => setIds([]), []);
  const favoritedIds = new Set(ids);
  return { ids, favoritedIds, toggle, clear, count: ids.length };
}
