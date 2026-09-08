// usePhoneLayout.ts: one boolean — rail+story side by side, or stacked tabs on phone.
//
// The breakpoint is Twenty's own MOBILE_VIEWPORT, NOT a number of our own. It used to
// be a hardcoded 720 (mirroring my-desk/responsive.tsx), and that left a 721-768px band
// where the HOST had already switched to its mobile container while this hero still
// rendered two columns. Harmless while the page scrolled as one; not harmless now that
// the hero owns a fixed frame inside that container. Importing the constant means the
// two can never disagree again — if Twenty moves its breakpoint, this moves with it.
//
// my-desk still hardcodes 720 and has the same latent mismatch. It scrolls with the
// page rather than owning a frame, so nothing is misplaced there today; left alone
// deliberately rather than changed on the way past.

import { useEffect, useState } from 'react';

import { MOBILE_VIEWPORT } from 'twenty-ui/theme-constants';

const phoneQuery = `(max-width: ${MOBILE_VIEWPORT}px)`;

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
