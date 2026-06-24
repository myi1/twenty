import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import {
  type StudioFacts,
  type StudioLintFinding,
  type StudioLocation,
  type StudioPermit,
  type StudioPermitAuthority,
  type StudioPublishResult,
  type StudioTone,
  type StudioWriteup,
} from '@/propel/types/listingStudio';

// Typed callers for the Listing Studio S4–S8 CRM routes (the PF-talking proxies).
// Every route is coordinator-gated server-side and SANDBOX-only; the hero holds no
// PF key. Each caller returns the parsed body or null (callPropelRoute soft-fails),
// so the steps render an honest empty/error state instead of throwing.

// ── /listing-studio/locations — PF location typeahead (Step 2) ────────────────
interface LocationsResponse {
  ok: boolean;
  options?: { id: number; name: string; type?: string; path?: string; fallback?: boolean }[];
  degraded?: boolean;
}

export interface StudioLocationMatch extends StudioLocation {
  type?: string;
  path?: string;
}

export const fetchStudioLocations = async (
  search: string,
): Promise<{ options: StudioLocationMatch[]; degraded: boolean } | null> => {
  const res = await callPropelRoute<LocationsResponse>('/listing-studio/locations', {
    search,
  });
  if (!res || res.ok !== true) return null;
  return {
    options: (res.options ?? []).map((o) => ({
      id: o.id,
      name: o.name,
      type: o.type,
      path: o.path,
      fallback: o.fallback,
    })),
    degraded: res.degraded === true,
  };
};

// ── /listing-studio/writeup — AI EN+AR copy + compliance lint (Step 4) ────────
interface WriteupResponse {
  ok: boolean;
  titleEn?: string;
  descriptionEn?: string;
  titleAr?: string;
  descriptionAr?: string;
  tone?: StudioTone;
  lint?: StudioLintFinding[];
}

export const generateStudioWriteup = async (
  facts: StudioFacts,
  tone: StudioTone,
): Promise<{ writeup: StudioWriteup; lint: StudioLintFinding[] } | null> => {
  const res = await callPropelRoute<WriteupResponse>('/listing-studio/writeup', {
    facts,
    tone,
  });
  if (!res || res.ok !== true) return null;
  return {
    writeup: {
      titleEn: res.titleEn,
      descriptionEn: res.descriptionEn,
      titleAr: res.titleAr,
      descriptionAr: res.descriptionAr,
      tone: res.tone ?? tone,
    },
    lint: res.lint ?? [],
  };
};

// ── /listing-studio/permit — validate a Trakheesi permit (Step 5) ─────────────
interface PermitResponse {
  ok: boolean;
  valid?: boolean;
  expiresAt?: string;
  startedAt?: string;
  validationURL?: string;
  covers?: {
    listingType?: string;
    size?: number;
    value?: number;
    roomsCount?: string;
    locationName?: string;
    unitNumber?: string;
  };
  reason?: string;
}

export interface PermitValidation {
  valid: boolean;
  expiresAt?: string;
  validationURL?: string;
  covers?: PermitResponse['covers'];
  reason?: string;
}

export const validateStudioPermit = async (args: {
  permitNumber: string;
  licenseNumber: string;
  authority: StudioPermitAuthority;
}): Promise<PermitValidation | null> => {
  const res = await callPropelRoute<PermitResponse>('/listing-studio/permit', args);
  if (!res || res.ok !== true) return null;
  return {
    valid: res.valid === true,
    expiresAt: res.expiresAt,
    validationURL: res.validationURL,
    covers: res.covers,
    reason: res.reason,
  };
};

// ── /listing-studio/publish — create / cost-preview / publish (Step 6) ────────
interface PublishResponse {
  ok: boolean;
  listingId?: string;
  reference?: string;
  published?: boolean;
  state?: string;
  cost?: { name?: string; credits?: number };
  // error envelope fields (callPropelRoute returns null on non-2xx, but a 200
  // envelope error — COMPLIANCE_BLOCK etc. — comes back with ok=false + a message)
  code?: string;
  message?: string;
  details?: unknown;
}

export interface PublishOutcome {
  ok: boolean;
  result?: StudioPublishResult;
  /** an envelope error (compliance block, PF rejection) to surface. */
  errorCode?: string;
  errorMessage?: string;
}

export const runStudioPublish = async (args: {
  facts: StudioFacts;
  writeup?: StudioWriteup;
  permit?: StudioPermit;
  imageUrls?: string[];
  locationId?: number;
  reference?: string;
  publish: boolean;
}): Promise<PublishOutcome | null> => {
  const res = await callPropelRoute<PublishResponse>('/listing-studio/publish', args);
  if (!res) return null;
  if (res.ok === true && res.listingId !== undefined) {
    return {
      ok: true,
      result: {
        listingId: res.listingId,
        reference: res.reference,
        published: res.published === true,
        state: res.state,
        cost: res.cost,
      },
    };
  }
  return {
    ok: false,
    errorCode: res.code,
    errorMessage: res.message ?? 'Property Finder could not complete the request.',
  };
};

// ── /listing-studio/manage — live status + unpublish (Step 6 manage) ──────────
interface ManageResponse {
  ok: boolean;
  action?: 'status' | 'unpublish';
  listingId?: string;
  reference?: string;
  state?: string;
  found?: boolean;
  code?: string;
  message?: string;
}

export const studioManage = async (args: {
  action: 'status' | 'unpublish';
  listingId?: string;
  reference?: string;
}): Promise<{ ok: boolean; state?: string; found?: boolean; message?: string } | null> => {
  const res = await callPropelRoute<ManageResponse>('/listing-studio/manage', args);
  if (!res) return null;
  return {
    ok: res.ok === true,
    state: res.state,
    found: res.found,
    message: res.message,
  };
};
