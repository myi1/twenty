import { act, fireEvent, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

import { useGlobalHotkeys } from '@/ui/utilities/hotkey/hooks/useGlobalHotkeys';
import { useGoToHotkeys } from '@/ui/utilities/hotkey/hooks/useGoToHotkeys';

// ── THE BUG THIS FILE EXISTS FOR ────────────────────────────────────────────────
// 2026-09-08, reported from the night shift: "The letter G is not working in the
// Whatsapp messages." `g` opens the go-to sequence, and the sequence was registered
// with enableOnFormTags + enableOnContentEditable + preventDefault, so inside our
// WhatsApp composer (a plain textarea, not on Twenty's focus stack, so it falls back
// to DEFAULT_GLOBAL_HOTKEYS_CONFIG where keyboard-conflicting hotkeys are enabled)
// every `g` was eaten. Worse: nothing ever disarmed the sequence, so typing "good"
// ate the g and then navigated away on the d.
// The same class covered here: `/` and `@` are global hotkeys on typeable characters,
// and `@` is what an agent types to write an email address.

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter
    initialEntries={['/one', '/two', { pathname: '/three' }]}
    initialIndex={1}
  >
    {children}
  </MemoryRouter>
);

const withTextarea = (): HTMLTextAreaElement => {
  const textarea = document.createElement('textarea');
  document.body.appendChild(textarea);
  textarea.focus();
  return textarea;
};

const press = (target: EventTarget, key: string) => {
  const event = new KeyboardEvent('keydown', {
    key,
    code: `Key${key.toUpperCase()}`,
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

describe('typeable shortcuts inside a text field', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('does not eat `g`, and does not navigate, while typing in a textarea', () => {
    const { result } = renderHook(
      () => {
        useGoToHotkeys({ key: 'd', location: '/three' });
        return { pathname: useLocation().pathname };
      },
      { wrapper: Wrapper },
    );

    const textarea = withTextarea();

    // "good" — the exact word that broke.
    const g = press(textarea, 'g');
    expect(g.defaultPrevented).toBe(false);
    press(textarea, 'o');
    press(textarea, 'o');
    const d = press(textarea, 'd');
    expect(d.defaultPrevented).toBe(false);

    expect(result.current.pathname).toBe('/two');
  });

  it('does not eat `/` or `@` while typing in a textarea', () => {
    const slash = jest.fn();
    const at = jest.fn();
    renderHook(() => {
      useGlobalHotkeys({ keys: ['/'], callback: slash, containsModifier: false });
      useGlobalHotkeys({ keys: ['@'], callback: at, containsModifier: false });
    });

    const textarea = withTextarea();
    const slashEvent = press(textarea, '/');
    const atEvent = press(textarea, '@');

    expect(slash).not.toHaveBeenCalled();
    expect(at).not.toHaveBeenCalled();
    expect(slashEvent.defaultPrevented).toBe(false);
    expect(atEvent.defaultPrevented).toBe(false);
  });

  it('still fires a modifier shortcut inside a textarea', () => {
    const callback = jest.fn();
    renderHook(() =>
      useGlobalHotkeys({
        keys: ['ctrl+k', 'meta+k'],
        callback,
        containsModifier: true,
      }),
    );

    const textarea = withTextarea();
    act(() => {
      fireEvent.keyDown(textarea, { key: 'k', code: 'KeyK', ctrlKey: true });
    });

    expect(callback).toHaveBeenCalled();
  });

  it('still navigates on the sequence outside a text field', () => {
    const { result } = renderHook(
      () => {
        useGoToHotkeys({ key: 'd', location: '/three' });
        return { pathname: useLocation().pathname };
      },
      { wrapper: Wrapper },
    );

    expect(result.current.pathname).toBe('/two');
    press(document, 'g');
    press(document, 'd');
    expect(result.current.pathname).toBe('/three');
  });

  it('disarms the sequence after its window, so a later `d` does not navigate', () => {
    jest.useFakeTimers();
    try {
      const { result } = renderHook(
        () => {
          useGoToHotkeys({ key: 'd', location: '/three' });
          return { pathname: useLocation().pathname };
        },
        { wrapper: Wrapper },
      );

      press(document, 'g');
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      press(document, 'd');

      expect(result.current.pathname).toBe('/two');
    } finally {
      jest.useRealTimers();
    }
  });
});
