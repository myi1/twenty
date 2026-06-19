import { useCallback, useEffect, useMemo, useState } from 'react';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { type CampaignBuilderHubPayload } from '@/propel/types/campaignBuilder';

// Loads the picker data the builder needs (segments, listings, WhatsApp +
// email templates, saved-snippet custom fields) from POST /s/marketing/hub —
// the same endpoint the Marketing Home hero uses, read for a different slice.
//
// Fails soft: a null route response leaves an EMPTY payload (every list []), so
// the wizard still renders honest empty states ("No saved audiences yet") and
// never throws or zero-fills.
const EMPTY: Required<
  Pick<
    CampaignBuilderHubPayload,
    'segments' | 'listings' | 'waTemplates' | 'emailTemplates' | 'customFields'
  >
> = {
  segments: [],
  listings: [],
  waTemplates: [],
  emailTemplates: [],
  customFields: [],
};

export const useCampaignBuilderData = () => {
  const [hub, setHub] = useState<CampaignBuilderHubPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    void callPropelRoute<CampaignBuilderHubPayload>('/marketing/hub', {}).then(
      (payload) => {
        if (!active) return;
        setHub(payload);
        setIsLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  // Re-pull the hub after a mutation that changes what the builder reads — e.g.
  // editing the send rules from the Review guardrails, so the guardrails summary
  // refreshes live without leaving Review. Fails soft like the initial load: a
  // null response leaves the last good payload in place (never blanks the UI).
  const refetch = useCallback(async () => {
    const payload = await callPropelRoute<CampaignBuilderHubPayload>(
      '/marketing/hub',
      {},
    );
    if (payload !== null) setHub(payload);
  }, []);

  const data = useMemo(
    () => ({
      segments: hub?.segments ?? EMPTY.segments,
      listings: hub?.listings ?? EMPTY.listings,
      waTemplates: hub?.waTemplates ?? EMPTY.waTemplates,
      emailTemplates: hub?.emailTemplates ?? EMPTY.emailTemplates,
      customFields: hub?.customFields ?? EMPTY.customFields,
      // S3 — the send-rules singleton for the Review guardrails card. Left
      // undefined (NOT zero-filled) when the route omits it, so the card shows
      // an honest "couldn't load your send rules" note rather than fake caps.
      sendRules: hub?.sendRules,
    }),
    [hub],
  );

  return { ...data, isLoading, refetch };
};
