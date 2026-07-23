import { MAX_SEARCH_RESULTS } from '@/command-menu/constants/MaxSearchResults';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useReadableObjectMetadataItems } from '@/object-metadata/hooks/useReadableObjectMetadataItems';
import { useQuery } from '@apollo/client/react';
import { useMemo } from 'react';
import { useDebounce } from 'use-debounce';
import { SearchDocument } from '~/generated/graphql';

// Propel: standalone cross-object search for the Quick Note picker. Modeled on
// useSidePanelSearchRecords, but takes the search string as a plain argument
// instead of reading the side panel's shared jotai atom — the Quick Note modal
// is a separate feature and must not share (or clobber) the side panel search
// page's own state.
export type QuickNoteSearchResultItem = {
  id: string;
  label: string;
  objectNameSingular: string;
  objectLabel: string;
};

export const useQuickNoteSearchResults = (searchInput: string) => {
  const coreClient = useApolloCoreClient();
  const { readableObjectMetadataItems } = useReadableObjectMetadataItems();

  const [deferredSearchInput] = useDebounce(searchInput, 300);

  const includedObjectNameSingulars = useMemo(
    () =>
      readableObjectMetadataItems
        .filter((item) => item.isSearchable)
        .map((item) => item.nameSingular),
    [readableObjectMetadataItems],
  );

  const { data: searchData, loading } = useQuery(SearchDocument, {
    client: coreClient,
    skip: deferredSearchInput.trim().length === 0,
    variables: {
      searchInput: deferredSearchInput,
      limit: MAX_SEARCH_RESULTS,
      includedObjectNameSingulars,
    },
  });

  const searchResultItems: QuickNoteSearchResultItem[] = useMemo(() => {
    return (searchData?.search.edges.map((edge) => edge.node) ?? []).map(
      (searchRecord) => ({
        id: searchRecord.recordId,
        label: searchRecord.label,
        objectNameSingular: searchRecord.objectNameSingular,
        objectLabel:
          readableObjectMetadataItems.find(
            (item) => item.nameSingular === searchRecord.objectNameSingular,
          )?.labelSingular ?? searchRecord.objectNameSingular,
      }),
    );
  }, [searchData, readableObjectMetadataItems]);

  return {
    loading,
    searchResultItems,
  };
};
