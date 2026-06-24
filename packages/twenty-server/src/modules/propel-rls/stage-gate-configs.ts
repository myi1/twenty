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
export const STAGE_GATE_CONFIGS: Record<string, { stageField: string; cfg: LaneGateConfig }> = {
  "secondaryOpportunity": {
    "stageField": "stage",
    "cfg": {
      "orderedStages": [
        "QUALIFY",
        "MATCH_VIEW",
        "OFFER",
        "AGREED"
      ],
      "terminalStages": [
        "PARKED",
        "LOST"
      ],
      "taskTargetField": "targetSecondaryOpportunityId",
      "stageTaskTitleByStage": {
        "QUALIFY": "Qualify the lead — pin budget, intent, timeline",
        "MATCH_VIEW": "Shortlist 3–5 permitted units and book viewings",
        "OFFER": "Submit a comp-backed offer and manage counters",
        "AGREED": "Verify funds/KYC and sign MOU — then convert to Deal",
        "PARKED": "Schedule the next nurture touch"
      }
    }
  },
  "sellOpportunity": {
    "stageField": "stage",
    "cfg": {
      "orderedStages": [
        "QUALIFY",
        "PITCH_PRICE",
        "MANDATE",
        "MARKET_LIVE",
        "OFFER_DECISION"
      ],
      "terminalStages": [
        "PARKED",
        "LOST"
      ],
      "taskTargetField": "targetSellOpportunityId",
      "stageTaskTitleByStage": {
        "QUALIFY": "Confirm owner is real, motivated, sellable — set timeline",
        "PITCH_PRICE": "Prepare and present the CMA; win the right to list",
        "MANDATE": "Capture a signed compliant mandate; get T3 approval",
        "MARKET_LIVE": "Create the listing and get the asset in front of buyers",
        "OFFER_DECISION": "Walk the owner to yes on price + terms",
        "PARKED": "Schedule the next owner nurture touch"
      }
    }
  },
  "offPlanOpportunity": {
    "stageField": "stage",
    "cfg": {
      "orderedStages": [
        "QUALIFY",
        "EOI",
        "BOOKING",
        "SPA_DOWNPAYMENT",
        "OQOOD",
        "PAYMENT_PLAN",
        "HANDOVER"
      ],
      "terminalStages": [
        "LOST"
      ],
      "taskTargetField": "targetOffPlanOpportunityId",
      "stageTaskTitleByStage": {
        "QUALIFY": "Qualify end-use vs invest + payment-plan appetite; match a project",
        "EOI": "Collect EOI + refundable deposit; register in developer queue",
        "BOOKING": "Win the unit at launch; convert EOI to a signed booking",
        "SPA_DOWNPAYMENT": "Get SPA executed and confirm funds hit RERA escrow",
        "OQOOD": "Register the sale on Oqood; raise the developer commission claim",
        "PAYMENT_PLAN": "Set up milestone reminders and relay construction updates",
        "HANDOVER": "Coordinate snagging and final transfer to title deed"
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
