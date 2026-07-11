import {
  Badge,
  Box,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { IconPencil, IconPhone, IconSearch } from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { enumLabel } from '@/propel/lib/enumLabels';
import { friendlyError } from '@/propel/lib/friendlyError';
import { fetchOwnedNumbers, type OwnedNumber } from '@/propel/lib/numbersCrm';
import { DetailDrawer, Seal, statusSeal } from '@/propel/components/desk';

// Numbers tab of the unified Marketing hero — a Mantine rebuild of the legacy
// Marketing Cloud "Phone numbers" surface. TM#51 reshaped the owned-lines list
// from a card stack into a TABLE (same grammar as LeadRoutingTab) with a per-number
// **Configure** DetailDrawer. Reads phoneNumber over core GraphQL (numbersCrm.ts);
// writes go through the manager-gated /voice/numbers/{search,provision,update}
// routes via callPropelRoute (creds + gate server-side).
//
// The Configure drawer edits the number's THREE existing writable fields —
// purpose, region prefixes, and default-line — all already accepted by
// /voice/numbers/update. NOTE (design ledger §3): richer per-number config
// (assignment to an agent/team, caller-ID, recording/voicemail) needs NEW backend
// fields on phone-number.object.ts + a route extension, so it is deferred; the
// column is headed "Region prefixes" because that is literally what it shows —
// do NOT title it "Assignment" until real assignment data exists (honest-UI
// sweep). The `name` field is NOT
// writable via the current update route, so it is displayed read-only here.
//
// Manager/Admin only: a mount-time probe answers before any control renders so the
// manager UI never flashes for an agent. (The actions are always server-gated, so
// the gate is for surface tidiness, not security.)

type AvailableNumber = {
  e164: string;
  provider: string;
  country: string;
  type: string;
  monthlyCost?: string;
  addressRequirement?: string;
  needsBundle?: boolean;
};

const NUMBER_COUNTRIES = [
  { value: 'GB', label: '🇬🇧 United Kingdom' },
  { value: 'US', label: '🇺🇸 United States' },
  { value: 'CA', label: '🇨🇦 Canada' },
  { value: 'FR', label: '🇫🇷 France' },
  { value: 'ES', label: '🇪🇸 Spain' },
  { value: 'DE', label: '🇩🇪 Germany' },
];
const NUMBER_TYPES = ['mobile', 'local', 'national', 'toll_free'].map((t) => ({
  value: t,
  label: t.replace('_', '-'),
}));

type NumberPatch = {
  purpose?: string;
  regionPrefixes?: string;
  isDefault?: boolean;
};

// Per-number Configure drawer — edits the three writable identity fields (purpose,
// region prefixes, default) in one save via /voice/numbers/update. `name` is shown
// read-only (the update route doesn't accept it — a backend change, deferred).
const ConfigureDrawer = ({
  number,
  saving,
  onClose,
  onSave,
}: {
  number: OwnedNumber | null;
  saving: boolean;
  onClose: () => void;
  onSave: (id: string, patch: NumberPatch) => Promise<void>;
}) => {
  const [purpose, setPurpose] = useState('');
  const [prefixes, setPrefixes] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  // Seed the form each time a different number opens.
  useEffect(() => {
    setPurpose(number?.purpose ?? '');
    setPrefixes(number?.regionPrefixes ?? '');
    setIsDefault(Boolean(number?.isDefault));
  }, [number]);

  if (number === null) return null;

  const dirty =
    purpose !== (number.purpose ?? '') ||
    prefixes !== (number.regionPrefixes ?? '') ||
    isDefault !== Boolean(number.isDefault);

  const submit = async () => {
    const patch: NumberPatch = {};
    if (purpose !== (number.purpose ?? '')) patch.purpose = purpose;
    if (prefixes !== (number.regionPrefixes ?? ''))
      patch.regionPrefixes = prefixes;
    if (isDefault !== Boolean(number.isDefault)) patch.isDefault = isDefault;
    if (Object.keys(patch).length === 0) return;
    await onSave(number.id, patch);
    onClose();
  };

  return (
    <DetailDrawer
      opened
      onClose={onClose}
      title={
        <Text ff="monospace" fw={700}>
          {number.e164}
        </Text>
      }
      actions={
        <>
          <Button variant="default" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            color="red"
            onClick={() => void submit()}
            loading={saving}
            disabled={!dirty || saving}
          >
            Save
          </Button>
        </>
      }
    >
      <Box>
        <Text size="xs" tt="uppercase" c="dimmed" fw={700} mb="xs">
          Line
        </Text>
        <Text size="sm">
          {[number.name, number.country, number.numberType, number.provider]
            .filter(Boolean)
            .join(' · ') || '—'}
        </Text>
      </Box>

      <TextInput
        label="Purpose"
        description="A human label, e.g. “UK outbound”."
        value={purpose}
        placeholder="UK outbound"
        disabled={saving}
        onChange={(e) => setPurpose(e.currentTarget.value)}
      />
      <TextInput
        label="Region prefixes"
        description="Destinations this line is the caller-ID for (comma-separated), e.g. +44,+33."
        value={prefixes}
        placeholder="+44,+33"
        disabled={saving}
        onChange={(e) => setPrefixes(e.currentTarget.value)}
      />
      <Switch
        color="red"
        checked={isDefault}
        disabled={saving}
        label="Default line"
        description="The fallback caller-ID when no prefix matches. Setting this clears the default on other lines."
        onChange={(e) => setIsDefault(e.currentTarget.checked)}
      />
    </DetailDrawer>
  );
};

export const NumbersTab = () => {
  const notify = usePropelToast();
  const [owned, setOwned] = useState<OwnedNumber[]>([]);
  const [country, setCountry] = useState('GB');
  const [type, setType] = useState('mobile');
  const [results, setResults] = useState<AvailableNumber[]>([]);
  const [searching, setSearching] = useState(false);
  const [provisioning, setProvisioning] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [checking, setChecking] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState<OwnedNumber | null>(null);
  const [msg, setMsg] = useState<{ text: string; tone: 'info' | 'error' } | null>(
    null,
  );

  const loadOwned = useCallback(async () => {
    setOwned(await fetchOwnedNumbers());
  }, []);

  const checkAccess = useCallback(async () => {
    const r = await callPropelRoute<{ ok?: boolean; forbidden?: boolean }>(
      '/voice/numbers/search',
      { probe: true },
    );
    if (r?.forbidden) setForbidden(true);
    setChecking(false);
  }, []);

  useEffect(() => {
    void checkAccess();
    void loadOwned();
  }, [checkAccess, loadOwned]);

  const search = useCallback(async () => {
    setSearching(true);
    setResults([]);
    setMsg(null);
    const r = await callPropelRoute<{
      numbers?: AvailableNumber[];
      provider?: string;
      error?: string;
      forbidden?: boolean;
    }>('/voice/numbers/search', { country, type, limit: '5' });
    setSearching(false);
    if (r === null) {
      setMsg({ text: 'Search failed — please try again.', tone: 'error' });
      return;
    }
    if (r.forbidden) {
      setForbidden(true);
      return;
    }
    if (r.error) setMsg({ text: friendlyError(r.error, 'load'), tone: 'error' });
    else setResults(r.numbers ?? []);
  }, [country, type]);

  const provision = useCallback(
    async (n: AvailableNumber) => {
      setProvisioning(n.e164);
      setMsg(null);
      const r = await callPropelRoute<{
        recordId?: string;
        needsBundle?: boolean;
        country?: string;
        error?: string;
        forbidden?: boolean;
      }>('/voice/numbers/provision', {
        e164: n.e164,
        country: n.country,
        type: n.type,
      });
      setProvisioning(null);
      if (r === null) {
        setMsg({ text: 'Provisioning failed — please try again.', tone: 'error' });
        return;
      }
      if (r.forbidden) {
        setForbidden(true);
        return;
      }
      if (r.needsBundle) {
        setMsg({
          text: `${n.e164} needs an approved regulatory bundle for ${r.country ?? n.country} first.`,
          tone: 'error',
        });
        notify('Regulatory bundle required', 'error');
        return;
      }
      if (r.error) {
        setMsg({ text: friendlyError(r.error, 'generic'), tone: 'error' });
        notify(friendlyError(r.error, 'generic'), 'error');
        return;
      }
      notify(`Provisioned ${n.e164}`, 'success');
      setResults((rs) => rs.filter((x) => x.e164 !== n.e164));
      void loadOwned();
    },
    [loadOwned, notify],
  );

  // Inline tag/update — purpose, region prefixes, default line. Manager-gated
  // server-side; single-default invariant enforced by the update route.
  const updateNumber = useCallback(
    async (id: string, patch: NumberPatch) => {
      setSavingId(id);
      setMsg(null);
      const r = await callPropelRoute<{
        updated?: boolean;
        error?: string;
        forbidden?: boolean;
      }>('/voice/numbers/update', { id, ...patch });
      setSavingId(null);
      if (r === null) {
        setMsg({ text: 'Update failed — please try again.', tone: 'error' });
        return;
      }
      if (r.forbidden) {
        setForbidden(true);
        return;
      }
      if (r.error) {
        setMsg({ text: friendlyError(r.error, 'save'), tone: 'error' });
        notify(friendlyError(r.error, 'save'), 'error');
        return;
      }
      void loadOwned();
    },
    [loadOwned, notify],
  );

  // ── forbidden — agents land here (quiet, no error styling) ──────────────────
  if (forbidden) {
    return (
      <Center mih={320} p="xl">
        <Stack align="center" gap={6} maw={420}>
          <Title order={4}>Numbers are coordinator-managed</Title>
          <Text size="sm" c="dimmed" ta="center">
            The number hub is for managers. Ask your team lead to provision or tag
            brokerage lines.
          </Text>
        </Stack>
      </Center>
    );
  }

  // ── neutral shell while the gate probe is in flight ─────────────────────────
  if (checking) {
    return (
      <Center mih={320}>
        <Loader color="red" />
      </Center>
    );
  }

  return (
    <Box p="md">
      <Stack gap={2} mb="md">
        <Title order={4}>Phone numbers</Title>
        <Text size="sm" c="dimmed" maw={620}>
          The brokerage’s telephony lines. The carrier originates calls presenting
          them; provision new ones by country here.
        </Text>
      </Stack>

      {/* Owned registry — table */}
      <Text size="xs" tt="uppercase" c="dimmed" fw={700} mt="lg" mb="sm">
        Your numbers
      </Text>
      {owned.length === 0 ? (
        <Text size="sm" c="dimmed">
          No numbers yet — search below and provision one.
        </Text>
      ) : (
        <Table
          striped
          highlightOnHover
          verticalSpacing="sm"
          horizontalSpacing="md"
          layout="auto"
          stickyHeader
        >
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Number</Table.Th>
              <Table.Th>Label</Table.Th>
              <Table.Th>Provider</Table.Th>
              <Table.Th>Type / Country</Table.Th>
              <Table.Th>Region prefixes</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Cost</Table.Th>
              <Table.Th ta="right">Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {owned.map((o) => {
              const rowSaving = savingId === o.id;
              return (
                <Table.Tr key={o.id} opacity={rowSaving ? 0.6 : 1}>
                  <Table.Td>
                    <Group gap={8} wrap="nowrap">
                      <Text ff="monospace" fw={700} size="sm">
                        {o.e164}
                      </Text>
                      {o.isDefault ? (
                        <Badge color="green" size="sm" variant="light">
                          default
                        </Badge>
                      ) : null}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{o.purpose || o.name || '—'}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge size="sm" variant="light" color="gray">
                      {o.provider || '—'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {[o.numberType, o.country].filter(Boolean).join(' · ') ||
                        '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {o.regionPrefixes || '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Seal kind={statusSeal(o.status)} />
                      <Text size="sm">{enumLabel(o.status || 'ACTIVE')}</Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {o.monthlyCost ? `${o.monthlyCost}/mo` : '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap" justify="flex-end">
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        leftSection={<IconPencil size={13} />}
                        disabled={rowSaving}
                        onClick={() => setConfiguring(o)}
                      >
                        Configure
                      </Button>
                      {!o.isDefault ? (
                        <Button
                          size="compact-xs"
                          variant="default"
                          disabled={rowSaving}
                          onClick={() =>
                            void updateNumber(o.id, { isDefault: true })
                          }
                        >
                          Make default
                        </Button>
                      ) : null}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}

      {/* Search + provision (unchanged) */}
      <Text size="xs" tt="uppercase" c="dimmed" fw={700} mt="xl" mb="sm">
        Add a number
      </Text>
      <Group gap="sm" align="flex-end" wrap="wrap">
        <Select
          label="Country"
          w={200}
          data={NUMBER_COUNTRIES}
          value={country}
          onChange={(v) => v && setCountry(v)}
          allowDeselect={false}
        />
        <Select
          label="Type"
          w={150}
          data={NUMBER_TYPES}
          value={type}
          onChange={(v) => v && setType(v)}
          allowDeselect={false}
        />
        <Button
          color="red"
          leftSection={<IconSearch size={15} />}
          onClick={() => void search()}
          loading={searching}
        >
          Search
        </Button>
      </Group>

      {msg ? (
        <Text size="sm" mt="sm" c={msg.tone === 'error' ? 'red' : 'green'}>
          {msg.text}
        </Text>
      ) : null}

      {results.length > 0 ? (
        <Stack gap="xs" mt="md">
          {results.map((n) => (
            <Card key={n.e164} withBorder padding="sm" radius="md">
              <Group justify="space-between" wrap="nowrap">
                <Box style={{ minWidth: 0 }}>
                  <Group gap="xs" wrap="wrap">
                    <Text ff="monospace" fw={700} size="sm">
                      {n.e164}
                    </Text>
                    {n.needsBundle ? (
                      <Badge color="yellow" size="sm" variant="light">
                        needs bundle
                      </Badge>
                    ) : (
                      <Badge color="green" size="sm" variant="light">
                        instant
                      </Badge>
                    )}
                  </Group>
                  <Text size="xs" c="dimmed" mt={2}>
                    {[
                      n.provider,
                      n.monthlyCost ? `${n.monthlyCost}/mo` : null,
                      n.addressRequirement ? `addr: ${n.addressRequirement}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </Box>
                <Button
                  color="red"
                  leftSection={<IconPhone size={14} />}
                  disabled={provisioning === n.e164}
                  loading={provisioning === n.e164}
                  onClick={() => void provision(n)}
                >
                  Provision
                </Button>
              </Group>
            </Card>
          ))}
        </Stack>
      ) : null}

      <ConfigureDrawer
        number={configuring}
        saving={configuring !== null && savingId === configuring.id}
        onClose={() => setConfiguring(null)}
        onSave={updateNumber}
      />
    </Box>
  );
};
