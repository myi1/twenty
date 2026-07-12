import { contextStoreAnyFieldFilterValueComponentState } from '@/context-store/states/contextStoreAnyFieldFilterValueComponentState';
import { contextStoreCurrentObjectMetadataItemIdComponentState } from '@/context-store/states/contextStoreCurrentObjectMetadataItemIdComponentState';
import { contextStoreFilterGroupsComponentState } from '@/context-store/states/contextStoreFilterGroupsComponentState';
import { contextStoreFiltersComponentState } from '@/context-store/states/contextStoreFiltersComponentState';
import { contextStoreTargetedRecordsRuleComponentState } from '@/context-store/states/contextStoreTargetedRecordsRuleComponentState';
import { computeContextStoreFilters } from '@/context-store/utils/computeContextStoreFilters';
import { useObjectMetadataItemById } from '@/object-metadata/hooks/useObjectMetadataItemById';
import { flattenedFieldMetadataItemsSelector } from '@/object-metadata/states/flattenedFieldMetadataItemsSelector';
import { useLazyFetchAllRecords } from '@/object-record/hooks/useLazyFetchAllRecords';
import { useFilterValueDependencies } from '@/object-record/record-filter/hooks/useFilterValueDependencies';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useCallback } from 'react';
import {
  CoreObjectNameSingular,
  type RecordGqlOperationFilter,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

const NO_MATCH_FILTER: RecordGqlOperationFilter = { id: { in: [] } };

// Resolves the FULL set of record ids currently selected in a context store,
// lazily and regardless of selection mode:
//   - 'selection' → the raw selectedRecordIds (every ticked row, including ones
//      not currently loaded into the record store).
//   - 'exclusion' (header "select all") → fetched from the server using the same
//      computed view filter the headless commands use, with the excluded ids
//      already subtracted inside computeContextStoreFilters.
// Mirrors the headless TriggerWorkflowVersionEngineCommand resolution so bulk
// RECORD_SELECTION front-components (e.g. "Move to lane") work with select-all,
// instead of receiving 0 ids. Lazy (returns a callback) so it fires no query on
// command-menu render.
export const useLazyResolveContextStoreSelectedRecordIds = ({
  instanceId,
}: {
  instanceId?: string;
}) => {
  const contextStoreCurrentObjectMetadataItemId = useAtomComponentStateValue(
    contextStoreCurrentObjectMetadataItemIdComponentState,
    instanceId,
  );

  const { objectMetadataItem } = useObjectMetadataItemById({
    objectId: contextStoreCurrentObjectMetadataItemId ?? '',
  });

  const contextStoreTargetedRecordsRule = useAtomComponentStateValue(
    contextStoreTargetedRecordsRuleComponentState,
    instanceId,
  );

  const contextStoreFilters = useAtomComponentStateValue(
    contextStoreFiltersComponentState,
    instanceId,
  );

  const contextStoreFilterGroups = useAtomComponentStateValue(
    contextStoreFilterGroupsComponentState,
    instanceId,
  );

  const contextStoreAnyFieldFilterValue = useAtomComponentStateValue(
    contextStoreAnyFieldFilterValueComponentState,
    instanceId,
  );

  const { filterValueDependencies } = useFilterValueDependencies();

  const flattenedFieldMetadataItems = useAtomStateValue(
    flattenedFieldMetadataItemsSelector,
  );

  const queryFilter = isDefined(objectMetadataItem)
    ? computeContextStoreFilters({
        contextStoreTargetedRecordsRule,
        contextStoreFilters,
        contextStoreFilterGroups,
        objectMetadataItem,
        fieldMetadataItems: flattenedFieldMetadataItems,
        filterValueDependencies,
        contextStoreAnyFieldFilterValue,
      })
    : NO_MATCH_FILTER;

  const { fetchAllRecords } = useLazyFetchAllRecords({
    objectNameSingular:
      objectMetadataItem?.nameSingular ?? CoreObjectNameSingular.Person,
    filter: queryFilter ?? NO_MATCH_FILTER,
  });

  const resolveSelectedRecordIds = useCallback(async (): Promise<string[]> => {
    if (contextStoreTargetedRecordsRule.mode === 'selection') {
      return contextStoreTargetedRecordsRule.selectedRecordIds;
    }

    const records = await fetchAllRecords();

    return records.map((record) => record.id);
  }, [contextStoreTargetedRecordsRule, fetchAllRecords]);

  return { resolveSelectedRecordIds };
};
