// Nocturne Riviera-paper ramp (DESIGN.md §2.1, light column): gray1 = surface
// #FCF8F0, gray2 = canvas #F6F1E7, gray4 = surface-2 #EFE8D9, gray6 = line
// #E2D9C7, gray11 = ink-2 #6E6656, gray12 = ink #2A2620.
// Luminance is monotonic (descending) 1→12.
export const GRAY_SCALE_LIGHT = {
  gray1: 'color(display-p3 0.988 0.973 0.941)',
  gray2: 'color(display-p3 0.965 0.945 0.906)',
  gray3: 'color(display-p3 0.953 0.925 0.878)',
  gray4: 'color(display-p3 0.937 0.91 0.851)',
  gray5: 'color(display-p3 0.914 0.882 0.816)',
  gray6: 'color(display-p3 0.886 0.851 0.78)',
  gray7: 'color(display-p3 0.827 0.788 0.706)',
  gray8: 'color(display-p3 0.702 0.659 0.561)',
  gray9: 'color(display-p3 0.588 0.549 0.467)',
  gray10: 'color(display-p3 0.522 0.482 0.4)',
  gray11: 'color(display-p3 0.431 0.4 0.337)',
  gray12: 'color(display-p3 0.165 0.149 0.125)',
};
