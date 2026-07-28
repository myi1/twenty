import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

// PROPEL-NOCTURNE PATCH (Tier B) — re-apply on Twenty upgrade.
// 3px left-edge stage bar (DESIGN.md §4): the board card wrapper sets
// --propel-stage-bar-color from its column's semantic (brass=active,
// sage=won-path, blue=new, muted=nurture); rendered as a clipped
// pseudo-element so border shorthands (hover/active) never clobber it.
const StyledBoardCard = styled.div<{
  isDragging?: boolean;
  isSecondaryDragged?: boolean;
  isPrimaryMultiDrag?: boolean;
}>`
  background-color: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  opacity: ${({ isSecondaryDragged }) => (isSecondaryDragged ? '0.3' : '1')};
  overflow: hidden;
  position: relative;

  &::before {
    background: var(--propel-stage-bar-color, transparent);
    bottom: 0;
    content: '';
    left: 0;
    position: absolute;
    top: 0;
    width: 3px;
  }

  width: 100%;

  &[data-selected='true'] {
    background-color: ${themeCssVariables.accent.quaternary};
  }

  &[data-focused='true'] {
    background-color: ${themeCssVariables.background.tertiary};
  }

  &[data-active='true'] {
    background-color: ${themeCssVariables.accent.quaternary};
    border: 1px solid ${themeCssVariables.color.blue7};
  }

  &:hover {
    border: 1px solid ${themeCssVariables.border.color.strong};

    &[data-active='true'] {
      border: 1px solid ${themeCssVariables.color.blue7};
    }
  }

  .checkbox-container {
    max-width: 0;
    opacity: 0;
    pointer-events: none;
    transition: all ease-in-out 160ms;
  }

  &[data-selected='true'] .checkbox-container,
  &:hover .checkbox-container {
    max-width: ${themeCssVariables.spacing[6]};
    opacity: 1;
    pointer-events: auto;
  }

  .compact-icon-container {
    opacity: 0;
    transition: all ease-in-out 160ms;
  }
  &:hover .compact-icon-container {
    opacity: 1;
  }
`;

export { StyledBoardCard as RecordCard };
