// Moved to ../desk/kit.tsx (the neutral shared "control-room" kit — see
// docs/superpowers/plans/2026-07-10-marketing-engine-implementation-plan.md
// Wave 0). This shim keeps every existing `marketingHero/deskShared` import
// working (BlogTab, LandingPagesTab, CampaignReviewPanel, MyDeskHome, etc.).
// New code imports from '@/propel/components/desk'.
export * from '../desk/kit';
