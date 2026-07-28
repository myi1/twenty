import {
  NOTIF_EVENT_ICONS,
  NOTIF_EVENT_LABELS,
  NOTIF_SUBJECT_ROUTE_NAME,
} from '@/propel/notification-bell/constants/notificationEventLabels';
import { type NotificationBellItem } from '@/propel/notification-bell/hooks/useNotificationBell';
import { useNotificationsCenter } from '@/propel/notification-bell/hooks/useNotificationsCenter';
import { useNotificationSubjectLabels } from '@/propel/notification-bell/hooks/useNotificationSubjectLabels';
import { useNotificationWaConversationRoutes } from '@/propel/notification-bell/hooks/useNotificationWaConversationRoutes';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useNavigate } from 'react-router-dom';
import { IconBell, IconTrash, H1Title, H1TitleFontColor } from 'twenty-ui/display';
import { LightIconButton, Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

// A real page (rendered inside DefaultLayout's <Outlet/>, sidebar included) —
// NOT a modal. The bell's small dropdown is for a quick glance; this is the
// "view all notifications, with full filtering" screen, reachable from its own
// sidebar entry (see NavigationDrawerHeroesSection.tsx) and the bell's
// "View all notifications" link.

const StyledTopBar = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-shrink: 0;
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[4]} ${themeCssVariables.spacing[6]};
`;

const StyledTopBarActions = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledContentScroll = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
`;

const StyledContentColumn = styled.div`
  margin: 0 auto;
  max-width: 720px;
  padding: ${themeCssVariables.spacing[6]};
`;

const StyledFilterGroup = styled.div`
  margin-bottom: ${themeCssVariables.spacing[4]};
`;

const StyledFilterGroupLabel = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  letter-spacing: 0.04em;
  margin-bottom: ${themeCssVariables.spacing[1]};
  text-transform: uppercase;
`;

const StyledFilterRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledChip = styled.button<{ isActive: boolean }>`
  background: ${({ isActive }) =>
    isActive
      ? themeCssVariables.color.blue
      : themeCssVariables.background.tertiary};
  border: 0;
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${({ isActive }) =>
    isActive
      ? themeCssVariables.font.color.inverted
      : themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[3]};
  white-space: nowrap;
`;

const StyledListContainer = styled.div`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  overflow: hidden;
`;

const StyledRow = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};

  &:last-child {
    border-bottom: 0;
  }

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }
`;

const StyledUnreadDotButton = styled.button<{ isUnread: boolean }>`
  background: ${({ isUnread }) =>
    isUnread ? themeCssVariables.color.blue : themeCssVariables.background.tertiary};
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  flex-shrink: 0;
  height: 10px;
  padding: 0;
  width: 10px;
`;

const StyledRowIcon = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  flex-shrink: 0;
`;

const StyledRowBody = styled.button`
  background: none;
  border: 0;
  cursor: pointer;
  flex: 1;
  min-width: 0;
  padding: 0;
  text-align: left;
`;

const StyledRowLabel = styled.div<{ isUnread: boolean }>`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${({ isUnread }) =>
    isUnread
      ? themeCssVariables.font.weight.semiBold
      : themeCssVariables.font.weight.regular};
`;

const StyledRowMeta = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  margin-top: ${themeCssVariables.spacing[1]};
`;

const StyledEmptyState = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  padding: ${themeCssVariables.spacing[8]} 0;
  text-align: center;
`;

const StyledLoadMoreContainer = styled.div`
  padding: ${themeCssVariables.spacing[4]} 0;
  text-align: center;
