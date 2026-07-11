import { RGBA } from '@ui/theme/constants/Rgba';

/* oxlint-disable twenty/no-hardcoded-colors */
// Nocturne elevation (DESIGN.md §2.5): a hairline system, not a shadow
// system. Shadows are warm (#0A0906 base, not pure black), low, and rare:
// light = --p-shadow-sm (resting card), strong = --p-shadow-pop
// (dropdowns/popovers), superHeavy = --p-shadow-sheet (drawers/modals).
export const BOX_SHADOW_DARK = {
  color: RGBA('#0A0906', 0.6),
  light: `0px 1px 2px 0px ${RGBA('#0A0906', 0.3)}`,
  strong: `0px 8px 28px 0px ${RGBA('#0A0906', 0.45)}`,
  underline: `0px 1px 0px 0px ${RGBA('#0A0906', 0.32)}`,
  superHeavy: `0px 16px 48px 0px ${RGBA('#0A0906', 0.55)}`,
};
