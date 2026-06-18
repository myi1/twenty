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
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { IconPhone, IconSearch } from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { fetchOwnedNumbers, type OwnedNumber } from '@/propel/lib/numbersCrm';

// Numbers tab of the unified Marketing hero — a Mantine rebuild of the legacy
// Marketing Cloud "Phone numbers" surface (marketing-cloud-numbers.tsx). Reads the
// owned-numbers registry (phoneNumber object over core GraphQL) and runs search /
// provision / tag / make-default through the SAME manager-gated proxy routes the
// old hub used (/voice/numbers/*) via callPropelRoute. The routes hold carrier
// creds server-side and derive the manager gate from the acting role.
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

// One owned-number row with inline tagging. `purpose` and `regionPrefixes` are
// edited locally and committed on blur (only if changed); "Make default" fires
// immediately. All writes go through the manager-gated update route via onSave.
const OwnedNumberRow = ({
  o,
  saving,
  onSave,
}: {
  o: OwnedNumber;
  saving: boolean;
  onSave: (
    id: string,
    patch: { purpose?: string; regionPrefixes?: string; isDefault?: boolean },
  ) => void;
}) => {
  const [purpose, setPurpose] = useState(o.purpose ?? '');
  const [prefixes, setPrefixes] = useState(o.regionPrefixes ?? '');

  // Keep local edits in sync if the registry reloads underneath us.
  useEffect(() => {
    setPurpose(o.purpose ?? '');
    setPrefixes(o.regionPrefixes ?? '');
  }, [o.purpose, o.regionPrefixes]);

  return (
    <Card withBorder padding="sm" radius="md">
      <Group justify="space-between" wrap="nowrap" mb="xs">
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          <Text ff="monospace" fw={700} size="sm">
            {o.e164}
          </Text>
          {o.isDefault ? (
            <Badge color="green" size="sm" variant="light">
              default
            </Badge>
          ) : null}
          {o.status && o.status !== 'ACTIVE' ? (
            <Badge color="yellow" size="sm" variant="light">
              {o.status}
            </Badge>
          ) : null}
        </Group>
        <Group gap="sm" wrap="nowrap">
          {o.monthlyCost ? (
            <Text size="xs" c="dimmed">
              {o.monthlyCost}/mo
            </Text>
          ) : null}
          {!o.isDefault ? (
            <Button
              size="compact-xs"
              variant="default"
              disabled={saving}
              onClick={() => onSave(o.id, { isDefault: true })}
            >
              Make default
            </Button>
          ) : null}
        </Group>
      </Group>
      <Text size="xs" c="dimmed" mb="xs">
        {[o.country, o.numberType, o.provider].filter(Boolean).join(' · ')}
      </Text>
      <Group gap="xs" wrap="nowrap" align="center">
        <TextInput
          style={{ flex: 1 }}
          size="xs"
          value={purpose}
          placeholder="Purpose (e.g. UK outbound)"
          disabled={saving}
          onChange={(e) => setPurpose(e.currentTarget.value)}
          onBlur={() =>
            purpose !== (o.purpose ?? '') && onSave(o.id, { purpose })
          }
          aria-label="Purpose"
        />
        <TextInput
          style={{ flex: 1 }}
          size="xs"
          value={prefixes}
          placeholder="Region prefixes (e.g. +44,+33)"
          disabled={saving}
          onChange={(e) => setPrefixes(e.currentTarget.value)}
          onBlur={() =>
            prefixes !== (o.regionPrefixes ?? '') &&
            onSave(o.id, { regionPrefixes: prefixes })
          }
          aria-label="Region prefixes"
        />
        {saving ? (
          <Text size="xs" c="dimmed">
            Saving…
          </Text>
        ) : null}
      </Group>
    </Card>
  );
};

export const NumbersTab = () => {
  const notify = usePropelToast();
  // The /voice/numbers/* routes derive the acting identity + manager gate from the
  // bearer token server-side; the legacy `actingUserId` body field was sent for
  // parity only ("ignored server-side"), so the hero omits it entirely.
  const [owned, setOwned] = useState<OwnedNumber[]>([]);
  const [country, setCountry] = useState('GB');
  const [type, setType] = useState('mobile');
  const [results, setResults] = useState<AvailableNumber[]>([]);
  const [searching, setSearching] = useState(false);
  const [provisioning, setProvisioning] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  // True until the mount-time gate probe answers — the manager UI must not flash
  // for agents (the actions are always server-gated, but the surface would leak).
  const [checking, setChecking] = useState(true);
  const [savingTag, setSavingTag] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; tone: 'info' | 'error' } | null>(
    null,
  );

  const loadOwned = useCallback(async () => {
    setOwned(await fetchOwnedNumbers());
  }, []);

  // Mount-time gate probe: the search route answers { ok: true } for
  // managers/admins and { forbidden: true } for agents. On a transport error we
  // leave the hub visible — every action is still server-gated.
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
    if (r.error) setMsg({ text: r.error, tone: 'error' });
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
        setMsg({ text: r.error, tone: 'error' });
        notify(r.error, 'error');
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
    async (
      id: string,
      patch: { purpose?: string; regionPrefixes?: string; isDefault?: boolean },
    ) => {
      setSavingTag(id);
      setMsg(null);
      const r = await callPropelRoute<{
        updated?: boolean;
        error?: string;
        forbidden?: boolean;
      }>('/voice/numbers/update', { id, ...patch });
      setSavingTag(null);
      if (r === null) {
        setMsg({ text: 'Update failed — please try again.', tone: 'error' });
        return;
      }
      if (r.forbidden) {
        setForbidden(true);
        return;
      }
      if (r.error) {
        setMsg({ text: r.error, tone: 'error' });
        notify(r.error, 'error');
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
    <Box p="md" style={{ overflowY: 'auto' }}>
      <Stack gap={2} mb="md">
        <Title order={4}>Phone numbers</Title>
        <Text size="sm" c="dimmed" maw={620}>
          The brokerage’s telephony lines. The carrier originates calls presenting
          them; provision new ones by country here.
        </Text>
      </Stack>

      {/* Owned registry */}
      <Text size="xs" tt="uppercase" c="dimmed" fw={700} mt="lg" mb="sm">
        Your numbers
      </Text>
      {owned.length === 0 ? (
        <Text size="sm" c="dimmed">
          No numbers yet — search below and provision one.
        </Text>
      ) : (
        <Stack gap="xs">
          {owned.map((o) => (
            <OwnedNumberRow
              key={o.id}
              o={o}
              saving={savingTag === o.id}
              onSave={updateNumber}
            />
          ))}
        </Stack>
      )}

      {/* Search + provision */}
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
    </Box>
  );
};
