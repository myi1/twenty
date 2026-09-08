import { type Keys } from 'react-hotkeys-hook/dist/types';
import { useNavigate } from 'react-router-dom';

import { useGlobalHotkeysSequence } from '@/ui/utilities/hotkey/hooks/useGlobalHotkeysSequence';

type GoToHotkeysProps = {
  key: Keys;
  location: string;
  preNavigateFunction?: () => void;
};

export const useGoToHotkeys = ({
  key,
  location,
  preNavigateFunction,
}: GoToHotkeysProps) => {
  const navigate = useNavigate();

  // No enableOnFormTags / enableOnContentEditable here — deliberately. `g` opens this
  // sequence, and it used to be enabled inside text fields WITH preventDefault, so an
  // agent typing "good morning" into the WhatsApp composer lost the g, and the pending
  // sequence then turned the `d` of "good" into a jump to Dashboards. A go-to shortcut
  // has no business firing while someone is writing a message; the sequence hook now
  // decides that per key, and `g` (typeable) stays out of text. preventDefault still
  // applies where the sequence DOES fire, so the browser doesn't also act on the key.
  useGlobalHotkeysSequence(
    'g',
    key,
    () => {
      preNavigateFunction?.();
      navigate(location);
    },
    { preventDefault: true },
    [navigate],
  );
};
