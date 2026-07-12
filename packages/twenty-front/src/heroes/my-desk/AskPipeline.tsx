// AskPipeline.tsx — the AI v2 "ask your pipeline" affordance: a small, discoverable
// top-bar "Ask" button that opens a popover where the agent types a plain-English
// question about their OWN open book ("who did I promise a callback and never
// call?"). The answer is READ-ONLY — grounded in the member's leads+deals, with
// the referenced records rendered as clickable rows (host.navigate to the record).
//
// Honesty:
//   · Strictly read-only — it never offers to act, only reports what the book shows.
//   · Graceful when AI is unavailable (a plain line, not a broken control).
//   · Every ref is a real record the route resolved (the model cites rows by index;
//     it can't invent an id), so a clickable row always lands somewhere real.

import { useRef, useState } from 'react';
import styled from '@emotion/styled';
import { type PropelHeroHost } from '@/propel/runtime/heroHost';

import { DUR, EASE } from '../_pulse/pulse-tokens';
import { Btn, FONT_MONO, FONT_UI, Input } from '../_pulse/pulse';

import { assistAskPipeline } from './deskApi';
import { deskRecordPath } from './PeekDrawer';
import type { DeskPipelineRef, DeskRow } from './types';

const Sheet = styled.div`
  position: fixed;
  top: 66px;
  right: 24px;
  z-index: 5000;
  width: 380px;
  max-width: calc(100vw - 48px);
  max-height: min(560px, calc(100vh - 96px));
  display: flex;
  flex-direction: column;
  border: 1px solid var(--p-line);
  border-radius: var(--p-radius);
  background: var(--p-surface-2);
  box-shadow: var(--p-shadow-pop);
  overflow: hidden;
  @media (prefers-reduced-motion: no-preference) {
    animation: askIn ${DUR.dropdown}ms ${EASE.out};
  }
  @keyframes askIn {
    from { opacity: 0; transform: translate3d(0, -6px, 0); }
    to { opacity: 1; transform: none; }
  }
`;

const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--p-line);
`;

const Title = styled.div`
  font-family: ${FONT_UI};
  font-size: 13px;
  font-weight: 600;
  color: var(--p-ink);
`;

const Hint = styled.div`
  font-family: ${FONT_MONO};
  font-size: 9px;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: var(--p-ink-2);
`;

const Body = styled.div`
  padding: 12px 14px 14px;
  overflow-y: auto;
`;

const Form = styled.form`
  display: flex;
  gap: 8px;
`;

const Answer = styled.div`
  margin-top: 13px;
  font-family: ${FONT_UI};
  font-size: 13px;
  line-height: 1.55;
  color: var(--p-ink);
  white-space: pre-wrap;
`;

const RefsLabel = styled.div`
  font-family: ${FONT_MONO};
  font-size: 9px;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: var(--p-ink-2);
  margin: 14px 0 6px;
`;

const RefRow = styled.button`
  all: unset;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 9px;
  border-radius: 7px;
  border: 1px solid var(--p-line);
  cursor: pointer;
  color: var(--p-ink);
  font-family: ${FONT_UI};
  font-size: 12.5px;
  & + & {
    margin-top: 6px;
  }
  @media (prefers-reduced-motion: no-preference) {
    transition: background ${DUR.press}ms ${EASE.out}, border-color ${DUR.press}ms ${EASE.out};
  }
  &:hover {
    background: var(--p-surface-3, var(--p-line));
    border-color: var(--p-accent);
  }
  &::before {
    content: '';
    flex: none;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--p-accent);
  }
`;

const Muted = styled.div`
  margin-top: 13px;
  font-family: ${FONT_UI};
  font-size: 12.5px;
  color: var(--p-ink-2);
`;

const AskGlyph = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden>
    <path d="M8 1.8c-3 0-5.4 2-5.4 4.6 0 1.5.8 2.8 2 3.6l-.5 2.4 2.5-1.3c.4.1.9.1 1.4.1 3 0 5.4-2 5.4-4.8S11 1.8 8 1.8Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);

type Result =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; answer: string; refs: DeskPipelineRef[]; truncated: boolean }
  | { kind: 'unavailable' }
  | { kind: 'error' };

export const AskPipeline = ({ host }: { host: PropelHeroHost }) => {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<Result>({ kind: 'idle' });
  const seq = useRef(0);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    const my = ++seq.current;
    setResult({ kind: 'loading' });
    const res = await assistAskPipeline(q);
    if (my !== seq.current) return; // a newer question superseded this one
    if (!res) {
      setResult({ kind: 'error' });
      return;
    }
    if (!res.ok) {
      setResult({ kind: res.code === 'AI_UNAVAILABLE' ? 'unavailable' : 'error' });
      return;
    }
    setResult({ kind: 'ok', answer: res.answer, refs: res.refs ?? [], truncated: !!res.truncated });
  };

  const goto = (ref: DeskPipelineRef) => {
    host.navigate(deskRecordPath({ laneObject: ref.laneObject, recordId: ref.recordId } as DeskRow));
    setOpen(false);
  };

  return (
    <>
      <Btn
        type="button"
        variant="secondary"
        aria-pressed={open}
        title="Ask a question about your pipeline"
        onClick={() => setOpen((v) => !v)}
        style={open ? { borderColor: 'var(--p-accent)', background: 'var(--p-accent-tint)' } : undefined}
      >
        <AskGlyph />
        Ask
      </Btn>
      {open && (
        <Sheet role="dialog" aria-label="Ask your pipeline">
          <Head>
            <Title>Ask your pipeline</Title>
            <Hint>Read-only</Hint>
          </Head>
          <Body>
            <Form onSubmit={ask}>
              <Input
                autoFocus
                value={question}
                placeholder="e.g. who's waiting on a callback?"
                onChange={(e) => setQuestion(e.target.value)}
                style={{ flex: 1 }}
              />
              <Btn type="submit" variant="primary" disabled={!question.trim() || result.kind === 'loading'}>
                {result.kind === 'loading' ? '…' : 'Ask'}
              </Btn>
            </Form>

            {result.kind === 'loading' && <Muted>Reading your open book…</Muted>}
            {result.kind === 'unavailable' && <Muted>Ask isn’t available right now.</Muted>}
            {result.kind === 'error' && <Muted>Couldn’t answer that just now — please try again.</Muted>}
            {result.kind === 'ok' && (
              <>
                <Answer>{result.answer}</Answer>
                {result.refs.length > 0 && (
                  <>
                    <RefsLabel>Deals mentioned</RefsLabel>
                    {result.refs.map((ref) => (
                      <RefRow key={`${ref.laneObject}:${ref.recordId}`} type="button" onClick={() => goto(ref)} title={`Open ${ref.name}`}>
                        {ref.name}
                      </RefRow>
                    ))}
                  </>
                )}
                {result.truncated && <Muted>Covers part of your book — ask about a narrower slice for the rest.</Muted>}
              </>
            )}
          </Body>
        </Sheet>
      )}
    </>
  );
};
