import { MobileBreadcrumb } from '@/ui/navigation/bread-crumb/components/MobileBreadcrumb';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
import { styled } from '@linaria/react';
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export type BreadcrumbProps = {
  className?: string;
  links: { children: string | ReactNode; href?: string }[];
};

// PROPEL-NOCTURNE PATCH (Tier B) — re-apply on Twenty upgrade.
// The breadcrumb is the visible table-view / record title in the top bar;
// size follows the ≥15px title rule (family inherits the display face from
// PageHeader's title container).
const StyledWrapper = styled.nav`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: grid;
  font-size: ${themeCssVariables.font.size.lg};
  grid-auto-flow: column;
  grid-column-gap: ${themeCssVariables.spacing[1]};
  height: ${themeCssVariables.spacing[8]};
  max-width: 100%;
  min-width: 0;
`;

const StyledLinkContainer = styled.div`
  > a {
    color: inherit;
    overflow: hidden;
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const StyledText = styled.span`
  color: ${themeCssVariables.font.color.primary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledDivider = styled.span`
  width: ${themeCssVariables.spacing[2]};
`;

export const Breadcrumb = ({ className, links }: BreadcrumbProps) => {
  const isMobile = useIsMobile();

  if (isMobile && links.length > 0) {
    return <MobileBreadcrumb className={className} links={links} />;
  }

  return (
    <StyledWrapper className={className}>
      {links.map((link, index) => {
        const text = typeof link.children === 'string' ? link.children : '';

        return (
          <Fragment key={index}>
            {link.href ? (
              <StyledLinkContainer>
                <Link title={text} to={link.href}>
                  {link.children}
                </Link>
              </StyledLinkContainer>
            ) : (
              <StyledText title={text}>{link.children}</StyledText>
            )}
            {index < links.length - 1 && <StyledDivider>/</StyledDivider>}
          </Fragment>
        );
      })}
    </StyledWrapper>
  );
};
