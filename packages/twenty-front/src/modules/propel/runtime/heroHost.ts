// ─────────────────────────────────────────────────────────────────────────────
// Propel runtime-loaded heroes — HOST PROP BAG (type only)
// ─────────────────────────────────────────────────────────────────────────────
//
// The `host` object HeroRoute passes to every hero's default export. It bundles the
// host capabilities a hero might need that AREN'T already reachable via the shared
// shims (navigation, snackbar, the cookie token, query params). ListingStudio needs
// none of these (it self-serves auth + data via the shimmed callPropelRoute /
// getTokenPair), but later heroes do — and a stable, typed contract now means we
// never have to re-thread props through HeroRoute when porting them.

import { type ReactElement } from 'react';

export type PropelHeroNotifyVariant = 'success' | 'error' | 'info' | 'warning';

export type PropelHeroHost = {
  // Authenticated Propel logic-function call (same instance the host uses).
  callPropelRoute: <T>(path: string, body: object) => Promise<T | null>;
  // Raw CRM session access token (cookie-derived) for callers that need it directly.
  getToken: () => string | undefined;
  // The resolved API origin (REACT_APP_SERVER_BASE_URL || page-hostname fallback).
  serverBaseUrl: string;
  // Router navigation (react-router useNavigate) — for cross-CRM links.
  navigate: (to: string) => void;
  // Toast helper bridged onto Twenty's SnackBar.
  notify: (message: string, variant?: PropelHeroNotifyVariant) => void;
  // The current URL search params (read-only snapshot at mount).
  searchParams: URLSearchParams;
};

// The shape every hero bundle's default export conforms to: a React component that
// takes `{ host }`. (Heroes free to ignore the prop — ListingStudio does.)
export type PropelHeroComponent = (props: {
  host: PropelHeroHost;
}) => ReactElement | null;
