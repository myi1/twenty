// StoryComposer.tsx: the box at the bottom of the story. It decides between three
// modes, not two: Message and Note are what the agent chooses, but Message
// itself resolves to one of three states depending on the lead and the thread:
//   1. Blocked: opted out of WhatsApp, or marked lost. No message mode at all,
//      just a plain statement of why. Note keeps working.
//   2. A live thread exists: reuse InboxComposer wholesale (it already owns the
//      AI chips, quick replies, media attach, the OFFICIAL-line 24h window card,
//      and IME-safe Enter-to-send) when the thread accepts a reply, or show its
//      `replyHint` when it doesn't.
//   3. No thread yet (first contact): a plain textarea that posts through
//      sendFirstWhatsApp, when the lead can be messaged and has a phone number.
//
// The line the message will go out on (data.wa.lineLabel / lineNumber) is shown
// next to the composer itself, not just once in the page header above. The
// header pill can scroll out of view on a long story, and an agent must never be
// unsure which number is about to speak for the business.

import { useEffect, useState } from 'react';
import { SegmentedControl, Textarea } from '@mantine/core';
import type { PropelHeroHost } from '@/propel/runtime/heroHost';
import { InboxComposer } from '@/propel/components/marketingHero/inbox/InboxComposer';
import { shouldSendOnKeyDown } from '@/propel/lib/inboxApi';
import type { InboxMediaKind, InboxThreadPayload } from '@/propel/types/inbox';
import { Btn } from '../_pulse/pulse';
import { Pill } from './styles';
import { addNote, errorText, sendFirstWhatsApp } from './leadApi';
import type { LeadLoad } from './types';

type Mode = 'message' | 'note';

// Draft persistence, scoped per lead so a refresh (or a failed send) never loses
// what the agent typed. Every access is try/catch'd: a full/disabled store must
// degrade to "the draft only survives this tab session", never throw.
const draftKey = (personId: string) => `lead-page-draft:${personId}`;
const readDraft = (personId: string): string => {
  try {
    return window.localStorage.getItem(draftKey(personId)) ?? '';
  } catch {
    return '';
  }
};
const writeDraft = (personId: string, text: string) => {
  try {
    if (text) window.localStorage.setItem(draftKey(personId), text);
    else window.localStorage.removeItem(draftKey(personId));
  } catch {
    /* best-effort: a lost draft on a full/disabled store is not fatal */
  }
};

// Plain words for a failed first-contact send. whatsapp-send-route.ts (and the
// wa-service it proxies) can hand back a raw engineering string here, such as
// "wa-service returned 502", "failed to reach wa-service: <whatever the fetch
// threw>", a WA_SERVICE_URL/WA_SERVICE_TOKEN config error, a REJECTED `reason`
// we don't recognise, or nothing at all on a pure transport failure. None of
// that belongs in front of an agent. Map what we actually know is a
// service/connectivity problem to one plain sentence; anything else,
// including an unrecognised rejection reason, gets the same plain, actionable
// fallback rather than a guess at a cause we don't have. In the spirit of
// errorText in leadApi.ts.
const sendFailureText = (r: { reason?: string; error?: string } | null): string => {
  const raw = r?.error ?? r?.reason ?? '';
  if (/wa-service|WA_SERVICE_URL|WA_SERVICE_TOKEN/i.test(raw)) {
    return 'The messaging service is not responding right now. Try again in a moment, and tell a manager if it keeps happening.';
  }
  return 'That message did not go. Try again, and tell a manager if it keeps happening.';
};

