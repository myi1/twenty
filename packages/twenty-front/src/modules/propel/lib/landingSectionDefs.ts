// Landing-page section catalog — the assembler half of the shared {type, props}[]
// contract (mirrors propel-crm-integration/src/shared/landing-page-core.ts and
// the site's lib/landing/sections.ts). This drives the Landing tab's form-driven
// editor: which section types exist, what scalar fields + repeatable row groups
// each exposes, and the default props when a section is added.
//
// Pure data — no React, no heavy deps. Extend LANDING_SECTION_DEFS to add a
// section type (also add it CRM-side + site-side to keep the three in lockstep).

export const LANDING_THEMES = ['NOCTURNE', 'RIVIERA', 'ATLAS'] as const;
export type LandingTheme = (typeof LANDING_THEMES)[number];

export const LANDING_STATUSES = ['DRAFT', 'LIVE', 'ARCHIVED'] as const;
export type LandingStatus = (typeof LANDING_STATUSES)[number];

// Canonical section-type list — LP Builder v2 Stage 1 (spec §7). Kept in
// lockstep with the site's SECTION_TYPES and the CRM's section cards; the
// parity tests assert equality against this same 22-string literal. Order is
// the default template display order, not semantic. `legalFooter` is
// intentionally ABSENT: it is auto-appended by the /lp page, never
// addable/removable, and therefore has no manual-form def.
export const LANDING_SECTION_TYPES = [
  'hero',
  'leadForm',
  'listingsGrid',
  'marketReport',
  'testimonial',
  'faq',
  'videoHero',
  'gallery',
  'developerStrip',
  'uspGrid',
  'comparisonTable',
  'timeline',
  'countdown',
  'paymentPlan',
  'floorPlans',
  'locationMap',
  'agentCards',
  'pressStrip',
  'stickyWhatsAppCta',
  'multiStepLeadForm',
  'gatedDownload',
  'bookingBlock',
] as const;
export type LandingSectionType = (typeof LANDING_SECTION_TYPES)[number];

export type ScalarKind = 'text' | 'textarea' | 'select';

export interface ScalarFieldDef {
  key: string;
  label: string;
  kind: ScalarKind;
  options?: string[];
  placeholder?: string;
}

export interface RowColumnDef {
  key: string;
  label: string;
  kind?: 'text' | 'textarea';
}

export interface RowGroupDef {
  key: string; // the props key holding the array
  label: string;
  addLabel: string;
  columns: RowColumnDef[];
}

export interface SectionDef {
  type: LandingSectionType;
  label: string;
  description: string;
  scalarFields: ScalarFieldDef[];
  rows?: RowGroupDef;
  defaultProps: Record<string, unknown>;
}

const LEAD_FORM_TYPES = [
  'contact',
  'consultation',
  'requirements',
  'fit-out',
  'recruitment',
  'playbook',
  'guide',
  'valuation',
];

