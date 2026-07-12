// Nocturne brass accent ramp, light/Riviera variant (DESIGN.md §2.1),
// anchored on --p-accent light #A6844A (accent9). Brass is the ONLY chrome
// accent — gold is money-only and must not appear here. Radix-style steps:
// 1–2 tinted backgrounds, 3–5 component fills, 6–8 borders/strong fills,
// 9–10 solid, 11–12 strongest brass (text).
const BRASS_LIGHT = {
  brass1: 'color(display-p3 0.984 0.965 0.91)',
  brass2: 'color(display-p3 0.969 0.941 0.867)',
  brass3: 'color(display-p3 0.941 0.894 0.769)',
  brass4: 'color(display-p3 0.91 0.843 0.671)',
  brass5: 'color(display-p3 0.875 0.788 0.58)',
  brass6: 'color(display-p3 0.827 0.722 0.494)',
  brass7: 'color(display-p3 0.761 0.643 0.404)',
  brass8: 'color(display-p3 0.678 0.549 0.314)',
  brass9: 'color(display-p3 0.651 0.518 0.29)',
  brass10: 'color(display-p3 0.592 0.463 0.247)',
  brass11: 'color(display-p3 0.49 0.38 0.196)',
  brass12: 'color(display-p3 0.29 0.227 0.118)',
};

export const ACCENT_LIGHT = {
  primary: BRASS_LIGHT.brass5,
  secondary: BRASS_LIGHT.brass5,
  tertiary: BRASS_LIGHT.brass3,
  quaternary: BRASS_LIGHT.brass2,
  accent3570: BRASS_LIGHT.brass8,
  accent4060: BRASS_LIGHT.brass8,
  accent1: BRASS_LIGHT.brass1,
  accent2: BRASS_LIGHT.brass2,
  accent3: BRASS_LIGHT.brass3,
  accent4: BRASS_LIGHT.brass4,
  accent5: BRASS_LIGHT.brass5,
  accent6: BRASS_LIGHT.brass6,
  accent7: BRASS_LIGHT.brass7,
  accent8: BRASS_LIGHT.brass8,
  accent9: BRASS_LIGHT.brass9,
  accent10: BRASS_LIGHT.brass10,
  accent11: BRASS_LIGHT.brass11,
  accent12: BRASS_LIGHT.brass12,
};
