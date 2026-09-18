import { dedupeEvents } from '../Story';
import { stripMachineKey } from '../machineKey';

describe('stripMachineKey', () => {
  it('hides the idempotency key an agent was reading on production', () => {
    expect(
      stripMachineKey(
        "LEAD-POOL-UNASSIGNED::ad4306a9-3aeb-4712-9f17-c44577c36fa8 — Pool lead 'Kinza Lead' unassigned past 10 min — desk-assigned → route to an agent.",
      ),
    ).toBe("Pool lead 'Kinza Lead' unassigned past 10 min — desk-assigned → route to an agent.");
  });

  it('handles the other key the same alerter writes', () => {
    expect(stripMachineKey('ACTIVE-LEAD-CAP::68778e46 — Agent at the active-lead cap (100/100).')).toBe(
      'Agent at the active-lead cap (100/100).',
    );
  });

  it('leaves a human title alone, including one with a double colon', () => {
    expect(stripMachineKey('Call back Tuesday')).toBe('Call back Tuesday');
    expect(stripMachineKey('Note: follow up :: urgent')).toBe('Note: follow up :: urgent');
    expect(stripMachineKey('Viewing — Marina, 3pm')).toBe('Viewing — Marina, 3pm');
  });

  it('keeps the original rather than rendering an empty row', () => {
    expect(stripMachineKey('LEAD-POOL-UNASSIGNED::abc — ')).toBe('LEAD-POOL-UNASSIGNED::abc — ');
  });
});

describe('dedupeEvents', () => {
  const at = (iso: string, title: string) => ({ occurredAt: iso, title });

  it('collapses the same sentence repeated within a minute', () => {
    const rows = dedupeEvents([
      at('2026-09-14T16:23:04.000Z', 'LEAD-POOL-UNASSIGNED::aaa — Pool lead unassigned past 10 min'),
      at('2026-09-14T16:23:41.000Z', 'LEAD-POOL-UNASSIGNED::aaa — Pool lead unassigned past 10 min'),
    ]);
    expect(rows).toHaveLength(1);
  });

  it('collapses two DIFFERENT keys that read identically', () => {
    const rows = dedupeEvents([
      at('2026-09-14T16:23:04.000Z', 'LEAD-POOL-UNASSIGNED::aaa — Pool lead unassigned'),
      at('2026-09-14T16:23:09.000Z', 'LEAD-POOL-UNASSIGNED::bbb — Pool lead unassigned'),
    ]);
    expect(rows).toHaveLength(1);
  });

  it('keeps genuine repeats that are minutes apart', () => {
    const rows = dedupeEvents([
      at('2026-09-14T16:23:04.000Z', 'Called — no answer'),
      at('2026-09-14T16:48:04.000Z', 'Called — no answer'),
    ]);
    expect(rows).toHaveLength(2);
  });

  it('keeps different sentences in the same minute, and preserves order', () => {
    const rows = dedupeEvents([
      at('2026-09-14T16:23:04.000Z', 'Called — no answer'),
      at('2026-09-14T16:23:20.000Z', 'Sent the files'),
    ]);
    expect(rows.map((r) => r.title)).toEqual(['Called — no answer', 'Sent the files']);
  });

  it('does not throw on an unparseable date', () => {
    expect(dedupeEvents([at('not-a-date', 'x'), at('not-a-date', 'x')])).toHaveLength(1);
  });
});
