import {
  NOTIF_EVENT_ICONS,
  NOTIF_EVENT_LABELS,
  NOTIF_SUBJECT_ROUTE_NAME,
} from '@/propel/notification-bell/constants/notificationEventLabels';
import {
  type NotificationBellItem,
  useNotificationBell,
} from '@/propel/notification-bell/hooks/useNotificationBell';
import { useNotificationSubjectLabels } from '@/propel/notification-bell/hooks/useNotificationSubjectLabels';
import { useNotificationWaConversationRoutes } from '@/propel/notification-bell/hooks/useNotificationWaConversationRoutes';
import { Dropdown } from '@/ui/layout/dropdown/components/Dropdown';
import { DropdownContent } from '@/ui/layout/dropdown/components/DropdownContent';
import { DropdownMenuItemsContainer } from '@/ui/layout/dropdown/components/DropdownMenuItemsContainer';
import { DropdownMenuSeparator } from '@/ui/layout/dropdown/components/DropdownMenuSeparator';
import { useCloseDropdown } from '@/ui/layout/dropdown/hooks/useCloseDropdown';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useNavigate } from 'react-router-dom';
import { IconBell } from 'twenty-ui/display';
import { LightIconButton } from 'twenty-ui/input';
import { MenuItem } from 'twenty-ui/navigation';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const NOTIFICATION_BELL_DROPDOWN_ID = 'notification-bell-dropdown';

// Kept in sync with the route registered in useCreateAppRouter.tsx.
export const NOTIFICATIONS_PAGE_PATH = '/notifications';

const StyledBadge = styled.div`
  align-items: center;
  background: ${themeCssVariables.color.red};
  border-radius: ${themeCssVariables.border.radius.rounded};
  color: ${themeCssVariables.font.color.inverted};
  display: flex;
  font-size: 9px;
  font-weight: ${themeCssVariables.font.weight.semiBold};
  height: 14px;
  justify-content: center;
  min-width: 14px;
  padding: 0 3px;
  pointer-events: none;
  position: absolute;
  right: -2px;
  top: -2px;
`;

const StyledIconButtonContainer = styled.div`
  position: relative;
`;

const StyledEmptyState = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  padding: ${themeCssVariables.spacing[4]};
  text-align: center;
`;

const StyledListContainer = styled.div`
  max-height: 360px;
  overflow-y: auto;
`;

const StyledItemRow = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  padding-left: ${themeCssVariables.spacing[2]};

  > *:last-child {
    flex: 1;
    min-width: 0;
  }
`;

const StyledUnreadDot = styled.div<{ isUnread: boolean }>`
  background: ${({ isUnread }) =>
    isUnread ? themeCssVariables.color.blue : 'transparent'};
  border-radius: 50%;
  flex-shrink: 0;
  height: 6px;
  width: 6px;
`;

const StyledHeader = styled.div`
  align-items: center;
  display: flex;
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;

const StyledHeaderTitle = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledHeaderAction = styled.button<{ disabled?: boolean }>`
  background: none;
  border: 0;
  color: ${({ disabled }) =>
    disabled
      ? themeCssVariables.font.color.light
      : themeCssVariables.color.blue};
  cursor: ${({ disabled }) => (disabled ? 'default' : 'pointer')};
  font-size: ${themeCssVariables.font.size.sm};
  padding: 0;
`;

const StyledFooter = styled.button`
  background: none;
  border: 0;
  border-top: 1px solid ${themeCssVariables.border.color.light};
  color: ${themeCssVariables.color.blue};
  cursor: pointer;
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
  text-align: center;
  width: 100%;
`;

const formatRelativeTime = (iso: string | null): string => {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const diffMinutes = Math.round((Date.now() - ms) / 60_000);
  if (diffMinutes < 1) return t`just now`;
  if (diffMinutes < 60) return t`${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return t`${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return t`${diffDays}d ago`;
};

export const NotificationBell = () => {
  const { records, unreadCount, markAllAsRead, markOneAsRead } =
    useNotificationBell();
  const subjectLabels = useNotificationSubjectLabels(records);
  const waConversationRoutes = useNotificationWaConversationRoutes(records);
  const { closeDropdown } = useCloseDropdown();
  const navigate = useNavigate();

  const getItemText = (item: NotificationBellItem): string => {
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

  const handleItemClick = (item: NotificationBellItem) => {
    closeDropdown(NOTIFICATION_BELL_DROPDOWN_ID);
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

  const handleViewAllClick = () => {
    closeDropdown(NOTIFICATION_BELL_DROPDOWN_ID);
    navigate(NOTIFICATIONS_PAGE_PATH);
  };

  const handleOpen = () => {
    // Requesting permission here (not on mount) ties it to an actual click — the
    // gesture browsers require for the prompt to reliably appear at all.
    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'default'
    ) {
      void Notification.requestPermission();
    }
  };

  return (
    <Dropdown
      dropdownId={NOTIFICATION_BELL_DROPDOWN_ID}
      onOpen={handleOpen}
      clickableComponent={
        <StyledIconButtonContainer>
          <LightIconButton
            Icon={IconBell}
            accent="secondary"
            size="small"
            aria-label={t`Notifications`}
          />
          {unreadCount > 0 && (
            <StyledBadge>{unreadCount > 9 ? '9+' : unreadCount}</StyledBadge>
          )}
        </StyledIconButtonContainer>
      }
      dropdownComponents={
        <DropdownContent widthInPixels={320}>
          <StyledHeader>
            <StyledHeaderTitle>{t`Notifications`}</StyledHeaderTitle>
            <StyledHeaderAction
              type="button"
              disabled={unreadCount === 0}
              onClick={markAllAsRead}
            >
              {t`Mark all read`}
            </StyledHeaderAction>
          </StyledHeader>
          <DropdownMenuSeparator />
          <StyledListContainer>
            {records.length === 0 && (
              <StyledEmptyState>{t`No notifications yet.`}</StyledEmptyState>
            )}
            {records.length > 0 && (
              <DropdownMenuItemsContainer>
                {records.map((item) => (
                  <StyledItemRow key={item.id}>
                    <StyledUnreadDot isUnread={!item.readAt} />
                    <MenuItem
                      LeftIcon={
                        (item.eventType && NOTIF_EVENT_ICONS[item.eventType]) ??
                        IconBell
                      }
                      text={getItemText(item)}
                      contextualText={formatRelativeTime(item.sentAt)}
                      onClick={() => handleItemClick(item)}
                    />
                  </StyledItemRow>
                ))}
              </DropdownMenuItemsContainer>
            )}
          </StyledListContainer>
          <StyledFooter type="button" onClick={handleViewAllClick}>
            {t`View all notifications`}
          </StyledFooter>
        </DropdownContent>
      }
    />
  );
};
