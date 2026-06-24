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
import 'react-loading-skeleton/dist/skeleton.css';
import 'twenty-ui/style.css';
import 'twenty-ui/theme-light.css';
import 'twenty-ui/theme-dark.css';
import './index.css';

const root = ReactDOM.createRoot(
  document.getElementById('root') ?? document.body,
);

root.render(<App />);
