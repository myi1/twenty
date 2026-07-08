import ReactDOM from 'react-dom/client';

// Propel runtime-loaded heroes: assemble window.__propelShared (the host's shared
// singletons) BEFORE the React tree mounts, so any hero loaded later (HeroRoute →
// dynamic import → import map → /propel-shims/*) resolves its bare imports to these
// instances. Side-effect import; must precede root.render().
import '@/propel/runtime/heroShared';

// Propel nav fast-path: kick off the host-mounted nav.config.json fetch at boot so
// the sidebar nav (labels/icons/order/routes) is config-driven at runtime, not
// baked into the engine. Returns immediately; the baked default config renders
// synchronously and the merged config swaps in (re-rendering the nav) when the
// fetch resolves. See modules/propel/runtime/propelNavConfig.ts.
import { loadPropelNavConfigOnce } from '@/propel/runtime/propelNavConfig';

loadPropelNavConfigOnce();

import { App } from '@/app/components/App';
import { migrateTokenPairCookieToLocalStorage } from '@/auth/utils/migrateTokenPairCookieToLocalStorage';
import 'react-loading-skeleton/dist/skeleton.css';
import 'twenty-ui-deprecated/style.css';
import 'twenty-ui-deprecated/theme-light.css';
import 'twenty-ui-deprecated/theme-dark.css';
// New twenty-ui ships its component styles (e.g. Toggle SCSS modules) in its own
// style.css; the --t-* theme tokens it relies on are already provided above.
import 'twenty-ui/style.css';
import './index.css';

// TODO: REMOVE this after 2026-12-12 — temporary migration of tokenPair from the
// legacy cookie to localStorage (legacy cookie has a 180-day expiry).
migrateTokenPairCookieToLocalStorage();

const root = ReactDOM.createRoot(
  document.getElementById('root') ?? document.body,
);

root.render(<App />);
