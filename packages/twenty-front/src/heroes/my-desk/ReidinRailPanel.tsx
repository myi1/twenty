// ReidinRailPanel.tsx — the REIDIN login helper as a My Desk rail panel (Batch 3,
// plan Task 26b). The standalone REIDIN sidebar page is retired; this compact panel
// takes its place, riding the same rail arrangement (order / fold / collapse) as the
// four data panels. Available to ALL agents — the SAME access the standalone had
// (the start/poll routes gate only on "is a real signed-in member").
//
// Flow (unchanged from the standalone): click "Get my REIDIN login code" → the gated
// start route reveals the shared login (username / password / links) and opens a
// monitor session; the agent signs in to REIDIN, which emails an OTP; the sidecar
// catches it and the poll route returns the 6-digit code. The login is NEVER embedded
// in this bundle — it only ever arrives through the gated call.
//
// Nocturne (_pulse) tokens + plain language throughout. Copy is honest: "Copied ✓"
// only when a copy path actually succeeds, "Couldn't copy" otherwise (value stays
// visible for manual selection).
//
// Copy pattern vs. the standalone: the standalone (an in-sandbox front-component) went
// through the twenty-sdk host clipboard bridge first, because the sandbox does NOT
// expose navigator.clipboard. This hero runs in the REAL DOM (main thread), where
// navigator.clipboard IS available and twenty-sdk/front-component is not importable —
// so we use navigator.clipboard first, then the hidden-textarea execCommand fallback.
// Same honest-feedback contract, adapted to the environment.

import { useEffect, useRef, useState } from 'react';
import styled from '@emotion/styled';

import { DUR, EASE } from '../_pulse/pulse-tokens';
import { Btn, FONT_MONO, FONT_UI } from '../_pulse/pulse';

import { pollReidinOtp, startReidinOtp } from './deskApi';
import type { ReidinLogin, ReidinSession } from './types';

const POLL_MS = 3000;

// Copy that works in the hero's real-DOM context. Order:
//   1. navigator.clipboard.writeText — the modern secure-context path.
//   2. hidden textarea + document.execCommand('copy') — legacy fallback for
//      non-secure contexts / older engines.
// Returns true only when one of the paths reports success.
async function copyText(value: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* permission-blocked / non-secure context — fall through */
  }
  try {
    if (typeof document === 'undefined' || !document.body) return false;
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

const Purpose = styled.div`
  font-family: ${FONT_UI};
  font-size: 12px;
  line-height: 1.5;
  color: var(--p-ink-2);
  margin-bottom: 12px;
`;

const Banner = styled.div<{ $tone: 'warn' | 'ok' }>`
  font-family: ${FONT_UI};
  font-size: 12px;
  line-height: 1.5;
  border-radius: var(--p-radius-sm);
  padding: 9px 11px;
  margin-bottom: 12px;
  border: 1px solid
    ${({ $tone }) => ($tone === 'ok' ? 'color-mix(in srgb, var(--p-good) 40%, var(--p-line))' : 'color-mix(in srgb, var(--p-warn) 40%, var(--p-line))')};
  background: ${({ $tone }) => ($tone === 'ok' ? 'color-mix(in srgb, var(--p-good) 10%, transparent)' : 'color-mix(in srgb, var(--p-warn) 10%, transparent)')};
  color: ${({ $tone }) => ($tone === 'ok' ? 'var(--p-good)' : 'var(--p-warn)')};
`;

const Cred = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--p-line);
  &:last-of-type {
    border-bottom: 0;
  }
`;
const CredLabel = styled.div`
  font-family: ${FONT_MONO};
  font-size: 9.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--p-ink-2);
  margin-bottom: 3px;
`;
const CredVal = styled.div`
  font-family: ${FONT_MONO};
  font-size: 12.5px;
  font-weight: 500;
  color: var(--p-ink);
  word-break: break-all;
`;

const CopyBtn = styled.button<{ $state: 'idle' | 'ok' | 'fail' }>`
  all: unset;
  box-sizing: border-box;
  flex: none;
  cursor: pointer;
  font-family: ${FONT_UI};
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  padding: 4px 9px;
  border-radius: 6px;
  border: 1px solid var(--p-line);
  color: ${({ $state }) => ($state === 'ok' ? 'var(--p-good)' : $state === 'fail' ? 'var(--p-bad)' : 'var(--p-ink-2)')};
  @media (prefers-reduced-motion: no-preference) {
    transition: color ${DUR.press}ms ${EASE.out}, border-color ${DUR.press}ms ${EASE.out};
  }
  &:hover {
    color: var(--p-ink);
    border-color: color-mix(in srgb, var(--p-accent) 35%, var(--p-line));
  }
`;

function Copy({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const busyRef = useRef(false);
  const onCopy = async () => {
    if (busyRef.current) return; // ignore double-clicks while feedback shows
    busyRef.current = true;
    const ok = await copyText(value);
    setState(ok ? 'ok' : 'fail');
    setTimeout(() => {
      setState('idle');
      busyRef.current = false;
    }, 1500);
  };
  return (
    <CopyBtn type="button" $state={state} onClick={onCopy}>
      {state === 'ok' ? 'Copied ✓' : state === 'fail' ? "Couldn't copy" : label}
    </CopyBtn>
  );
}

const LinkRow = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 10px;
`;
const RelayLink = styled.a`
  font-family: ${FONT_UI};
  font-size: 11.5px;
  font-weight: 600;
  text-decoration: none;
  color: var(--p-ink-2);
  border: 1px solid var(--p-line);
  border-radius: 6px;
  padding: 5px 10px;
  @media (prefers-reduced-motion: no-preference) {
    transition: color ${DUR.press}ms ${EASE.out}, border-color ${DUR.press}ms ${EASE.out};
  }
  &:hover {
    color: var(--p-ink);
    border-color: color-mix(in srgb, var(--p-accent) 35%, var(--p-line));
  }
`;

