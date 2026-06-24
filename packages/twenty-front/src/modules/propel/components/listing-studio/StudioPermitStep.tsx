import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  Group,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconShield, IconAlertTriangle, IconExternalLink, IconId } from 'twenty-ui/display';
import {
  type StudioPermit,
  type StudioPermitAuthority,
} from '@/propel/types/listingStudio';
import { validateStudioPermit } from '@/propel/lib/listingStudioRoutes';

// Step 5 — Permit (lane spec §4.7 / §9). Trakheesi stays MANUAL (founder): the agent
// obtains the permit from DLD; here they enter it and we VALIDATE it against PF's
// DLD record (/listing-studio/permit) — returning the expiry + what it covers. The
// authority segmented (RERA / DTCM / ADREC), the permit + license fields, the
// validation box, and the userConfirmedDataIsCorrect attestation. Publish is gated
// on a validated permit + the attestation (enforced again server-side).

const AUTHORITIES: { id: StudioPermitAuthority; label: string }[] = [
  { id: 'rera', label: 'RERA (Dubai)' },
  { id: 'dtcm', label: 'DTCM (Dubai holiday)' },
  { id: 'adrec', label: 'ADREC (Abu Dhabi)' },
];

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
};

export const StudioPermitStep = ({
  permit,
  onPermit,
}: {
  permit: StudioPermit | undefined;
  onPermit: (permit: StudioPermit) => void;
}) => {
  const p = permit ?? {};
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<{
    valid: boolean;
    expiresAt?: string;
    validationURL?: string;
    covers?: Record<string, unknown>;
    reason?: string;
  } | null>(permit?.validated ? { valid: true, expiresAt: permit.expiresAt } : null);

  const authority: StudioPermitAuthority = p.authority ?? 'rera';

  const patch = (patchObj: Partial<StudioPermit>) => onPermit({ ...p, ...patchObj });

  const validate = async () => {
    if (!p.permitNumber || !p.licenseNumber) {
      setErr('Enter both the permit number and the issuing client/broker license number.');
      return;
    }
    setBusy(true);
    setErr('');
    const res = await validateStudioPermit({
      permitNumber: p.permitNumber,
      licenseNumber: p.licenseNumber,
      authority,
    });
    setBusy(false);
    if (!res) {
      setErr("Couldn't reach Property Finder to validate the permit. Try again.");
      return;
    }
    setResult(res);
    onPermit({
      ...p,
      authority,
      validated: res.valid,
      expiresAt: res.expiresAt,
    });
  };

  return (
    <Stack gap="md">
      <Box>
        <Text fw={600}>Permit</Text>
        <Text size="sm" c="dimmed">
          Enter the Trakheesi advertising permit you obtained from DLD. We validate it
          against Property Finder's record — we don't issue it.
        </Text>
      </Box>

      <Alert color="blue" variant="light" icon={<IconId size={16} />}>
        You already hold the title deed and Form A — apply for the advertising permit
        at DLD (Trakheesi), then enter the number below.
      </Alert>

      <Card withBorder radius="md" padding="lg">
        <Stack gap="md">
          {/* Authority segmented. */}
          <Box>
            <Text size="sm" fw={500} mb={6}>
              Authority
            </Text>
            <Group gap={6}>
              {AUTHORITIES.map((a) => (
                <Button
                  key={a.id}
                  size="xs"
                  variant={authority === a.id ? 'filled' : 'default'}
                  color={authority === a.id ? 'red' : 'gray'}
                  onClick={() => patch({ authority: a.id })}
                >
                  {a.label}
                </Button>
              ))}
            </Group>
          </Box>

          <Group grow>
            <TextInput
              label="Permit number"
              placeholder="e.g. 7129834521"
              value={p.permitNumber ?? ''}
              onChange={(e) => {
                patch({ permitNumber: e.currentTarget.value, validated: false });
                setResult(null);
              }}
            />
            <TextInput
              label="Issuing client / broker license"
              placeholder="License number"
              value={p.licenseNumber ?? ''}
              onChange={(e) => {
                patch({ licenseNumber: e.currentTarget.value, validated: false });
                setResult(null);
              }}
            />
          </Group>

          <TextInput
            type="date"
            label="Permit issuance date"
            value={p.issuanceDate ? p.issuanceDate.slice(0, 10) : ''}
            onChange={(e) =>
              patch({
                issuanceDate: e.currentTarget.value
                  ? new Date(e.currentTarget.value).toISOString()
                  : undefined,
              })
            }
          />

          <Group>
            <Button
              leftSection={<IconShield size={16} />}
              color="red"
              variant="light"
              loading={busy}
              onClick={() => void validate()}
            >
              Validate permit
            </Button>
          </Group>

          {err && (
            <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />}>
              {err}
            </Alert>
          )}

          {result && (
            <Alert
              color={result.valid ? 'teal' : 'red'}
              variant="light"
              icon={result.valid ? <IconShield size={16} /> : <IconAlertTriangle size={16} />}
              title={result.valid ? 'Permit validated' : 'Permit not valid'}
            >
              {result.valid ? (
                <Stack gap={4}>
                  {result.expiresAt && (
                    <Text size="sm">Expires {fmtDate(result.expiresAt)}.</Text>
                  )}
                  {result.covers?.locationName !== undefined && (
                    <Text size="xs" c="dimmed">
                      Covers: {String(result.covers.locationName)}
                      {result.covers.size ? ` · ${String(result.covers.size)} sqft` : ''}
                      {result.covers.roomsCount ? ` · ${String(result.covers.roomsCount)} rooms` : ''}
                    </Text>
                  )}
                  {result.validationURL && (
                    <Button
                      component="a"
                      href={result.validationURL}
                      target="_blank"
                      rel="noopener"
                      size="compact-xs"
                      variant="subtle"
                      leftSection={<IconExternalLink size={12} />}
                      style={{ alignSelf: 'flex-start' }}
                    >
                      View on DLD
                    </Button>
                  )}
                </Stack>
              ) : (
                <Text size="sm">
                  {result.reason ?? 'Property Finder could not validate this permit. Check the numbers and authority.'}
                </Text>
              )}
            </Alert>
          )}

          {/* Attestation — required to publish. */}
          <Checkbox
            checked={p.userConfirmedDataIsCorrect === true}
            onChange={(e) => patch({ userConfirmedDataIsCorrect: e.currentTarget.checked })}
            color="red"
            label={
              <Text size="sm">
                I confirm the permit and listing data are correct and that I am
                authorized to advertise this property.
              </Text>
            }
          />
        </Stack>
      </Card>
    </Stack>
  );
};
