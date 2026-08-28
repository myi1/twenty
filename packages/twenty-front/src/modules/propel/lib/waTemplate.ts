// Fork-local PORT of the Propel WhatsApp-template pure logic (propel-crm-integration:
// src/shared/wa-template-renderer.ts + wa-template-create.ts + the
// hasUnsupportedComponents half of wa-template-sync.ts). Pure, dependency-free,
// no I/O — the EXACT client-side Meta-validation mirror + component assembly +
// drain-aware preview the legacy WhatsApp editor (marketing-cloud-tpleditors.tsx)
// used, copied so the graduated hero WhatsApp editor reaches full parity:
//   • validateCreateInput → the prominent "N things to fix" submit blocker,
//   • assembleComponents → fed to hasUnsupportedComponents (drain-supportability),
//   • previewTemplateBody + renderParams → the drain-aware FILLED preview,
//   • bodyParamCount / bodyPlaceholdersValid → the body↔paramMap sequence gate.
//
// We do NOT import across repos and we deliberately keep this independent of the
// hero's email-preview campaignRenderer (whose MERGE_FIELDS_V1 is a smaller
// preview-only subset). The WhatsApp vocabulary is the FULL legacy MERGE_FIELDS_V1
// superset, declared here byte-faithfully to the source so the client gate and the
// real save/create routes can't drift.

// ── The closed WhatsApp/merge vocabulary (campaign-renderer MERGE_FIELDS_V1) ────
export const WA_MERGE_FIELDS_V1 = [
  'firstName',
  'lastName',
  'fullName',
  'email',
  'phone',
  'listingTitle',
  'listingPrice',
  'permitNumber',
  'agentName',
  'agentPhone',
  'agentEmail',
  'officeName',
  'unsubscribeUrl',
] as const;

export type WaMergeField = (typeof WA_MERGE_FIELDS_V1)[number];
export type WaMergeValues = Partial<Record<WaMergeField, string>>;

// unsubscribeUrl is email-only: WhatsApp has no unsubscribe link — opting out is a
// STOP reply. Everything else is fair game (wa-template-renderer WA_PARAM_FIELDS).
export const WA_PARAM_FIELDS = WA_MERGE_FIELDS_V1.filter(
  (f) => f !== 'unsubscribeUrl',
);

// Meta hard-caps are generous; 10 params is already an unreadable template.
export const WA_PARAM_CAP = 10;

// Subset of the vocabulary the drain actually populates per recipient — the set
// buildRecipientMergeValues fills from real data: the recipient Person, the
// recipient's assigned agent, the brokerage singleton, and the campaign scope
// (listingTitle/permitNumber). The editor offers EXACTLY these as chips, so each
// needs a realistic preview stand-in. (listingPrice/unsubscribeUrl are absent:
// listingPrice has no drain source yet, unsubscribeUrl is auto-appended.)
export const DRAIN_POPULATED_FIELDS: readonly WaMergeField[] = [
  'firstName',
  'lastName',
  'fullName',
  'email',
  'phone',
  'listingTitle',
  'permitNumber',
  'agentName',
  'agentPhone',
  'agentEmail',
  'officeName',
];

// ── paramMap validation (wa-template-renderer) ─────────────────────────────────

/** Validate a raw paramMap. Returns human-readable problems; [] = valid. */
export const validateParamMap = (raw: unknown): string[] => {
  if (raw == null) return [];
  if (!Array.isArray(raw))
    return ['paramMap must be a JSON array of merge-field keys'];
  const problems: string[] = [];
  if (raw.length > WA_PARAM_CAP)
    problems.push(`paramMap has ${raw.length} params — cap is ${WA_PARAM_CAP}`);
  raw.forEach((k, i) => {
    if (
      typeof k !== 'string' ||
      !(WA_PARAM_FIELDS as readonly string[]).includes(k)
    ) {
      problems.push(
        `paramMap[${i}] = ${JSON.stringify(k)} is not a WhatsApp-valid merge field (allowed: ${WA_PARAM_FIELDS.join(', ')})`,
      );
    }
  });
  return problems;
};

