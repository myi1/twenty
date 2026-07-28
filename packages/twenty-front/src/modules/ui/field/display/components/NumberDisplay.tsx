import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { EllipsisDisplay } from './EllipsisDisplay';

// PROPEL-NOCTURNE PATCH (Tier B) — re-apply on Twenty upgrade.
// Numbers align in tabular mono (DESIGN.md §5) — conservative: no gold, no
// rounding here (gold is money-only and lives in CurrencyDisplay).
const StyledNumberDisplay = styled(EllipsisDisplay)`
  font-family: ${themeCssVariables.code.font.family};
  font-variant-numeric: tabular-nums;
  justify-content: flex-end;
`;

type NumberDisplayProps = {
  value: string | number | null | undefined;
  decimals?: number;
};

export const NumberDisplay = ({ value }: NumberDisplayProps) => (
  <StyledNumberDisplay>{value}</StyledNumberDisplay>
);
