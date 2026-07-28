import { objectMetadataItemsBySingularNameSelector } from '@/object-metadata/states/objectMetadataItemsBySingularNameSelector';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { isDefined } from 'twenty-shared/utils';

/**
 * Do ALL of the named object metadata items exist yet?
 *
 * ⚠️ The length check is load-bearing. The selector DROPS names it cannot find
 * (flatMap → []), so when metadata has not loaded — e.g. the sign-in screen, or
 * the moment before the first metadata fetch resolves — it returns an EMPTY
 * array, and `[].every(...)` is vacuously TRUE. The guard then reports "ready"
 * at precisely the moment nothing is loaded, so anything gated on it mounts and
 * throws "Object metadata item X cannot be found in an array of 0 elements",
 * white-screening the whole app.
 *
 * Verified on staging 2026-07-28: the sign-in page rendered "Sorry, something
 * went wrong" for exactly this reason.
 */
export const useDoObjectMetadataItemsExist = (
  objectNameSingulars: string[],
) => {
  const objectMetadataItems = useAtomFamilySelectorValue(
    objectMetadataItemsBySingularNameSelector,
    objectNameSingulars,
  );

  return (
    objectMetadataItems.length === objectNameSingulars.length &&
    objectMetadataItems.every((objectMetadataItem) => isDefined(objectMetadataItem))
  );
};