/** Fire-time validation: vocabulary-valid AND drain-populatable. */
export const validateParamMapForDrain = (raw: unknown): string[] => {
  const problems = validateParamMap(raw);
  if (problems.length > 0 || raw == null || !Array.isArray(raw)) return problems;
  raw.forEach((k, i) => {
    if (
      typeof k === 'string' &&
      (WA_PARAM_FIELDS as readonly string[]).includes(k) &&
      !(DRAIN_POPULATED_FIELDS as readonly string[]).includes(k)
    ) {
      problems.push(
        `paramMap[${i}] = "${k}" is valid vocabulary but the drain cannot populate it yet (supported: ${DRAIN_POPULATED_FIELDS.join(', ')})`,
      );
    }
  });
  return problems;
};

// Meta rejects empty-string params. firstName is the one key routinely missing
// (phone-only leads), so it gets a language-aware salutation fallback; any OTHER
// missing value is a per-recipient failure.
const FIRSTNAME_FALLBACK: Record<'EN' | 'AR', string> = {
  EN: 'there',
  AR: 'حضرتك',
};

export interface RenderedParams {
  params: string[];
  /** merge keys whose value was missing with no fallback — send must not proceed. */
  missing: WaMergeField[];
}

export const renderParams = (
  paramMap: WaMergeField[],
  values: WaMergeValues,
  language: 'EN' | 'AR',
): RenderedParams => {
  const params: string[] = [];
  const missing: WaMergeField[] = [];
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

// Every {{n}} number present in the body (1-based, may repeat).
export const placeholderNumbers = (body: string): number[] => {
  const nums: number[] = [];
  for (const m of body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) nums.push(Number(m[1]));
  return nums;
};

// WhatsApp bodies use NUMERIC placeholders only ({{1}}, {{2}}…). A named token
// like {{firstName}} is Meta-invalid but the numeric scan above ignores it, so
// detect any {{…}} whose inner text isn't purely digits and reject the body.
export const hasNonNumericPlaceholder = (body: string): boolean => {
  for (const m of body.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)) {
    if (!/^\d+$/.test((m[1] ?? '').trim())) return true;
  }
  return false;
};

/** The placeholder contract shared by the editor (client guard) and the
 * save-template route: the DISTINCT {{n}} numbers in the body must be exactly
 * {1..paramLen} — every binding referenced, nothing out of range, no gaps, no
 * {{0}}, no non-numeric {{…}}. A number MAY repeat. */
export const bodyPlaceholdersValid = (
  body: string,
  paramLen: number,
): boolean => {
  if (hasNonNumericPlaceholder(body)) return false;
  const distinct = new Set(placeholderNumbers(body));
  return (
    distinct.size === paramLen && [...distinct].every((n) => n >= 1 && n <= paramLen)
  );
};

/** Substitute params into the template body for previews — NOT what's sent (Meta
 * renders server-side from the approved template; we send only the params). */
export const previewTemplateBody = (
  bodyText: string,
  params: string[],
): string =>
  bodyText.replace(/\{\{\s*(\d+)\s*\}\}/g, (m, n: string) => {
    const i = Number(n) - 1;
    return i >= 0 && i < params.length && params[i] !== '' ? params[i] : m;
  });

// ── create-input shape (what the route receives, what the editor sends) ────────

export type WaHeaderInput =
  | { format: 'TEXT'; text: string; example?: string }
  | { format: 'IMAGE' | 'VIDEO' | 'DOCUMENT'; example?: string };

export type WaButtonInput =
  | { type: 'QUICK_REPLY'; text: string }
  | { type: 'URL'; text: string; url: string; example?: string }
  | { type: 'PHONE_NUMBER'; text: string; phoneNumber: string };

export interface WaTemplateCreateInput {
  /** Meta template name — lowercase letters, digits, underscores. */
  name: string;
  /** exact Meta locale, e.g. 'en_US' / 'ar'. */
  language: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  /** body text with positional {{1}}..{{n}} placeholders (required). */
  bodyText: string;
  /** one sample value per distinct {{n}} in bodyText, in order (1..n). */
  bodyExample: string[];
  /** ordered drain merge-field bindings for {{1..n}} (element i → {{i+1}}). */
  paramMap?: string[];
  header?: WaHeaderInput;
  footer?: string;
  buttons?: WaButtonInput[];
}

