import { Module } from '@nestjs/common';

import { RoleModule } from 'src/engine/metadata-modules/role/role.module';
import { UserRoleModule } from 'src/engine/metadata-modules/user-role/user-role.module';
import { PropelTierService } from 'src/modules/propel-rls/propel-tier.service';
import { SecondaryOpportunityRlsPreQueryHook } from 'src/modules/propel-rls/secondary-opportunity-rls.pre-query.hook';
import { SecondaryOpportunityFindOneRlsPreQueryHook } from 'src/modules/propel-rls/secondary-opportunity-find-one-rls.pre-query.hook';
import { SecondaryOpportunityGroupByRlsPreQueryHook } from 'src/modules/propel-rls/secondary-opportunity-group-by-rls.pre-query.hook';
import { SellOpportunityRlsPreQueryHook } from 'src/modules/propel-rls/sell-opportunity-rls.pre-query.hook';
import { SellOpportunityFindOneRlsPreQueryHook } from 'src/modules/propel-rls/sell-opportunity-find-one-rls.pre-query.hook';
import { SellOpportunityGroupByRlsPreQueryHook } from 'src/modules/propel-rls/sell-opportunity-group-by-rls.pre-query.hook';
import { OffPlanOpportunityRlsPreQueryHook } from 'src/modules/propel-rls/offplan-opportunity-rls.pre-query.hook';
import { OffPlanOpportunityFindOneRlsPreQueryHook } from 'src/modules/propel-rls/offplan-opportunity-find-one-rls.pre-query.hook';
import { OffPlanOpportunityGroupByRlsPreQueryHook } from 'src/modules/propel-rls/offplan-opportunity-group-by-rls.pre-query.hook';
import { InstitutionalOpportunityRlsPreQueryHook } from 'src/modules/propel-rls/institutional-opportunity-rls.pre-query.hook';
import { InstitutionalOpportunityFindOneRlsPreQueryHook } from 'src/modules/propel-rls/institutional-opportunity-find-one-rls.pre-query.hook';
import { InstitutionalOpportunityGroupByRlsPreQueryHook } from 'src/modules/propel-rls/institutional-opportunity-group-by-rls.pre-query.hook';
import { RcbiOpportunityRlsPreQueryHook } from 'src/modules/propel-rls/rcbi-opportunity-rls.pre-query.hook';
import { RcbiOpportunityFindOneRlsPreQueryHook } from 'src/modules/propel-rls/rcbi-opportunity-find-one-rls.pre-query.hook';
import { RcbiOpportunityGroupByRlsPreQueryHook } from 'src/modules/propel-rls/rcbi-opportunity-group-by-rls.pre-query.hook';
import { ListingRlsPreQueryHook } from 'src/modules/propel-rls/listing-rls.pre-query.hook';
import { ListingFindOneRlsPreQueryHook } from 'src/modules/propel-rls/listing-find-one-rls.pre-query.hook';
import { ListingGroupByRlsPreQueryHook } from 'src/modules/propel-rls/listing-group-by-rls.pre-query.hook';
import { DealRlsPreQueryHook } from 'src/modules/propel-rls/deal-rls.pre-query.hook';
import { DealFindOneRlsPreQueryHook } from 'src/modules/propel-rls/deal-find-one-rls.pre-query.hook';
import { DealGroupByRlsPreQueryHook } from 'src/modules/propel-rls/deal-group-by-rls.pre-query.hook';
import { OfferRlsPreQueryHook } from 'src/modules/propel-rls/offer-rls.pre-query.hook';
import { OfferFindOneRlsPreQueryHook } from 'src/modules/propel-rls/offer-find-one-rls.pre-query.hook';
import { OfferGroupByRlsPreQueryHook } from 'src/modules/propel-rls/offer-group-by-rls.pre-query.hook';
import { HeldMoneyRlsPreQueryHook } from 'src/modules/propel-rls/held-money-rls.pre-query.hook';
import { HeldMoneyFindOneRlsPreQueryHook } from 'src/modules/propel-rls/held-money-find-one-rls.pre-query.hook';
import { HeldMoneyGroupByRlsPreQueryHook } from 'src/modules/propel-rls/held-money-group-by-rls.pre-query.hook';
import { ChainLinkRlsPreQueryHook } from 'src/modules/propel-rls/chain-link-rls.pre-query.hook';
import { ChainLinkFindOneRlsPreQueryHook } from 'src/modules/propel-rls/chain-link-find-one-rls.pre-query.hook';
import { ChainLinkGroupByRlsPreQueryHook } from 'src/modules/propel-rls/chain-link-group-by-rls.pre-query.hook';
import { OffPlanMilestoneRlsPreQueryHook } from 'src/modules/propel-rls/offplan-milestone-rls.pre-query.hook';
import { OffPlanMilestoneFindOneRlsPreQueryHook } from 'src/modules/propel-rls/offplan-milestone-find-one-rls.pre-query.hook';
import { OffPlanMilestoneGroupByRlsPreQueryHook } from 'src/modules/propel-rls/offplan-milestone-group-by-rls.pre-query.hook';
import { PortalSyncRlsPreQueryHook } from 'src/modules/propel-rls/portal-sync-rls.pre-query.hook';
import { PortalSyncFindOneRlsPreQueryHook } from 'src/modules/propel-rls/portal-sync-find-one-rls.pre-query.hook';
import { PortalSyncGroupByRlsPreQueryHook } from 'src/modules/propel-rls/portal-sync-group-by-rls.pre-query.hook';
import { TrakheesiPermitRlsPreQueryHook } from 'src/modules/propel-rls/trakheesi-permit-rls.pre-query.hook';
import { TrakheesiPermitFindOneRlsPreQueryHook } from 'src/modules/propel-rls/trakheesi-permit-find-one-rls.pre-query.hook';
import { TrakheesiPermitGroupByRlsPreQueryHook } from 'src/modules/propel-rls/trakheesi-permit-group-by-rls.pre-query.hook';
import { StageGateService } from 'src/modules/propel-rls/stage-gate.service';
import { SecondaryOpportunityStageGatePreQueryHook } from 'src/modules/propel-rls/secondary-opportunity-stage-gate.pre-query.hook';
import { SellOpportunityStageGatePreQueryHook } from 'src/modules/propel-rls/sell-opportunity-stage-gate.pre-query.hook';
import { OffPlanOpportunityStageGatePreQueryHook } from 'src/modules/propel-rls/offplan-opportunity-stage-gate.pre-query.hook';
import { InstitutionalOpportunityStageGatePreQueryHook } from 'src/modules/propel-rls/institutional-opportunity-stage-gate.pre-query.hook';
import { RcbiOpportunityStageGatePreQueryHook } from 'src/modules/propel-rls/rcbi-opportunity-stage-gate.pre-query.hook';
import { ListingStageGatePreQueryHook } from 'src/modules/propel-rls/listing-stage-gate.pre-query.hook';
import { DealStageGatePreQueryHook } from 'src/modules/propel-rls/deal-stage-gate.pre-query.hook';
import { RcbiComplianceGateService } from 'src/modules/propel-rls/rcbi-compliance-gate.service';
import { RcbiOpportunityComplianceGatePreQueryHook } from 'src/modules/propel-rls/rcbi-opportunity-compliance-gate.pre-query.hook';
// Standard-Twenty object RLS hooks (Person / Task / TimelineActivity) — extend
// the original 14 custom-object hooks above to close the standard-object leak
// surface (an agent on the Agent role was seeing 1,649 contacts assigned to
// other agents, 1,907 other agents' tasks, and the 45k-row global activity
// log). Each uses a non-default ownerField passed through
// PropelTierService.buildTierFilter (person → assignedAgentId,
// task → assigneeId, timelineActivity → workspaceMemberId).
import { PersonRlsPreQueryHook } from 'src/modules/propel-rls/person-rls.pre-query.hook';
import { PersonFindOneRlsPreQueryHook } from 'src/modules/propel-rls/person-find-one-rls.pre-query.hook';
import { PersonGroupByRlsPreQueryHook } from 'src/modules/propel-rls/person-group-by-rls.pre-query.hook';
import { TaskRlsPreQueryHook } from 'src/modules/propel-rls/task-rls.pre-query.hook';
import { TaskFindOneRlsPreQueryHook } from 'src/modules/propel-rls/task-find-one-rls.pre-query.hook';
import { TaskGroupByRlsPreQueryHook } from 'src/modules/propel-rls/task-group-by-rls.pre-query.hook';
import { TimelineActivityRlsPreQueryHook } from 'src/modules/propel-rls/timeline-activity-rls.pre-query.hook';
import { TimelineActivityFindOneRlsPreQueryHook } from 'src/modules/propel-rls/timeline-activity-find-one-rls.pre-query.hook';
import { TimelineActivityGroupByRlsPreQueryHook } from 'src/modules/propel-rls/timeline-activity-group-by-rls.pre-query.hook';

