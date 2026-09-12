// A type-only import: the whole statement is erased at runtime, so this module
// loads under `node --test --experimental-strip-types` (which cannot resolve the
// `@/` alias) while keeping the repo's import convention.
import type { A2ADocumentStatus, DealStateAgreement } from '@/propel/types/a2a';

// Task 52 (2026-09-12) — what to do with an agreement the deal already has.
//
// Proven on prod: after the first real agreement reached OUT_FOR_SIGNATURE,
// reopening the Studio on that deal rendered the blank prepare form with a
// "Create draft" button and no sign of it. An agent who navigates away and comes
// back would make a second agreement for the same deal.
//
// Kept out of the hook so the decision can be exercised without a renderer, and
// because one of its rules protects a real document (see `markSent`).

export type ResumeDraft = {
  a2aDocumentId: string;
  documensoDocumentId: string;
};

export type ResumePlan =
  | {
      kind: 'resume';
      step: 'send' | 'done';
      status: A2ADocumentStatus;
      draft: ResumeDraft;
      shareUrl: string | null;
      signedPdfUrl: string | null;
      auditUrl: string | null;
      /** ⚠️ ALWAYS true. The hook discards an UN-SENT draft when the page
       * unmounts (orphan cleanup). A resumed agreement that did not carry this
       * would be voided at Documenso by an agent opening the deal and navigating
       * away — the cleanup cannot tell the two apart on its own. */
      markSent: true;
    }
  | { kind: 'notice'; status: string; createdAt: string | null }
  | { kind: 'fresh' };

/** Statuses where the agreement is live and the screen should pick it up. */
const RESUMABLE: Record<string, 'send' | 'done'> = {
  OUT_FOR_SIGNATURE: 'send',
  SIGNED: 'done',
};

export const planResume = (
  agreement: DealStateAgreement | null | undefined,
): ResumePlan => {
  if (agreement == null) return { kind: 'fresh' };
  const status = agreement.status ?? '';
  const step = RESUMABLE[status];
  if (step === undefined) {
    // DRAFT, GENERATED, or anything this build does not recognise: report it.
    // Continuing an old draft would be a guess — its Documenso document may be
    // long gone — and ignoring it is how a deal ends up with two agreements.
    return { kind: 'notice', status: status || 'DRAFT', createdAt: agreement.createdAt ?? null };
  }
  return {
    kind: 'resume',
    step,
    status: status as A2ADocumentStatus,
    draft: {
      a2aDocumentId: agreement.a2aDocumentId,
      documensoDocumentId: agreement.documensoDocumentId ?? '',
    },
    shareUrl: agreement.counterpartySigningUrl ?? null,
    signedPdfUrl: agreement.signedPdfUrl ?? null,
    auditUrl: agreement.auditUrl ?? null,
    markSent: true,
  };
};