// ── Mandatory opt-out on MARKETING templates ───────────────────────────────────
// PORT of propel-crm-integration:src/shared/wa-opt-out.ts + the ensureOptOut half
// of wa-template-create.ts. KEEP IN SYNC — the create route re-runs the same rule
// server-side, so a divergence here shows the operator one footer and submits
// another.
//
// Why it exists: on 2026-08-28 a 1,485-recipient marketing send drew a Meta spam
// notice and pushed the sending number to quality_rating RED. Recipients who
// wanted out had no exit, so they used "Report spam" / "Block" — and Meta gives
// us NO signal for either, so those people stay in our lists and get messaged
// again. A second strike is what actually disables a number.
//
// The suppression itself already works: a STOP reply (or a tap on an opt-out
// button) is classified UNSUBSCRIBED by the WA adapter, written as
// whatsappOptOut on the Person by the webhook route, and excluded from every
// future audience by the segment resolver. Templates just never said so.

// The BUTTON is the default affordance (Yahya's call, 2026-08-28): one tap beats
// typing a word, so more of the people who want out use the exit we control
// rather than "Report spam". Meta's own canonical marketing-template example
// ships this exact shape (a quick_reply "Unsubscribe" listed after any
// url/phone_number buttons), and static quick-reply buttons need no send-time
// parameters, so the body-only send path carries them unchanged.
export const WA_OPT_OUT_BUTTON_EN = 'Stop promotions';
export const WA_OPT_OUT_BUTTON_AR = 'إيقاف الرسائل';

// The FOOTER line is the fallback, used when all 10 button slots are taken.
// Free-text opt-out is EXACT-MATCH ONLY at runtime — a typed reply is a hot lead
// by default ("stop by tomorrow" must never suppress a buyer) — so the line asks
// for the BARE word, which is what the runtime honours.
export const WA_OPT_OUT_FOOTER_EN = 'Reply STOP to unsubscribe';
export const WA_OPT_OUT_FOOTER_AR = 'أرسل "إيقاف" لإلغاء الاشتراك';

// A BUTTON tap is unambiguous, so its label is matched permissively at runtime —
// "Stop promotions" would never match the anchored free-text rule. `cancel` is
// deliberately absent: a "Cancel" button usually means cancel-the-booking.
const STOP_BUTTON_WORDS = /(stop|unsubscribe|opt\s*out|إلغاء|ايقاف|إيقاف|توقف)/i;

export const isOptOutButtonLabel = (label: string): boolean =>
  STOP_BUTTON_WORDS.test(label ?? '');

// Author-time cue: bare "stop" needs an instruction verb beside it, because
// marketing copy says "STOP paying rent" — without that guard the mandate would
// pass on a template offering no exit at all.
const OPT_OUT_CUE = new RegExp(
  [
    '\\bunsubscribe\\b',
    '\\bopt[\\s-]?out\\b',
    '\\b(?:reply|send|text|type|message)\\b[^\\n]{0,24}?\\bstop\\b',
    '(?:أرسل|ارسل|اكتب|رد|للإلغاء|للالغاء|لإلغاء)[\\s\\S]{0,24}?(?:إيقاف|ايقاف|إلغاء|الغاء|توقف|stop)',
    'إلغاء الاشتراك',
  ].join('|'),
  'i',
);

export const hasOptOutCue = (text: string): boolean => OPT_OUT_CUE.test(text ?? '');

const isArabicLocale = (language: string): boolean =>
  /^ar(_|$)/i.test((language ?? '').trim());

// ur/hi/fa fall back to the English line on purpose: Latin "STOP" is typeable on
// every keyboard and IS in the honoured set; there are no ur/hi/fa stop words yet.
export const optOutFooterFor = (language: string): string =>
  isArabicLocale(language) ? WA_OPT_OUT_FOOTER_AR : WA_OPT_OUT_FOOTER_EN;

export const optOutButtonFor = (language: string): string =>
  isArabicLocale(language) ? WA_OPT_OUT_BUTTON_AR : WA_OPT_OUT_BUTTON_EN;

/** Does this template already offer an exit — footer, body copy, or a
 * quick-reply button the runtime will actually honour? */
export const hasOptOutAffordance = (input: WaTemplateCreateInput): boolean =>
  hasOptOutCue(input.footer ?? '') ||
  hasOptOutCue(input.bodyText ?? '') ||
  (input.buttons ?? []).some(
    (b) => b.type === 'QUICK_REPLY' && isOptOutButtonLabel(b.text ?? ''),
  );

export type OptOutAddition = 'FOOTER' | 'FOOTER_APPENDED' | 'BUTTON' | null;

