import { GRAY_SCALE_LIGHT_ALPHA } from '@ui/theme/constants/GrayScaleLightAlpha';

// Nocturne elevation (DESIGN.md §2.5): hairline-first; same sm/pop/sheet
// geometry as dark, with the warm near-black alpha ramp as the base so
// elevation reads warm on the Riviera paper.
export const BOX_SHADOW_LIGHT = {
  color: GRAY_SCALE_LIGHT_ALPHA.gray2,
  light: `0px 1px 2px 0px ${GRAY_SCALE_LIGHT_ALPHA.gray5}`,
  strong: `0px 8px 28px 0px ${GRAY_SCALE_LIGHT_ALPHA.gray7}`,
  underline: `0px 1px 0px 0px ${GRAY_SCALE_LIGHT_ALPHA.gray9}`,
  superHeavy: `0px 16px 48px 0px ${GRAY_SCALE_LIGHT_ALPHA.gray10}`,
};
