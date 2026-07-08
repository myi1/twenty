import { Button, Center, Group, Loader, SegmentedControl } from '@mantine/core';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type Layouts } from 'react-grid-layout';
import { AppPath } from 'twenty-shared/types';
import {
  IconArrowsSplit2,
  IconCheck,
  IconPencil,
  IconPlus,
} from 'twenty-ui-deprecated/display';
import { MarketingDashboardGrid } from '@/propel/components/MarketingDashboardGrid';
import { useMarketingDashboardData } from '@/propel/hooks/useMarketingDashboardData';
import { type AnalyticsRange } from '@/propel/types/marketingHome';

// Home tab body of the unified Marketing hero. This is the former
// MarketingHomePage content (the customizable widget grid) extracted into a tab
// component: it owns its own action row (New campaign / Sequences / range /
// Customize) and the grid, but NOT the page chrome (PropelMantineProvider /
// PageContainer / PageHeader) — the hero shell owns those and the tab strip.
export const MarketingHomeTab = () => {
  const navigate = useNavigate();
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const [editMode, setEditMode] = useState(false);

  const {
    analytics,
    hub,
    layouts,
    setLayouts,
    enabledWidgetIds,
    isLoading,
    layoutLoaded,
    persistLayout,
  } = useMarketingDashboardData(range);

  const handleLayoutChange = useCallback(
    (allLayouts: Layouts) => {
      // Only track changes once the persisted layout has loaded, so the initial
      // breakpoint-derivation passes don't clobber a user's saved arrangement.
      if (layoutLoaded) {
        setLayouts(allLayouts);
      }
    },
    [layoutLoaded, setLayouts],
  );

  const toggleEditMode = useCallback(() => {
    setEditMode((prev) => {
      const next = !prev;
      // Leaving edit mode ("Done") persists the current arrangement.
      if (prev && !next) {
        persistLayout(layouts, enabledWidgetIds);
      }
      return next;
    });
  }, [layouts, enabledWidgetIds, persistLayout]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        padding: '12px 16px 24px',
      }}
    >
      <Group gap="sm" wrap="nowrap" justify="flex-end" mb="md">
        <Button
          size="xs"
          color="red"
          leftSection={<IconPlus size={14} />}
          onClick={() => navigate(AppPath.MarketingCampaignBuilder)}
        >
          New campaign
        </Button>
        <Button
          size="xs"
          variant="default"
          leftSection={<IconArrowsSplit2 size={14} />}
          onClick={() => navigate(AppPath.MarketingSequenceEditor)}
        >
          Sequences
        </Button>
        <SegmentedControl
          size="xs"
          value={range}
          onChange={(value) => setRange(value as AnalyticsRange)}
          data={[
            { label: '7d', value: '7d' },
            { label: '30d', value: '30d' },
            { label: '90d', value: '90d' },
          ]}
        />
        <Button
          size="xs"
          variant={editMode ? 'filled' : 'default'}
          color={editMode ? 'red' : undefined}
          leftSection={
            editMode ? <IconCheck size={14} /> : <IconPencil size={14} />
          }
          onClick={toggleEditMode}
        >
          {editMode ? 'Done' : 'Customize'}
        </Button>
      </Group>

      {isLoading && analytics === null ? (
        <Center h={320}>
          <Loader color="red" />
        </Center>
      ) : (
        <MarketingDashboardGrid
          analytics={analytics}
          hub={hub}
          layouts={layouts}
          enabledWidgetIds={enabledWidgetIds}
          editMode={editMode}
          onLayoutChange={handleLayoutChange}
        />
      )}
    </div>
  );
};
