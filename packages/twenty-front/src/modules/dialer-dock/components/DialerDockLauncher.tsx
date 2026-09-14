import styled from '@emotion/styled';
import { type PointerEventHandler } from 'react';
import { IconPhone } from 'twenty-ui/display';

import { dialerAccent, dockColor } from '@/ui/theme/dockColorTokens';

const StyledLauncher = styled.button`
  align-items: center;
  align-self: flex-end;
  background: ${dialerAccent.pillBg};
  border: 0;
  border-radius: 50%;
  box-shadow: ${dockColor.shadowStrong};
  color: ${dockColor.iconOnAccent};
  cursor: pointer;
  display: flex;
  height: 44px;
  justify-content: center;
  padding: 0;
  touch-action: none;
  width: 44px;

  &:hover {
    background: ${dialerAccent.pillBgHover};
  }

  &:focus-visible {
    outline: 2px solid ${dockColor.textPrimary};
    outline-offset: 2px;
  }
`;

type DialerDockLauncherProps = {
  onClick: () => void;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
  onPointerMove?: PointerEventHandler<HTMLButtonElement>;
  onPointerUp?: PointerEventHandler<HTMLButtonElement>;
  onPointerCancel?: PointerEventHandler<HTMLButtonElement>;
};

export const DialerDockLauncher = ({
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: DialerDockLauncherProps) => {
  return (
    <StyledLauncher
      aria-label="Expand dialer"
      title="Open dialer"
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <span aria-hidden="true">
        <IconPhone size={20} />
      </span>
    </StyledLauncher>
  );
};
