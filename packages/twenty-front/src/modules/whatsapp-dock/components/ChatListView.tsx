import styled from '@emotion/styled';
import { useCallback, useEffect, useRef, useState } from 'react';

import { dockColor } from '@/ui/theme/dockColorTokens';
import {
  fetchRecentWaChats,
  searchPeopleByName,
  type WaChatRow,
  type WaPersonResult,
  type WaTarget,
} from '@/whatsapp-dock/utils/whatsAppComposeBridge';

const StyledWrap = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
`;

const StyledSearchBar = styled.div`
  border-bottom: 1px solid ${dockColor.borderLight};
  flex-shrink: 0;
  padding: 10px 12px;
`;

const StyledInput = styled.input`
  background: ${dockColor.bgSecondary};
  border: 1px solid ${dockColor.borderLight};
  border-radius: ${dockColor.radiusSm};
  color: ${dockColor.textPrimary};
  font-family: ${dockColor.fontFamily};
  font-size: 13px;
  outline: none;
  padding: 8px 10px;
  width: 100%;

  &:focus {
    border-color: ${dockColor.accentGreen};
  }

  &::placeholder {
    color: ${dockColor.textTertiary};
  }
`;

const StyledList = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow-y: auto;
`;

const StyledRow = styled.button`
  align-items: center;
  background: transparent;
  border: 0;
  border-bottom: 1px solid ${dockColor.borderLight};
  cursor: pointer;
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  text-align: left;
  width: 100%;

  &:hover {
    background: ${dockColor.bgTertiary};
  }
`;

const StyledAvatar = styled.div`
  align-items: center;
  background: ${dockColor.outboundBubbleBg};
  border-radius: ${dockColor.radiusPill};
  color: ${dockColor.accentGreenStrong};
  display: flex;
  flex-shrink: 0;
  font: 600 14px/1 ${dockColor.fontFamily};
  height: 36px;
  justify-content: center;
  width: 36px;
`;

const StyledRowBody = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const StyledRowTop = styled.div`
  align-items: baseline;
  display: flex;
  gap: 8px;
  justify-content: space-between;
`;

const StyledName = styled.span`
  color: ${dockColor.textPrimary};
  font: 600 13px/1.2 ${dockColor.fontFamily};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledTime = styled.span`
  color: ${dockColor.textTertiary};
  flex-shrink: 0;
  font-size: 11px;
`;

const StyledSubtitleRow = styled.div`
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
`;

const StyledPreview = styled.span`
  color: ${dockColor.textSecondary};
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledUnreadBadge = styled.span`
  align-items: center;
  background: ${dockColor.accentGreen};
  border-radius: ${dockColor.radiusPill};
  color: ${dockColor.textInverted};
  display: flex;
  flex-shrink: 0;
  font: 600 10px/1 ${dockColor.fontFamily};
  height: 16px;
  justify-content: center;
  min-width: 16px;
  padding: 0 4px;
`;

const StyledHint = styled.div`
  color: ${dockColor.textTertiary};
  font-size: 12px;
  padding: 16px 12px;
`;

const initial = (name: string): string => (name.trim()[0] ?? '?').toUpperCase();

type ChatListViewProps = {
  onOpenChat: (target: WaTarget) => void;
  onPickPerson: (person: WaPersonResult) => void;
};

export const ChatListView = ({ onOpenChat, onPickPerson }: ChatListViewProps) => {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<WaPersonResult[]>([]);
  const [recentChats, setRecentChats] = useState<WaChatRow[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const searchSeqRef = useRef(0);

  const loadRecentChats = useCallback(async () => {
    setLoadingRecent(true);
    setRecentChats(await fetchRecentWaChats());
    setLoadingRecent(false);
  }, []);

  useEffect(() => {
    void loadRecentChats();
  }, [loadRecentChats]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++searchSeqRef.current;
    const timer = window.setTimeout(() => {
      void searchPeopleByName(term).then((people) => {
        if (seq === searchSeqRef.current) {
          setResults(people);
          setSearching(false);
        }
      });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  const handleOpenRecentChat = (chat: WaChatRow) => {
    onOpenChat({
      personId: chat.personId ?? '',
      name: chat.title,
      e164Digits: '',
      conversationId: chat.id,
      lineType: chat.lineType,
      lastInboundAt: null,
    });
  };

  const isSearchMode = query.trim().length >= 2;

  return (
    <StyledWrap>
      <StyledSearchBar>
        <StyledInput
          autoFocus
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a contact by name…"
          value={query}
        />
      </StyledSearchBar>
      <StyledList>
        {isSearchMode ? (
          <>
            {searching && <StyledHint>Searching…</StyledHint>}
            {!searching && results.length === 0 && (
              <StyledHint>No contacts match “{query.trim()}”.</StyledHint>
            )}
            {results.map((person) => (
              <StyledRow key={person.id} onClick={() => onPickPerson(person)} type="button">
                <StyledAvatar>{initial(person.name)}</StyledAvatar>
                <StyledRowBody>
                  <StyledRowTop>
                    <StyledName>{person.name}</StyledName>
                  </StyledRowTop>
                  <StyledPreview>
                    {person.e164Digits ? `+${person.e164Digits}` : 'No phone number on file'}
                  </StyledPreview>
                </StyledRowBody>
              </StyledRow>
            ))}
          </>
        ) : loadingRecent ? (
          <StyledHint>Loading recent chats…</StyledHint>
        ) : recentChats.length === 0 ? (
          <StyledHint>
            No recent WhatsApp chats yet. Search a contact above to start one.
          </StyledHint>
        ) : (
          recentChats.map((chat) => (
            <StyledRow key={chat.id} onClick={() => handleOpenRecentChat(chat)} type="button">
              <StyledAvatar>{initial(chat.title)}</StyledAvatar>
              <StyledRowBody>
                <StyledRowTop>
                  <StyledName>{chat.title}</StyledName>
                  <StyledTime>{chat.whenLabel}</StyledTime>
                </StyledRowTop>
                <StyledSubtitleRow>
                  <StyledPreview>{chat.preview || 'No messages yet'}</StyledPreview>
                  {chat.unreadCount > 0 && (
                    <StyledUnreadBadge>{chat.unreadCount > 99 ? '99+' : chat.unreadCount}</StyledUnreadBadge>
                  )}
                </StyledSubtitleRow>
              </StyledRowBody>
            </StyledRow>
          ))
        )}
      </StyledList>
    </StyledWrap>
  );
};
