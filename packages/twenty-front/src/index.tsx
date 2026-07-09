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
import { hydrateMetadataStore } from '@/metadata-store/storage/metadataStoreStorage';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import 'react-loading-skeleton/dist/skeleton.css';
import 'twenty-ui/style.css';
import 'twenty-ui/theme-light.css';
import 'twenty-ui/theme-dark.css';
import './index.css';

// TODO: REMOVE this after 2026-12-12 — temporary migration of tokenPair from the
// legacy cookie to localStorage (legacy cookie has a 180-day expiry).
migrateTokenPairCookieToLocalStorage();

const renderApp = () => {
  const root = ReactDOM.createRoot(
    document.getElementById('root') ?? document.body,
  );

  root.render(<App />);
};

hydrateMetadataStore().then(renderApp, renderApp);
