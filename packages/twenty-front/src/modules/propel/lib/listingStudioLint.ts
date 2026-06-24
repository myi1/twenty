import {
  type StudioLintFinding,
  type StudioWriteup,
} from '@/propel/types/listingStudio';

// Client-side compliance lint — a thin mirror of the server's lintWriteup
// (propel-crm src/listing-studio/pf-atlas/listing-from-facts.ts) so the Publish
// step's eligibility checklist can flag hard issues without a round-trip. The
// SERVER is authoritative: the publish route re-runs lintWriteup and blocks on any
// hard finding regardless of what the client showed. EN gets the full ASCII +
// HTML + regulated-claim check; AR (legitimately non-Latin) gets HTML + claims.

const NON_ASCII = /[^\x09\x0A\x0D\x20-\x7E]/;
const HTML = /<[^>]+>/;

const REGULATED: { pattern: RegExp; label: string }[] = [
  { pattern: /\bguaranteed?\s+(roi|return|rental|yield|income|profit)/i, label: 'guaranteed return' },
  { pattern: /\bguaranteed\b/i, label: 'guaranteed' },
  { pattern: /\b(highest|best|cheapest|lowest)\s+(price|roi|return|in\s+dubai|in\s+the\s+market)/i, label: 'superlative claim' },
  { pattern: /\brisk[-\s]?free\b/i, label: 'risk-free' },
  { pattern: /\bno\.?\s*1\b|\bnumber\s+one\b/i, label: 'number-one claim' },
];

const checkClaims = (field: StudioLintFinding['field'], text: string): StudioLintFinding[] =>
  REGULATED.filter((r) => r.pattern.test(text)).map((r) => ({
    severity: 'hard' as const,
    field,
    message: `Regulated claim ("${r.label}") — remove before publishing.`,
  }));

export const lintWriteupClient = (writeup: StudioWriteup): StudioLintFinding[] => {
  const findings: StudioLintFinding[] = [];

  for (const [field, text] of [
    ['titleEn', writeup.titleEn],
    ['descriptionEn', writeup.descriptionEn],
  ] as const) {
    if (!text) continue;
    if (NON_ASCII.test(text)) {
      findings.push({ severity: 'hard', field, message: 'Contains characters Property Finder rejects (emoji/symbols).' });
    }
    if (HTML.test(text)) {
      findings.push({ severity: 'hard', field, message: 'Contains HTML tags — Property Finder rejects them.' });
    }
    findings.push(...checkClaims(field, text));
  }

  for (const [field, text] of [
    ['titleAr', writeup.titleAr],
    ['descriptionAr', writeup.descriptionAr],
  ] as const) {
    if (!text) continue;
    if (HTML.test(text)) {
      findings.push({ severity: 'hard', field, message: 'Contains HTML tags — Property Finder rejects them.' });
    }
    findings.push(...checkClaims(field, text));
  }

  return findings;
};
