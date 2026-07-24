import { QuickNoteModal } from '@/propel/quick-note/components/QuickNoteModal';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { isModalOpenedComponentState } from '@/ui/layout/modal/states/isModalOpenedComponentState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { dockColor, noteAccent } from '@/ui/theme/dockColorTokens';
import { QUICK_NOTE_MODAL_ID } from '@/propel/quick-note/constants/QuickNoteModalId';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { IconNotes } from 'twenty-ui/display';

// Propel: global "Quick Note" floating launcher — lets anyone jot a note
// against any contact/lead without first opening that record's own page.
// Stacked directly above the WhatsApp dock (which sits above the Dialer
// dock), same right-edge column, so all three floating launchers read as one
// group in the bottom-right corner. Unlike the two docks, this one isn't
// draggable/expandable — it only ever opens the centered Quick Note modal —
// so a fixed default position (no drag-persisted offset) is enough.
//
// Dialer default: right 14 / bottom 72. WhatsApp default: right 14 / bottom
// 130 (+58 to clear the dialer's collapsed pill). This stacks one more pill
// height above that: right 14 / bottom 188.
const QUICK_NOTE_DOCK_Z_INDEX = 30;

const StyledLauncherContainer = styled.div`
  bottom: 188px;
  position: fixed;
  right: 14px;
  z-index: ${QUICK_NOTE_DOCK_Z_INDEX};
`;

const StyledLauncher = styled.button`
  align-items: center;
  background: ${noteAccent.pillBg};
  border: 0;
  border-radius: 50%;
  box-shadow: ${dockColor.shadowStrong};
  color: ${dockColor.iconOnAccent};
  cursor: pointer;
  display: flex;
  height: 44px;
  justify-content: center;
  padding: 0;
  width: 44px;

  &:hover {
    background: ${noteAccent.pillBgHover};
  }

  &:focus-visible {
    outline: 2px solid ${dockColor.textPrimary};
    outline-offset: 2px;
  }
`;

export const QuickNoteButton = () => {
  const { openModal } = useModal();

  // Mount the modal ONLY while it is open. Its body calls
  // useOpenCreateActivityDrawer(Note) and useQuickNoteSearchResults at render,
  // and both need object metadata to be loaded — rendering it eagerly on every
  // page threw "Object metadata item 'note' cannot be found in an array of 0
  // elements" before the metadata store had filled, which the error boundary
  // turned into a full-app error page. Gating on open also means the picker
  // does no work until someone actually wants it. The open/close animation is
  // unaffected: ModalStatefulWrapper drives it from the same atom.
  const isQuickNoteModalOpened = useAtomComponentStateValue(
    isModalOpenedComponentState,
    QUICK_NOTE_MODAL_ID,
  );

  return (
    <>
      <StyledLauncherContainer>
        <StyledLauncher
          type="button"
          title={t`Quick Note`}
          aria-label={t`Quick Note`}
          onClick={() => openModal(QUICK_NOTE_MODAL_ID)}
        >
          <span aria-hidden="true">
            <IconNotes size={20} />
          </span>
        </StyledLauncher>
      </StyledLauncherContainer>
      {isQuickNoteModalOpened && <QuickNoteModal />}
    </>
  );
};
