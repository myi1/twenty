// F4 regressions: what the agent typed, and where it is allowed to live.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  clearAllDrafts,
  draftKey,
  DRAFT_PREFIX,
  EMPTY_DRAFTS,
  hasDraftContent,
  LEGACY_DRAFT_PREFIX,
  purgeForeignDrafts,
  purgeLegacyDrafts,
  readDrafts,
  writeDrafts,
  type DraftStore,
  type LeadDrafts,
} from './leadDrafts.ts';

/** A Storage stand-in with the same index semantics the real one has. */
const store = (seed: Record<string, string> = {}) => {
  const m = new Map(Object.entries(seed));
  const s: DraftStore & { map: Map<string, string> } = {
    map: m,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => { m.set(k, v); },
    removeItem: (k) => { m.delete(k); },
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
  return s;
};
/** A store where every operation throws — a disabled or partitioned one. */
const hostileStore = (): DraftStore => ({
  getItem: () => { throw new Error('denied'); },
  setItem: () => { throw new Error('denied'); },
  removeItem: () => { throw new Error('denied'); },
  key: () => { throw new Error('denied'); },
  get length(): number { throw new Error('denied'); },
});

const WS = 'https://crm.example';
const ME = 'member-me';
const THEM = 'member-other';
const LEAD = 'person-1';

describe('draftKey — whose draft is this?', () => {
  it('two agents on one machine do not share a lead"s draft', () => {
    // THE LEAK. The old key was `lead-page-draft:<personId>` — the lead and
    // nothing else — so on a shared office browser profile the next agent to
    // open that lead read the previous one's unsent message about a named
    // customer.
    assert.notEqual(draftKey(WS, ME, LEAD), draftKey(WS, THEM, LEAD));
  });

  it('a staging tab and a production tab do not share one either', () => {
    assert.notEqual(draftKey('https://staging.example', ME, LEAD), draftKey(WS, ME, LEAD));
  });

  it('the same agent on the same lead gets the same key', () => {
    assert.equal(draftKey(WS, ME, LEAD), draftKey(WS, ME, LEAD));
  });

  it('different leads are different drafts', () => {
    assert.notEqual(draftKey(WS, ME, 'person-1'), draftKey(WS, ME, 'person-2'));
  });

  it('the parts cannot be smeared into each other', () => {
    // A naive `a + ':' + b + ':' + c` lets a personId containing a colon
    // impersonate another member's key. JSON.stringify of an array cannot.
    assert.notEqual(draftKey(WS, ME, `x:${THEM}:y`), draftKey(WS, `${ME}:x`, `${THEM}:y`));
  });
});

describe('readDrafts / writeDrafts', () => {
  it('round-trips a message, a note and the open tab', () => {
    const s = store();
    const k = draftKey(WS, ME, LEAD);
    const d: LeadDrafts = { message: 'hello', note: 'called, no answer', mode: 'note' };
    writeDrafts(s, k, d);
    assert.deepEqual(readDrafts(s, k), d);
  });

  it('keeps the composer tab, so a half-typed note is not hidden behind Message', () => {
    const s = store();
    const k = draftKey(WS, ME, LEAD);
    writeDrafts(s, k, { message: '', note: 'half a thought', mode: 'note' });
    assert.equal(readDrafts(s, k).mode, 'note');
  });

  it('an empty draft is REMOVED, not stored as an empty husk', () => {
    const s = store();
    const k = draftKey(WS, ME, LEAD);
    writeDrafts(s, k, { message: 'typed', note: '', mode: 'message' });
    assert.equal(s.map.size, 1);
    writeDrafts(s, k, EMPTY_DRAFTS);
    assert.equal(s.map.size, 0, 'a sent message must leave nothing behind');
  });

  it('an absent, corrupt or wrong-shaped entry reads as empty, never throws', () => {
    const k = draftKey(WS, ME, LEAD);
    assert.deepEqual(readDrafts(store(), k), EMPTY_DRAFTS);
    assert.deepEqual(readDrafts(store({ [DRAFT_PREFIX + k]: 'not json' }), k), EMPTY_DRAFTS);
    assert.deepEqual(readDrafts(store({ [DRAFT_PREFIX + k]: 'null' }), k), EMPTY_DRAFTS);
    assert.deepEqual(readDrafts(store({ [DRAFT_PREFIX + k]: '[1,2,3]' }), k), { message: '', note: '', mode: 'message' });
    assert.deepEqual(readDrafts(store({ [DRAFT_PREFIX + k]: '{"message":7,"mode":"nope"}' }), k), EMPTY_DRAFTS);
  });

  it('a store that throws on every call degrades silently', () => {
    // A browser with site data blocked must not take the lead page down.
    const h = hostileStore();
    assert.deepEqual(readDrafts(h, 'k'), EMPTY_DRAFTS);
    assert.doesNotThrow(() => writeDrafts(h, 'k', { message: 'x', note: '', mode: 'message' }));
    assert.equal(clearAllDrafts(h), 0);
    assert.equal(purgeLegacyDrafts(h), 0);
  });

  it('no store at all is handled — a hero can render before storage resolves', () => {
    assert.deepEqual(readDrafts(null, 'k'), EMPTY_DRAFTS);
    assert.doesNotThrow(() => writeDrafts(null, 'k', EMPTY_DRAFTS));
    assert.equal(clearAllDrafts(null), 0);
  });
});

describe('clearAllDrafts — session expiry takes the words with it', () => {
  it('removes every draft of ours and nothing else', () => {
    // THE REGRESSION: "expire the session, assert personal content is removed
    // from visible state". The parent drops its state; this drops the mirror.
    const s = store({
      [DRAFT_PREFIX + draftKey(WS, ME, 'p1')]: '{"message":"private","note":"","mode":"message"}',
      [DRAFT_PREFIX + draftKey(WS, ME, 'p2')]: '{"message":"","note":"also private","mode":"note"}',
      'some-other-app-key': 'not ours',
      'colorScheme': 'dark',
    });
    assert.equal(clearAllDrafts(s), 2);
    assert.deepEqual([...s.map.keys()].sort(), ['colorScheme', 'some-other-app-key']);
  });

  it('removes ALL of them when there are many — the index does not renumber under it', () => {
    // Removing while walking `store.key(i)` skips every second entry. With five
    // drafts a buggy walk leaves three behind, and those three are exactly the
    // customer text this function exists to remove.
    const seed: Record<string, string> = {};
    for (let i = 0; i < 5; i += 1) seed[DRAFT_PREFIX + draftKey(WS, ME, `p${i}`)] = '{"message":"x","note":"","mode":"message"}';
    const s = store(seed);
    assert.equal(clearAllDrafts(s), 5);
    assert.equal(s.map.size, 0);
  });
});

describe('purgeLegacyDrafts — the text already sitting on agents" machines', () => {
  it('deletes the old unscoped keys', () => {
    // Writing somewhere safer from now on would leave every existing entry
    // exactly where it is: real message text, keyed by lead alone, with no
    // member and no expiry.
    const s = store({
      [`${LEGACY_DRAFT_PREFIX}person-1`]: 'unsent message about a named customer',
      [`${LEGACY_DRAFT_PREFIX}person-2`]: 'another one',
      [DRAFT_PREFIX + draftKey(WS, ME, 'p1')]: '{"message":"current","note":"","mode":"message"}',
      'unrelated': 'keep me',
    });
    assert.equal(purgeLegacyDrafts(s), 2);
    assert.deepEqual([...s.map.keys()].sort(), [DRAFT_PREFIX + draftKey(WS, ME, 'p1'), 'unrelated'].sort());
  });

  it('leaves the new scheme alone — the two prefixes must not overlap', () => {
    assert.equal(DRAFT_PREFIX.startsWith(LEGACY_DRAFT_PREFIX), false);
    assert.equal(LEGACY_DRAFT_PREFIX.startsWith(DRAFT_PREFIX), false);
  });
});

describe('hasDraftContent', () => {
  it('is about text, not about which tab is open', () => {
    assert.equal(hasDraftContent({ message: '', note: '', mode: 'note' }), false);
    assert.equal(hasDraftContent({ message: 'x', note: '', mode: 'message' }), true);
    assert.equal(hasDraftContent({ message: '', note: 'x', mode: 'message' }), true);
  });
});

describe('purgeForeignDrafts — the tab cleans up after the last person in it', () => {
  // Added after the session-expiry check half-failed on staging: the lead left the
  // screen (the shell redirects to sign-in) but the draft text was STILL in
  // sessionStorage, because that redirect happens before the hero mounts and the
  // NOT_AUTHENTICATED branch never ran. This does not depend on catching expiry.
  const ME = 'member-me';
  const THEM = 'member-other';
  const WS = 'https://crm.example';

  it("removes another member's drafts and keeps mine", () => {
    const s = store({
      [DRAFT_PREFIX + draftKey(WS, THEM, 'p1')]: '{"message":"","note":"their private note","mode":"note"}',
      [DRAFT_PREFIX + draftKey(WS, THEM, 'p2')]: '{"message":"more of theirs","note":"","mode":"message"}',
      [DRAFT_PREFIX + draftKey(WS, ME, 'p1')]: '{"message":"mine","note":"","mode":"message"}',
      'unrelated-key': 'must survive',
    });
    assert.equal(purgeForeignDrafts(s, ME), 2);
    assert.deepEqual([...s.map.keys()].sort(), [DRAFT_PREFIX + draftKey(WS, ME, 'p1'), 'unrelated-key'].sort());
  });

  it('a draft key that will not parse is removed too', () => {
    // Ours by prefix, not by shape. Leaving it means leaving text we cannot attribute.
    const s = store({ [`${DRAFT_PREFIX}not-json-at-all`]: 'text of unknown ownership' });
    assert.equal(purgeForeignDrafts(s, ME), 1);
    assert.equal(s.map.size, 0);
  });

  it('does nothing without a member, rather than deleting everything', () => {
    // Called before the viewer resolves, an empty member must NOT match-none-and-purge-all.
    const s = store({ [DRAFT_PREFIX + draftKey(WS, ME, 'p1')]: '{"message":"mine","note":"","mode":"message"}' });
    assert.equal(purgeForeignDrafts(s, ''), 0);
    assert.equal(s.map.size, 1);
  });

  it('survives a hostile store', () => {
    assert.equal(purgeForeignDrafts(hostileStore(), ME), 0);
    assert.equal(purgeForeignDrafts(null, ME), 0);
  });

  it('removes ALL foreign drafts when there are many — no index renumbering', () => {
    const seed: Record<string, string> = {};
    for (let i = 0; i < 5; i += 1) seed[DRAFT_PREFIX + draftKey(WS, THEM, `p${i}`)] = '{"message":"x","note":"","mode":"message"}';
    const s = store(seed);
    assert.equal(purgeForeignDrafts(s, ME), 5);
    assert.equal(s.map.size, 0);
  });
});
