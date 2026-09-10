import { composeCallNote } from '@/dialer-dock/utils/dialerCrmBridge';

// Regression cover for the 2026-09-10 silent-write bug: the dialer's post-call
// sheet claimed "Save to CRM" while its sink was a stub, so notes never left the
// agent's browser. These assert the shape of what now actually gets written.
describe('composeCallNote', () => {
  it("puts the agent's own words first and verbatim", () => {
    const { markdown } = composeCallNote({
      personId: 'p1',
      number: '+971556872843',
      note: 'He sounded pretty busy, call back after 6pm.',
      disposition: 'Callback',
      durationMs: 74_000,
    });

    expect(markdown.startsWith('He sounded pretty busy, call back after 6pm.')).toBe(
      true,
    );
    expect(markdown).toContain('- Outcome: Callback');
    expect(markdown).toContain('- Duration: 1m 14s');
  });

  it('still writes a note when the agent typed nothing', () => {
    const { title, markdown } = composeCallNote({
      personId: 'p1',
      number: '+971556872843',
      disposition: 'No answer',
    });

    expect(title).toBe('📞 No answer');
    expect(markdown).toContain('- Number: +971556872843');
  });

  it('titles the note with outcome and duration so it is scannable in the Notes tab', () => {
    const { title } = composeCallNote({
      personId: 'p1',
      number: '+447709996802',
      disposition: 'Interested',
      durationMs: 134_000,
    });

    expect(title).toBe('📞 Interested · 2m 14s');
  });

  it('omits duration for a call that never connected', () => {
    const { title, markdown } = composeCallNote({
      personId: 'p1',
      number: '+447709996802',
      outcome: 'no-answer',
      durationMs: 0,
    });

    expect(title).toBe('📞 no-answer');
    expect(markdown).not.toContain('Duration');
  });

  it('records a follow-up time when the agent set one', () => {
    const { markdown } = composeCallNote({
      personId: 'p1',
      number: '+971556872843',
      followUpAtMs: Date.UTC(2026, 8, 11, 9, 0, 0),
    });

    expect(markdown).toContain('- Follow-up: 2026-09-11T09:00:00.000Z');
  });
});
