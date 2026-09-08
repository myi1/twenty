import { bindsTypeableCharacter } from '../bindsTypeableCharacter';

// The bug, as a test: an agent typed "speak soon ok" and the client received
// "spea soon o". `k` is bound to vim row-up and the shortcut ate the letter.
describe('bindsTypeableCharacter', () => {
  it('catches the three letters agents could not type', () => {
    // useRecordTableRowFocusHotkeys: ['ArrowUp', 'Shift+Enter', 'k'] and ['ArrowDown', 'j']
    expect(bindsTypeableCharacter(['ArrowUp', 'Shift+Enter', 'k'])).toBe(true);
    expect(bindsTypeableCharacter(['ArrowDown', 'j'])).toBe(true);
    // useRecordTableRowHotkeys / useRecordBoardCardHotkeys: ['x']
    expect(bindsTypeableCharacter(['x'])).toBe(true);
    // Shift+X still produces a character a person types.
    expect(bindsTypeableCharacter(['Shift+x'])).toBe(true);
  });

  it('leaves the keys that MUST work inside a field alone', () => {
    // Flipping the default blindly would have broken all of these — 69 of 76
    // registrations rely on it, and most are Escape or Enter in a field editor.
    for (const keys of [
      ['Escape'],
      ['Enter'],
      ['Control+Enter', 'Meta+Enter'],
      ['ctrl+Enter,meta+Enter'],
      ['tab'],
      ['shift+tab'],
      ['Tab'],
      ['Shift+Tab'],
      ['ArrowUp'],
      ['ArrowDown'],
      ['ArrowLeft'],
      ['ArrowRight'],
      ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight'],
      ['Backspace', 'Delete'],
    ]) {
      expect(bindsTypeableCharacter(keys)).toBe(false);
    }
  });

  it('never treats the any-key wildcard as typeable', () => {
    // '*' is used deliberately for type-to-search and type-to-edit (the rich-text editor,
    // selectable lists, table cells). Those guard themselves and must keep firing from a
    // non-input context; calling them typeable would silently disable them.
    expect(bindsTypeableCharacter('*')).toBe(false);
    expect(bindsTypeableCharacter(['*'])).toBe(false);
  });

  it('exempts a real modifier combo — nobody types Ctrl+K into a sentence', () => {
    expect(bindsTypeableCharacter(['ctrl+a,meta+a'])).toBe(false);
    expect(bindsTypeableCharacter(['meta+k'])).toBe(false);
    expect(bindsTypeableCharacter(['alt+x'])).toBe(false);
    expect(bindsTypeableCharacter(['mod+s'])).toBe(false);
  });

  it('one dangerous alternative makes the whole binding dangerous', () => {
    // A single spec may carry several branches; if any of them eats a letter, the
    // registration eats a letter.
    expect(bindsTypeableCharacter('Escape,k')).toBe(true);
    expect(bindsTypeableCharacter(['Escape', 'meta+k'])).toBe(false);
  });

  it('accepts every shape react-hotkeys-hook accepts, without throwing', () => {
    expect(bindsTypeableCharacter('k')).toBe(true);
    expect(bindsTypeableCharacter('j, k')).toBe(true);
    expect(bindsTypeableCharacter([])).toBe(false);
    expect(bindsTypeableCharacter('')).toBe(false);
    expect(bindsTypeableCharacter(['  '])).toBe(false);
  });

  it('digits and punctuation count — they are typed too', () => {
    expect(bindsTypeableCharacter(['1'])).toBe(true);
    expect(bindsTypeableCharacter(['/'])).toBe(true);
    expect(bindsTypeableCharacter([','])).toBe(false); // a bare comma is a separator, not a key
  });
});
