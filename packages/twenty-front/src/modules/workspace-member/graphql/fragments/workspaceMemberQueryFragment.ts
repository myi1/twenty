import { gql } from '@apollo/client';

// NOTE — Propel additions: additionalFlags / excludedFlags are PROPEL CUSTOM
// FIELDS on workspaceMember (defined in the propel-crm app manifest at
// src/fields/workspace-member-additional-flags.field.ts and
// .../workspace-member-excluded-flags.field.ts). Fetched in this standard
// fragment so the propel hero-gate hook (usePropelEffectiveFlags) can merge
// `(currentUserWorkspace.permissionFlags ∪ additionalFlags) \ excludedFlags`
// without a second round trip on every page load. MULTI_SELECT fields
// surface as string[] of option `value`s — the flag KEY strings
// (PROPEL_INBOX, …). Workspaces without the propel app get null for both
// (handled in the hook).
export const WORKSPACE_MEMBER_QUERY_FRAGMENT = gql`
  fragment WorkspaceMemberQueryFragment on WorkspaceMember {
    id
    name {
      firstName
      lastName
    }
    colorScheme
    avatarUrl
    locale
    userEmail
    userWorkspaceId
    timeZone
    dateFormat
    timeFormat
    calendarStartDay
    numberFormat
    additionalFlags
    excludedFlags
  }
`;
