import {
  IconAlertTriangle,
  IconBolt,
  IconCheck,
  IconClock,
  IconFileText,
  IconHome,
  IconListCheck,
  IconLogin2,
  IconMail,
  IconMessage,
  IconNotes,
  IconPaperclip,
  IconRefresh,
  IconShield,
  IconStar,
  IconTarget,
  IconUserPlus,
  IconUsers,
  type IconComponent,
} from 'twenty-ui/display';

// Mirrors NOTIF_EVENTS[event].label + the subject→route map in propel-crm's
// src/shared/notify-agent-core.ts. Duplicated here (labels + a route map only, no
// decision logic) because the frontend and the backend logic-functions are separate
// repos/build systems — keep this in sync if a new event/subject type is added there.
export const NOTIF_EVENT_LABELS: Record<string, string> = {
  LEAD_ASSIGNED: 'Lead assigned to you',
  LEAD_REPLIED: 'Your lead replied',
  SLA_WARNING: 'Lead SLA about to breach',
  SLA_BREACH: 'Lead SLA breached',
  LEAD_REASSIGNED: 'Lead reassigned',
  TASK_DUE: 'Task overdue',
  DEAL_WON: 'Deal won',
  DORMANT_REENGAGED: 'Dormant lead re-engaged',
  STAGE_KEY: 'Opportunity hit a key stage',
  POOL_UNASSIGNED: 'Pool lead unassigned',
  MANAGER_DIGEST: 'Daily manager digest',
  LISTING_MATCH: 'New listing matches a buyer',
  PITCH_OPENED: 'A client opened your pitch',
  NOTE_ADDED: 'New note on your lead',
  TASK_ASSIGNED: 'Task assigned to you',
  TASK_UPDATED: 'Task updated',
  FILE_UPLOADED: 'File added to your lead',
  LOGIN_SUCCESS: 'You logged in',
  PASSWORD_CHANGED: 'Your password was changed',
};

// Per-event icon — a plain unread dot doesn't say WHAT happened at a glance; an
// icon does. Falls back to no icon (caller renders a default) for any event type
// not listed here (keeps this additive — a brand-new event never breaks rendering).
export const NOTIF_EVENT_ICONS: Record<string, IconComponent> = {
  LEAD_ASSIGNED: IconUserPlus,
  LEAD_REPLIED: IconMessage,
  SLA_WARNING: IconAlertTriangle,
  SLA_BREACH: IconAlertTriangle,
  LEAD_REASSIGNED: IconRefresh,
  TASK_DUE: IconClock,
  DEAL_WON: IconStar,
  DORMANT_REENGAGED: IconBolt,
  STAGE_KEY: IconTarget,
  POOL_UNASSIGNED: IconUsers,
  MANAGER_DIGEST: IconMail,
  LISTING_MATCH: IconHome,
  PITCH_OPENED: IconFileText,
  NOTE_ADDED: IconNotes,
  TASK_ASSIGNED: IconListCheck,
  TASK_UPDATED: IconCheck,
  FILE_UPLOADED: IconPaperclip,
  LOGIN_SUCCESS: IconLogin2,
  PASSWORD_CHANGED: IconShield,
};

// subjectObjectType → Twenty record-route nameSingular (/object/:nameSingular/:id).
// CONVERSATION + POOL have no single record route → no link.
export const NOTIF_SUBJECT_ROUTE_NAME: Record<string, string> = {
  PERSON: 'person',
  SECONDARY: 'secondaryOpportunity',
  SELL: 'sellOpportunity',
  OFFPLAN: 'offPlanOpportunity',
  INSTITUTIONAL: 'institutionalOpportunity',
  RCBI: 'rcbiOpportunity',
  DEAL: 'deal',
  TASK: 'task',
  LISTING: 'listing',
};
