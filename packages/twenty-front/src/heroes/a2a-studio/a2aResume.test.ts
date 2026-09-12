// Task 52 — what the Studio does with an agreement the deal already has.
//
// Proven on prod 2026-09-12: reopening the Studio on a deal whose agreement was
// already OUT_FOR_SIGNATURE showed the blank prepare form and a "Create draft"
// button. The decision below is the whole fix, kept out of the hook so it can be
// exercised without a renderer.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { planResume } from '../../modules/propel/lib/a2aResume.ts';

const OUT = {
  a2aDocumentId: 'a2a-1',
  status: 'OUT_FOR_SIGNATURE' as const,
  documensoDocumentId: '78',
  counterpartySigningUrl: 'https://sign.postbuild.ae/sign/LIVE',
  signedPdfUrl: null,
  auditUrl: null,
  createdAt: '2026-09-12T12:12:09.136Z',
};

describe('planResume', () => {
  it('an agreement out for signature is resumed at the sharing step, with its live link', () => {
    const plan = planResume(OUT);
    assert.equal(plan.kind, 'resume');
    if (plan.kind !== 'resume') return;
    assert.equal(plan.step, 'send');
    assert.equal(plan.status, 'OUT_FOR_SIGNATURE');
    assert.equal(plan.shareUrl, 'https://sign.postbuild.ae/sign/LIVE');
    assert.equal(plan.draft.a2aDocumentId, 'a2a-1');
    assert.equal(plan.draft.documensoDocumentId, '78', 'send and discard both need this id');
  });

  // ── THE ONE THAT WOULD DESTROY AN AGREEMENT ───────────────────────────────
  it('a resumed agreement is marked as already sent, so leaving the page cannot discard it', () => {
    // The hook discards an UN-SENT draft on unmount (orphan cleanup). A resumed
    // agreement that did not carry this flag would be voided at Documenso by an
    // agent simply opening the deal and navigating away.
    assert.equal(planResume(OUT).kind === 'resume' && planResume(OUT).markSent, true);
    const signed = planResume({ ...OUT, status: 'SIGNED' });
    assert.equal(signed.kind === 'resume' && signed.markSent, true);
  });

  it('a signed agreement opens on the finished step with its PDF and audit links', () => {
    const plan = planResume({ ...OUT, status: 'SIGNED', signedPdfUrl: 'https://x/pdf', auditUrl: 'https://x/audit' });
    assert.equal(plan.kind, 'resume');
    if (plan.kind !== 'resume') return;
    assert.equal(plan.step, 'done');
    assert.equal(plan.signedPdfUrl, 'https://x/pdf');
    assert.equal(plan.auditUrl, 'https://x/audit');
  });

  it('an older unfinished draft is REPORTED, never silently continued', () => {
    // Its Documenso draft may be long gone; continuing it would be a guess. The
    // screen warns instead, which is all the prod defect needed.
    for (const status of ['DRAFT', 'GENERATED']) {
      const plan = planResume({ ...OUT, status: status as 'DRAFT' });
      assert.equal(plan.kind, 'notice', status);
      if (plan.kind !== 'notice') continue;
      assert.equal(plan.status, status);
      assert.equal(plan.createdAt, OUT.createdAt);
    }
  });

  it('no agreement at all → a fresh start, which is the normal case', () => {
    assert.equal(planResume(null).kind, 'fresh');
    assert.equal(planResume(undefined).kind, 'fresh');
  });

  it('an unrecognised status is reported rather than resumed or ignored', () => {
    const plan = planResume({ ...OUT, status: 'SOMETHING_NEW' as 'DRAFT' });
    assert.equal(plan.kind, 'notice', 'never silently offer a second agreement');
  });

  it('a row without a Documenso id still resumes — the link is the useful part', () => {
    const plan = planResume({ ...OUT, documensoDocumentId: null });
    assert.equal(plan.kind, 'resume');
    if (plan.kind !== 'resume') return;
    assert.equal(plan.draft.documensoDocumentId, '');
  });
});
