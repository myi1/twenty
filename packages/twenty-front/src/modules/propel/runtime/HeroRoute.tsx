/* eslint-disable @nx/enforce-module-boundaries */
// ─────────────────────────────────────────────────────────────────────────────
// Propel runtime-loaded heroes — ROUTE LOADER
// ─────────────────────────────────────────────────────────────────────────────
//
// Renders a hero that is loaded AT RUNTIME (not bundled into the app). The hero is a
// single ESM file at `${REACT_APP_HEROES_BASE_URL}/<name>/index.js`, built with all
// shared/host specifiers external (see vite.hero.config.ts). Its bare imports resolve
// — via the page import map (index.html) → /propel-shims/*.js → window.__propelShared
// (populated by heroShared.ts before any hero loads) — to the host's own singletons.
// So: one React, one Mantine, one ThemeContext; the hero behaves exactly as if it had
// been bundled in, but ships independently of the engine image.
//
// On staging the /heroes volume is runtime-mutable (the coordinator mounts it), so a
// hero can be re-deployed without rebuilding the front. A 404 (volume not wired, name
// typo, bad build) is caught and shown as a friendly error rather than a white screen.

import {
  Component,
  lazy,
  Suspense,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { MainContainerLayoutWithSidePanel } from '@/object-record/components/MainContainerLayoutWithSidePanel';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { REACT_APP_SERVER_BASE_URL } from '~/config';
import {
  type PropelHeroComponent,
  type PropelHeroHost,
  type PropelHeroNotifyVariant,
} from '@/propel/runtime/heroHost';
import { getHeroDisplayName } from '@/propel/runtime/heroRegistry';

// REACT_APP_HEROES_BASE_URL: where hero bundles are served. Default `/heroes` (the
// runtime-mutable volume). Runtime read pattern mirrors the rest of the front:
// window._env_ first (baked at container start), then Vite build-time env.
const heroesBaseUrl = (): string =>
  window._env_?.REACT_APP_HEROES_BASE_URL ||
  import.meta.env.REACT_APP_HEROES_BASE_URL ||
  '/heroes';

// Module-level cache of lazy components keyed by hero name, so re-navigating to a
// hero doesn't re-trigger the dynamic import (React.lazy already memoizes per
// component identity — we must NOT create a fresh lazy() on every render).
const lazyHeroCache = new Map<
  string,
  ComponentType<{ host: PropelHeroHost }>
>();

const getLazyHero = (name: string): ComponentType<{ host: PropelHeroHost }> => {
  const cached = lazyHeroCache.get(name);
  if (cached !== undefined) {
    return cached;
  }
  const Lazy = lazy(async () => {
    const url = `${heroesBaseUrl()}/${name}/index.js`;
    // @vite-ignore: the URL is computed at runtime; Vite must NOT try to resolve or
    // pre-bundle it — the bundle is served from the heroes volume, not from src.
    const mod = await import(/* @vite-ignore */ url);
    const Hero = (mod.default ?? mod.Hero) as PropelHeroComponent | undefined;
    if (typeof Hero !== 'function') {
      throw new Error(
        `[propel-hero] bundle at ${url} has no default export (got ${typeof Hero})`,
      );
    }
    return { default: Hero as ComponentType<{ host: PropelHeroHost }> };
  });
  lazyHeroCache.set(name, Lazy);
  return Lazy;
};

// ── Error boundary ────────────────────────────────────────────────────────────
type HeroErrorBoundaryProps = {
  displayName: string;
  children: ReactNode;
};
type HeroErrorBoundaryState = { error: Error | null };

class HeroErrorBoundary extends Component<
  HeroErrorBoundaryProps,
  HeroErrorBoundaryState
> {
  state: HeroErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): HeroErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // oxlint-disable-next-line no-console
    console.error('[propel-hero] failed to load/render hero', error, info);
  }

  render() {
    if (this.state.error !== null) {
      return (
        <div
          role="alert"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: 48,
            textAlign: 'center',
            height: '100%',
            color: 'var(--t-font-color-secondary, #777)',
            font: '14px Inter, sans-serif',
          }}
        >
          <strong style={{ color: 'var(--t-font-color-primary, #111)' }}>
            {this.props.displayName} couldn’t load
          </strong>
          <span>
            This screen failed to load. It may be temporarily unavailable — try
            refreshing.
          </span>
        </div>
      );
    }
    return this.props.children;
  }
}

// A minimal centered placeholder while the bundle is fetched.
const HeroLoading = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      color: 'var(--t-font-color-tertiary, #999)',
      font: '13px Inter, sans-serif',
    }}
  >
    Loading…
  </div>
);

// ── The route component ───────────────────────────────────────────────────────
// `name` is the hero bundle name (e.g. "marketing-hub"). Typed as a plain string
// so a hero added purely via the runtime nav config (no code change) still works.
export const HeroRoute = ({ name }: { name: string }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    enqueueSuccessSnackBar,
    enqueueErrorSnackBar,
    enqueueInfoSnackBar,
    enqueueWarningSnackBar,
  } = useSnackBar();

  const notify = (
    message: string,
    variant: PropelHeroNotifyVariant = 'info',
  ) => {
    if (variant === 'success') return enqueueSuccessSnackBar({ message });
    if (variant === 'error') return enqueueErrorSnackBar({ message });
    if (variant === 'warning') return enqueueWarningSnackBar({ message });
    return enqueueInfoSnackBar({ message });
  };

  const host: PropelHeroHost = {
    callPropelRoute,
    getToken: () =>
      getTokenPair()?.accessOrWorkspaceAgnosticToken?.token ?? undefined,
    serverBaseUrl: REACT_APP_SERVER_BASE_URL,
    navigate: (to: string) => navigate(to),
    notify,
    searchParams,
  };

  const Hero = getLazyHero(name);
  const displayName = getHeroDisplayName(name);

  return (
    <MainContainerLayoutWithSidePanel>
      <HeroErrorBoundary displayName={displayName}>
        <Suspense fallback={<HeroLoading />}>
          <Hero host={host} />
        </Suspense>
      </HeroErrorBoundary>
    </MainContainerLayoutWithSidePanel>
  );
};
