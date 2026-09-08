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

  // A different lead's page mounted the same Story without a remount (personId
  // changes via the URL without unmounting, see index.tsx). Load THAT lead's
  // own draft rather than carrying the previous one forward.
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
    host.notify(`Not sent: ${r?.reason ?? r?.error ?? 'the line did not answer'}`, 'warning');
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
              <div style={{ fontSize: 13, color: 'var(--p-ink-2)' }}>{thread.replyHint}</div>
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