export const LANDING_SECTION_DEFS: readonly SectionDef[] = [
  {
    type: 'hero',
    label: 'Hero',
    description: 'Headline + subheadline + CTA (optional image).',
    scalarFields: [
      { key: 'eyebrow', label: 'Eyebrow', kind: 'text', placeholder: 'New Launch' },
      { key: 'headline', label: 'Headline', kind: 'text', placeholder: 'Own a piece of the Palm' },
      { key: 'subheadline', label: 'Subheadline', kind: 'textarea' },
      { key: 'ctaLabel', label: 'CTA label', kind: 'text', placeholder: 'Enquire now' },
      { key: 'ctaHref', label: 'CTA link', kind: 'text', placeholder: '#enquire' },
      { key: 'imageUrl', label: 'Image URL', kind: 'text' },
    ],
    defaultProps: {
      eyebrow: '',
      headline: 'Own a piece of the Palm',
      subheadline: 'Limited beachfront residences with a flexible payment plan.',
      ctaLabel: 'Enquire now',
      ctaHref: '#enquire',
      imageUrl: '',
    },
  },
  {
    type: 'leadForm',
    label: 'Lead form',
    description: 'Capture form → the CRM web-lead pipeline (attributed by page slug).',
    scalarFields: [
      { key: 'heading', label: 'Heading', kind: 'text', placeholder: 'Register your interest' },
      { key: 'subheading', label: 'Subheading', kind: 'textarea' },
      { key: 'formType', label: 'Form type', kind: 'select', options: LEAD_FORM_TYPES },
      { key: 'submitLabel', label: 'Submit button label', kind: 'text', placeholder: 'Request details' },
    ],
    defaultProps: {
      heading: 'Register your interest',
      subheading: 'A RE/MAX Hub advisor will call you back within minutes.',
      formType: 'consultation',
      submitLabel: 'Request details',
    },
  },
  {
    type: 'listingsGrid',
    label: 'Listings grid',
    description: 'A grid of featured properties.',
    scalarFields: [
      { key: 'heading', label: 'Heading', kind: 'text', placeholder: 'Featured residences' },
      { key: 'subheading', label: 'Subheading', kind: 'textarea' },
    ],
    rows: {
      key: 'items',
      label: 'Listings',
      addLabel: 'Add listing',
      columns: [
        { key: 'title', label: 'Title' },
        { key: 'priceLabel', label: 'Price' },
        { key: 'imageUrl', label: 'Image URL' },
        { key: 'beds', label: 'Beds' },
        { key: 'baths', label: 'Baths' },
        { key: 'area', label: 'Area' },
        { key: 'href', label: 'Link' },
      ],
    },
    defaultProps: { heading: 'Featured residences', subheading: '', items: [] },
  },
  {
    type: 'marketReport',
    label: 'Market snapshot',
    description: 'A row of headline stats (DLD/market figures).',
    scalarFields: [
      { key: 'heading', label: 'Heading', kind: 'text', placeholder: 'The Palm in numbers' },
      { key: 'subheading', label: 'Subheading', kind: 'textarea' },
    ],
    rows: {
      key: 'stats',
      label: 'Stats',
      addLabel: 'Add stat',
      columns: [
        { key: 'label', label: 'Label' },
        { key: 'value', label: 'Value' },
        { key: 'delta', label: 'Change' },
      ],
    },
    defaultProps: { heading: 'The Palm in numbers', subheading: '', stats: [] },
  },
  {
    type: 'testimonial',
    label: 'Testimonials',
    description: 'Client quotes.',
    scalarFields: [{ key: 'heading', label: 'Heading', kind: 'text', placeholder: 'What buyers say' }],
    rows: {
      key: 'quotes',
      label: 'Quotes',
      addLabel: 'Add quote',
      columns: [
        { key: 'quote', label: 'Quote', kind: 'textarea' },
        { key: 'author', label: 'Author' },
        { key: 'role', label: 'Role' },
      ],
    },
    defaultProps: { heading: 'What buyers say', quotes: [] },
  },
  {
    type: 'faq',
    label: 'FAQ',
    description: 'Question / answer pairs (also emitted as FAQ schema).',
    scalarFields: [{ key: 'heading', label: 'Heading', kind: 'text', placeholder: 'Frequently asked questions' }],
    rows: {
      key: 'items',
      label: 'Questions',
      addLabel: 'Add question',
      columns: [
        { key: 'q', label: 'Question', kind: 'textarea' },
        { key: 'a', label: 'Answer', kind: 'textarea' },
      ],
    },
    defaultProps: { heading: 'Frequently asked questions', items: [] },
  },
  {
    type: 'videoHero',
    label: 'Video hero',
    description: 'Full-bleed autoplay background video with centered headline + CTA.',
    scalarFields: [
      { key: 'headline', label: 'Headline', kind: 'text', placeholder: 'Live the Palm' },
      { key: 'subheadline', label: 'Subheadline', kind: 'textarea' },
      { key: 'videoUrl', label: 'Video URL', kind: 'text', placeholder: 'https://…/hero.mp4' },
      { key: 'posterUrl', label: 'Poster image URL', kind: 'text' },
      { key: 'ctaLabel', label: 'CTA label', kind: 'text', placeholder: 'Enquire now' },
      { key: 'ctaHref', label: 'CTA link', kind: 'text', placeholder: '#enquire' },
    ],
    defaultProps: {
      headline: 'Live the Palm',
      subheadline: '',
      videoUrl: '',
      posterUrl: '',
      ctaLabel: 'Enquire now',
      ctaHref: '#enquire',
    },
  },
  {
    type: 'gallery',
    label: 'Gallery',
    description: 'Responsive image grid with a click-to-open lightbox.',
    scalarFields: [{ key: 'heading', label: 'Heading', kind: 'text', placeholder: 'Gallery' }],
    rows: {
      key: 'images',
      label: 'Images',
      addLabel: 'Add image',
      columns: [
        { key: 'src', label: 'Image URL' },
        { key: 'alt', label: 'Alt text' },
        { key: 'caption', label: 'Caption' },
      ],
    },
    defaultProps: { heading: 'Gallery', images: [] },
  },
  {
    type: 'developerStrip',
    label: 'Developer strip',
    description: 'Single row of developer / partner logos (grayscale → color on hover).',
    scalarFields: [{ key: 'heading', label: 'Heading', kind: 'text', placeholder: 'In partnership with' }],
    rows: {
      key: 'logos',
      label: 'Logos',
      addLabel: 'Add logo',
      columns: [
        { key: 'src', label: 'Logo URL' },
        { key: 'alt', label: 'Alt text' },
        { key: 'href', label: 'Link' },
      ],
    },
    defaultProps: { heading: 'In partnership with', logos: [] },
  },
  {
    type: 'uspGrid',
    label: 'USP grid',
    description: 'Grid of unique-selling-point cards (emoji/glyph icon + title + body).',
    scalarFields: [
      { key: 'heading', label: 'Heading', kind: 'text', placeholder: 'Why buy here' },
      { key: 'subheading', label: 'Subheading', kind: 'textarea' },
    ],
    rows: {
      key: 'items',
      label: 'Points',
      addLabel: 'Add point',
      columns: [
        { key: 'title', label: 'Title' },
        { key: 'body', label: 'Body', kind: 'textarea' },
        { key: 'icon', label: 'Icon (emoji)' },
      ],
    },
    defaultProps: { heading: 'Why buy here', subheading: '', items: [] },
  },
  {
    type: 'comparisonTable',
    label: 'Comparison table',
    description: 'Two-option comparison (first column highlighted as recommended).',
    scalarFields: [{ key: 'heading', label: 'Heading', kind: 'text', placeholder: 'Buy vs rent' }],
    rows: {
      key: 'rows',
      label: 'Rows',
      addLabel: 'Add row',
      columns: [
        { key: 'label', label: 'Row label' },
        { key: 'a', label: 'Column A value' },
        { key: 'b', label: 'Column B value' },
      ],
    },
    defaultProps: { heading: 'Buy vs rent', columns: ['Option A', 'Option B'], rows: [] },
  },
  {
    type: 'timeline',
    label: 'Timeline',
    description: 'Vertical milestone timeline (completed milestones get a filled dot).',
    scalarFields: [{ key: 'heading', label: 'Heading', kind: 'text', placeholder: 'Construction timeline' }],
    rows: {
      key: 'milestones',
      label: 'Milestones',
      addLabel: 'Add milestone',
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'title', label: 'Title' },
        { key: 'body', label: 'Body', kind: 'textarea' },
        { key: 'done', label: 'Done? (true/false)' },
      ],
    },
    defaultProps: { heading: 'Construction timeline', milestones: [] },
  },
  {
    type: 'countdown',
    label: 'Countdown',
    description: 'Live countdown to a deadline (days / hours / min / sec).',
    scalarFields: [
      { key: 'heading', label: 'Heading', kind: 'text', placeholder: 'Sales open in' },
      { key: 'deadlineIso', label: 'Deadline (ISO)', kind: 'text', placeholder: '2026-12-31T18:00:00Z' },
      { key: 'expiredText', label: 'Expired text', kind: 'text', placeholder: 'Sales are now open' },
    ],
    defaultProps: { heading: 'Sales open in', deadlineIso: '', expiredText: '' },
  },
  {
    type: 'paymentPlan',
    label: 'Payment plan',
    description: 'Payment-schedule table (stage / % / note) with optional footnote.',
    scalarFields: [
      { key: 'heading', label: 'Heading', kind: 'text', placeholder: 'Payment plan' },
      { key: 'subheading', label: 'Subheading', kind: 'textarea' },
      { key: 'footnote', label: 'Footnote', kind: 'textarea' },
    ],
    rows: {
      key: 'rows',
      label: 'Stages',
      addLabel: 'Add stage',
      columns: [
        { key: 'stage', label: 'Stage' },
        { key: 'pct', label: 'Percentage (e.g. 10%)' },
        { key: 'note', label: 'Note' },
      ],
    },
    defaultProps: { heading: 'Payment plan', subheading: '', footnote: '', rows: [] },
  },
  {
    type: 'floorPlans',
    label: 'Floor plans',
    description: 'Tabbed floor-plan viewer (label tabs + active plan image + meta).',
    scalarFields: [{ key: 'heading', label: 'Heading', kind: 'text', placeholder: 'Floor plans' }],
    rows: {
      key: 'plans',
      label: 'Plans',
      addLabel: 'Add plan',
      columns: [
        { key: 'label', label: 'Label' },
        { key: 'imageSrc', label: 'Image URL' },
        { key: 'area', label: 'Area' },
        { key: 'beds', label: 'Beds' },
        { key: 'priceLabel', label: 'Price' },
      ],
    },
    defaultProps: { heading: 'Floor plans', plans: [] },
  },
  {
    type: 'locationMap',
    label: 'Location map',
    description: 'Embedded map (Google embed or lat/lng) + nearby "X min" anchor chips.',
    scalarFields: [
      { key: 'heading', label: 'Heading', kind: 'text', placeholder: 'Location' },
      { key: 'mapEmbedUrl', label: 'Google Map embed URL', kind: 'text' },
      { key: 'lat', label: 'Latitude', kind: 'text' },
      { key: 'lng', label: 'Longitude', kind: 'text' },
    ],
    rows: {
      key: 'anchors',
      label: 'Nearby anchors',
      addLabel: 'Add anchor',
      columns: [
        { key: 'label', label: 'Place' },
        { key: 'minutes', label: 'Minutes' },
      ],
    },
    defaultProps: { heading: 'Location', mapEmbedUrl: '', lat: '', lng: '', anchors: [] },
  },
  {
    type: 'agentCards',
    label: 'Agent cards',
    description: 'Grid of agent cards (photo, name, title, call / WhatsApp links).',
    scalarFields: [{ key: 'heading', label: 'Heading', kind: 'text', placeholder: 'Meet the team' }],
    rows: {
      key: 'agents',
      label: 'Agents',
      addLabel: 'Add agent',
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'title', label: 'Title' },
        { key: 'photoSrc', label: 'Photo URL' },
        { key: 'phone', label: 'Phone' },
        { key: 'whatsapp', label: 'WhatsApp' },
      ],
    },
    defaultProps: { heading: 'Meet the team', agents: [] },
  },
  {
    type: 'pressStrip',
    label: 'Press strip',
    description: 'Muted single-row press strip (outlet / logo + optional one-line quote).',
    scalarFields: [{ key: 'heading', label: 'Heading', kind: 'text', placeholder: 'As featured in' }],
    rows: {
      key: 'items',
      label: 'Press items',
      addLabel: 'Add item',
      columns: [
        { key: 'outlet', label: 'Outlet' },
        { key: 'quote', label: 'Quote', kind: 'textarea' },
        { key: 'href', label: 'Link' },
        { key: 'logoSrc', label: 'Logo URL' },
      ],
    },
    defaultProps: { heading: 'As featured in', items: [] },
  },
  {
    type: 'stickyWhatsAppCta',
    label: 'Sticky WhatsApp CTA',
    description: 'Fixed WhatsApp CTA bar (mobile) / floating pill (desktop).',
    scalarFields: [
      { key: 'label', label: 'Label', kind: 'text', placeholder: 'Chat on WhatsApp' },
      { key: 'whatsapp', label: 'WhatsApp number', kind: 'text', placeholder: '+971 5x xxx xxxx' },
      { key: 'prefill', label: 'Prefilled message', kind: 'textarea' },
    ],
    defaultProps: { label: 'Chat on WhatsApp', whatsapp: '', prefill: '' },
  },
  {
    type: 'multiStepLeadForm',
    label: 'Multi-step lead form',
    description: 'Multi-step capture (interest + budget → contact) → the CRM web-lead pipeline.',
    scalarFields: [
      { key: 'heading', label: 'Heading', kind: 'text', placeholder: 'Find your home' },
      { key: 'subheading', label: 'Subheading', kind: 'textarea' },
      { key: 'steps', label: 'Steps', kind: 'select', options: ['2', '3'] },
      { key: 'submitLabel', label: 'Submit button label', kind: 'text', placeholder: 'Get matched' },
    ],
    defaultProps: { heading: 'Find your home', subheading: '', steps: '2', submitLabel: 'Get matched' },
  },
  {
    type: 'gatedDownload',
    label: 'Gated download',
    description: 'Email-gated asset download (fires a lead, then reveals the link).',
    scalarFields: [
      { key: 'heading', label: 'Heading', kind: 'text', placeholder: 'Download the guide' },
      { key: 'subheading', label: 'Subheading', kind: 'textarea' },
      { key: 'assetLabel', label: 'Asset label', kind: 'text', placeholder: 'Dubai Hills Buyer Guide' },
      { key: 'assetUrl', label: 'Asset URL', kind: 'text', placeholder: 'https://…/guide.pdf' },
      { key: 'buttonLabel', label: 'Button label', kind: 'text', placeholder: 'Get the guide' },
    ],
    defaultProps: {
      heading: 'Download the guide',
      subheading: '',
      assetLabel: '',
      assetUrl: '',
      buttonLabel: 'Get the guide',
    },
  },
  {
    type: 'bookingBlock',
    label: 'Booking block',
    description: 'Pick a slot + contact → the CRM web-lead pipeline (booking form type).',
    scalarFields: [
      { key: 'heading', label: 'Heading', kind: 'text', placeholder: 'Book a viewing' },
      { key: 'subheading', label: 'Subheading', kind: 'textarea' },
      { key: 'whatsapp', label: 'WhatsApp number', kind: 'text', placeholder: '+971 5x xxx xxxx' },
    ],
    defaultProps: { heading: 'Book a viewing', subheading: '', whatsapp: '' },
  },
] as const;

export const sectionDef = (type: LandingSectionType): SectionDef =>
  LANDING_SECTION_DEFS.find((d) => d.type === type) ?? LANDING_SECTION_DEFS[0];

// A prompt-stub template: given free text, seed a sensible starter stack. NOT AI
// — a deterministic scaffold the marketer then edits (the "describe the page → a
// draft appears" affordance, honestly labelled as a template in the UI).
export const seedSectionsFromPrompt = (
  prompt: string,
): { type: LandingSectionType; props: Record<string, unknown> }[] => {
  const headline = prompt.trim().slice(0, 80) || 'Your campaign headline';
  return [
    {
      type: 'hero',
      props: {
        eyebrow: '',
        headline,
        subheadline: 'Edit this starter draft — swap the copy, add sections, pick a theme.',
        ctaLabel: 'Enquire now',
        ctaHref: '#enquire',
        imageUrl: '',
      },
    },
    { type: 'marketReport', props: { heading: 'Why now', subheading: '', stats: [] } },
    {
      type: 'leadForm',
      props: {
        heading: 'Register your interest',
        subheading: '',
        formType: 'consultation',
        submitLabel: 'Request details',
      },
    },
    { type: 'faq', props: { heading: 'Frequently asked questions', items: [] } },
  ];
};
