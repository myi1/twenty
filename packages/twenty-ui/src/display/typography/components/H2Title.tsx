import { styled } from '@linaria/react';
import { OverflowingTextWithTooltip } from '@ui/display/tooltip/OverflowingTextWithTooltip';
import { themeCssVariables } from '@ui/theme-constants';

type H2TitleProps = {
  title: string;
  description?: string;
  adornment?: React.ReactNode;
  className?: string;
};

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  margin-bottom: ${themeCssVariables.spacing[4]};
`;

const StyledTitleContainer = styled.div`
  align-items: center;
  display: flex;
  justify-content: space-between;
`;

// PROPEL-NOCTURNE PATCH (Tier B) — re-apply on Twenty upgrade.
// Section headers render in the Fraunces display face; size raised md → lg
// (titles never below 15px, DESIGN.md §2.2) and weight capped at 500
// (Fraunces is loaded at 400/500 only).
const StyledTitle = styled.h2`
  color: ${themeCssVariables.font.color.primary};
  font-family: ${themeCssVariables.font.familyDisplay};
  font-size: ${themeCssVariables.font.size.lg};
  font-weight: ${themeCssVariables.font.weight.medium};
  margin: 0;
`;

const StyledDescription = styled.h3`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.regular};
  margin: 0;
  margin-top: ${themeCssVariables.spacing[2]};
`;

export const H2Title = ({
  title,
  description,
  adornment,
  className,
}: H2TitleProps) => {
  return (
    <StyledContainer className={className}>
      <StyledTitleContainer>
        <StyledTitle>{title}</StyledTitle>
        {adornment}
      </StyledTitleContainer>
      {description && (
        <StyledDescription>
          <OverflowingTextWithTooltip
            text={description}
            displayedMaxRows={5}
            isTooltipMultiline={true}
          />
        </StyledDescription>
      )}
    </StyledContainer>
  );
};
