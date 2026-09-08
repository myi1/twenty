import { useHotkeysOnFocusedElementCallback } from '@/ui/utilities/hotkey/hooks/useHotkeysOnFocusedElementCallback';
import { pendingHotkeyState } from '@/ui/utilities/hotkey/states/internal/pendingHotkeysState';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  type HotkeyCallback,
  type Keys,
  type Options,
} from 'react-hotkeys-hook/dist/types';
import { isDefined } from 'twenty-shared/utils';
import { bindsTypeableCharacter } from '@/ui/utilities/hotkey/utils/bindsTypeableCharacter';

type UseHotkeysOptionsWithoutBuggyOptions = Omit<Options, 'enabled'>;

export const useHotkeysOnFocusedElement = ({
  keys,
  callback,
  focusId,
  dependencies,
  options,
}: {
  keys: Keys;
  callback: HotkeyCallback;
  focusId: string;
  dependencies?: unknown[];
  options?: UseHotkeysOptionsWithoutBuggyOptions;
}) => {
  const [pendingHotkey, setPendingHotkey] = useAtomState(pendingHotkeyState);

  const callScopedHotkeyCallback =
    useHotkeysOnFocusedElementCallback(dependencies);

  // A shortcut bound to a character someone could be typing must not fire — and with
  // preventDefault below, EAT that character — while they are typing. `k` (row-up) did
  // exactly that: an agent's "speak soon ok" reached a client as "spea soon o".
  // Escape / Enter / Tab / arrows are not typeable and keep their old behaviour, which is
  // why this is conditional rather than a blanket flip: 69 of 76 registrations rely on the
  // default and most of them are Escape and Enter inside field editors.
  // A caller that genuinely wants a printable key to fire in a field may still say so.
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

  return useHotkeys(
    keys,
    (keyboardEvent, hotkeysEvent) => {
      if (keyboardEvent.isComposing || keyboardEvent.keyCode === 229) {
        return;
      }

      callScopedHotkeyCallback({
        keyboardEvent,
        hotkeysEvent,
        callback: () => {
          if (!isDefined(pendingHotkey)) {
            callback(keyboardEvent, hotkeysEvent);
            return;
          }
          setPendingHotkey(null);
        },
        focusId,
        preventDefault,
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
