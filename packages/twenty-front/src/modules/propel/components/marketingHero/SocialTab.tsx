import { SegmentedControl, Box, Group, Text } from '@mantine/core';
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IconCalendarEvent, IconSpy } from 'twenty-ui/display';
import { CompetitorsTab } from '@/propel/components/marketingHero/CompetitorsTab';
import { SocialCalendarTab } from '@/propel/components/marketingHero/SocialCalendarTab';

// Marketing → Social: a thin two-surface switcher.
//
//   • Calendar    — our own posting pipeline (SocialCalendarTab, unchanged).
//   • Competitors — what other Dubai brokerages are posting (CompetitorsTab,
//                   relocated here from its old top-level sidebar page —
//                   founder decision 2026-07-11).
//
// The sub-tab is URL-addressable (?tab=social&social=competitors) so links and
// refreshes land on the right surface; the default stays the calendar. State
// lives in the URL, not local state, mirroring the hero's own ?tab= pattern.

type SocialSub = 'calendar' | 'competitors';

const SUB_PARAM = 'social';

export const SocialTab = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const sub: SocialSub =
    searchParams.get(SUB_PARAM) === 'competitors' ? 'competitors' : 'calendar';

  const setSub = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams);
      if (value === 'competitors') {
        next.set(SUB_PARAM, 'competitors');
      } else {
        next.delete(SUB_PARAM);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  return (
    <Box>
      <Group mb="sm">
        <SegmentedControl
          size="xs"
          value={sub}
          onChange={setSub}
          data={[
            {
              value: 'calendar',
              label: (
                <Group gap={6} wrap="nowrap">
                  <IconCalendarEvent size={14} />
                  <Text size="xs">Calendar</Text>
                </Group>
              ),
            },
            {
              value: 'competitors',
              label: (
                <Group gap={6} wrap="nowrap">
                  <IconSpy size={14} />
                  <Text size="xs">Competitors</Text>
                </Group>
              ),
            },
          ]}
        />
      </Group>
      {sub === 'calendar' ? <SocialCalendarTab /> : <CompetitorsTab />}
    </Box>
  );
};
