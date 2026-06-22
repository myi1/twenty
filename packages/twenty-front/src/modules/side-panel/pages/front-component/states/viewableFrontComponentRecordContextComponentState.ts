import { SidePanelPageComponentInstanceContext } from '@/side-panel/states/contexts/SidePanelPageComponentInstanceContext';
import { createAtomComponentState } from '@/ui/utilities/state/jotai/utils/createAtomComponentState';

type FrontComponentRecordContext = {
  // The records selected when the action was invoked. Single-record actions carry
  // a 1-element array (useRecordId() still resolves it); RECORD_SELECTION bulk
  // actions carry the FULL selection (useSelectedRecordIds() reads all of them).
  selectedRecordIds: string[];
  objectNameSingular: string;
};

export const viewableFrontComponentRecordContextComponentState =
  createAtomComponentState<FrontComponentRecordContext | null>({
    key: 'side-panel/viewable-front-component-record-context',
    defaultValue: null,
    componentInstanceContext: SidePanelPageComponentInstanceContext,
  });
