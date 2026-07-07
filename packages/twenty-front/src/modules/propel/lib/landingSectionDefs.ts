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

export const LANDING_SECTION_TYPES = [
  'hero',
  'leadForm',
  'listingsGrid',
  'marketReport',
  'testimonial',
  'faq',
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