/**
 * Normalize a create-input so a MARKETING template carries an opt-out, adding
 * the standard one when the author didn't. Cascade: already-compliant → a free
 * button slot gets a quick-reply opt-out BUTTON (the default, appended last) →
 * all 10 slots used, so the footer gets the line (set, or appended if it fits) →
 * nowhere to put it (validateCreateInput then blocks). UTILITY / AUTHENTICATION
 * are left alone: they are transactional, Meta does not require an opt-out, and
 * inviting a STOP there would suppress messages people actually want.
 */
export const ensureOptOut = (
  input: WaTemplateCreateInput,
): { input: WaTemplateCreateInput; added: OptOutAddition } => {
  if (input.category !== 'MARKETING') return { input, added: null };
  if (hasOptOutAffordance(input)) return { input, added: null };

  const buttons = input.buttons ?? [];
  if (buttons.length < WA_BUTTONS_MAX) {
    return {
      input: {
        ...input,
        buttons: [
          ...buttons,
          { type: 'QUICK_REPLY', text: optOutButtonFor(input.language ?? '') },
        ],
      },
      added: 'BUTTON',
    };
  }

  const line = optOutFooterFor(input.language ?? '');
  const footer = (input.footer ?? '').trim();
  if (!footer) return { input: { ...input, footer: line }, added: 'FOOTER' };

  const combined = `${footer} · ${line}`;
  if (combined.length <= WA_FOOTER_MAX)
    return { input: { ...input, footer: combined }, added: 'FOOTER_APPENDED' };

  return { input, added: null };
};

/** Plain-language note about what was added on the operator's behalf. */
export const optOutAdditionNote = (added: OptOutAddition): string | null => {
  if (added === 'BUTTON')
    return 'An opt-out button was added — every marketing message must offer a way out.';
  if (added === 'FOOTER')
    return 'All 10 button slots were used, so an opt-out line was added to the footer instead — every marketing message must offer a way out.';
  if (added === 'FOOTER_APPENDED')
    return 'All 10 button slots were used, so an opt-out line was added to the end of your footer instead — every marketing message must offer a way out.';
  return null;
};

// ── Meta caps (Templates > Components; WhatsApp Cloud API docs) ─────────────────
export const WA_NAME_RE = /^[a-z0-9_]+$/;
export const WA_TEMPLATE_NAME_MAX = 512;
export const WA_BODY_MAX = 1024;
export const WA_HEADER_TEXT_MAX = 60;
export const WA_FOOTER_MAX = 60;
export const WA_BUTTON_TEXT_MAX = 25;
export const WA_BUTTONS_MAX = 10;
export const WA_URL_BUTTONS_MAX = 2;
export const WA_PHONE_BUTTONS_MAX = 1;
const META_LOCALE_RE = /^[a-z]{2,3}(_[A-Z]{2})?$/;

// distinct, sorted {{n}} numbers in a body (1-based).
export const distinctBodyParams = (body: string): number[] =>
  [...new Set(placeholderNumbers(body))].sort((a, b) => a - b);

/** Body placeholders are valid for SUBMISSION when the distinct {{n}} set is
 * exactly {1..k} for some k ≥ 0. k = the number of body example values Meta needs. */
export const bodyParamCount = (body: string): { ok: boolean; count: number } => {
  const nums = distinctBodyParams(body);
  const count = nums.length;
  const ok = nums.every((n, i) => n === i + 1);
  return { ok, count };
};

// ── Meta component types (what we POST) ────────────────────────────────────────
type MetaComponent = Record<string, unknown>;

/** Assemble the Meta `components` array in render order (HEADER → BODY → FOOTER →
 * BUTTONS). Assumes validateCreateInput already passed. */
