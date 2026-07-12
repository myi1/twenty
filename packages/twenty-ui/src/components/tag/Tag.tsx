import { styled } from '@linaria/react';

import { type IconComponent } from '@ui/display/icon/types/IconComponent';
import { OverflowingTextWithTooltip } from '@ui/display/tooltip/OverflowingTextWithTooltip';
import { isDefined } from 'twenty-shared/utils';
import { type ThemeColor } from '@ui/theme';
import { ThemeContext, themeCssVariables } from '@ui/theme-constants';
import { useContext } from 'react';

// PROPEL-NOCTURNE PATCH (Tier B) — re-apply on Twenty upgrade.
// Status tags render as SEALS (DESIGN.md §4): a 7px semantic dot with a soft
// ring + a plain-language label — never a filled pill, never UPPER_CASE.
const StyledTag = styled.span<{
  color: TagColor;
  weight: TagWeight;
  variant: TagVariant;
  preventShrink?: boolean;
  preventPadding?: boolean;
}>`
  align-items: center;
  background: transparent;
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${({ color }) =>
    color === 'transparent'
      ? themeCssVariables.font.color.secondary
      : themeCssVariables.font.color.primary};
  display: inline-flex;
  text-transform: none;
  font-size: ${themeCssVariables.font.size.md};
  font-style: normal;
  font-weight: ${({ weight }) =>
    weight === 'regular'
      ? themeCssVariables.font.weight.regular
      : themeCssVariables.font.weight.medium};
  height: ${themeCssVariables.spacing[5]};
  margin: 0;
  overflow: hidden;
  padding: ${({ preventPadding }) =>
    preventPadding ? '0' : `0 ${themeCssVariables.spacing[2]}`};
  border: ${({ variant }) =>
    variant === 'outline' || variant === 'border'
      ? `1px ${variant === 'border' ? 'solid' : 'dashed'} ${themeCssVariables.border.color.strong}`
      : 'none'};

  gap: ${themeCssVariables.spacing[1]};

  min-width: ${({ preventShrink }) => (preventShrink ? 'fit-content' : 'none')};
`;

// PROPEL-NOCTURNE PATCH (Tier B) — the 7px seal dot carries the semantic
// color; the soft ring is a warm transparent wash.
const StyledSealDot = styled.span<{ color: TagColor }>`
  background: ${({ color }) =>
    color === 'transparent'
      ? themeCssVariables.font.color.tertiary
      : (themeCssVariables.tag.text[color] ??
        themeCssVariables.font.color.tertiary)};
  border-radius: 50%;
  box-shadow: 0 0 0 3px ${themeCssVariables.background.transparent.light};
  flex-shrink: 0;
  height: 7px;
  margin: 0 ${themeCssVariables.spacing[1]};
  width: 7px;
`;

const StyledContent = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledNonShrinkableText = styled.span`
  white-space: nowrap;
  width: fit-content;
`;

const StyledIconContainer = styled.div`
  display: flex;
`;

type TagWeight = 'regular' | 'medium';
type TagVariant = 'solid' | 'outline' | 'border';
export type TagColor = ThemeColor | 'transparent';

type TagProps = {
  className?: string;
  color: TagColor;
  text: string;
  Icon?: IconComponent;
  onClick?: () => void;
  weight?: TagWeight;
  variant?: TagVariant;
  preventShrink?: boolean;
  preventPadding?: boolean;
};

export const Tag = ({
  className,
  color,
  text,
  Icon,
  onClick,
  weight = 'regular',
  variant = 'solid',
  preventShrink,
  preventPadding,
}: TagProps) => {
  const { theme } = useContext(ThemeContext);

  return (
    <StyledTag
      className={className}
      color={color}
      onClick={onClick}
      weight={weight}
      variant={variant}
      preventShrink={preventShrink}
      preventPadding={preventPadding}
    >
      {isDefined(Icon) ? (
        <StyledIconContainer>
          <Icon size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
        </StyledIconContainer>
      ) : (
        color !== 'transparent' && <StyledSealDot color={color} />
      )}
      {preventShrink ? (
        <StyledNonShrinkableText>{text}</StyledNonShrinkableText>
      ) : (
        <StyledContent>
          <OverflowingTextWithTooltip text={text} />
        </StyledContent>
      )}
    </StyledTag>
  );
};
