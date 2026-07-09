import { settingsDraftRoleFamilyState } from '@/settings/roles/states/settingsDraftRoleFamilyState';
import { HERO_KEY_TO_FLAG_KEY } from '@/propel/runtime/heroKeyToFlagKey';
import { TableCell } from '@/ui/layout/table/components/TableCell';
import { TableHeader } from '@/ui/layout/table/components/TableHeader';
import { TableRow } from '@/ui/layout/table/components/TableRow';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { useSetAtomFamilyState } from '@/ui/utilities/state/jotai/hooks/useSetAtomFamilyState';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useContext } from 'react';
import {
  H2Title,
  IconArrowsSort,
  IconCalendarEvent,
  IconFileText,
  IconHome,
  IconInbox,
  IconPhone,
  IconPhoto,
  IconRocket,
  IconSettings,
  IconUsers,
  type IconComponent,
} from 'twenty-ui/display';
import { Checkbox } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { ThemeContext, themeCssVariables } from 'twenty-ui/theme-constants';
import { v4 } from 'uuid';

// "Feature access" — a NATIVE Settings → Roles section that toggles which PROPEL_*
// hero permission flags each role grants (Inbox, Marketing hub, Media Studio, …).
//
// Unlike the built-in Tool/Settings sections (which iterate the twenty-shared
// `PermissionFlagType` enum), these flags are APP-defined by the propel-crm app.
// They are NOT in that enum — but they are carried on the very same plumbing:
//   • `RolePermissionFlag.flag` is a plain `String` (not the enum), and GetRoles
//     returns EVERY flag a role holds, so `settingsDraftRole.permissionFlags`
//     already contains any PROPEL_* flags the role has.
//   • The role's existing Save button (`useSaveDraftRoleToDB` → `upsertPermissionFlags`,
//     whose `permissionFlagKeys` input is `[String!]`) sends back the COMPLETE flag
//     list on save.
// So this section reads/writes the SAME draft array the native sections do — a toggle
// just adds/removes a `{ id, flag, roleId }` entry and rides the native Save. No
// separate mutation, no app-route call, and non-propel flags are never clobbered.
//
// Admin/owner roles (`canUpdateAllSettings`) always see every hero (the engine's
// heroadmin shortcut), so their toggles render all-on + disabled — mirroring the
// native `isAllSettingsOverride` rule.

type PropelFeature = {
  flagKey: string;
  name: string;
  description: string;
  Icon: IconComponent;
};

// Friendly label + icon per PROPEL hero flag key. Keyed by flag key so the ordered
// list below can be derived straight from HERO_KEY_TO_FLAG_KEY (the runtime hero→flag
// source of truth) + the standalone PROPEL_NUMBER_HUB flag.
const PROPEL_FEATURE_META: Record<
  string,
  { name: string; description: string; Icon: IconComponent }
> = {
  PROPEL_INBOX: {
    name: 'Inbox',
    description: 'Unified conversation inbox and triage',
    Icon: IconInbox,
  },
  PROPEL_MARKETING_HUB: {
    name: 'Marketing hub',
    description: 'Marketing cloud home and overview',
    Icon: IconRocket,
  },
  PROPEL_CAMPAIGN_BUILDER: {
    name: 'Media Studio / Campaign builder',
    description: 'Create and manage marketing campaigns',
    Icon: IconPhoto,
  },
  PROPEL_LISTING_STUDIO: {
    name: 'Listing Studio',
    description: 'Guided listing creation and publishing',
    Icon: IconHome,
  },
  PROPEL_A2A_STUDIO: {
    name: 'A2A Studio',
    description: 'Agent-to-agent document workflows',
    Icon: IconFileText,
  },
  PROPEL_SEQUENCE_EDITOR: {
    name: 'Sequence editor',
    description: 'Build and edit nurture sequences',
    Icon: IconArrowsSort,
  },
  PROPEL_SOCIAL_CALENDAR: {
    name: 'Social calendar',
    description: 'Schedule and manage social posts',
    Icon: IconCalendarEvent,
  },
  PROPEL_SETTINGS_HUB: {
    name: 'Settings hub',
    description: 'Propel configuration and feature access',
    Icon: IconSettings,
  },
  PROPEL_ONE_ON_ONE_RUNNER: {
    name: 'One-on-one runner',
    description: 'Run structured one-on-one sessions',
    Icon: IconUsers,
  },
  PROPEL_NUMBER_HUB: {
    name: 'Number hub',
    description: 'Manage phone numbers and calling',
    Icon: IconPhone,
  },
};

// Ordered feature list: the 9 heroes wired in HERO_KEY_TO_FLAG_KEY, plus the
// standalone Number hub flag (which has no nav key today but is a real hero flag).
const PROPEL_FEATURES: PropelFeature[] = [
  ...Object.values(HERO_KEY_TO_FLAG_KEY),
  'PROPEL_NUMBER_HUB',
]
  .filter((flagKey, index, all) => all.indexOf(flagKey) === index)
  .map((flagKey) => {
    const meta = PROPEL_FEATURE_META[flagKey];
    return {
      flagKey,
      name: meta?.name ?? flagKey,
      description: meta?.description ?? '',
      Icon: meta?.Icon ?? IconRocket,
    };
  });

const PROPEL_FEATURE_FLAG_SET = new Set<string>(
  PROPEL_FEATURES.map((feature) => feature.flagKey),
);

const StyledTable = styled.div`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
`;