export const assembleComponents = (
  input: WaTemplateCreateInput,
): MetaComponent[] => {
  const components: MetaComponent[] = [];

  if (input.header) {
    if (input.header.format === 'TEXT') {
      const text = (input.header.text ?? '').trim();
      const hasVar = distinctBodyParams(text).length === 1;
      const header: MetaComponent = { type: 'HEADER', format: 'TEXT', text };
      const ex = (input.header.example ?? '').trim();
      if (hasVar && ex) header.example = { header_text: [ex] };
      components.push(header);
    } else {
      const header: MetaComponent = {
        type: 'HEADER',
        format: input.header.format,
      };
      const handle = (input.header.example ?? '').trim();
      if (handle) header.example = { header_handle: [handle] };
      components.push(header);
    }
  }

  const body: MetaComponent = { type: 'BODY', text: (input.bodyText ?? '').trim() };
  const examples = (input.bodyExample ?? [])
    .map((v) => (v ?? '').trim())
    .filter((v) => v !== '');
  if (examples.length > 0) body.example = { body_text: [examples] };
  components.push(body);

  const footer = (input.footer ?? '').trim();
  if (footer) components.push({ type: 'FOOTER', text: footer });

  const buttons = input.buttons ?? [];
  if (buttons.length > 0) {
    const metaButtons: MetaComponent[] = buttons.map((b) => {
      if (b.type === 'QUICK_REPLY')
        return { type: 'QUICK_REPLY', text: (b.text ?? '').trim() };
      if (b.type === 'URL') {
        const out: MetaComponent = {
          type: 'URL',
          text: (b.text ?? '').trim(),
          url: (b.url ?? '').trim(),
        };
        const ex = (b.example ?? '').trim();
        if (ex) out.example = [ex];
        return out;
      }
      return {
        type: 'PHONE_NUMBER',
        text: (b.text ?? '').trim(),
        phone_number: (b.phoneNumber ?? '').trim(),
      };
    });
    components.push({ type: 'BUTTONS', buttons: metaButtons });
  }

  return components;
};

// ── hasUnsupportedComponents (wa-template-sync) ─────────────────────────────────
// Operates on the assembled component array (our POST shape uses `phone_number`
// and a `buttons` sub-array), checking for components the WhatsApp campaign sender
// can't fill: a media or variable-text HEADER, or a dynamic-URL BUTTON.
const HAS_PLACEHOLDER = /\{\{\s*\d+\s*\}\}/;

export const hasUnsupportedComponents = (components: MetaComponent[]): boolean => {
  for (const cc of components ?? []) {
    const type = String(cc.type ?? '').toUpperCase();
    if (type === 'BODY' || type === 'FOOTER') continue;
    if (type === 'HEADER') {
      if (String(cc.format ?? 'TEXT').toUpperCase() !== 'TEXT') return true;
      if (HAS_PLACEHOLDER.test(String(cc.text ?? ''))) return true;
      continue;
    }
    if (type === 'BUTTONS') {
      const btns = (cc.buttons as { url?: string }[] | undefined) ?? [];
      for (const b of btns) {
        if (HAS_PLACEHOLDER.test(String(b.url ?? ''))) return true;
      }
      continue;
    }
    return true;
  }
  return false;
};

/** Validate the whole input against Meta's caps. Returns human-readable problems;
 * [] = ready to submit. Mirrors what Meta enforces so the operator sees it first;
 * Meta's own verdict still governs (the route returns its message verbatim). */
