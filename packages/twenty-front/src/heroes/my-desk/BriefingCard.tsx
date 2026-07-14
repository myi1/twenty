// BriefingCard.tsx — the AI "morning briefing": a compact ≤3-line day-setter
// under the greeting, grounded in the acting member's own board + rail state.
// Each signal owns its disposition controls so handling one never hides siblings.

import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import styled from '@emotion/styled';
import { IconClock, IconX } from 'twenty-ui/display';

import { DUR, EASE } from '../_pulse/pulse-tokens';
import { FONT_MONO, FONT_UI } from '../_pulse/pulse';

import { assistBriefing, writeBriefingDisposition } from './deskApi';
import { DESK_PHONE_BREAKPOINT_PX } from './responsive';
import type { DeskBriefingItem } from './types';

const Card = styled.div`
  position: relative;
  margin: 0;
  padding: 13px 24px 14px;
  border-bottom: 1px solid var(--p-line);
  border-left: 2px solid var(--p-accent);
  background: var(--p-surface-2);
  @media (prefers-reduced-motion: no-preference) {
    animation: briefingIn ${DUR.drawerIn}ms ${EASE.out};
  }
  @keyframes briefingIn {
    from {
      opacity: 0;
      transform: translate3d(0, -3px, 0);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
`;

const Eyebrow = styled.div`
  margin-bottom: 8px;
  color: var(--p-accent-strong);
  font-family: ${FONT_MONO};
  font-size: 9.5px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
`;

const LineRow = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  & + & {
    margin-top: 5px;
  }
`;

const Bullet = styled.span`
  width: 4px;
  height: 4px;
  flex: none;
  border-radius: 50%;
  background: var(--p-accent);
`;

const LineText = styled.div`
  min-width: 0;
  flex: 1;
  color: var(--p-ink);
  font-family: ${FONT_UI};
  font-size: 13px;
  line-height: 1.5;
`;

const Actions = styled.div`
  position: relative;
  display: flex;
  flex: none;
  align-items: center;
  gap: 5px;
`;

const ActionButton = styled.button`
  display: grid;
  width: 28px;
  height: 28px;
  appearance: none;
  place-items: center;
  border: 1px solid var(--p-line);
  border-radius: 50%;
  background: var(--p-surface-3, var(--p-surface-2));
  color: var(--p-ink-2);
  cursor: pointer;
  @media (max-width: ${DESK_PHONE_BREAKPOINT_PX}px) {
    width: 40px;
    height: 40px;
  }
  @media (prefers-reduced-motion: no-preference) {
    transition:
      color ${DUR.press}ms ${EASE.out},
      border-color ${DUR.press}ms ${EASE.out};
  }
  &:hover {
    border-color: var(--p-accent);
    color: var(--p-ink);
  }
  &:focus-visible {
    border-color: var(--p-accent);
    outline: 2px solid var(--p-accent);
    outline-offset: 2px;
    color: var(--p-ink);
  }
  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
`;

const SnoozeMenu = styled.div`
  position: absolute;
  z-index: 4;
  top: 34px;
  right: 0;
  width: 132px;
  padding: 4px;
  border: 1px solid var(--p-line);
  border-radius: 8px;
  background: var(--p-surface-1);
  box-shadow: 0 12px 28px rgb(0 0 0 / 22%);
  @media (max-width: ${DESK_PHONE_BREAKPOINT_PX}px) {
    top: 46px;
  }
`;

const SnoozeOption = styled.button`
  width: 100%;
  padding: 7px 8px;
  appearance: none;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--p-ink);
  text-align: left;
  cursor: pointer;
  &:hover {
    background: var(--p-surface-3);
  }
  &:focus-visible {
    outline: 2px solid var(--p-accent);
    outline-offset: -2px;
    background: var(--p-surface-3);
  }
`;

const ErrorMessage = styled.div`
  margin-top: 8px;
  color: var(--p-danger, #d96565);
  font-family: ${FONT_UI};
  font-size: 12px;
`;

// Shimmer skeleton lines hold the card height while the response lands.
const Shimmer = styled.div<{ $w: string }>`
  width: ${({ $w }) => $w};
  height: 12px;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    var(--p-line) 25%,
    var(--p-surface-3, var(--p-surface-2)) 37%,
    var(--p-line) 63%
  );
  background-size: 400% 100%;
  & + & {
    margin-top: 8px;
  }
  @media (prefers-reduced-motion: no-preference) {
    animation: briefingShimmer 1.4s ${EASE.inOut} infinite;
  }
  @keyframes briefingShimmer {
    0% {
      background-position: 100% 0;
    }
    100% {
      background-position: 0 0;
    }
  }
