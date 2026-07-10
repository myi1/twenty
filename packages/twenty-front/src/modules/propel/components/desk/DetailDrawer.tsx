import { Drawer, Group, Stack } from '@mantine/core';
import type { ReactNode } from 'react';

// Right slide-out detail. "Edit" inside escalates to the surface's full
// workspace (LP builder / GrapesJS / form or CTA editor).
export const DetailDrawer = ({
  opened,
  title,
  onClose,
  actions,
  children,
}: {
  opened: boolean;
  title: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
  children: ReactNode;
}): ReactNode => (
  <Drawer opened={opened} onClose={onClose} position="right" size="lg" title={title}>
    <Stack gap="md">
      {children}
      {actions !== undefined && <Group justify="flex-end">{actions}</Group>}
    </Stack>
  </Drawer>
);