export const validateCreateInput = (input: WaTemplateCreateInput): string[] => {
  const problems: string[] = [];
  const name = (input.name ?? '').trim();
  if (!name) problems.push('Template name is required.');
  else if (!WA_NAME_RE.test(name))
    problems.push(
      'Template name must be lowercase letters, digits and underscores (Meta format), e.g. listing_launch_en.',
    );
  else if (name.length > WA_TEMPLATE_NAME_MAX)
    problems.push(`Template name is too long (max ${WA_TEMPLATE_NAME_MAX}).`);

  const language = (input.language ?? '').trim();
  if (!language) problems.push('Language is required.');
  else if (!META_LOCALE_RE.test(language))
    problems.push(`Language "${language}" is not a Meta locale (e.g. en_US, ar).`);

  if (!['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(input.category)) {
    problems.push(
      `Category "${input.category}" is invalid (MARKETING, UTILITY or AUTHENTICATION).`,
    );
  }

  const body = (input.bodyText ?? '').trim();
  if (!body) problems.push('Body text is required.');
  else if (body.length > WA_BODY_MAX)
    problems.push(`Body is too long (${body.length}/${WA_BODY_MAX}).`);
  const { ok: bodyOk, count } = bodyParamCount(input.bodyText ?? '');
  if (!bodyOk) {
    problems.push(
      'Body placeholders must be {{1}}…{{n}} in order — no gaps, no {{0}}, no out-of-range numbers.',
    );
  } else if (count > 0) {
    const examples = (input.bodyExample ?? []).map((v) => (v ?? '').trim());
    if (examples.length !== count) {
      problems.push(
        `Provide one example value for each placeholder ({{1}}…{{${count}}}) — ${examples.length} given, ${count} needed.`,
      );
    } else if (examples.some((v) => v === '')) {
      problems.push(
        'Every placeholder example value must be non-empty (Meta rejects blank examples).',
      );
    }
  }

  const paramMap = input.paramMap;
  if (paramMap !== undefined) {
    const mapProblems = validateParamMapForDrain(paramMap);
    if (mapProblems.length > 0)
      problems.push(`Bound fields invalid: ${mapProblems.join('; ')}`);
    if (!bodyPlaceholdersValid(input.bodyText ?? '', paramMap.length)) {
      problems.push(
        `Each {{n}} must bind a send field: {{1}}…{{${paramMap.length}}} must all appear, numbered in range — no gaps, no {{0}}. Bind ${count} field(s) to match the body.`,
      );
    }
  } else if (bodyOk && count > 0) {
    problems.push(
      `The body has ${count} placeholder(s) but no send fields are bound — bind a field for each {{n}} so the message can fill them.`,
    );
  }

  if (input.header) {
    if (input.header.format === 'TEXT') {
      const ht = (input.header.text ?? '').trim();
      if (!ht) problems.push('A text header must have text.');
      else if (ht.length > WA_HEADER_TEXT_MAX)
        problems.push(
          `Header text is too long (${ht.length}/${WA_HEADER_TEXT_MAX}).`,
        );
      const headerNums = distinctBodyParams(input.header.text ?? '');
      if (
        headerNums.length > 1 ||
        (headerNums.length === 1 && headerNums[0] !== 1)
      ) {
        problems.push('A text header may use at most one variable, written {{1}}.');
      } else if (
        headerNums.length === 1 &&
        !(input.header.example ?? '').trim()
      ) {
        problems.push('The header variable {{1}} needs an example value.');
      }
    }
  }

  if (input.footer != null && input.footer.trim().length > WA_FOOTER_MAX) {
    problems.push(
      `Footer is too long (${input.footer.trim().length}/${WA_FOOTER_MAX}).`,
    );
  }

  const buttons = input.buttons ?? [];
  if (buttons.length > WA_BUTTONS_MAX)
    problems.push(`Too many buttons (${buttons.length}/${WA_BUTTONS_MAX}).`);
  const urlCount = buttons.filter((b) => b.type === 'URL').length;
  const phoneCount = buttons.filter((b) => b.type === 'PHONE_NUMBER').length;
  if (urlCount > WA_URL_BUTTONS_MAX)
    problems.push(`At most ${WA_URL_BUTTONS_MAX} URL buttons (got ${urlCount}).`);
  if (phoneCount > WA_PHONE_BUTTONS_MAX)
    problems.push(
      `At most ${WA_PHONE_BUTTONS_MAX} call button (got ${phoneCount}).`,
    );
  buttons.forEach((b, i) => {
    const label = (b.text ?? '').trim();
    if (!label) problems.push(`Button ${i + 1} needs label text.`);
    else if (label.length > WA_BUTTON_TEXT_MAX)
      problems.push(
        `Button ${i + 1} label is too long (${label.length}/${WA_BUTTON_TEXT_MAX}).`,
      );
    if (b.type === 'URL' && !(b.url ?? '').trim())
      problems.push(`URL button ${i + 1} needs a URL.`);
    if (b.type === 'PHONE_NUMBER' && !(b.phoneNumber ?? '').trim())
      problems.push(`Call button ${i + 1} needs a phone number.`);
  });

  // Drain-supportability — the WhatsApp send path supplies BODY params ONLY, so a
  // media/variable-text HEADER or a dynamic-URL BUTTON would make Meta reject the
  // send. Only run once the structural checks pass.
  if (problems.length === 0 && hasUnsupportedComponents(assembleComponents(input))) {
    problems.push(
      'This template uses a component the WhatsApp campaign sender can’t fill yet — a media or variable header, or a dynamic-link button. Use a static text header and static buttons, with variables only in the body.',
    );
  }

  // Mandatory exit on MARKETING. Callers run ensureOptOut BEFORE this, which adds
  // the standard footer (or button) automatically — so reaching here means there
  // was nowhere to put one: a full 60-character footer AND all 10 button slots
  // used. Same rule, same wording, as the server-side create route.
  if (input.category === 'MARKETING' && !hasOptOutAffordance(input)) {
    problems.push(
      'A marketing template must tell people how to stop receiving messages. Add an opt-out button, or “Reply STOP to unsubscribe” to the footer — all 10 button slots are used and the footer is full, so free one of them up first.',
    );
  }

  return problems;
};