const CodeCard = styled.div`
  text-align: center;
  border: 1px solid color-mix(in srgb, var(--p-good) 40%, var(--p-line));
  background: color-mix(in srgb, var(--p-good) 8%, transparent);
  border-radius: var(--p-radius);
  padding: 14px 12px;
  margin-top: 12px;
`;
const CodeVal = styled.div`
  font-family: ${FONT_MONO};
  font-weight: 600;
  font-size: 30px;
  letter-spacing: 8px;
  color: var(--p-ink);
  margin: 4px 0 10px;
`;
const CodeNote = styled.p`
  font-family: ${FONT_UI};
  font-size: 11px;
  color: var(--p-ink-2);
  margin: 10px 0 0;
`;

const Waiting = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: ${FONT_UI};
  font-size: 12px;
  color: var(--p-ink-2);
  margin-top: 12px;
`;

export function ReidinRailPanel() {
  const [login, setLogin] = useState<ReidinLogin | null>(null);
  const [session, setSession] = useState<ReidinSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [inUseRole, setInUseRole] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => stopPolling, []);

  const start = async () => {
    setErr(null);
    setInUseRole(null);
    setSession(null);
    setStarting(true);
    stopPolling();
    try {
      const res = await startReidinOtp();
      if (res === null) {
        setErr('Could not reach the REIDIN login helper. Please try again.');
      } else if ('ok' in res && res.ok) {
        setLogin(res.login);
        setSession(res.session);
      } else if (res.code === 'IN_USE') {
        setInUseRole(res.holderRole ?? null);
      } else {
        setErr(res.error ?? 'Could not start the REIDIN login helper.');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };

  // Poll while the session is PENDING; stop the moment it resolves or terminates.
  useEffect(() => {
    if (!session || session.status !== 'PENDING') {
      stopPolling();
      return;
    }
    const tick = async () => {
      const res = await pollReidinOtp(session.id);
      if (res === null) return; // transient transport hiccup — keep polling
      if ('ok' in res && res.ok) {
        setSession(res.session);
      } else if (res.error) {
        setErr(res.error);
        stopPolling();
      }
    };
    pollRef.current = setInterval(() => void tick(), POLL_MS);
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.status]);

  const otp = session?.status === 'OTP_RECEIVED' ? session.otpCode : null;
  const terminal =
    session &&
    (session.status === 'EXPIRED' || session.status === 'FAILED' || session.status === 'CANCELLED');

  return (
    <div>
      <Purpose>
        Sign in to the shared REIDIN account without watching the mailbox. Get the login, start the
        monitor, then finish the REIDIN sign-in — the code appears here the moment REIDIN emails it.
      </Purpose>

      {err && <Banner $tone="warn">Couldn’t start: {err}</Banner>}

      {inUseRole !== null && (
        <Banner $tone="warn">
          The shared REIDIN login is in use by another agent
          {inUseRole ? ` (${inUseRole.toLowerCase()})` : ''}. Try again in a minute.
        </Banner>
      )}

      {!login && (
        <Btn type="button" variant="primary" disabled={starting} onClick={start} style={{ width: '100%', justifyContent: 'center' }}>
          {starting ? 'Starting…' : 'Get my REIDIN login code'}
        </Btn>
      )}

      {login && (
        <div>
          <Cred>
            <div style={{ minWidth: 0 }}>
              <CredLabel>Username</CredLabel>
              <CredVal>{login.username}</CredVal>
            </div>
            <Copy value={login.username} label="Copy" />
          </Cred>
          <Cred>
            <div style={{ minWidth: 0 }}>
              <CredLabel>Password</CredLabel>
              <CredVal>{login.password}</CredVal>
            </div>
            <Copy value={login.password} label="Copy" />
          </Cred>
          <LinkRow>
            <RelayLink href={login.insightUrl} target="_blank" rel="noreferrer">
              Open Insight ↗
            </RelayLink>
            <RelayLink href={login.cmaUrl} target="_blank" rel="noreferrer">
              Open CMA ↗
            </RelayLink>
          </LinkRow>
        </div>
      )}

      {otp && (
        <CodeCard>
          <CredLabel>Your login code</CredLabel>
          <CodeVal>{otp}</CodeVal>
          <Copy value={otp} label="Copy code" />
          <CodeNote>
            {session?.forwardedToEmail
              ? `Also emailed to ${session.forwardedToEmail}.`
              : 'Enter it now — REIDIN codes expire quickly.'}
          </CodeNote>
        </CodeCard>
      )}

      {login && session?.status === 'PENDING' && (
        <Waiting>
          <span aria-hidden>⏳</span>
          <span>Waiting for the code… finish the REIDIN sign-in to trigger the email.</span>
        </Waiting>
      )}

      {terminal && (
        <>
          <Banner $tone="warn">
            {session?.status === 'CANCELLED'
              ? session.errorMessage ?? 'This monitor was superseded.'
              : session?.status === 'EXPIRED'
                ? 'No code arrived before the 2-minute window closed.'
                : session?.errorMessage ?? 'The monitor failed.'}
          </Banner>
          <Btn type="button" variant="secondary" disabled={starting} onClick={start} style={{ width: '100%', justifyContent: 'center' }}>
            {starting ? 'Starting…' : 'Try again'}
          </Btn>
        </>
      )}
    </div>
  );
}
