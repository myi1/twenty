import { useEffect, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Card,
  Group,
  Loader,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { IconMap, IconCheck } from 'twenty-ui/display';
import {
  type StudioFacts,
  type StudioLocation,
} from '@/propel/types/listingStudio';
import {
  fetchStudioLocations,
  type StudioLocationMatch,
} from '@/propel/lib/listingStudioRoutes';

// Step 2 — Details & price (lane spec §4.3 / §7). The deed-confirmed field grid, the
// PF location typeahead (resolves community → PF location.id), and the price block
// with an inline comps reality-check pill. Edits flow up via onPatch (autosaves +
// rebuilds the live PF preview); the resolved location flows up via onLocation.
//
// Price reality-check: a lightweight per-sqft sanity band derived from the entered
// price + size (the full comps drawer backed by the listings/DLD/off-plan MCPs is a
// deeper backend integration — this gives the agent an immediate signal). The pill
// crossfades green/amber by how far the implied /sqft sits from a typical band.

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

const ASSET_CLASS = ['RESIDENTIAL', 'COMMERCIAL', 'LAND', 'INDUSTRIAL'];
const PROPERTY_TYPE = [
  'APARTMENT', 'VILLA', 'TOWNHOUSE', 'PENTHOUSE', 'STUDIO', 'OFFICE',
  'SHOP', 'RETAIL', 'WAREHOUSE', 'SHOWROOM', 'PLOT',
];
const FURNISHING = ['FURNISHED', 'UNFURNISHED', 'PARTLY'];
const COMPLETION = ['READY', 'OFF_PLAN'];

// A coarse typical /sqft band for Dubai residential (AED). Only a sanity signal —
// the comps-backed price is the real check (open backend item). Tuned wide so it
// only flags clearly-off prices, never second-guesses a defensible asking price.
const TYPICAL_PSF_LOW = 700;
const TYPICAL_PSF_HIGH = 3500;

const fmtAed = (n: number): string =>
  `AED ${new Intl.NumberFormat('en-US').format(Math.round(n))}`;

const PriceCheck = ({ facts }: { facts: StudioFacts }) => {
  const price = facts.askingPriceAed;
  const size = facts.sizeSqft ?? facts.plotSqft;
  if (price === undefined || price <= 0 || size === undefined || size <= 0) {
    return (
      <Text size="xs" c="dimmed">
        Enter the price and size to reality-check the asking price.
      </Text>
    );
  }
  const psf = price / size;
  const low = psf < TYPICAL_PSF_LOW;
  const high = psf > TYPICAL_PSF_HIGH;
  const color = low || high ? 'orange' : 'teal';
  const label = low
    ? 'Below the typical range'
    : high
      ? 'Above the typical range'
      : 'Within a typical range';
  return (
    <Group gap="xs">
      <Badge
        color={color}
        variant="light"
        leftSection={!low && !high ? <IconCheck size={11} /> : undefined}
        style={{ transition: `background 200ms ${EASE_OUT}` }}
      >
        {label}
      </Badge>
      <Text size="xs" c="dimmed">
        {fmtAed(psf)}/sqft
        {low || high ? ' — confirm against comparables before publishing' : ''}
      </Text>
    </Group>
  );
};

// PF location typeahead — debounced search against /listing-studio/locations.
const LocationField = ({
  value,
  community,
  onResolve,
}: {
  value: StudioLocation | undefined;
  community: string | undefined;
  onResolve: (loc: StudioLocation) => void;
}) => {
  const [query, setQuery] = useState(value?.name ?? community ?? '');
  const [options, setOptions] = useState<StudioLocationMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const runSearch = (q: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setOptions([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(() => {
      void fetchStudioLocations(q).then((res) => {
        setLoading(false);
        if (!res) {
          setOptions([]);
          setOpen(false);
          return;
        }
        setOptions(res.options);
        setDegraded(res.degraded);
        setOpen(res.options.length > 0);
      });
    }, 350);
  };

  return (
    <Box style={{ position: 'relative' }}>
      <TextInput
        label="Property Finder location"
        placeholder="Search a community, e.g. Dubai Marina"
        value={query}
        leftSection={<IconMap size={14} />}
        rightSection={loading ? <Loader size={14} /> : value ? <IconCheck size={14} color="teal" /> : null}
        onChange={(e) => {
          const v = e.currentTarget.value;
          setQuery(v);
          runSearch(v);
        }}
        onFocus={() => options.length > 0 && setOpen(true)}
      />
      {value && (
        <Text size="xs" c="dimmed" mt={4}>
          Resolved to PF location #{value.id}
          {value.fallback ? ' (sandbox fallback — geo lookup unavailable)' : ''}.
        </Text>
      )}
      {open && (
        <Card
          withBorder
          radius="md"
          padding={4}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            zIndex: 5000, // clear Twenty drawers (memory: dropdown z-index gotcha)
            maxHeight: 240,
            overflowY: 'auto',
            boxShadow: 'var(--mantine-shadow-md)',
          }}
        >
          {degraded && (
            <Text size="xs" c="dimmed" px={8} py={4}>
              Live geo lookup unavailable — using the sandbox area.
            </Text>
          )}
          {options.map((o) => (
            <UnstyledButton
              key={o.id}
              onClick={() => {
                onResolve({ id: o.id, name: o.name, fallback: o.fallback });
                setQuery(o.name);
                setOpen(false);
              }}
              style={{ display: 'block', width: '100%', padding: '7px 9px', borderRadius: 6 }}
              className="studio-loc-option"
            >
              <Text size="sm">{o.name}</Text>
              {o.path && (
                <Text size="xs" c="dimmed">
                  {o.path}
                </Text>
              )}
            </UnstyledButton>
          ))}
        </Card>
      )}
    </Box>
  );
};

export const StudioDetailsStep = ({
  facts,
  location,
  onPatch,
  onLocation,
}: {
  facts: StudioFacts;
  location: StudioLocation | undefined;
  onPatch: (patch: Partial<StudioFacts>) => void;
  onLocation: (loc: StudioLocation) => void;
}) => (
  <Card withBorder radius="md" padding="lg">
    <Stack gap="md">
      <Box>
        <Text fw={600}>Details &amp; price</Text>
        <Text size="sm" c="dimmed">
          Confirm the facts. The live Property Finder preview on the right updates as
          you type.
        </Text>
      </Box>

      <TextInput
        label="Listing title (working)"
        placeholder="e.g. Spacious 2-Bedroom Apartment in Dubai Marina"
        value={facts.name ?? ''}
        onChange={(e) => onPatch({ name: e.currentTarget.value })}
      />

      <Group grow>
        <Select
          label="Asset class"
          data={ASSET_CLASS}
          value={facts.assetClass ?? null}
          onChange={(v) => onPatch({ assetClass: v ?? undefined })}
          comboboxProps={{ withinPortal: true, zIndex: 5000 }}
        />
        <Select
          label="Property type"
          data={PROPERTY_TYPE}
          value={facts.propertyType ?? null}
          onChange={(v) => onPatch({ propertyType: v ?? undefined })}
          comboboxProps={{ withinPortal: true, zIndex: 5000 }}
        />
      </Group>

      <TextInput
        label="Community"
        placeholder="e.g. Dubai Marina"
        value={facts.community ?? ''}
        onChange={(e) => onPatch({ community: e.currentTarget.value })}
      />

      <LocationField
        value={location}
        community={facts.community}
        onResolve={onLocation}
      />

      <Group grow>
        <NumberInput
          label="Bedrooms"
          min={0}
          value={facts.bedrooms ?? ''}
          onChange={(v) => onPatch({ bedrooms: typeof v === 'number' ? v : undefined })}
        />
        <NumberInput
          label="Bathrooms"
          min={0}
          step={0.5}
          value={facts.bathrooms ?? ''}
          onChange={(v) => onPatch({ bathrooms: typeof v === 'number' ? v : undefined })}
        />
        <NumberInput
          label="Size (sqft)"
          min={0}
          value={facts.sizeSqft ?? ''}
          onChange={(v) => onPatch({ sizeSqft: typeof v === 'number' ? v : undefined })}
        />
      </Group>

      <Group grow>
        <Select
          label="Furnishing"
          data={FURNISHING}
          value={facts.furnishing ?? null}
          onChange={(v) => onPatch({ furnishing: v ?? undefined })}
          comboboxProps={{ withinPortal: true, zIndex: 5000 }}
        />
        <Select
          label="Completion"
          data={COMPLETION}
          value={facts.completionStatus ?? null}
          onChange={(v) => onPatch({ completionStatus: v ?? undefined })}
          comboboxProps={{ withinPortal: true, zIndex: 5000 }}
        />
      </Group>

      <Box>
        <NumberInput
          label="Asking price (AED)"
          description="From the owner's Form A — we reality-check it below."
          min={0}
          thousandSeparator=","
          value={facts.askingPriceAed ?? ''}
          onChange={(v) => onPatch({ askingPriceAed: typeof v === 'number' ? v : undefined })}
        />
        <Box mt="xs">
          <PriceCheck facts={facts} />
        </Box>
      </Box>
    </Stack>
  </Card>
);
