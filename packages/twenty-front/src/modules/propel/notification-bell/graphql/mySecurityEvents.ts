// Hand-written gql (not codegen) — mirrors modules/users/graphql/queries/getCurrentUser.ts.
// These hit a core (cross-workspace) resolver, not a workspace-metadata object, so they
// can't go through useFindManyRecords like the rest of the notification bell.
import { gql } from '@apollo/client';

export const GET_MY_SECURITY_EVENTS = gql`
  query GetMySecurityEvents {
    mySecurityEvents {
      id
      eventType
      createdAt
      readAt
    }
  }
`;

export const MARK_SECURITY_EVENTS_AS_READ = gql`
  mutation MarkSecurityEventsAsRead($ids: [String!]!) {
    markSecurityEventsAsRead(ids: $ids)
  }
`;

export const MARK_SECURITY_EVENTS_AS_UNREAD = gql`
  mutation MarkSecurityEventsAsUnread($ids: [String!]!) {
    markSecurityEventsAsUnread(ids: $ids)
  }
`;

export const MARK_ALL_SECURITY_EVENTS_AS_READ = gql`
  mutation MarkAllSecurityEventsAsRead {
    markAllSecurityEventsAsRead
  }
`;