export const StoryComposer = ({
  host,
  data,
  thread,
  pushPending,
  markPendingFailed,
  markPendingSent,
  onChanged,
}: {
  host: PropelHeroHost;
  data: LeadLoad;
  thread: InboxThreadPayload | null;
  pushPending: (body: string, media?: { url: string; kind: InboxMediaKind } | null) => string;
  markPendingFailed: (tempId: string) => void;
  markPendingSent: (tempId: string) => void;
  onChanged: () => void;
}) => {
  const { person, wa, viewer } = data;
  const blocked = person.optedOutWhatsApp || person.isLost;

  const [mode, setMode] = useState<Mode>('message');
  const [firstMsg, setFirstMsg] = useState(() => readDraft(person.id));
  const [sendingFirst, setSendingFirst] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // index.tsx sets `data` to null on a personId change, which unmounts Story
  // (and this composer) through its `{data && ...}` render guard, so in the
  // current wiring a personId change already remounts this component, and the
  // `useState(() => readDraft(person.id))` initializer above already loads the
  // right draft on that fresh mount. This effect is a defensive backstop for if
  // that guard is ever relaxed and a future personId change reaches this
  // component WITHOUT a remount: it re-reads THAT lead's own draft rather than
  // carrying the previous one forward.
  useEffect(() => {
    setFirstMsg(readDraft(person.id));
  }, [person.id]);

  // Mirror every keystroke to localStorage. Never lose what the agent typed.
  useEffect(() => {
    writeDraft(person.id, firstMsg);
  }, [person.id, firstMsg]);

  const mergeValues = {
    firstName: person.displayName.split(' ')[0],
    fullName: person.displayName,
    agentName: person.assignedAgentName ?? '',
    officeName: 'RE/MAX Hub',
  };

  const sendFirst = async () => {
    const text = firstMsg.trim();
    if (!text || sendingFirst || !person.phoneE164) return;
    setSendingFirst(true);
    const r = await sendFirstWhatsApp(host, person.phoneE164, person.id, text);
    setSendingFirst(false);
    if (r?.kind === 'SENT') {
      setFirstMsg('');
      host.notify('Sent.', 'success');
      onChanged();
      return;
    }
    if (r?.kind === 'QUEUED_FOR_RETRY') {
      // The WhatsApp service queues and drains this on its own. Re-sending from
      // here would put a duplicate message in front of a real customer, so this
      // clears the box exactly like a normal success.
      setFirstMsg('');
      host.notify('Queued, will send.', 'info');
      onChanged();
      return;
    }
    // Anything else: keep the draft (already mirrored to localStorage above) so
    // the agent never has to retype a message that didn't go out.
    host.notify(sendFailureText(r), 'warning');
  };

  const saveNote = async () => {
    const text = noteText.trim();
    if (!text || savingNote) return;
    setSavingNote(true);
    const r = await addNote(host, person.id, text);
    setSavingNote(false);
    if (!r || r.ok === false) {
      host.notify(errorText(r), 'warning');
      return;
    }
    setNoteText('');
    onChanged();
  };

  return (
    <div id="lead-page-composer" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <SegmentedControl
        fullWidth
        value={mode}
        onChange={(v) => setMode(v as Mode)}
        data={[
          { label: 'Message', value: 'message' },
          { label: 'Note', value: 'note' },
        ]}
        styles={{ label: { minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13.5 } }}
      />

      {mode === 'note' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Textarea
            autosize
            minRows={2}
            placeholder="Add a note"
            value={noteText}
            onChange={(e) => setNoteText(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (shouldSendOnKeyDown(e)) {
                e.preventDefault();
                void saveNote();
              }
            }}
          />
          <Btn
            variant="secondary"
            disabled={savingNote || !noteText.trim()}
            onClick={() => void saveNote()}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            {savingNote ? 'Saving…' : 'Save note'}
          </Btn>
        </div>
      ) : blocked ? (
        // Deliberately no textarea here, even a read-only focus anchor: a
        // blocked lead gets NO message mode at all, full stop. That means
        // index.tsx's focusComposer (which only ever focuses a <textarea>
        // inside #lead-page-composer) still can't reach this Pill, so the
        // header's and phone bar's WhatsApp buttons stay a no-op for a
        // blocked lead specifically. Closing that requires either a
        // non-textarea fallback in focusComposer itself or index.tsx calling
        // scrollIntoView on the container directly; both are index.tsx
        // changes, out of scope here (see the task-11 fix-round-1 report).
        <Pill $tone="bad">{`Do not message on WhatsApp: ${person.isLost ? 'lead marked lost' : 'opted out'}`}</Pill>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Pill>{`${wa.lineLabel} · ${wa.lineNumber}`}</Pill>
          {thread ? (
            thread.canReply ? (
              <InboxComposer
                id={thread.id}
                channel="WHATSAPP"
                surface="DM"
                mergeValues={mergeValues}
                actingMemberId={viewer.workspaceMemberId}
                onPending={pushPending}
                onPendingFailed={markPendingFailed}
                onPendingSent={markPendingSent}
                onSent={() => onChanged()}
                lineType={thread.lineType}
                sessionWindowOpen={thread.sessionWindowOpen}
                sessionWindowEndsAtMs={thread.sessionWindowEndsAtMs}
                suggestedTemplate={thread.suggestedTemplate}
                approvedTemplates={thread.approvedTemplates}
              />
            ) : (
              // Read-only, not a message box: the agent cannot type into it and
              // nothing here can send. It's a real <textarea> purely so
              // index.tsx's focusComposer (getElementById('lead-page-composer')
              // .querySelector('textarea')?.focus()) has something to find:
              // a plain <div> here is a dead tap for both the header's WhatsApp
              // button and the phone bar's, since neither can reach a bare div.
              // tabIndex={-1} keeps it out of normal keyboard Tab order (it's
              // programmatically focusable, which is all that call needs) while
              // still triggering the browser's default scroll-into-view on
              // focus. A fallback sentence covers an empty replyHint from the
              // route, so the agent is never left looking at a blank box.
              <Textarea
                readOnly
                tabIndex={-1}
                variant="unstyled"
                autosize
                minRows={1}
                aria-label="Why you can’t message on this conversation right now"
                value={thread.replyHint || 'Messaging isn’t available on this conversation right now.'}
                styles={{ input: { fontSize: 13, color: 'var(--p-ink-2)', cursor: 'default', padding: 0 } }}
              />
            )
          ) : wa.canReply && person.phoneE164 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Textarea
                autosize
                minRows={2}
                placeholder={`First message on ${wa.lineLabel}`}
                value={firstMsg}
                onChange={(e) => setFirstMsg(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (shouldSendOnKeyDown(e)) {
                    e.preventDefault();
                    void sendFirst();
                  }
                }}
              />
              <Btn
                variant="primary"
                disabled={sendingFirst || !firstMsg.trim()}
                onClick={() => void sendFirst()}
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                {sendingFirst ? 'Sending…' : 'Send'}
              </Btn>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--p-ink-2)' }}>WhatsApp isn’t available for this lead yet.</div>
          )}
        </div>
      )}
    </div>
  );
};
