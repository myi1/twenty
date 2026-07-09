import { atom } from 'jotai';
import { atomWithStorage, createJSONStorage } from 'jotai/utils';
import { isDefined } from 'twenty-shared/utils';

import { type FamilyState } from '@/ui/utilities/state/jotai/types/FamilyState';
import { type JotaiSyncStorage } from '@/ui/utilities/state/jotai/types/JotaiSyncStorage';

// A localStorage-backed jotai storage that NEVER throws on a failed write.
// The full metadata store (objectMetadataItems/fieldMetadataItems/views/…) can
// exceed the browser's ~5MB localStorage budget on a workspace with many custom
// objects + fields, which raises QuotaExceededError. The default jotai storage
// lets that throw out of the persist write, rejecting the metadata-load promise
// and leaving every record view stuck on empty skeletons. A failed persist is
// harmless — the value is still in memory and re-fetched from the server — so we
// swallow it (and drop the over-quota key so no stale partial value lingers).
// Also guards private-mode / disabled storage. Applies to every persisted atom.
const createQuotaSafeLocalStorage = <ValueType>() => {
  const base = createJSONStorage<ValueType>(() => localStorage);
  return {
    ...base,
    setItem: (storageKey: string, newValue: ValueType): void => {
      try {
        base.setItem(storageKey, newValue);
      } catch (error) {
        try {
          localStorage.removeItem(storageKey);
        } catch {
          // ignore — storage unavailable
        }
        // eslint-disable-next-line no-console
        console.warn(
          `[createAtomFamilyState] skipped persisting "${storageKey}" (localStorage full or unavailable); using in-memory value:`,
          error instanceof Error ? error.message : error,
        );
      }
    },
  };
};

export const createAtomFamilyState = <ValueType, FamilyKey>({
  key,
  defaultValue,
  useLocalStorage = false,
  localStorageOptions,
  storage,
}: {
  key: string;
  defaultValue: ValueType;
  useLocalStorage?: boolean;
  localStorageOptions?: { getOnInit?: boolean };
  storage?: JotaiSyncStorage<ValueType>;
}): FamilyState<ValueType, FamilyKey> => {
  const atomCache = new Map<
    string,
    ReturnType<FamilyState<ValueType, FamilyKey>['atomFamily']>
  >();

  const familyFunction = (
    familyKey: FamilyKey,
  ): ReturnType<FamilyState<ValueType, FamilyKey>['atomFamily']> => {
    const cacheKey =
      typeof familyKey === 'string' ? familyKey : JSON.stringify(familyKey);

    const existing = atomCache.get(cacheKey);

    if (existing !== undefined) {
      return existing;
    }

    const atomKey = `${key}__${cacheKey}`;

    const buildBaseAtom = () => {
      if (isDefined(storage)) {
        return atomWithStorage<ValueType>(
          atomKey,
          defaultValue,
          storage,
          localStorageOptions ?? { getOnInit: true },
        );
      }

      if (useLocalStorage) {
        return atomWithStorage<ValueType>(
          atomKey,
          defaultValue,
          createQuotaSafeLocalStorage<ValueType>(),
          localStorageOptions ?? undefined,
        );
      }

      return atom(defaultValue);
    };

    const baseAtom = buildBaseAtom();
    baseAtom.debugLabel = atomKey;
    atomCache.set(cacheKey, baseAtom);

    return baseAtom;
  };

  return Object.assign(familyFunction, {
    type: 'FamilyState' as const,
    key,
    atomFamily: familyFunction,
  });
};
