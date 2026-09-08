// usePhoneLayout.ts: mirrors my-desk/responsive.tsx's useDeskStackedLayout, at the
// phone breakpoint (720px) rather than the desk's stack breakpoint (1023px). The
// lead page has only two layouts (rail+story side by side, or stacked tabs on
// phone), so it needs the one boolean rather than the desk's stack/phone pair.

import { useEffect, useState } from 'react';

const phoneQuery = '(max-width: 720px)';

const phoneMatches = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia(phoneQuery).matches;

export const usePhoneLayout = (): boolean => {
  const [phone, setPhone] = useState(phoneMatches);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;

    const query = window.matchMedia(phoneQuery);
    const onChange = (event: MediaQueryListEvent) => setPhone(event.matches);
    setPhone(query.matches);
    query.addEventListener('change', onChange);

    return () => query.removeEventListener('change', onChange);
  }, []);

  return phone;
};
