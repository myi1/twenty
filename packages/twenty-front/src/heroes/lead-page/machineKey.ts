// Some task titles carry a MACHINE KEY as their prefix — `LEAD-POOL-UNASSIGNED::<personId> — …`,
// `ACTIVE-LEAD-CAP::<agentId> — …`. The key is not decoration: lead-pool-desk-alert.ts finds its
// own open task by `title.startsWith(prefix)` / `ilike`, so it IS the idempotency latch and
// cannot leave the title without breaking every task already in flight.
//
// It can, however, stop being shown. On production an agent opening a lead read
// "LEAD-POOL-UNASSIGNED::ad4306a9-3aeb-4712-9f17-c44577c36fa8 — Pool lead 'Kinza Lead' …" in the
// timeline, twice, AND again as the page's "Next:" line — two different render paths, so the rule
// lives here rather than in either of them.
//
// Deliberately narrow: it strips ONLY a leading SCREAMING-KEBAB key, `::`, a token with no spaces,
// and the alerter's own ` — ` separator. A human title containing a double colon keeps it, and a
// key with nothing after the separator falls back to the original rather than rendering blank.
const MACHINE_KEY_RE = /^[A-Z][A-Z0-9-]{2,}::\S+\s—\s(?=\S)/;

export const stripMachineKey = (title: string): string => {
  const cleaned = title.replace(MACHINE_KEY_RE, '');
  return cleaned.trim() ? cleaned : title;
};
