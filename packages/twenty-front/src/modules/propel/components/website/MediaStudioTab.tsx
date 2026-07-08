import { useEffect, useRef, useState } from 'react';
import { Box, Center, Group, Loader, Title } from '@mantine/core';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { MediaStudioBody } from '@/propel/components/website/MediaStudioBody';
import { listAssets } from '@/propel/lib/websiteAssetsCrm';

// Media Studio TAB — the standalone, top-level Marketing → Media Studio surface.
// Unlike MediaStudioModal (opened from an image field to insert a pick), this is a
// full-surface place to create and manage imagery on its own, NOT tied to editing a
// page. It renders the same shared MediaStudioBody but WITHOUT `onPick`, so the
// panels drop every insert action: "Save to library" is primary on Generate/Enhance
// and Library/Renders tiles get Copy URL + Download instead of "Use this image".
//
// The body needs `sitePublicUrl` (the published gateway host) to render/download
// tiles. We fetch it the same way WebsiteAssetsTab does — off the websiteAsset
// `list` meta — then hand it down. The body handles an empty host gracefully
// (Generate/Enhance dim), so a missing/mis-configured host never crashes the tab.

export const MediaStudioTab = () => {
  const notify = usePropelToast();
  const mounted = useRef(true);

  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [sitePublicUrl, setSitePublicUrl] = useState('');

  useEffect(() => {
    mounted.current = true;
    void (async () => {
      const res = await listAssets();
      if (!mounted.current) return;
      if (res.ok) {
        setSitePublicUrl(res.data.sitePublicUrl);
      } else {
        notify(res.error, 'error');
      }
      setPhase('ready');
    })();
    return () => {
      mounted.current = false;
    };
  }, [notify]);

  return (
    <Box p="md" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <Group align="center" mb="md">
        <Title order={4}>Media studio</Title>
      </Group>
      {phase === 'loading' ? (
        <Center style={{ flex: 1 }} mih={200}>
          <Loader color="red" />
        </Center>
      ) : (
        <MediaStudioBody sitePublicUrl={sitePublicUrl} />
      )}
    </Box>
  );
};

export default MediaStudioTab;
