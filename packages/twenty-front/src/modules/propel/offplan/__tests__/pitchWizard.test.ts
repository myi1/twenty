import {
  WIZARD_STEPS,
  canProceed,
  defaultWaMessage,
  ensurePitchLinks,
  gotoStep,
  initWizard,
  nextStep,
  prevStep,
  removeProject,
} from '../pitchWizard';

describe('initWizard', () => {
  it('dedups project ids preserving order and applies defaults', () => {
    const s = initWizard([7, 9, 7, 3, 9]);
    expect(s.projectIds).toEqual([7, 9, 3]);
    expect(s.step).toBe(0);
    expect(s.theme).toBe('nocturne');
    expect(s.language).toBe('English');
    expect(s.currency).toBe('AED');
    expect(s.hideDeveloper).toBe(false);
    expect(s.client).toBeNull();
    expect(s.clientSkipped).toBe(false);
    expect(s.coverNote).toBe('');
    expect(s.waMessage).toBe('');
    expect(s.generated).toEqual([]);
    expect(s.sections).toEqual({
      cover: true,
      districtIntro: true,
      projectPages: true,
      units: true,
      layouts: true,
      amenities: true,
      paymentPlan: true,
      areaStrength: false,
      investorRoi: false,
    });
  });

  it('records the anchor unit when provided', () => {
    const s = initWizard([7, 9], { projectId: 7, unitId: 42 });
    expect(s.anchorUnits[7]).toBe(42);
    expect(s.anchorUnits[9]).toBeUndefined();
  });

  it('ignores an anchor without a unitId', () => {
    const s = initWizard([7], { projectId: 7 });
    expect(s.anchorUnits[7]).toBeUndefined();
  });
});

describe('removeProject', () => {
  it('removes the project and clears its anchor', () => {
    const s = initWizard([7, 9], { projectId: 7, unitId: 42 });
    const next = removeProject(s, 7);
    expect(next.projectIds).toEqual([9]);
    expect(next.anchorUnits[7]).toBeUndefined();
    // untouched original (pure)
    expect(s.projectIds).toEqual([7, 9]);
    expect(s.anchorUnits[7]).toBe(42);
  });

  it('an emptied selection blocks proceeding from step 0', () => {
    const s = removeProject(initWizard([7]), 7);
    expect(s.projectIds).toEqual([]);
    expect(canProceed(s)).toBe(false);
  });
});

describe('canProceed', () => {
  it('gates step 0 on a non-empty selection', () => {
    expect(canProceed(initWizard([]))).toBe(false);
    expect(canProceed(initWizard([7]))).toBe(true);
  });

  it('gates step 1 on client picked OR explicitly skipped', () => {
    const s = { ...initWizard([7]), step: 1 };
    expect(canProceed(s)).toBe(false);
    expect(
      canProceed({
        ...s,
        client: { id: 'p1', name: 'Nancy Doe', phoneE164: '+9715' },
      }),
    ).toBe(true);
    expect(canProceed({ ...s, clientSkipped: true })).toBe(true);
  });

  it('always allows steps 2..4', () => {
    const s = initWizard([7]);
    for (const step of [2, 3, 4]) {
      expect(canProceed({ ...s, step })).toBe(true);
    }
  });
});

describe('step navigation', () => {
  it('nextStep/prevStep move within 0..4 and clamp at the edges', () => {
    let s = initWizard([7]);
    s = nextStep(s);
    expect(s.step).toBe(1);
    s = prevStep(s);
    expect(s.step).toBe(0);
    s = prevStep(s);
    expect(s.step).toBe(0); // clamped low
    s = gotoStep(s, WIZARD_STEPS.length - 1);
    s = nextStep(s);
    expect(s.step).toBe(WIZARD_STEPS.length - 1); // clamped high
  });

  it('gotoStep clamps out-of-range targets', () => {
    const s = initWizard([7]);
    expect(gotoStep(s, -3).step).toBe(0);
    expect(gotoStep(s, 99).step).toBe(4);
    expect(gotoStep(s, 2).step).toBe(2);
  });
});

describe('defaultWaMessage', () => {
  it('greets the client by first name and lists each pair as name — url', () => {
    const s = {
      ...initWizard([7, 9]),
      client: { id: 'p1', name: 'Nancy Al Habtoor', phoneE164: '+9715' },
    };
    const msg = defaultWaMessage(s, [
      { name: 'Marina Vista', url: 'https://x/a.pdf' },
      { name: 'Palm Crest', url: 'https://x/b.pdf' },
    ]);
    expect(msg).toContain('Hi Nancy');
    expect(msg).toContain('• Marina Vista — https://x/a.pdf');
    expect(msg).toContain('• Palm Crest — https://x/b.pdf');
  });

  it('omits the personal greeting when no client is attached', () => {
    const s = initWizard([7]);
    const msg = defaultWaMessage(s, [{ name: 'Marina Vista', url: 'https://x/a.pdf' }]);
    expect(msg).not.toMatch(/Hi\s+\w+,/); // no "Hi <name>,"
    expect(msg).toContain('https://x/a.pdf');
  });

  it('partial failure: only successful projects appear, each name next to ITS url', () => {
    // 3 projects selected, generation succeeded for #7 and #3 only —
    // the message is built from success PAIRS, never from the full selection
    // zipped against a shorter url list (which mispaired names and urls).
    const s = initWizard([7, 9, 3]);
    const msg = defaultWaMessage(s, [
      { name: 'Marina Vista', url: 'https://x/a.pdf' },
      { name: 'Golf Greens', url: 'https://x/c.pdf' },
    ]);
    expect(msg).toContain('• Marina Vista — https://x/a.pdf');
    expect(msg).toContain('• Golf Greens — https://x/c.pdf');
    expect(msg).not.toContain('Palm Crest'); // the failed project never appears
    // and no cross-pairing: Golf Greens must NOT sit next to a.pdf
    expect(msg).not.toContain('Golf Greens — https://x/a.pdf');
    expect(msg).not.toContain('Marina Vista — https://x/c.pdf');
  });

  it('uses singular copy for one pair, plural for many', () => {
    const s = initWizard([7]);
    expect(
      defaultWaMessage(s, [{ name: 'Marina Vista', url: 'https://x/a.pdf' }]),
    ).toContain('Here is the presentation');
    expect(
      defaultWaMessage(s, [
        { name: 'Marina Vista', url: 'https://x/a.pdf' },
        { name: 'Palm Crest', url: 'https://x/b.pdf' },
      ]),
    ).toContain('Here are the presentations');
  });
});

describe('ensurePitchLinks', () => {
  const pairs = [
    { name: 'Marina Vista', url: 'https://x/a.pdf' },
    { name: 'Palm Crest', url: 'https://x/b.pdf' },
  ];

  it('appends the links block when the base message has no link', () => {
    const out = ensurePitchLinks('Hi Nancy, sharing two great options.', pairs);
    expect(out).toContain('Hi Nancy, sharing two great options.');
    expect(out).toContain('• Marina Vista — https://x/a.pdf');
    expect(out).toContain('• Palm Crest — https://x/b.pdf');
    // links come AFTER the base message
    expect(out.indexOf('https://x/a.pdf')).toBeGreaterThan(out.indexOf('options.'));
  });

  it('leaves a message that already contains a link untouched', () => {
    const base = 'Hi,\n• Marina Vista — https://x/a.pdf';
    expect(ensurePitchLinks(base, pairs)).toBe(base);
  });

  it('is a no-op when there are no pairs', () => {
    expect(ensurePitchLinks('Hi Nancy.', [])).toBe('Hi Nancy.');
  });
});
