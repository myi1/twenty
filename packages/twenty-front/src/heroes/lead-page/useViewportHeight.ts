// The usable viewport height, tracked live.
//
// `visualViewport` rather than innerHeight wherever it exists: on a phone the software
// keyboard shrinks the visual viewport but NOT innerHeight, and the qualification sheet
// is a form — the keyboard is open exactly when its height matters most. Without this
// the sheet would size itself to a window the agent can no longer see all of, and the
// field being typed into would sit under the keyboard.
import { useEffect, useState } from 'react';

const measure = (): number => {
  if (typeof window === 'undefined') return 0;
  return Math.round(window.visualViewport?.height ?? window.innerHeight ?? 0);
};

export const useViewportHeight = (): number => {
  const [height, setHeight] = useState(measure);

  useEffect(() => {
    const onChange = () => setHeight(measure());
    window.addEventListener('resize', onChange);
    window.visualViewport?.addEventListener('resize', onChange);
    window.visualViewport?.addEventListener('scroll', onChange);
    return () => {
      window.removeEventListener('resize', onChange);
      window.visualViewport?.removeEventListener('resize', onChange);
      window.visualViewport?.removeEventListener('scroll', onChange);
    };
  }, []);

  return height;
};
