import { callPropelRoute } from '@/propel/lib/callPropelRoute';

// Real data layer for the Asset Library (LP Builder v2 §4.3). All websiteAsset
// CRUD runs through ONE Manager/Admin-gated CRM route (propel-crm-integration,
// src/logic-functions/website-assets-route.ts):
//
//   POST /website/assets  body { action, ... }   (flat body — the gotcha)
//     action:'list'   + filter?{source?,tag?,favorite?,query?}  → { ok, assets }
//     action:'create' + {gatewayPath, source, title?, altText?, prompt?,
//                        projectExternalId?, projectName?, width?, height?}
//                                                                → { ok, id }
//     action:'update' + {id, patch:{name?,altText?,tags?}}       → { ok, id }
//     action:'toggleFavorite' + {id}                             → { ok, favorite }
//     action:'delete' + {id}                                     → { ok }
//
// callPropelRoute sends the agent's own session token; identity + role are
// derived server-side and the route fails CLOSED (NOT_FOUND) for a non-Manager.
// It returns the parsed 2xx body, or null (non-2xx / network / not signed in /
// route not deployed). We narrow on body shape and hand callers a discriminated
// result — never a fake-empty success. Mirrors landingPagesCrm.ts verbatim.

const ROUTE = '/website/assets';

// The 5 asset provenances (UPPER_CASE — matches the O1 SELECT enum values).
export type WebsiteAssetSource = 'GENERATED' | 'PROJECT' | 'UPLOADED' | 'BRAND' | 'TEAM';

export const WEBSITE_ASSET_SOURCES: WebsiteAssetSource[] = [
  'GENERATED',
  'PROJECT',
  'UPLOADED',
  'BRAND',
  'TEAM',
];

// One asset row (list projection). Matches the route's `assets[]` projection.
export interface WebsiteAsset {
  id: string;
  name: string;
  gatewayPath: string;
  source: WebsiteAssetSource;
  tags: string;
  favorite: boolean;
  altText: string;
  prompt: string;
  projectName: string;
  width: number | null;
  height: number | null;
  usageCount: number;
}

export interface AssetFilter {
  source?: WebsiteAssetSource;
  tag?: string;
  favorite?: boolean;
  query?: string;
}

export interface CreateAssetInput {
  gatewayPath: string;
  source: WebsiteAssetSource;
  title?: string;
  altText?: string;
  prompt?: string;
  projectExternalId?: string;
  projectName?: string;
  width?: number;
  height?: number;
}

export interface UpdateAssetPatch {
  name?: string;
  altText?: string;
  tags?: string;
}

export type CrmResult<T> = { ok: true; data: T } | { ok: false; error: string };

type Envelope = { ok?: boolean; error?: string; code?: string } & Record<string, unknown>;

// The `list` response carries the same-domain gateway origin in `meta`
// (SITE_PUBLIC_URL server-side; absent → '' → thumbnails degrade to a
// placeholder). Read it ALONGSIDE the rows so a single fetch feeds both the grid
// and its <img> src — mirrors landingPagesCrm.readSitePublicUrl.
export interface AssetListPayload {
  assets: WebsiteAsset[];
  sitePublicUrl: string;
}

const readSitePublicUrl = (body: Envelope | null): string => {
  const meta = body?.meta;
  if (meta !== null && typeof meta === 'object') {
    const url = (meta as Record<string, unknown>).sitePublicUrl;
    if (typeof url === 'string') return url;
  }
  return '';
};

const failMessage = (body: Envelope | null): string => {
  if (body === null) {
    return 'Could not reach the asset library (sign in as a Manager; the object may not be deployed yet).';
  }
  return typeof body.error === 'string' && body.error ? body.error : 'Request failed.';
};

export async function listAssets(filter?: AssetFilter): Promise<CrmResult<AssetListPayload>> {
  const body = await callPropelRoute<Envelope>(ROUTE, { action: 'list', filter: filter ?? {} });
  if (body && body.ok === true && Array.isArray(body.assets)) {
    return {
      ok: true,
      data: { assets: body.assets as WebsiteAsset[], sitePublicUrl: readSitePublicUrl(body) },
    };
  }
  return { ok: false, error: failMessage(body) };
}

export async function createAsset(input: CreateAssetInput): Promise<CrmResult<{ id: string }>> {
  const body = await callPropelRoute<Envelope>(ROUTE, { action: 'create', ...input });
  if (body && body.ok === true && typeof body.id === 'string') {
    return { ok: true, data: { id: body.id } };
  }
  return { ok: false, error: failMessage(body) };
}

export async function updateAsset(
  id: string,
  patch: UpdateAssetPatch,
): Promise<CrmResult<{ id: string }>> {
  const body = await callPropelRoute<Envelope>(ROUTE, { action: 'update', id, patch });
  if (body && body.ok === true && typeof body.id === 'string') {
    return { ok: true, data: { id: body.id } };
  }
  return { ok: false, error: failMessage(body) };
}

export async function toggleFavorite(id: string): Promise<CrmResult<{ favorite: boolean }>> {
  const body = await callPropelRoute<Envelope>(ROUTE, { action: 'toggleFavorite', id });
  if (body && body.ok === true && typeof body.favorite === 'boolean') {
    return { ok: true, data: { favorite: body.favorite } };
  }
  return { ok: false, error: failMessage(body) };
}

export async function deleteAsset(id: string): Promise<CrmResult<Record<string, never>>> {
  const body = await callPropelRoute<Envelope>(ROUTE, { action: 'delete', id });
  if (body && body.ok === true) {
    return { ok: true, data: {} };
  }
  return { ok: false, error: failMessage(body) };
}
