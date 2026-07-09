import { NavigationDrawerOpenedSection } from '@/navigation-menu-item/display/sections/components/NavigationDrawerOpenedSection';

import { PropelNavigationSections } from '@/navigation/components/PropelNavigationSections';
import { styled } from '@linaria/react';

import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledScrollableItemsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

export const MainNavigationDrawerScrollableItems = () => {
  return (
    <StyledScrollableItemsContainer>
      <NavigationDrawerOpenedSection />
      {/* Propel: the Favorites → Workspace → (promoted folders) → Other
          composition is config-driven (propelNavConfig.ts `sections`); falls back
          to the hardcoded Favorites → Workspace → Other when no config sections. */}
      <PropelNavigationSections />
    </StyledScrollableItemsContainer>
  );
};
