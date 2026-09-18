// Is the desktop qualification rail collapsed? Remembered per agent.
//
// The rail is reference material. An agent who is mid-conversation wants the story to
// have the window; an agent qualifying wants the form. Forcing that choice once per
// page load would be worse than the fixed 320px it replaced, so the choice persists.
// Storage that refuses (private window, blocked site data) degrades to "expanded",
// which is the state the page has always had.
import { useCallback, useState } from 'react';

const KEY = 'propel.leadPage.railCollapsed';

const read = (): boolean => {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

export const useRailCollapsed = (): [boolean, (next: boolean) => void] => {
  const [collapsed, setCollapsedState] = useState<boolean>(read);

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
    try {
      window.localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      /* forgets, still works */
    }
  }, []);

  return [collapsed, setCollapsed];
};