const StyledTableRows = styled.div`
  padding-bottom: ${themeCssVariables.spacing[2]};
  padding-top: ${themeCssVariables.spacing[2]};
`;

const StyledName = styled.span`
  color: ${themeCssVariables.font.color.primary};
`;

const StyledDescription = styled.span`
  color: ${themeCssVariables.font.color.secondary};
`;

const StyledIconContainer = styled.div`
  align-items: center;
  display: flex;
  justify-content: center;
`;

type SettingsRolePermissionsPropelFeaturesSectionProps = {
  roleId: string;
  isEditable: boolean;
};

export const SettingsRolePermissionsPropelFeaturesSection = ({
  roleId,
  isEditable,
}: SettingsRolePermissionsPropelFeaturesSectionProps) => {
  const { theme } = useContext(ThemeContext);
  const settingsDraftRole = useAtomFamilyStateValue(
    settingsDraftRoleFamilyState,
    roleId,
  );
  const setSettingsDraftRole = useSetAtomFamilyState(
    settingsDraftRoleFamilyState,
    roleId,
  );

  // Admins (canUpdateAllSettings) always see every hero — mirror the engine's
  // heroadmin shortcut: force all-on + disabled.
  const isAdminOverride = settingsDraftRole.canUpdateAllSettings === true;

  const isFlagEnabled = (flagKey: string) =>
    settingsDraftRole.permissionFlags?.some(
      (permissionFlag) => permissionFlag.flag === flagKey,
    ) ?? false;

  const allFeaturesEnabled = PROPEL_FEATURES.every((feature) =>
    isFlagEnabled(feature.flagKey),
  );
  const someFeaturesEnabled = PROPEL_FEATURES.some((feature) =>
    isFlagEnabled(feature.flagKey),
  );

  const setFeatureFlag = (flagKey: string, value: boolean) => {
    const currentPermissionFlags = settingsDraftRole.permissionFlags ?? [];

    if (value === true) {
      if (currentPermissionFlags.some((flag) => flag.flag === flagKey)) {
        return;
      }
      setSettingsDraftRole({
        ...settingsDraftRole,
        permissionFlags: [
          ...currentPermissionFlags,
          { id: v4(), flag: flagKey, roleId },
        ],
      });
    } else {
      setSettingsDraftRole({
        ...settingsDraftRole,
        permissionFlags: currentPermissionFlags.filter(
          (flag) => flag.flag !== flagKey,
        ),
      });
    }
  };

  const toggleAllFeatures = () => {
    const newValue = !allFeaturesEnabled;
    // Preserve every non-propel flag the role holds; only add/remove the propel set.
    const nonPropelFlags = (settingsDraftRole.permissionFlags ?? []).filter(
      (flag) => !PROPEL_FEATURE_FLAG_SET.has(flag.flag),
    );
    const propelFlags = newValue
      ? PROPEL_FEATURES.map((feature) => ({
          id: v4(),
          flag: feature.flagKey,
          roleId,
        }))
      : [];

    setSettingsDraftRole({
      ...settingsDraftRole,
      permissionFlags: [...nonPropelFlags, ...propelFlags],
    });
  };

  return (
    <Section>
      <H2Title
        title={t`Feature access`}
        description={t`Choose which Propel features each role can access`}
      />
      <StyledTable>
        <TableRow gridAutoColumns="3fr 4fr 24px">
          <TableHeader>{t`Name`}</TableHeader>
          <TableHeader>{t`Description`}</TableHeader>
          <TableHeader
            align="right"
            padding={`0 ${themeCssVariables.spacing[1]} 0 ${themeCssVariables.spacing[2]}`}
            aria-label={t`Actions`}
          >
            <Checkbox
              checked={isAdminOverride || allFeaturesEnabled}
              indeterminate={
                !isAdminOverride &&
                someFeaturesEnabled &&
                !allFeaturesEnabled
              }
              disabled={!isEditable || isAdminOverride}
              aria-label={t`Toggle all feature access`}
              onChange={toggleAllFeatures}
            />
          </TableHeader>
        </TableRow>
        <StyledTableRows>
          {PROPEL_FEATURES.map((feature) => {
            const isChecked =
              isAdminOverride || isFlagEnabled(feature.flagKey);
            const isDisabled = !isEditable || isAdminOverride;

            const handleChange = (value: boolean) => {
              if (isDisabled) return;
              setFeatureFlag(feature.flagKey, value);
            };

            return (
              <TableRow
                key={feature.flagKey}
                gridAutoColumns="3fr 4fr 24px"
                onClick={() => handleChange(!isChecked)}
                cursor={isDisabled ? 'default' : 'pointer'}
              >
                <TableCell gap={themeCssVariables.spacing[2]}>
                  <StyledIconContainer>
                    <feature.Icon
                      size={theme.icon.size.md}
                      color={theme.font.color.primary}
                      stroke={theme.icon.stroke.sm}
                    />
                  </StyledIconContainer>
                  <StyledName>{feature.name}</StyledName>
                </TableCell>
                <TableCell gap={themeCssVariables.spacing[2]}>
                  <StyledDescription>{feature.description}</StyledDescription>
                </TableCell>
                <TableCell
                  align="right"
                  padding={`0 ${themeCssVariables.spacing[1]} 0 ${themeCssVariables.spacing[2]}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    checked={isChecked}
                    disabled={isDisabled}
                    onChange={(event) => handleChange(event.target.checked)}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </StyledTableRows>
      </StyledTable>
    </Section>
  );
};
