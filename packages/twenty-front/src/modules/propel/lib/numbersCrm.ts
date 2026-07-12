import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

// The Numbers tab reads the brokerage's owned telephony lines (phoneNumber
// object) directly over the core GraphQL endpoint with the AGENT'S OWN session
// token — same thin-fetch bridge the A2A Studio (a2aCrm.ts), the 1:1 Runner
// (oneOnOneCrm.ts) and the dialer dock (dialerCrmBridge.ts) use, NOT the Apollo
// client. The legacy Marketing Cloud read this via CoreApiClient; the route world
// has no CoreApiClient, so we hand-write the `phoneNumbers` query. All WRITES
// (search / provision / tag / default) still go through the manager-gated
// /voice/numbers/* routes via callPropelRoute — this helper is read-only.

export type OwnedNumber = {
  id: string;
  name?: string;
  e164: string;
  provider: string;
  country?: string;
  numberType?: string;
  purpose?: string;
  regionPrefixes?: string;
  isDefault?: boolean;
  status?: string;
  monthlyCost?: string;
};

const OWNED_NUMBERS_QUERY = `
  query PropelOwnedPhoneNumbers {
    phoneNumbers(first: 50) {
      edges {
        node {
          id
          name
          e164
          provider
          country
          numberType
          purpose
          regionPrefixes
          isDefault
          status
          monthlyCost
        }
      }
    }
  }
`;

// Read the owned-numbers registry. Returns [] on any error (registry may be
// empty / the object not yet installed) — the tab renders an empty state.
export const fetchOwnedNumbers = async (): Promise<OwnedNumber[]> => {
  const token = getTokenPair()?.accessOrWorkspaceAgnosticToken?.token;
  if (token === undefined || token === '') {
    return [];
  }
  try {
    const response = await fetch(`${REACT_APP_SERVER_BASE_URL}/graphql`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: OWNED_NUMBERS_QUERY, variables: {} }),
    });
    if (!response.ok) {
      return [];
    }
    const json = (await response.json()) as {
      data?: { phoneNumbers?: { edges?: { node: OwnedNumber }[] } };
    };
    return (json.data?.phoneNumbers?.edges ?? []).map((e) => e.node);
  } catch {
    return [];
  }
};
