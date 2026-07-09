import { CommandMenuContext } from '@/command-menu-item/contexts/CommandMenuContext';
import { useMountCommand } from '@/command-menu-item/engine-command/hooks/useMountCommand';
import { isEngineCommandMountedFamilySelector } from '@/command-menu-item/engine-command/selectors/isEngineCommandMountedFamilySelector';
import { useCloseCommandMenu } from '@/command-menu-item/hooks/useCloseCommandMenu';
import { commandMenuItemProgressFamilyState } from '@/command-menu-item/states/commandMenuItemProgressFamilyState';
import { useLazyResolveContextStoreSelectedRecordIds } from '@/context-store/hooks/useLazyResolveContextStoreSelectedRecordIds';
import { ContextStoreComponentInstanceContext } from '@/context-store/states/contexts/ContextStoreComponentInstanceContext';
import { useOpenFrontComponentInSidePanel } from '@/side-panel/hooks/useOpenFrontComponentInSidePanel';
import { useAvailableComponentInstanceIdOrThrow } from '@/ui/utilities/state/component-state/hooks/useAvailableComponentInstanceIdOrThrow';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { useContext } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { type IconComponent } from 'twenty-ui/icon';
import { type CommandMenuItemFieldsFragment } from '~/generated-metadata/graphql';

export const useCommandMenuItemClick = ({
  item,
  Icon,
  label,
}: {
  item: CommandMenuItemFieldsFragment;
  Icon: IconComponent;
  label: string;
}) => {
  const { commandMenuContextApi } = useContext(CommandMenuContext);
  const mountCommand = useMountCommand();
  const { openFrontComponentInSidePanel } = useOpenFrontComponentInSidePanel();

  const contextStoreInstanceId = useAvailableComponentInstanceIdOrThrow(
    ContextStoreComponentInstanceContext,
  );

  const { resolveSelectedRecordIds } =
    useLazyResolveContextStoreSelectedRecordIds({
      instanceId: contextStoreInstanceId,
    });

  const isMounted = useAtomFamilySelectorValue(
    isEngineCommandMountedFamilySelector,
    item.id,
  );

  const commandMenuItemProgress = useAtomFamilyStateValue(
    commandMenuItemProgressFamilyState,
    item.id,
  );

  const isHeadless =
    isDefined(item.frontComponentId) &&
    item.frontComponent?.isHeadless === true;

  const isEngineCommand =
    isDefined(item.engineComponentKey) && !isDefined(item.frontComponentId);

  const isFrontComponent =
    isDefined(item.frontComponentId) &&
    item.frontComponent?.isHeadless !== true;

  const shouldMountCommand = isHeadless || isEngineCommand;

  const closeBehavior = shouldMountCommand
    ? ({
        closeSidePanelOnShowPageOptionsExecution: false,
        closeSidePanelOnCommandMenuListExecution: false,
      } as const)
    : ({} as const);

  const { closeCommandMenu } = useCloseCommandMenu(closeBehavior);

  const disabled = shouldMountCommand ? isMounted : false;

  const handleClick = async () => {
    if (shouldMountCommand) {
      if (isMounted) {
        return;
      }

      closeCommandMenu();

      await mountCommand({
        engineCommandId: item.id,
        contextStoreInstanceId,
        engineComponentKey: item.engineComponentKey,
        frontComponentId: item.frontComponentId ?? undefined,
        workflowVersionId: item.workflowVersionId ?? undefined,
        availabilityType: item.availabilityType,
        availabilityObjectMetadataId: item.availabilityObjectMetadataId,
        payload: item.payload ?? undefined,
        isInSidePanel: commandMenuContextApi.isInSidePanel,
      });

      return;
    }

    if (isFrontComponent && isDefined(item.frontComponentId)) {
      const { objectMetadataItem } = commandMenuContextApi;

      const objectNameSingular = objectMetadataItem.nameSingular as
        | string
        | undefined;

      closeCommandMenu();

      // Forward the FULL selection so RECORD_SELECTION (bulk) front-components
      // receive every selected id. resolveSelectedRecordIds returns the raw ids
      // in 'selection' mode (not just the rows loaded into the store) and the
      // server-fetched ids in 'exclusion'/select-all mode (where the old
      // selectedRecords path resolved to 0). Single-record actions still carry a
      // 1-element array, so useRecordId() resolves. Route caps at 100.
      const selectedRecordIds = await resolveSelectedRecordIds();

      openFrontComponentInSidePanel({
        frontComponentId: item.frontComponentId,
        pageTitle: label,
        pageIcon: Icon,
        recordContext:
          selectedRecordIds.length > 0 && isDefined(objectNameSingular)
            ? { selectedRecordIds, objectNameSingular }
            : undefined,
      });
    }
  };

  return {
    handleClick,
    disabled,
    progress: shouldMountCommand ? commandMenuItemProgress : undefined,
    showDisabledLoader: shouldMountCommand ? isMounted : false,
  };
};
