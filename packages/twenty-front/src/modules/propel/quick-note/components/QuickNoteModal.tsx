import { useOpenCreateActivityDrawer } from '@/activities/hooks/useOpenCreateActivityDrawer';
import { QUICK_NOTE_MODAL_ID } from '@/propel/quick-note/constants/QuickNoteModalId';
import { useQuickNoteSearchResults } from '@/propel/quick-note/hooks/useQuickNoteSearchResults';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { H3Title, IconNotes } from 'twenty-ui/display';
import { SearchInput } from 'twenty-ui/input';
import { MenuItem } from 'twenty-ui/navigation';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledTitleContainer = styled.div`
  margin-bottom: ${themeCssVariables.spacing[3]};
`;

const StyledSearchContainer = styled.div`
  margin-bottom: ${themeCssVariables.spacing[2]};
`;

const StyledResultsContainer = styled.div`
  max-height: 320px;
  overflow-y: auto;
`;

const StyledEmptyState = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.light};
  display: flex;
  flex-direction: row;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[4]} 0;
`;

export const QuickNoteModal = () => {
  const { closeModal } = useModal();
  const [searchInput, setSearchInput] = useState('');
  const { loading, searchResultItems } =
    useQuickNoteSearchResults(searchInput);

  const openCreateNoteDrawer = useOpenCreateActivityDrawer({
    activityObjectNameSingular: CoreObjectNameSingular.Note,
  });

  const handleClose = () => {
    setSearchInput('');
    closeModal(QUICK_NOTE_MODAL_ID);
  };

  const handleSelectRecord = async (
    item: (typeof searchResultItems)[number],
  ) => {
    handleClose();
    await openCreateNoteDrawer({
      targetableObjects: [
        { id: item.id, targetObjectNameSingular: item.objectNameSingular },
      ],
    });
  };

  return (
    <ModalStatefulWrapper
      modalInstanceId={QUICK_NOTE_MODAL_ID}
      onClose={handleClose}
      isClosable
      padding="medium"
      renderInDocumentBody
      smallBorderRadius
      narrowWidth
      autoHeight
    >
      <StyledTitleContainer>
        <H3Title title={t`Quick Note`} />
      </StyledTitleContainer>
      <StyledSearchContainer>
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          placeholder={t`Search a contact, company or lead...`}
          autoFocus
        />
      </StyledSearchContainer>
      <StyledResultsContainer>
        {searchInput.trim().length === 0 && (
          <StyledEmptyState>
            <IconNotes size={16} />
            {t`Start typing a name to find who this note is about.`}
          </StyledEmptyState>
        )}
        {searchInput.trim().length > 0 &&
          !loading &&
          searchResultItems.length === 0 && (
            <StyledEmptyState>{t`No matches found.`}</StyledEmptyState>
          )}
        {searchResultItems.map((item) => (
          <MenuItem
            key={`${item.objectNameSingular}-${item.id}`}
            text={item.label}
            contextualText={item.objectLabel}
            onClick={() => handleSelectRecord(item)}
          />
        ))}
      </StyledResultsContainer>
    </ModalStatefulWrapper>
  );
};
