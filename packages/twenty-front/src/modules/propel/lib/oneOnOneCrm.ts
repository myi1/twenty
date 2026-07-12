import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { type ReviewLine } from '@/propel/types/oneOnOne';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

// The Runner reads/writes the `leadReviewLine` custom object directly over the
// core GraphQL endpoint, with the AGENT'S OWN session token — so reads respect
// their record visibility (propel-rls) exactly like the rest of the CRM. This
// mirrors the dialer dock's CRM bridge (dialerCrmBridge.ts): a thin fetch to
// `${base}/graphql`, NOT the Apollo client (these app-object types aren't in the
// generated core schema, so a hand-written query is the simplest faithful port).
//
// We touch ONLY the two operations the in-sandbox Runner used: a paged
// `leadReviewLines` read and a scalar `updateLeadReviewLine` write. No backend
// route, object, or field is added or changed.

const graphql = async <T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T | null> => {
  const token = getTokenPair()?.accessOrWorkspaceAgnosticToken?.token;
  if (token === undefined || token === '') {
    return null;
  }
  try {
    const response = await fetch(`${REACT_APP_SERVER_BASE_URL}/graphql`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
      return null;
    }
    const json = (await response.json()) as { data?: T };
    return json.data ?? null;
  } catch {
    return null;
  }
};

const LINE_NODE = `
  id
  clientName
  leadObjectType
  leadRecordId
  stageSnapshot
  sourceSnapshot
  segmentSnapshot
  detailsSnapshot
  lastActivityAt
  notes
  nextAction
  discussed
  lineStatus
  closedSincePrep
  budgetSnapshot { amountMicros currencyCode }
`;

type LineConnection = {
  leadReviewLines?: {
    edges?: { node: ReviewLine; cursor: string }[];
    pageInfo?: { hasNextPage?: boolean; endCursor?: string };
  };
};

/**
 * Load every review line for a meeting (paged, capped at 20 pages × 100 like the
 * in-sandbox Runner), ordered by position. Returns [] on any failure so the
 * Runner shows an honest empty/wrap-up state rather than throwing.
 */
export const loadReviewLines = async (
  meetingId: string,
): Promise<ReviewLine[]> => {
  const out: ReviewLine[] = [];
  let after: string | null = null;
  for (let i = 0; i < 20; i++) {
    const data: LineConnection | null = await graphql<LineConnection>(
      `query OooReviewLines($filter: LeadReviewLineFilterInput, $after: String) {
         leadReviewLines(first: 100, filter: $filter, orderBy: [{ position: AscNullsLast }], after: $after) {
           edges { node { ${LINE_NODE} } cursor }
           pageInfo { hasNextPage endCursor }
         }
       }`,
      { filter: { meetingId: { eq: meetingId } }, after },
    );
    const conn: LineConnection['leadReviewLines'] = data?.leadReviewLines;
    for (const e of conn?.edges ?? []) out.push(e.node);
    if (conn?.pageInfo?.hasNextPage !== true) break;
    after = conn?.pageInfo?.endCursor ?? null;
    if (after === null) break;
  }
  return out;
};

/**
 * Patch a single review line's scalar fields (notes / nextAction / discussed /
 * lineStatus only — never composite/relation fields). Mirrors the in-sandbox
 * Runner's updateLeadReviewLine. Returns true on success.
 */
export const updateReviewLine = async (
  id: string,
  patch: Pick<
    Partial<ReviewLine>,
    'notes' | 'nextAction' | 'discussed' | 'lineStatus'
  >,
): Promise<boolean> => {
  const data: Record<string, unknown> = {};
  if ('notes' in patch) data.notes = patch.notes ?? null;
  if ('nextAction' in patch) data.nextAction = patch.nextAction ?? null;
  if ('discussed' in patch) data.discussed = patch.discussed ?? false;
  if ('lineStatus' in patch) data.lineStatus = patch.lineStatus;

  const res = await graphql<{ updateLeadReviewLine?: { id?: string } }>(
    `mutation OooUpdateReviewLine($id: UUID!, $data: LeadReviewLineUpdateInput!) {
       updateLeadReviewLine(id: $id, data: $data) { id }
     }`,
    { id, data },
  );
  return res?.updateLeadReviewLine?.id != null;
};

