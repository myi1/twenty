import { gql } from '@apollo/client';

// NOTE (2026-07-08, root cause of the recurring "heroes vanish / need
// re-login" bug): additionalFlags / excludedFlags used to be requested HERE —
// but they are workspace-schema CUSTOM fields that the CORE API's
// WorkspaceMember type never exposed, so EVERY currentUser (re)load failed
// GraphQL validation silently. The app then ran on login-time cached state;
// any mid-session state disturbance had no working refetch to recover from.
// The flags are now fetched where they actually live — the workspace RECORD
// API — inside usePropelEffectiveFlags. NEVER add workspace-schema custom
// fields to this core fragment.
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
  }
`;
