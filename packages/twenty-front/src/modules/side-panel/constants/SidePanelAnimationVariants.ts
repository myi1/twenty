import { themeCssVariables } from 'twenty-ui/theme-constants';

// PROPEL-NOCTURNE PATCH (Tier B) — re-apply on Twenty upgrade.
// iOS-like drawer curve (DESIGN.md §2.6 EASE.drawer): 320ms in / 200ms out.
// Framer-motion takes the cubic-bezier as an array.
export const SIDE_PANEL_DRAWER_EASE: [number, number, number, number] = [
  0.32, 0.72, 0, 1,
];

export const SIDE_PANEL_DRAWER_TRANSITION = {
  open: { duration: 0.32, ease: SIDE_PANEL_DRAWER_EASE },
  closed: { duration: 0.2, ease: SIDE_PANEL_DRAWER_EASE },
} as const;

export const SIDE_PANEL_ANIMATION_VARIANTS = {
  fullScreen: {
    x: '0%',
    width: '100%',
    height: '100%',
    bottom: '0',
    top: '0',
    transition: SIDE_PANEL_DRAWER_TRANSITION.open,
  },
  normal: {
    x: '0%',
    width: themeCssVariables.sidePanelWidth,
    height: '100%',
    bottom: '0',
    top: '0',
    transition: SIDE_PANEL_DRAWER_TRANSITION.open,
  },
  closed: {
    x: '100%',
    width: themeCssVariables.sidePanelWidth,
    height: '100%',
    bottom: '0',
    top: 'auto',
    transition: SIDE_PANEL_DRAWER_TRANSITION.closed,
  },
};
