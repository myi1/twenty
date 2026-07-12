import {
  type MergeField,
  type MergeValues,
} from '@/propel/lib/campaignRenderer';

// S7 — WhatsApp filled-template preview (parity with the email live preview).
// WA campaigns don't render free content: Meta pre-approved the template text and
// we only supply positional {{1..n}} params. paramMap (on whatsappTemplate) is an
// ordered array of merge-field keys — element i renders {{i+1}}. This is a
// fork-local port of the relevant slice of the in-sandbox wa-template-renderer
// (propel-crm-integration: src/shared/wa-template-renderer.ts) — only the two
// PURE preview helpers the builder needs, no Meta-locale/validation machinery.

// Meta rejects empty-string params. firstName is the one key that's routinely
// missing (phone-only leads), so it gets a language-aware salutation fallback —
// the same fallback the drain uses at send time, so the preview matches reality.
const FIRSTNAME_FALLBACK: Record<'EN' | 'AR', string> = {
  EN: 'there',
  AR: 'حضرتك',
};

// Sample values for the preview. firstName mirrors the email preview's "Aisha";
// the rest are representative so a multi-param template reads naturally rather
// than leaving raw {{n}} holes. These never send — they're preview-only, exactly
// like the email preview's PREVIEW_SAMPLES.
export const WA_PREVIEW_SAMPLES: MergeValues = {
  firstName: 'Aisha',
  lastName: 'Khan',
  listingTitle: 'Marina Gate · 2BR',
  listingPrice: 'AED 2,400,000',
  permitNumber: 'P-DLD-00000',
  agentName: 'Sara from RE/MAX Hub',
  agentPhone: '+971 50 000 0000',
};

export interface RenderedParams {
  params: string[];
  /** merge keys whose value was missing with no fallback — the real send would
   * fail for these; the preview shows them as the literal placeholder. */
  missing: MergeField[];
}

// Resolve a paramMap to positional param strings against the preview samples,
// applying the firstName salutation fallback. Mirrors the drain's renderParams.
export const renderParams = (
  paramMap: MergeField[],
  values: MergeValues,
  language: 'EN' | 'AR',
): RenderedParams => {
  const params: string[] = [];
  const missing: MergeField[] = [];
  for (const key of paramMap) {
    const v = (values[key] ?? '').trim();
    if (v) {
      params.push(v);
    } else if (key === 'firstName') {
      params.push(FIRSTNAME_FALLBACK[language]);
    } else {
      missing.push(key);
      params.push('');
    }
  }
  return { params, missing };
};

// Substitute positional params into the template body for the preview: {{n}} →
// params[n-1] when non-empty, else the literal {{n}} (so a missing value reads as
// an unfilled hole, never a silent blank). Pure string op; identical to the
// in-sandbox previewTemplateBody.
export const previewTemplateBody = (
  bodyText: string,
  params: string[],
): string =>
  bodyText.replace(/\{\{\s*(\d+)\s*\}\}/g, (m, n: string) => {
    const i = Number(n) - 1;
    return i >= 0 && i < params.length && params[i] !== '' ? params[i] : m;
  });
