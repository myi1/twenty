import * as fs from 'fs';
import * as path from 'path';

import { config } from 'dotenv';
config({
  path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
  override: true,
});

export function generateFrontConfig(): void {
  // When FRONT_AUTO_BASE_URL=true (or SERVER_URL is unset), inject an empty
  // _env_ so the frontend's getDefaultUrl() fallback resolves the API origin
  // from the page's own hostname at request time. This lets the same deploy
  // be reached at both http://<external-ip> and http://localhost without a
  // hairpin through the public interface.
  const useAutoUrl =
    process.env.FRONT_AUTO_BASE_URL === 'true' || !process.env.SERVER_URL;

  const envForFront: Record<string, string> = useAutoUrl
    ? {}
    : { REACT_APP_SERVER_BASE_URL: process.env.SERVER_URL! };

  if (process.env.REACT_APP_DIALER_DOCK_URL) {
    envForFront.REACT_APP_DIALER_DOCK_URL =
      process.env.REACT_APP_DIALER_DOCK_URL;
  }

  // Propel Marketing Hub (P3 graduated heroes) — runtime toggle. The FE reads
  // Boolean(window._env_.REACT_APP_PROPEL_MARKETING_HUB), so any non-empty value
  // enables it; leave the env var unset to disable.
  if (process.env.REACT_APP_PROPEL_MARKETING_HUB) {
    envForFront.REACT_APP_PROPEL_MARKETING_HUB =
      process.env.REACT_APP_PROPEL_MARKETING_HUB;
  }

  // Propel runtime-loaded heroes — base URL of the hero-bundles volume. The FE
  // (HeroRoute) reads window._env_.REACT_APP_HEROES_BASE_URL and dynamic-imports
  // `${base}/<name>/index.js`. Defaults to `/heroes` in the FE when unset; set this
  // to point at the mounted heroes volume (e.g. when it's served from another path).
  //
  // This SAME base URL also serves the Propel nav fast-path config: the FE fetches
  // `${base}/nav.config.json` (propelNavConfig.ts) to drive the sidebar hero nav
  // (labels/icons/order/routes) at runtime. So a nav edit is just editing that JSON
  // on the heroes mount + a refresh — no rebuild, no extra env var. No allowlist
  // change is needed here: the nav config rides REACT_APP_HEROES_BASE_URL.
  if (process.env.REACT_APP_HEROES_BASE_URL) {
    envForFront.REACT_APP_HEROES_BASE_URL =
      process.env.REACT_APP_HEROES_BASE_URL;
  }

  // Propel floating WhatsApp dock (founder feature #2) — runtime toggle. The FE
  // (WhatsAppDock) renders only when window._env_.REACT_APP_WA_DOCK_ENABLED ===
  // 'true', so the flag must be surfaced here or the dock can never turn on at
  // runtime. Set "true" to enable (staging first); leave unset to dark-ship.
  if (process.env.REACT_APP_WA_DOCK_ENABLED) {
    envForFront.REACT_APP_WA_DOCK_ENABLED =
      process.env.REACT_APP_WA_DOCK_ENABLED;
  }

  const configString = `<!-- BEGIN: Twenty Config -->
    <script id="twenty-env-config">
      window._env_ = ${JSON.stringify(envForFront, null, 2)};
    </script>
    <!-- END: Twenty Config -->`;

  const distPath = path.join(__dirname, '..', 'front');
  const indexPath = path.join(distPath, 'index.html');

  try {
    let indexContent = fs.readFileSync(indexPath, 'utf8');

    indexContent = indexContent.replace(
      /<!-- BEGIN: Twenty Config -->[\s\S]*?<!-- END: Twenty Config -->/,
      configString,
    );

    fs.writeFileSync(indexPath, indexContent, 'utf8');
  } catch {
    // oxlint-disable-next-line no-console
    console.log(
      'Frontend build not found or not writable, assuming it is served independently',
    );
  }
}