`;

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; items: DeskBriefingItem[]; allCaughtUp: boolean }
  | { kind: 'hidden' };

const SNOOZE = [
  { label: 'Later today', hours: 4 },
  { label: 'Tomorrow', hours: 24 },
  { label: 'Next week', hours: 168 },
] as const;

const UUID =
  '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const UUID_RE = new RegExp(`^${UUID}$`, 'i');
const SIGNAL_ID_RE =
  /^brief:v1:(lead|deal|viewing|whatsapp):([A-Za-z]+|none):([^:]+):([0-9a-f]{16})$/;
const DEAL_LANES = new Set([
  'secondaryOpportunity',
  'sellOpportunity',
  'offplanOpportunity',
  'rcbiOpportunity',
  'institutionalOpportunity',
  'deal',
]);

const isBriefingKind = (value: unknown): value is DeskBriefingItem['kind'] =>
  value === 'lead' ||
  value === 'deal' ||
  value === 'viewing' ||
  value === 'whatsapp';

const parseBriefingSignalId = (
  value: unknown,
): { kind: DeskBriefingItem['kind']; identity: string } | null => {
  if (typeof value !== 'string') return null;
  const match = SIGNAL_ID_RE.exec(value);
  if (!match) return null;
  const [, kind, lane, sourceId] = match;
  if (!UUID_RE.test(sourceId)) return null;
  if (kind === 'deal' ? !DEAL_LANES.has(lane) : lane !== 'none') return null;
  return isBriefingKind(kind)
    ? {
        kind,
        identity: `${kind}:${lane}:${sourceId.toLowerCase()}:${match[4]}`,
      }
    : null;
};

const isBriefingItem = (value: unknown): value is DeskBriefingItem => {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  const parsedId = parseBriefingSignalId(item.id);
  return (
    parsedId !== null &&
    isBriefingKind(item.kind) &&
    parsedId.kind === item.kind &&
    typeof item.line === 'string' &&
    item.line.trim().length > 0
  );
};

const validatedBriefingItems = (value: unknown): DeskBriefingItem[] | null => {
  if (!Array.isArray(value) || value.length > 3) return null;
  const identities = new Set<string>();
  for (const item of value) {
    if (!isBriefingItem(item)) return null;
    const parsedId = parseBriefingSignalId(item.id);
    if (!parsedId || identities.has(parsedId.identity)) return null;
    identities.add(parsedId.identity);
  }
  return value;
};

const successfulBriefingItems = (value: unknown): DeskBriefingItem[] | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return null;
  const response = value as Record<string, unknown>;
  if (response.ok !== true || typeof response.allCaughtUp !== 'boolean')
    return null;
  return validatedBriefingItems(response.items);
};

const isSuccessfulDisposition = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  (value as Record<string, unknown>).ok === true;

export const BriefingCard = () => {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [menuId, setMenuId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const loadGeneration = useRef(0);
  const busyRef = useRef(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const dismissRefs = useRef(new Map<string, HTMLButtonElement>());

  const load = async (showLoading: boolean) => {
    const generation = ++loadGeneration.current;
    if (showLoading) setState({ kind: 'loading' });
    const response = await assistBriefing().catch(() => null);
    if (!mounted.current || generation !== loadGeneration.current) return;
    const items = successfulBriefingItems(response);
    if (!items) {
      if (showLoading) setState({ kind: 'hidden' });
      return;
    }
    setState({
      kind: 'ready',
      items,
      allCaughtUp: items.length === 0,
    });
  };

  useEffect(() => {
    mounted.current = true;
    void load(true);
    return () => {
      mounted.current = false;
      loadGeneration.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!menuId) return;
    const trigger = triggerRefs.current.get(menuId);
    const focusableOptions =
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    focusableOptions?.[0]?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setMenuId(null);
      trigger?.focus();
    };
    const closeOutside = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target) || trigger?.contains(target))
        return;
      setMenuId(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    document.addEventListener('mousedown', closeOutside);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('mousedown', closeOutside);
    };
  }, [menuId]);

  const apply = async (
    item: DeskBriefingItem,
    mode: 'dismissed' | 'snoozed',
    hours?: number,
  ) => {
    if (!mounted.current || busyRef.current || state.kind !== 'ready') return;
    const previous = state;
    const items = previous.items.filter(({ id }) => id !== item.id);
    const until =
      hours === undefined
        ? undefined
        : new Date(Date.now() + hours * 3_600_000).toISOString();

    busyRef.current = true;
    setBusy(true);
    setError(null);
    setMenuId(null);
    setState(
      items.length === 0
        ? { kind: 'hidden' }
        : { kind: 'ready', items, allCaughtUp: false },
    );

    const response = await writeBriefingDisposition(item.id, mode, until).catch(
      () => null,
    );
    if (!mounted.current) return;
    if (!isSuccessfulDisposition(response)) {
      busyRef.current = false;
      setState(previous);
      setError("That didn't save. Try again.");
      setBusy(false);
      return;
    }

    await load(false);
    if (!mounted.current) return;
    busyRef.current = false;
    setBusy(false);
  };

  const navigateMenu = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      const trigger = menuId ? triggerRefs.current.get(menuId) : undefined;
      const dismiss = menuId ? dismissRefs.current.get(menuId) : undefined;
      setMenuId(null);
      (event.shiftKey ? trigger : dismiss)?.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const options = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]',
      ),
    );
    if (options.length === 0) return;
    event.preventDefault();
    const activeIndex = options.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : event.key === 'ArrowDown'
            ? (Math.max(activeIndex, 0) + 1) % options.length
            : activeIndex <= 0
              ? options.length - 1
              : activeIndex - 1;
    options.forEach((option, index) => {
      option.tabIndex = index === nextIndex ? 0 : -1;
    });
    options[nextIndex]?.focus();
  };

  if (state.kind === 'hidden') return null;

  return (
    <Card as="section" aria-labelledby="my-desk-briefing-title">
      <Eyebrow id="my-desk-briefing-title">Your day</Eyebrow>
      {state.kind === 'loading' ? (
        <>
          <Shimmer $w="72%" />
          <Shimmer $w="54%" />
        </>
      ) : state.allCaughtUp ? (
        <LineText role="status">
          You're all caught up — nothing needs you right now.
        </LineText>
      ) : (
        state.items.map((item, index) => {
          const menuDomId = `my-desk-briefing-snooze-${index}`;
          const menuOpen = menuId === item.id;
          return (
            <LineRow key={item.id}>
              <Bullet aria-hidden="true" />
              <LineText>{item.line}</LineText>
              <Actions>
                <ActionButton
                  ref={(node) => {
                    if (node) triggerRefs.current.set(item.id, node);
                    else triggerRefs.current.delete(item.id);
                  }}
                  type="button"
                  aria-label={`Snooze ${item.line}`}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-controls={menuOpen ? menuDomId : undefined}
                  title="Snooze"
                  disabled={busy}
                  onClick={() => setMenuId(menuOpen ? null : item.id)}
                >
                  <IconClock size={14} />
                </ActionButton>
                <ActionButton
                  ref={(node) => {
                    if (node) dismissRefs.current.set(item.id, node);
                    else dismissRefs.current.delete(item.id);
                  }}
                  type="button"
                  aria-label={`Dismiss ${item.line}`}
                  title="Dismiss"
                  disabled={busy}
                  onClick={() => void apply(item, 'dismissed')}
                >
                  <IconX size={14} />
                </ActionButton>
                {menuOpen && (
                  <SnoozeMenu
                    ref={menuRef}
                    id={menuDomId}
                    role="menu"
                    aria-label={`Snooze ${item.line}`}
                    onKeyDown={navigateMenu}
                  >
                    {SNOOZE.map((option, optionIndex) => (
                      <SnoozeOption
                        key={option.hours}
                        type="button"
                        role="menuitem"
                        tabIndex={optionIndex === 0 ? 0 : -1}
                        onFocus={(event) => {
                          const options =
                            menuRef.current?.querySelectorAll<HTMLButtonElement>(
                              '[role="menuitem"]',
                            );
                          options?.forEach((menuOption) => {
                            menuOption.tabIndex =
                              menuOption === event.currentTarget ? 0 : -1;
                          });
                        }}
                        onClick={() =>
                          void apply(item, 'snoozed', option.hours)
                        }
                      >
                        {option.label}
                      </SnoozeOption>
                    ))}
                  </SnoozeMenu>
                )}
              </Actions>
            </LineRow>
          );
        })
      )}
      {error && <ErrorMessage role="alert">{error}</ErrorMessage>}
    </Card>
  );
};
