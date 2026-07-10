import {
  WIZARD_STEPS,
  canProceed,
  defaultWaMessage,
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
  it('greets the client by first name and includes every project name and url', () => {
    const s = {
      ...initWizard([7, 9]),
      client: { id: 'p1', name: 'Nancy Al Habtoor', phoneE164: '+9715' },
    };
    const msg = defaultWaMessage(
      s,
      ['Marina Vista', 'Palm Crest'],
      ['https://x/a.pdf', 'https://x/b.pdf'],
    );
    expect(msg).toContain('Hi Nancy');
    expect(msg).toContain('Marina Vista');
    expect(msg).toContain('Palm Crest');
    expect(msg).toContain('https://x/a.pdf');
    expect(msg).toContain('https://x/b.pdf');
  });

  it('omits the personal greeting when no client is attached', () => {
    const s = initWizard([7]);
    const msg = defaultWaMessage(s, ['Marina Vista'], ['https://x/a.pdf']);
    expect(msg).not.toMatch(/Hi\s+\w+,/); // no "Hi <name>,"
    expect(msg).toContain('https://x/a.pdf');
  });

  it('still includes urls that outnumber project names', () => {
    const s = initWizard([7, 9]);
    const msg = defaultWaMessage(s, ['Marina Vista'], ['https://x/a.pdf', 'https://x/b.pdf']);
    expect(msg).toContain('https://x/a.pdf');
    expect(msg).toContain('https://x/b.pdf');
  });
});
