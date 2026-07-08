/* eslint-disable @nx/enforce-module-boundaries */
// ─────────────────────────────────────────────────────────────────────────────
// Propel runtime nav config — REACT BINDING + ICON RESOLUTION
// ─────────────────────────────────────────────────────────────────────────────
//
// Thin React surface over propelNavConfig.ts. `usePropelNavConfig()` subscribes
// the calling component (the nav drawer) to the config cache via
// useSyncExternalStore, so when the mounted nav.config.json finishes loading at
// boot the sidebar re-renders with the merged config. `resolvePropelNavIcon()`
// turns a config icon NAME (string) into the actual twenty-ui icon component, so
// the mounted JSON can name any Tabler icon without a code change.

import { useSyncExternalStore } from 'react';
import * as TwentyUiDisplay from 'twenty-ui-deprecated/display';
import { type IconComponent } from 'twenty-ui-deprecated/display';

import {
  getPropelNavConfig,
  type PropelNavConfig,
  subscribePropelNavConfig,
} from '@/propel/runtime/propelNavConfig';

export const usePropelNavConfig = (): PropelNavConfig =>
  useSyncExternalStore(subscribePropelNavConfig, getPropelNavConfig);

// twenty-ui/display re-exports the Tabler icon set as named exports (IconInbox,
// IconBroadcast, …). Index that namespace by the config's string icon name.
const ICON_NAMESPACE = TwentyUiDisplay as unknown as Record<
  string,
  IconComponent | undefined
>;

// Resolve a config icon name to an icon component, falling back to a neutral dot
// if the name is unknown (so a typo in the mounted JSON can't crash the nav).
export const resolvePropelNavIcon = (iconName: string): IconComponent => {
  const resolved = ICON_NAMESPACE[iconName];
  if (typeof resolved === 'function') {
    return resolved;
  }
  return TwentyUiDisplay.IconCircleDot;
};
