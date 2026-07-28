import { type LaneGateConfig } from 'src/modules/propel-rls/stage-gate.util';

// AUTO-DERIVED from the propel-crm §8.3 stage-entry emitters' NEXT_TASK_BY_STAGE
// maps (titles MUST match for the gate to find the current stage's task). If you
// change an emitter title, regenerate this. Keyed by object metadata name.
//
// 2026-06-24: rcbiOpportunity hand-synced to the lead-system RCBI stage SET
// (NEW/CONTACTED/QUALIFIED/COMPLIANCE_CHECK/CONSULTATION/PARTNER_ENGAGED/APPLICATION/
// CONVERTED, terminal ON_HOLD/LOST) and the on-rcbi-stage-entered.ts NEXT_TASK_BY_STAGE
// titles on develop (v0.5.41). The old NEW_LEAD/PARTNER_ENGAGEMENT/CONVERSION_REVENUE
// keys never matched after the lead-system rename, so the gate could not find the
// current stage's task. See propel-rls/rcbi-compliance.util.ts RCBI_STAGE_ORDER.
//
// 2026-06-24 (follow-up): secondaryOpportunity, sellOpportunity and offPlanOpportunity
// ALSO synced to the lead-system stage sets + their on-<lane>-stage-entered.ts
// NEXT_TASK_BY_STAGE titles (main == develop). The lead-system "Status≠Stage" split
// REMOVED PARKED/LOST from these `stage` enums and re-homed the off-ramp onto a
// separate `status` field (ACTIVE/ON_HOLD/LOST) — so `stage` is now pure progression
// and terminalStages reflects the status off-ramp (never a `stage` value, kept for
// intent + parity with rcbi). Until this sync the old QUALIFY/MATCH_VIEW/… keys
// never matched the live enum, so §8.3 silently did not gate these lanes.
// institutionalOpportunity, listing and deal were NOT reworked and already match.
export const STAGE_GATE_CONFIGS: Record<string, { stageField: string; cfg: LaneGateConfig }> = {
  "secondaryOpportunity": {
    "stageField": "stage",
    "cfg": {
      "orderedStages": [
        "NEW",
        "CONTACTED",
        "QUALIFIED",
        "VIEWING",
        "OFFER",
        "NEGOTIATION",
        "AGREED"
      ],
      "terminalStages": [
        "ON_HOLD",
        "LOST"
      ],
      "taskTargetField": "targetSecondaryOpportunityId",
      "stageTaskTitleByStage": {
        "NEW": "Start first outreach to the buyer lead (call or personal WhatsApp)",
        "CONTACTED": "Qualify the lead — pin budget, areas, intent, timeline",
        "QUALIFIED": "Shortlist 3–5 permitted units and book viewings",
        "VIEWING": "Run the viewings and capture feedback; refine the shortlist",
        "OFFER": "Submit a comp-backed offer and manage counters",
        "NEGOTIATION": "Drive the negotiation to terms — align price, deposit, dates",
        "AGREED": "Verify funds/KYC and sign MOU — then convert to Deal"
      }
    }
  },
  "sellOpportunity": {
    "stageField": "stage",
    "cfg": {
      "orderedStages": [
        "NEW",
        "CONTACTED",
        "QUALIFIED",
        "VALUATION",
        "LISTING_SIGNED",
        "LIVE",
        "OFFER",
        "NEGOTIATION",
        "SOLD"
      ],
      "terminalStages": [
        "ON_HOLD",
        "LOST"
      ],
      "taskTargetField": "targetSellOpportunityId",
      "stageTaskTitleByStage": {
        "NEW": "Start first outreach to the seller lead (call or personal WhatsApp)",
        "CONTACTED": "Qualify the owner — confirm ownership, motivation, timeline, price expectation",
        "QUALIFIED": "Prepare and book the valuation / CMA appointment",
        "VALUATION": "Present the CMA and win the listing — agree price + agreement type",
        "LISTING_SIGNED": "Capture the signed compliant mandate; get T3 approval and prep the listing",
        "LIVE": "Publish the listing and get the asset in front of buyers",
        "OFFER": "Present incoming offers to the owner; manage counters",
        "NEGOTIATION": "Walk the owner to yes on price + terms",
        "SOLD": "Verify funds/MOU and sign — then convert to Deal"
      }
    }
  },
  "offPlanOpportunity": {
    "stageField": "stage",
    "cfg": {
      "orderedStages": [
        "NEW",
        "CONTACTED",
        "QUALIFIED",
        "SHORTLISTED",
        "RESERVED",
        "SPA_SIGNED",
        "BOOKED"
      ],
      "terminalStages": [
        "ON_HOLD",
        "LOST"
      ],
      "taskTargetField": "targetOffPlanOpportunityId",
      "stageTaskTitleByStage": {
        "NEW": "Start first outreach to the off-plan lead (call or personal WhatsApp)",
        "CONTACTED": "Qualify end-use vs invest, budget + payment-plan appetite, timeline",
        "QUALIFIED": "Match projects + share a shortlist (pitch pack); book a presentation",
        "SHORTLISTED": "Drive to a reservation — collect EOI/token + register in developer queue",
        "RESERVED": "Convert the reservation to a signed SPA; confirm funds + KYC",
        "SPA_SIGNED": "Confirm down-payment hit RERA escrow; finalise the booking",
        "BOOKED": "Verify the booking + raise the developer commission — then convert to Deal"
      }
    }
  },
  "institutionalOpportunity": {
    "stageField": "stage",
    "cfg": {
      "orderedStages": [
        "QUALIFY_MANDATE",
        "THESIS_SOURCE",
        "LOI",
        "DUE_DILIGENCE",
        "IC_APPROVAL",
        "STRUCTURING_SPA",
        "CLOSE_TRANSFER"
      ],
      "terminalStages": [
        "PASSED"
      ],
      "taskTargetField": "targetInstitutionalOpportunityId",
      "stageTaskTitleByStage": {
        "QUALIFY_MANDATE": "Qualify ticket + mandate + decision structure; get NDA signed",
        "THESIS_SOURCE": "Translate the mandate into a data-backed shortlist; deliver teaser/IM",
        "LOI": "Secure a defensible LOI with exclusivity",
        "DUE_DILIGENCE": "Run a clean sequenced DD; keep the deal alive through findings",
        "IC_APPROVAL": "Package the IC memo and shepherd approval",
        "STRUCTURING_SPA": "Lock binding terms + the right ownership vehicle; sign SPA",
        "CLOSE_TRANSFER": "Drive to DLD transfer/registration"
      }
    }
  },
  "rcbiOpportunity": {
    "stageField": "stage",
    "cfg": {
      "orderedStages": [
        "NEW",
        "CONTACTED",
        "QUALIFIED",
        "COMPLIANCE_CHECK",
        "CONSULTATION",
        "PARTNER_ENGAGED",
        "APPLICATION",
        "CONVERTED"
      ],
      "terminalStages": [
        "ON_HOLD",
        "LOST"
      ],
      "taskTargetField": "targetRcbiOpportunityId",
      "stageTaskTitleByStage": {
        "NEW": "Start first outreach to the RCBI lead (call or personal WhatsApp)",
        "CONTACTED": "Run the qualification call (budget, nationality, motivation, timeline)",
        "QUALIFIED": "Run the compliance check (nationality / source-of-funds / PEP)",
        "COMPLIANCE_CHECK": "Complete compliance screening and clear or escalate",
        "CONSULTATION": "Run the consultation — recommend a programme and confirm intent",
        "PARTNER_ENGAGED": "Send the partner briefing and confirm receipt within 48h",
        "APPLICATION": "Monitor the partner application; bi-weekly status check-in",
        "CONVERTED": "Raise the commission invoice and send the referral ask"
      }
    }
  },
  "listing": {
    "stageField": "status",
    "cfg": {
      "orderedStages": [
        "DRAFT",
        "AWAITING_PUBLISH",
        "LIVE",
        "UNDER_OFFER"
      ],
      "terminalStages": [
        "CLOSED"
      ],
      "taskTargetField": "targetListingId",
      "stageTaskTitleByStage": {
        "DRAFT": "Compose copy/price/photos (>=6) and submit for QA",
        "AWAITING_PUBLISH": "Submit to DET and capture the Trakheesi permit",
        "LIVE": "Serve on portals; watch permit expiry and sync health",
        "UNDER_OFFER": "Freeze + take down from portals; hold the record",
        "CLOSED": "Issue per-portal deletes and clear externalRef"
      }
    }
  },
  "deal": {
    "stageField": "stage",
    "cfg": {
      "orderedStages": [
        "AGREED",
        "SECURED",
        "CLEARANCE",
        "TRANSFER",
        "REGISTERED",
        "COMMISSION_SETTLED",
        "CLOSED"
      ],
      "terminalStages": [
        "COLLAPSED"
      ],
      "taskTargetField": "targetDealId",
      "stageTaskTitleByStage": {
        "AGREED": "Capture price/commission/parties; seed split rows; freeze listing",
        "SECURED": "Collect deposit; confirm Form F signed; KYC both sides",
        "CLEARANCE": "Drive NOCs + finance clearance; confirm funds",
        "TRANSFER": "Book the Trustee appointment; assemble the pack; compute DLD 4%",
        "REGISTERED": "Upload the DLD receipt/title deed; release commission rows",
        "COMMISSION_SETTLED": "Reconcile the invoice; track inbound; settle A2A",
        "CLOSED": "Fire the Post-Build handover packet; archive the deal file"
      }
    }
  }
};
