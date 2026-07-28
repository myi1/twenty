import { ACCENT_DARK } from '@ui/theme/constants/AccentDark';
import { ANIMATION } from './Animation';
import { ICON } from './Icon';
import { MODAL } from './Modal';
import { TEXT } from './Text';

export const THEME_COMMON = {
  icon: ICON,
  modal: MODAL,
  text: TEXT,
  animation: ANIMATION,
  spacingMultiplicator: 4,
  spacing: (...args: number[]) =>
    args.map((multiplicator) => `${multiplicator * 4}px`).join(' '),
  betweenSiblingsGap: `2px`,
  table: {
    horizontalCellMargin: '8px',
    checkboxColumnWidth: '32px',
    horizontalCellPadding: '8px',
  },
  sidePanelWidth: '500px',
  // PROPEL-NOCTURNE PATCH (Tier B) — 140ms press on the EASE.out curve
  // (DESIGN.md §2.6); consumed by the shared Button via the CSS var.
  clickableElementBackgroundTransition:
    'background 140ms cubic-bezier(0.23, 1, 0.32, 1)',
  lastLayerZIndex: 2147483647,
  buttons: {
    secondaryTextColor: ACCENT_DARK.accent11,
  },
};
