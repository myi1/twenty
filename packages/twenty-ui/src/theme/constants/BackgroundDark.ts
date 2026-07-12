import DarkNoise from '@assets/themes/dark-noise.jpg';

import { COLOR_DARK } from '@ui/theme/constants/ColorsDark';
import { GRAY_SCALE_DARK } from './GrayScaleDark';
import { TRANSPARENT_COLORS_DARK } from './TransparentColorsDark';

export const BACKGROUND_DARK = {
  noisy: `url(${DarkNoise.toString()})`,
  primary: GRAY_SCALE_DARK.gray1,
  secondary: GRAY_SCALE_DARK.gray2,
  tertiary: GRAY_SCALE_DARK.gray4,
  quaternary: GRAY_SCALE_DARK.gray5,
  invertedPrimary: GRAY_SCALE_DARK.gray12,
  invertedSecondary: GRAY_SCALE_DARK.gray11,
  danger: COLOR_DARK.red3,
  transparent: {
    // Warm near-black #0A0906 overlays (Radix blackA7/blackA6 alphas kept).
    primary: 'color(display-p3 0.039 0.035 0.024 / 0.5)',
    secondary: 'color(display-p3 0.039 0.035 0.024 / 0.4)',
    strong: TRANSPARENT_COLORS_DARK.gray7,
    medium: TRANSPARENT_COLORS_DARK.gray5,
    light: TRANSPARENT_COLORS_DARK.gray2,
    lighter: TRANSPARENT_COLORS_DARK.gray1,
    danger: TRANSPARENT_COLORS_DARK.red3,
    blue: TRANSPARENT_COLORS_DARK.blue4,
    orange: TRANSPARENT_COLORS_DARK.orange4,
    success: TRANSPARENT_COLORS_DARK.green4,
  },
  // Warm near-black #0A0906 (alphas unchanged from the old #000000 values).
  overlayPrimary: '#0a0906b8',
  overlaySecondary: '#0a09065c',
  overlayTertiary: '#0a09065c',
  radialGradient: `radial-gradient(50% 62.62% at 50% 0%, ${GRAY_SCALE_DARK.gray9} 0%, ${GRAY_SCALE_DARK.gray10} 100%)`,
  radialGradientHover: `radial-gradient(76.32% 95.59% at 50% 0%, ${GRAY_SCALE_DARK.gray10} 0%, ${GRAY_SCALE_DARK.gray11} 100%)`,
  primaryInverted: GRAY_SCALE_DARK.gray12,
  primaryInvertedHover: GRAY_SCALE_DARK.gray11,
};
