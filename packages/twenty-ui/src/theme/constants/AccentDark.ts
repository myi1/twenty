// Nocturne brass accent ramp (DESIGN.md §2.1) anchored on --p-accent #C6A86C
// (accent9). Brass is the ONLY chrome accent — gold (#E4C988) is reserved for
// money/hero numerals and must not appear here. Radix-style steps: 1–2 tinted
// backgrounds, 3–5 component fills, 6–8 borders/strong fills, 9–10 solid,
// 11–12 strongest brass (text).
const BRASS_DARK = {
  brass1: 'color(display-p3 0.086 0.075 0.043)',
  brass2: 'color(display-p3 0.106 0.09 0.063)',
  brass3: 'color(display-p3 0.165 0.133 0.063)',
  brass4: 'color(display-p3 0.212 0.169 0.078)',
  brass5: 'color(display-p3 0.255 0.204 0.094)',
  brass6: 'color(display-p3 0.31 0.247 0.118)',
  brass7: 'color(display-p3 0.388 0.318 0.165)',
  brass8: 'color(display-p3 0.494 0.404 0.22)',
  brass9: 'color(display-p3 0.776 0.659 0.424)',
  brass10: 'color(display-p3 0.824 0.714 0.486)',
  brass11: 'color(display-p3 0.847 0.737 0.518)',
  brass12: 'color(display-p3 0.937 0.89 0.769)',
};

export const ACCENT_DARK = {
  primary: BRASS_DARK.brass5,
  secondary: BRASS_DARK.brass5,
  tertiary: BRASS_DARK.brass3,
  quaternary: BRASS_DARK.brass2,
  accent3570: BRASS_DARK.brass8,
  accent4060: BRASS_DARK.brass8,
  accent1: BRASS_DARK.brass1,
  accent2: BRASS_DARK.brass2,
  accent3: BRASS_DARK.brass3,
  accent4: BRASS_DARK.brass4,
  accent5: BRASS_DARK.brass5,
  accent6: BRASS_DARK.brass6,
  accent7: BRASS_DARK.brass7,
  accent8: BRASS_DARK.brass8,
  accent9: BRASS_DARK.brass9,
  accent10: BRASS_DARK.brass10,
  accent11: BRASS_DARK.brass11,
  accent12: BRASS_DARK.brass12,
};
