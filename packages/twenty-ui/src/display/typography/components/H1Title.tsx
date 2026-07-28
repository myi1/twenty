import { type ReactNode } from 'react';
import { styled } from '@linaria/react';
import { themeCssVariables } from '@ui/theme-constants';

type H1TitleProps = {
  title: ReactNode;
  fontColor?: H1TitleFontColor;
  className?: string;
};

export enum H1TitleFontColor {
  Primary = 'primary',
  Secondary = 'secondary',
  Tertiary = 'tertiary',
}

// PROPEL-NOCTURNE PATCH (Tier B) — re-apply on Twenty upgrade.
// Page titles render in the Fraunces display face at weight 500 (Fraunces
// is loaded at 400/500 only — 600 would synthesize a faux bold).
const StyledTitle = styled.h2<{
  fontColor: H1TitleFontColor;
}>`
  color: ${({ fontColor }) => themeCssVariables.font.color[fontColor]};
  font-family: ${themeCssVariables.font.familyDisplay};
  font-size: ${themeCssVariables.font.size.lg};
  font-weight: ${themeCssVariables.font.weight.medium};
  line-height: ${themeCssVariables.text.lineHeight.md};
  margin: 0;
  margin-bottom: ${themeCssVariables.spacing[4]};
`;

export const H1Title = ({
  title,
  fontColor = H1TitleFontColor.Tertiary,
  className,
}: H1TitleProps) => {
  return (
    <StyledTitle fontColor={fontColor} className={className}>
      {title}
    </StyledTitle>
  );
};