`;

const formatFullRelativeTime = (iso: string | null): string => {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const diffMinutes = Math.round((Date.now() - ms) / 60_000);
  if (diffMinutes < 1) return t`just now`;
  if (diffMinutes < 60) return t`${diffMinutes} min ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return t`${diffHours} hr ago`;
  const diffDays = Math.round(diffHours / 24);
  return t`${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
};

export const NotificationsPage = () => {
  const navigate = useNavigate();
  const {
    records,
    unreadCount,
    availableEventTypes,
    readFilter,
    setReadFilter,
    eventTypeFilter,
    setEventTypeFilter,
    hasNextPage,
    fetchMoreRecords,
    markAllAsRead,
    markOneAsRead,
    toggleRead,
    deleteOne,
    deleteAllRead,
  } = useNotificationsCenter();
  const subjectLabels = useNotificationSubjectLabels(records);
  const waConversationRoutes = useNotificationWaConversationRoutes(records);

  const getItemLabel = (item: NotificationBellItem): string => {
    const eventLabel =
      (item.eventType && NOTIF_EVENT_LABELS[item.eventType]) ??
      item.eventType ??
      t`Notification`;
    const subjectLabel =
      item.subjectObjectType && item.subjectRecordId
        ? subjectLabels[`${item.subjectObjectType}:${item.subjectRecordId}`]
        : undefined;
    return subjectLabel ? `${eventLabel} — ${subjectLabel}` : eventLabel;
  };

  const handleRowClick = (item: NotificationBellItem) => {
    if (!item.readAt) markOneAsRead(item.id, item.source);
    if (!item.subjectObjectType || !item.subjectRecordId) return;
    // "Your lead replied" / "Dormant lead re-engaged" are WhatsApp-triggered — jump
    // straight to the actual conversation thread, not the person's generic profile.
    const waConversationId = waConversationRoutes[item.subjectRecordId];
    if (waConversationId) {
      navigate(`/object/whatsAppConversation/${waConversationId}`);
      return;
    }
    const routeName = NOTIF_SUBJECT_ROUTE_NAME[item.subjectObjectType];
    if (!routeName) return;
    navigate(`/object/${routeName}/${item.subjectRecordId}`);
  };

  return (
    <PageContainer style={{ flex: 1, minHeight: 0 }}>
      <StyledTopBar>
        <H1Title title={t`Notifications`} fontColor={H1TitleFontColor.Primary} />
        <StyledTopBarActions>
          <Button
            title={t`Mark all read`}
            variant="secondary"
            size="small"
            disabled={unreadCount === 0}
            onClick={markAllAsRead}
          />
          <Button
            title={t`Delete read`}
            variant="secondary"
            accent="danger"
            size="small"
            onClick={deleteAllRead}
          />
        </StyledTopBarActions>
      </StyledTopBar>

      <StyledContentScroll>
        <StyledContentColumn>
          <StyledFilterGroup>
            <StyledFilterGroupLabel>{t`Status`}</StyledFilterGroupLabel>
            <StyledFilterRow>
              <StyledChip
                type="button"
                isActive={readFilter === 'all'}
                onClick={() => setReadFilter('all')}
              >
                {t`All`}
              </StyledChip>
              <StyledChip
                type="button"
                isActive={readFilter === 'unread'}
                onClick={() => setReadFilter('unread')}
              >
                {t`Unread`}
                {unreadCount > 0 ? ` (${unreadCount})` : ''}
              </StyledChip>
            </StyledFilterRow>
          </StyledFilterGroup>

          <StyledFilterGroup>
            <StyledFilterGroupLabel>{t`Type`}</StyledFilterGroupLabel>
            <StyledFilterRow>
              <StyledChip
                type="button"
                isActive={eventTypeFilter === null}
                onClick={() => setEventTypeFilter(null)}
              >
                {t`All types`}
              </StyledChip>
              {availableEventTypes.map((eventType) => (
                <StyledChip
                  key={eventType}
                  type="button"
                  isActive={eventTypeFilter === eventType}
                  onClick={() => setEventTypeFilter(eventType)}
                >
                  {NOTIF_EVENT_LABELS[eventType] ?? eventType}
                </StyledChip>
              ))}
            </StyledFilterRow>
          </StyledFilterGroup>

          <StyledListContainer>
            {records.length === 0 && (
              <StyledEmptyState>{t`No notifications match this filter.`}</StyledEmptyState>
            )}
            {records.map((item) => (
              <StyledRow key={item.id}>
                <StyledUnreadDotButton
                  type="button"
                  isUnread={!item.readAt}
                  aria-label={item.readAt ? t`Mark as unread` : t`Mark as read`}
                  title={item.readAt ? t`Mark as unread` : t`Mark as read`}
                  onClick={() => toggleRead(item.id, Boolean(item.readAt), item.source)}
                />
                <StyledRowIcon>
                  {(() => {
                    const Icon =
                      (item.eventType && NOTIF_EVENT_ICONS[item.eventType]) ??
                      IconBell;
                    return <Icon size={16} />;
                  })()}
                </StyledRowIcon>
                <StyledRowBody type="button" onClick={() => handleRowClick(item)}>
                  <StyledRowLabel isUnread={!item.readAt}>
                    {getItemLabel(item)}
                  </StyledRowLabel>
                  <StyledRowMeta>{formatFullRelativeTime(item.sentAt)}</StyledRowMeta>
                </StyledRowBody>
                {item.source !== 'security' && (
                  <LightIconButton
                    Icon={IconTrash}
                    accent="secondary"
                    size="small"
                    aria-label={t`Delete`}
                    onClick={() => deleteOne(item.id)}
                  />
                )}
              </StyledRow>
            ))}
          </StyledListContainer>
          {hasNextPage && (
            <StyledLoadMoreContainer>
              <Button
                title={t`Load more`}
                variant="secondary"
                size="small"
                onClick={() => fetchMoreRecords()}
              />
            </StyledLoadMoreContainer>
          )}
        </StyledContentColumn>
      </StyledContentScroll>
    </PageContainer>
  );
};