// Propel clean-room module:
//  - RLS read-path hooks (findMany/findOne/groupBy) inject per-tier row filters.
//  - §8.3 stage-gate hooks (updateOne) block forward stage moves until the current
//    stage's task is DONE. StageGateService does the lookup (GlobalWorkspaceOrmManager
//    is @Global-exported, so no module import needed).
//  - PropelTierService resolves the per-request tier (MANAGER/AGENT) from the
//    user's Twenty role (via RoleModule's RoleService); used by both the RLS
//    read-path hooks (buildTierFilter) and the stage gate (gateBypasses).
// None derived from @license Enterprise code.
@Module({
  imports: [RoleModule, UserRoleModule],
  providers: [
    PropelTierService,
    SecondaryOpportunityRlsPreQueryHook,
    SecondaryOpportunityFindOneRlsPreQueryHook,
    SecondaryOpportunityGroupByRlsPreQueryHook,
    SellOpportunityRlsPreQueryHook,
    SellOpportunityFindOneRlsPreQueryHook,
    SellOpportunityGroupByRlsPreQueryHook,
    OffPlanOpportunityRlsPreQueryHook,
    OffPlanOpportunityFindOneRlsPreQueryHook,
    OffPlanOpportunityGroupByRlsPreQueryHook,
    InstitutionalOpportunityRlsPreQueryHook,
    InstitutionalOpportunityFindOneRlsPreQueryHook,
    InstitutionalOpportunityGroupByRlsPreQueryHook,
    RcbiOpportunityRlsPreQueryHook,
    RcbiOpportunityFindOneRlsPreQueryHook,
    RcbiOpportunityGroupByRlsPreQueryHook,
    ListingRlsPreQueryHook,
    ListingFindOneRlsPreQueryHook,
    ListingGroupByRlsPreQueryHook,
    DealRlsPreQueryHook,
    DealFindOneRlsPreQueryHook,
    DealGroupByRlsPreQueryHook,
    OfferRlsPreQueryHook,
    OfferFindOneRlsPreQueryHook,
    OfferGroupByRlsPreQueryHook,
    HeldMoneyRlsPreQueryHook,
    HeldMoneyFindOneRlsPreQueryHook,
    HeldMoneyGroupByRlsPreQueryHook,
    ChainLinkRlsPreQueryHook,
    ChainLinkFindOneRlsPreQueryHook,
    ChainLinkGroupByRlsPreQueryHook,
    OffPlanMilestoneRlsPreQueryHook,
    OffPlanMilestoneFindOneRlsPreQueryHook,
    OffPlanMilestoneGroupByRlsPreQueryHook,
    PortalSyncRlsPreQueryHook,
    PortalSyncFindOneRlsPreQueryHook,
    PortalSyncGroupByRlsPreQueryHook,
    TrakheesiPermitRlsPreQueryHook,
    TrakheesiPermitFindOneRlsPreQueryHook,
    TrakheesiPermitGroupByRlsPreQueryHook,
    SecondaryOpportunityStageGatePreQueryHook,
    SellOpportunityStageGatePreQueryHook,
    OffPlanOpportunityStageGatePreQueryHook,
    InstitutionalOpportunityStageGatePreQueryHook,
    RcbiOpportunityStageGatePreQueryHook,
    ListingStageGatePreQueryHook,
    DealStageGatePreQueryHook,
    StageGateService,
    // RCBI compliance HARD-block (FATF/PEP) — a SEPARATE updateOne hook from the
    // §8.3 task stage-gate above; both run, either can reject. Not manager-bypassable.
    RcbiComplianceGateService,
    RcbiOpportunityComplianceGatePreQueryHook,
    // Standard-Twenty object RLS hooks (own-rows-only for AGENT tier).
    PersonRlsPreQueryHook,
    PersonFindOneRlsPreQueryHook,
    PersonGroupByRlsPreQueryHook,
    TaskRlsPreQueryHook,
    TaskFindOneRlsPreQueryHook,
    TaskGroupByRlsPreQueryHook,
    TimelineActivityRlsPreQueryHook,
    TimelineActivityFindOneRlsPreQueryHook,
    TimelineActivityGroupByRlsPreQueryHook,
  ],
})
export class PropelRlsModule {}
