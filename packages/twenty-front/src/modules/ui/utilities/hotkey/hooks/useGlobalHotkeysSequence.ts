import { useEffect, useRef } from 'react';
import { type Options, useHotkeys } from 'react-hotkeys-hook';
import { type Keys } from 'react-hotkeys-hook/dist/types';

import { pendingHotkeyState } from '@/ui/utilities/hotkey/states/internal/pendingHotkeysState';

import { useGlobalHotkeysCallback } from '@/ui/utilities/hotkey/hooks/useGlobalHotkeysCallback';
import { bindsTypeableCharacter } from '@/ui/utilities/hotkey/utils/bindsTypeableCharacter';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';
import { isDefined } from 'twenty-shared/utils';

// How long the first key of a sequence stays armed. Before this existed, `g` armed the
// sequence FOREVER: nothing cleared pendingHotkey except a matching second key, so a `g`
// pressed at any point turned the next d/n/p/t/w — typed anywhere, minutes later — into a
// navigation. Two keystrokes of a deliberate shortcut land well inside this window.
const SEQUENCE_WINDOW_MS = 1500;

export const useGlobalHotkeysSequence = (
  firstKey: Keys,
  secondKey: Keys,
  sequenceCallback: () => void,
  options: Options = { preventDefault: true },
  deps: any[] = [],
) => {
  const [pendingHotkey, setPendingHotkey] = useAtomState(pendingHotkeyState);

  const callGlobalHotkeysCallback = useGlobalHotkeysCallback();

  const disarmTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDisarmTimeout = () => {
    if (disarmTimeout.current !== null) {
      clearTimeout(disarmTimeout.current);
      disarmTimeout.current = null;
    }
  };

  useEffect(() => clearDisarmTimeout, []);

  // A key someone could be typing must not fire — and with preventDefault, EAT that key —
  // inside a message box or a rich-text field. Same rule useHotkeysOnFocusedElement
  // already applies; it is decided per key because a sequence's two halves need not be
  // the same kind of key. An explicit option still wins, for a caller that means it.
  const textOptionsFor = (keys: Keys) => {
    const defaultEnableInText = !bindsTypeableCharacter(keys);
    return {
      enableOnContentEditable: isDefined(options.enableOnContentEditable)
        ? options.enableOnContentEditable
        : defaultEnableInText,
      enableOnFormTags: isDefined(options.enableOnFormTags)
        ? options.enableOnFormTags
        : defaultEnableInText,
    };
  };

  useHotkeys(
    firstKey,
    (keyboardEvent, hotkeysEvent) => {
      callGlobalHotkeysCallback({
        keyboardEvent,
        hotkeysEvent,
        containsModifier: false,
        callback: () => {
          setPendingHotkey(firstKey);
          clearDisarmTimeout();
          disarmTimeout.current = setTimeout(() => {
            setPendingHotkey(null);
            disarmTimeout.current = null;
          }, SEQUENCE_WINDOW_MS);
        },
        preventDefault: Boolean(options.preventDefault),
      });
    },
    textOptionsFor(firstKey),
    [setPendingHotkey],
  );

  useHotkeys(
    secondKey,
    (keyboardEvent, hotkeysEvent) => {
      callGlobalHotkeysCallback({
        keyboardEvent,
        hotkeysEvent,
        containsModifier: false,
        callback: () => {
          if (pendingHotkey !== firstKey) {
            return;
          }

          clearDisarmTimeout();
          setPendingHotkey(null);

          if (isDefined(options.preventDefault)) {
            keyboardEvent.stopImmediatePropagation();
            keyboardEvent.stopPropagation();
            keyboardEvent.preventDefault();
          }

          sequenceCallback();
        },
        preventDefault: false,
      });
    },
    textOptionsFor(secondKey),
    [pendingHotkey, setPendingHotkey, ...deps],
  );
};