// ── Team management (Add agent picker) ───────────────────────────────────────
// A 1:1 "report" is a workspaceMember whose self-relation `manager` points at the
// caller — the relation's join column is `managerId` (see the app repo's
// src/fields/workspace-member-manager.field.ts → joinColumnName 'managerId'). The
// hub builds its team off exactly this (`workspaceMembers where managerId == me`).
// So "add agent X to MY team" is a single scalar write: set X's managerId to my
// member id. This mirrors the in-sandbox "Set 1:1 manager" panel verbatim — no new
// route, object, or field; the `manager` field on the STANDARD workspaceMember
// object isn't in the generated core schema, hence the hand-written GraphQL here
// (same escape hatch as the review-line read/write above).

export type WorkspaceMemberRow = {
  id: string;
  label: string;
  /** the member's current manager id, or null = unmanaged */
  managerId: string | null;
};

type MemberName = { firstName?: string | null; lastName?: string | null };

type WorkspaceMemberConnection = {
  workspaceMembers?: {
    edges?: {
      node: { id: string; managerId?: string | null; name?: MemberName };
      cursor: string;
    }[];
    pageInfo?: { hasNextPage?: boolean; endCursor?: string };
  };
};

const memberLabel = (name: MemberName | null | undefined): string => {
  const first = name?.firstName ?? '';
  const last = name?.lastName ?? '';
  const full = `${first} ${last}`.trim();
  return full !== '' ? full : 'Member';
};

/**
 * List every workspace member (id, display label, current managerId) for the
 * "Add agent" picker, ordered by name. Paged-capped like the rest of this bridge.
 * Returns [] on any failure so the picker shows an honest empty state.
 */
export const listWorkspaceMembers = async (): Promise<WorkspaceMemberRow[]> => {
  const out: WorkspaceMemberRow[] = [];
  let after: string | null = null;
  for (let i = 0; i < 20; i++) {
    const data: WorkspaceMemberConnection | null =
      await graphql<WorkspaceMemberConnection>(
        `query OooWorkspaceMembers($after: String) {
         workspaceMembers(first: 100, orderBy: [{ name: { firstName: AscNullsLast } }], after: $after) {
           edges { node { id managerId name { firstName lastName } } cursor }
           pageInfo { hasNextPage endCursor }
         }
       }`,
        { after },
      );
    const conn: WorkspaceMemberConnection['workspaceMembers'] =
      data?.workspaceMembers;
    for (const e of conn?.edges ?? []) {
      out.push({
        id: e.node.id,
        label: memberLabel(e.node.name),
        managerId: e.node.managerId ?? null,
      });
    }
    if (conn?.pageInfo?.hasNextPage !== true) break;
    after = conn?.pageInfo?.endCursor ?? null;
    if (after === null) break;
  }
  return out;
};

/**
 * Assign `agentId`'s 1:1 manager via the `managerId` join column (pass null to
 * clear). Used by the hub's "Add agent" picker to point a member at the acting
 * manager. Returns true on success.
 */
export const setMemberManager = async (
  agentId: string,
  managerId: string | null,
): Promise<boolean> => {
  const res = await graphql<{ updateWorkspaceMember?: { id?: string } }>(
    `mutation OooSetMemberManager($id: UUID!, $data: WorkspaceMemberUpdateInput!) {
       updateWorkspaceMember(id: $id, data: $data) { id }
     }`,
    { id: agentId, data: { managerId } },
  );
  return res?.updateWorkspaceMember?.id != null;
};
