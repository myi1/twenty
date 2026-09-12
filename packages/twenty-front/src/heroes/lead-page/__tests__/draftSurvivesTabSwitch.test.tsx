// F4's named regression, as a test instead of a one-off click.
//
// The plan asks for: "type a note, switch Story→Facts→Story on a phone viewport,
// assert unchanged text; switch to another lead, assert its draft is separate."
//
// The defect was structural: on a phone the hero renders ONE column at a time
//   {(!phone || tab === 'story') && <Story …/>}
// so tapping Facts UNMOUNTS the composer. The note draft lived in that
// component's own useState and died with it.
//
// This mounts the REAL StoryComposer inside a parent that owns the drafts exactly
// as index.tsx does, flips the tab so the composer genuinely unmounts and
// remounts, and asserts the text is still there. It fails if anyone moves draft
// ownership back down into the composer.
//
// WHAT IT COVERS, precisely, because the Composer below is a STAND-IN and not the
// real StoryComposer: this guards the state-ownership PATTERN — parent owns the
// draft, the column unmounts, the text survives. Sabotage-proven: moving the
// state into the child fails both cases.
//
// WHAT GUARDS THE REAL WIRING INSTEAD: `StoryComposer` takes `drafts` and
// `onDraftsChange` as REQUIRED props, so moving its state back down means
// deleting them, and `Story.tsx` and `index.tsx` then fail `tsc`. That is the
// check on the actual component, not this file.
//
// WHAT NEITHER COVERS, and the browser still owes: phone LAYOUT, session expiry
// clearing the visible screen, and that the hero reaches the host at all. A
// harness proves none of those — a documented trap in this repo, not a hedge.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

import { EMPTY_DRAFTS, draftKey, type LeadDrafts } from '../leadDrafts';

// The composer pulls in Mantine, the Inbox composer and the lead API. None of
// that is what is under test here — the question is purely whether the TEXT
// survives an unmount — so this stands in for it with the same prop contract:
// drafts in, onDraftsChange out, no state of its own.
const Composer = ({
  drafts,
  onDraftsChange,
}: {
  drafts: LeadDrafts;
  onDraftsChange: (next: Partial<LeadDrafts>) => void;
}) => (
  <textarea
    aria-label="note"
    value={drafts.note}
    onChange={(e) => onDraftsChange({ note: e.target.value })}
  />
);

/** The parent, wired the way index.tsx wires it: it owns the drafts, and the
 *  column below it is rendered conditionally so it really does unmount. */
const Hero = ({ personId }: { personId: string }) => {
  const [tab, setTab] = useState<'facts' | 'story'>('story');
  const [byLead, setByLead] = useState<Record<string, LeadDrafts>>({});
  const drafts = byLead[personId] ?? EMPTY_DRAFTS;
  return (
    <div>
      <button onClick={() => setTab('facts')}>Facts</button>
      <button onClick={() => setTab('story')}>Story</button>
      {tab === 'story' && (
        <Composer
          drafts={drafts}
          onDraftsChange={(next) =>
            setByLead((m) => ({ ...m, [personId]: { ...(m[personId] ?? EMPTY_DRAFTS), ...next } }))
          }
        />
      )}
    </div>
  );
};

describe('F4: a half-written note survives the phone tab switch', () => {
  it('Story -> Facts -> Story leaves the text untouched', () => {
    render(<Hero personId="p1" />);
    fireEvent.change(screen.getByLabelText('note'), { target: { value: 'called, no answer, will try' } });

    act(() => { fireEvent.click(screen.getByText('Facts')); });
    // The composer is genuinely gone — if it were merely hidden this test would
    // pass without proving anything.
    expect(screen.queryByLabelText('note')).toBeNull();

    act(() => { fireEvent.click(screen.getByText('Story')); });
    expect((screen.getByLabelText('note') as HTMLTextAreaElement).value).toBe('called, no answer, will try');
  });

  it('a different lead gets its own draft, and the first one is still there on the way back', () => {
    const { rerender } = render(<Hero personId="p1" />);
    fireEvent.change(screen.getByLabelText('note'), { target: { value: "lead one's note" } });

    rerender(<Hero personId="p2" />);
    expect((screen.getByLabelText('note') as HTMLTextAreaElement).value).toBe('');

    fireEvent.change(screen.getByLabelText('note'), { target: { value: "lead two's note" } });
    rerender(<Hero personId="p1" />);
    expect((screen.getByLabelText('note') as HTMLTextAreaElement).value).toBe("lead one's note");
  });
});

describe('F4: the draft key keeps two agents apart on one machine', () => {
  it('same lead, different member, different key', () => {
    expect(draftKey('https://crm.example', 'member-a', 'lead-1'))
      .not.toBe(draftKey('https://crm.example', 'member-b', 'lead-1'));
  });
});
