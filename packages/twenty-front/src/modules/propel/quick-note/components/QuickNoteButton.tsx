import { QuickNoteModal } from '@/propel/quick-note/components/QuickNoteModal';
import { useReadableObjectMetadataItems } from '@/object-metadata/hooks/useReadableObjectMetadataItems';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { isModalOpenedComponentState } from '@/ui/layout/modal/states/isModalOpenedComponentState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { dockColor, noteAccent } from '@/ui/theme/dockColorTokens';
import { QUICK_NOTE_MODAL_ID } from '@/propel/quick-note/constants/QuickNoteModalId';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { IconNotes } from 'twenty-ui/display';
import { useDraggableDock } from '@/ui/layout/dock/hooks/useDraggableDock';

// Propel: global "Quick Note" floating launcher — lets anyone jot a note
// against any contact/lead without first opening that record's own page.
// Stacked directly above the WhatsApp dock (which sits above the Dialer
// dock), same right-edge column, so all three floating launchers read as one
// group in the bottom-right corner.
//
// 2026-09-08 — IT IS NOW DRAGGABLE, like the other two. The previous comment here argued
// that "a fixed default position is enough" because this launcher only opens a modal. That
// reasoning held until the pill landed on top of the Inbox composer's Send button, and it
// was the one pill an agent could not drag out of the way. Yahya: "the note button isnt
// movable like the other 2 buttons are." Position persists per browser.
//
// Dialer default: right 14 / bottom 72. WhatsApp default: right 14 / bottom
// 130 (+58 to clear the dialer's collapsed pill). This stacks one more pill
// height above that: right 14 / bottom 188.
const QUICK_NOTE_DOCK_Z_INDEX = 30;

const QUICK_NOTE_DOCK_POSITION_STORAGE_KEY = 'propel-quick-note-dock-position';
const DEFAULT_DOCK_POSITION = { right: 14, bottom: 188 };

// right/bottom now come from the drag position as an inline style — the container keeps
// only what does not change.
const StyledLauncherContainer = styled.div`
  position: fixed;
  z-index: ${QUICK_NOTE_DOCK_Z_INDEX};
`;

const StyledLauncher = styled.button`
  align-items: center;
  background: ${noteAccent.pillBg};
  border: 0;
  border-radius: 50%;
  box-shadow: ${dockColor.shadowStrong};
  color: ${dockColor.iconOnAccent};
  cursor: grab;

  &:active {
    cursor: grabbing;
  }
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
  const { position, dragHandleProps, shouldSuppressClick } = useDraggableDock(
    QUICK_NOTE_DOCK_POSITION_STORAGE_KEY,
    DEFAULT_DOCK_POSITION,
  );

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

  // Show the launcher only once the Note object's metadata is actually loaded.
  // This is both a correctness guard and the product behaviour we want:
  //  · Signed out (/welcome, sign-in) the metadata store is empty, so the
  //    button is hidden — a "jot a note against a contact" action makes no
  //    sense before you have a workspace.
  //  · It also makes the modal safe to open. QuickNoteModal calls
  //    useOpenCreateActivityDrawer({ Note }), which does a hard
  //    useObjectMetadataItem('note') lookup and THROWS
  //    ("Object metadata item \"note\" cannot be found in an array of 0
  //    elements") when the store is empty — an error the boundary turns into a
  //    full-app error page. If the launcher isn't there, that path can't run.
  const { readableObjectMetadataItems } = useReadableObjectMetadataItems();
  const isNoteObjectReady = readableObjectMetadataItems.some(
    (item) => item.nameSingular === CoreObjectNameSingular.Note,
  );

  if (!isNoteObjectReady) {
    return null;
  }

  return (
    <>
      <StyledLauncherContainer
        style={{ right: position.right, bottom: position.bottom }}
      >
        <StyledLauncher
          type="button"
          title={t`Quick Note`}
          aria-label={t`Quick Note`}
          {...dragHandleProps}
          onClick={() => {
            // A drag ends in a click. Swallow that one so moving the pill does not also
            // open the modal.
            if (shouldSuppressClick()) return;
            openModal(QUICK_NOTE_MODAL_ID);
          }}
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
