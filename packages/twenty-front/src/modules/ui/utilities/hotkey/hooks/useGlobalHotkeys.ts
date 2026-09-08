import { useCallback } from 'react';

import { useGlobalHotkeysCallback } from '@/ui/utilities/hotkey/hooks/useGlobalHotkeysCallback';
import { pendingHotkeyState } from '@/ui/utilities/hotkey/states/internal/pendingHotkeysState';
import { bindsTypeableCharacter } from '@/ui/utilities/hotkey/utils/bindsTypeableCharacter';
import { useStore } from 'jotai';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  type HotkeyCallback,
  type Keys,
  type Options,
} from 'react-hotkeys-hook/dist/types';
import { isDefined } from 'twenty-shared/utils';

type UseHotkeysOptionsWithoutBuggyOptions = Omit<Options, 'enabled'>;

export const useGlobalHotkeys = ({
  keys,
  callback,
  containsModifier,
  dependencies,
  options,
}: {
  keys: Keys;
  callback: HotkeyCallback;
  containsModifier: boolean;
  dependencies?: unknown[];
  options?: UseHotkeysOptionsWithoutBuggyOptions;
}) => {
  const store = useStore();

  const callGlobalHotkeysCallback = useGlobalHotkeysCallback(dependencies);

  // A GLOBAL shortcut bound to a character someone could be typing must not fire — and
  // with preventDefault below, EAT that character — inside a message box or a rich-text
  // field. `/` (open search) and `@` (open Ask AI) are both bound here, both typeable, and
  // both were swallowed in the WhatsApp composer: an agent could not type an email address.
  // Modifier combos (ctrl+k, meta+k) are not typeable, so the command menu keeps opening
  // from inside a field exactly as before. An explicit option still wins.
  const defaultEnableInText = !bindsTypeableCharacter(keys);

  const enableOnContentEditable = isDefined(options?.enableOnContentEditable)
    ? options.enableOnContentEditable
    : defaultEnableInText;

  const enableOnFormTags = isDefined(options?.enableOnFormTags)
    ? options.enableOnFormTags
    : defaultEnableInText;

  const preventDefault = isDefined(options?.preventDefault)
    ? options.preventDefault === true
    : true;

  const ignoreModifiers = isDefined(options?.ignoreModifiers)
    ? options.ignoreModifiers === true
    : false;

  const handleCallback = useCallback(
    async (keyboardEvent: KeyboardEvent, hotkeysEvent: any) => {
      const pendingHotkey = store.get(pendingHotkeyState.atom);

      if (!isDefined(pendingHotkey)) {
        callback(keyboardEvent, hotkeysEvent);
      }

      store.set(pendingHotkeyState.atom, null);
    },
    [callback, store],
  );

  return useHotkeys(
    keys,
    (keyboardEvent, hotkeysEvent) => {
      callGlobalHotkeysCallback({
        keyboardEvent,
        hotkeysEvent,
        callback: () => {
          handleCallback(keyboardEvent, hotkeysEvent);
        },
        preventDefault,
        containsModifier,
      });
    },
    {
      enableOnContentEditable,
      enableOnFormTags,
      ignoreModifiers,
    },
    dependencies,
  );
};
