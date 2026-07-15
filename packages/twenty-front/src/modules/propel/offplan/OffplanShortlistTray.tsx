import { Button } from '@mantine/core';

export function OffplanShortlistTray({ count, onBuild }: { count: number; onBuild: () => void }) {
  if (count === 0) return null;
  return (
    <Button color="red" radius="xl" style={{ position: 'absolute', right: 16, bottom: 16, zIndex: 10 }} onClick={onBuild}>
      ◈ Shortlist ({count}) · Build pitch →
    </Button>
  );
}
