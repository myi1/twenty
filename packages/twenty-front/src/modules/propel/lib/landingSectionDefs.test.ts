import {
  LANDING_SECTION_DEFS,
  LANDING_SECTION_TYPES,
  sectionDef,
  seedSectionsFromPrompt,
} from './landingSectionDefs';

// The canonical 22-type literal — hardcoded here (NOT imported from the module
// under test) so this file is an independent oracle. Must stay character-for-
// character equal to the site's SECTION_TYPES and the CRM section cards.
// `legalFooter` is intentionally absent (auto-appended, never addable → no def).
const CANONICAL_SECTION_TYPES = [
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

describe('landing section defs — parity', () => {
  it('the exported type list equals the canonical 22-type literal (order-exact)', () => {
    expect([...LANDING_SECTION_TYPES]).toEqual([...CANONICAL_SECTION_TYPES]);
  });

  it('never lists legalFooter (auto-appended, no manual-form def)', () => {
    expect(LANDING_SECTION_TYPES).not.toContain('legalFooter');
  });

  it('defs cover exactly the 22 canonical types (no missing, no orphan)', () => {
    const defTypes = LANDING_SECTION_DEFS.map((d) => d.type).sort();
    expect(defTypes).toEqual([...CANONICAL_SECTION_TYPES].sort());
  });

  it('has exactly one def per type (no duplicates)', () => {
    const defTypes = LANDING_SECTION_DEFS.map((d) => d.type);
    expect(new Set(defTypes).size).toBe(defTypes.length);
    expect(defTypes.length).toBe(CANONICAL_SECTION_TYPES.length);
  });
});

describe('landing section defs — shape integrity', () => {
  for (const def of LANDING_SECTION_DEFS) {
    it(`${def.type}: has label, description and non-empty scalar keys`, () => {
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
      for (const f of def.scalarFields) expect(f.key.length).toBeGreaterThan(0);
    });

    it(`${def.type}: defaultProps includes the rows-group key as an array (when a rows group exists)`, () => {
      if (def.rows) {
        expect(Array.isArray(def.defaultProps[def.rows.key])).toBe(true);
      }
    });
  }
});

describe('landing section defs — key contracts (site prop parity)', () => {
  // Assert the load-bearing prop keys the site renderers read, per the plan's
  // "Tasks 3-16" contracts. This is the character-for-character check.
  const scalars = (t: string) => sectionDef(t as never).scalarFields.map((f) => f.key);
  const rowKey = (t: string) => sectionDef(t as never).rows?.key;
  const rowCols = (t: string) => sectionDef(t as never).rows?.columns.map((c) => c.key) ?? [];

  it('videoHero scalars', () => {
    expect(scalars('videoHero')).toEqual([
      'headline',
      'subheadline',
      'videoUrl',
      'posterUrl',
      'ctaLabel',
      'ctaHref',
    ]);
  });
  it('gallery images rows', () => {
    expect(rowKey('gallery')).toBe('images');
    expect(rowCols('gallery')).toEqual(['src', 'alt', 'caption']);
  });
  it('developerStrip logos rows', () => {
    expect(rowKey('developerStrip')).toBe('logos');
    expect(rowCols('developerStrip')).toEqual(['src', 'alt', 'href']);
  });
  it('uspGrid items rows', () => {
    expect(rowKey('uspGrid')).toBe('items');
    expect(rowCols('uspGrid')).toEqual(['title', 'body', 'icon']);
  });
  it('comparisonTable rows', () => {
    expect(rowKey('comparisonTable')).toBe('rows');
    expect(rowCols('comparisonTable')).toEqual(['label', 'a', 'b']);
  });
  it('timeline milestones rows', () => {
    expect(rowKey('timeline')).toBe('milestones');
    expect(rowCols('timeline')).toEqual(['date', 'title', 'body', 'done']);
  });
  it('countdown scalars', () => {
    expect(scalars('countdown')).toEqual(['heading', 'deadlineIso', 'expiredText']);
  });
  it('paymentPlan scalars + rows', () => {
    expect(scalars('paymentPlan')).toEqual(['heading', 'subheading', 'footnote']);
    expect(rowKey('paymentPlan')).toBe('rows');
    expect(rowCols('paymentPlan')).toEqual(['stage', 'pct', 'note']);
  });
  it('floorPlans plans rows', () => {
    expect(rowKey('floorPlans')).toBe('plans');
    expect(rowCols('floorPlans')).toEqual(['label', 'imageSrc', 'area', 'beds', 'priceLabel']);
  });
  it('locationMap scalars + anchors rows', () => {
    expect(scalars('locationMap')).toEqual(['heading', 'mapEmbedUrl', 'lat', 'lng']);
    expect(rowKey('locationMap')).toBe('anchors');
    expect(rowCols('locationMap')).toEqual(['label', 'minutes']);
  });
  it('agentCards agents rows', () => {
    expect(rowKey('agentCards')).toBe('agents');
    expect(rowCols('agentCards')).toEqual(['name', 'title', 'photoSrc', 'phone', 'whatsapp']);
  });
  it('pressStrip items rows', () => {
    expect(rowKey('pressStrip')).toBe('items');
    expect(rowCols('pressStrip')).toEqual(['outlet', 'quote', 'href', 'logoSrc']);
  });
  it('stickyWhatsAppCta scalars', () => {
    expect(scalars('stickyWhatsAppCta')).toEqual(['label', 'whatsapp', 'prefill']);
  });
  it('multiStepLeadForm scalars', () => {
    expect(scalars('multiStepLeadForm')).toEqual(['heading', 'subheading', 'steps', 'submitLabel']);
  });
  it('gatedDownload scalars', () => {
    expect(scalars('gatedDownload')).toEqual([
      'heading',
      'subheading',
      'assetLabel',
      'assetUrl',
      'buttonLabel',
    ]);
  });
  it('bookingBlock scalars', () => {
    expect(scalars('bookingBlock')).toEqual(['heading', 'subheading', 'whatsapp']);
  });
});

describe('seedSectionsFromPrompt still works', () => {
  it('seeds a valid starter stack whose types are all canonical', () => {
    const seeded = seedSectionsFromPrompt('Palm Jumeirah beachfront launch');
    expect(seeded.length).toBeGreaterThan(0);
    for (const s of seeded) expect(LANDING_SECTION_TYPES).toContain(s.type);
  });
});
