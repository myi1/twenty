import {
  DEFAULT_API_URL_NAME,
  DEFAULT_APP_ACCESS_TOKEN_NAME,
} from 'twenty-shared/application';

// Shared transport for `/apps/agents/*` endpoints. Centralises the env-var
// check, auth header, and HTTP error translation. Mirrors the connections
// transport so both features behave identically at runtime.
export const postAgentsEndpoint = async <TBody, TResponse>(
  path: 'run',
  body: TBody,
): Promise<TResponse> => {
  const apiUrl = process.env[DEFAULT_API_URL_NAME];
  const accessToken = process.env[DEFAULT_APP_ACCESS_TOKEN_NAME];

  if (!apiUrl || !accessToken) {
    throw new Error(
      `runAgent() requires the app runtime env vars ` +
        `${DEFAULT_API_URL_NAME} and ${DEFAULT_APP_ACCESS_TOKEN_NAME}.`,
    );
  }

  const response = await fetch(`${apiUrl}/apps/agents/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `runAgent() failed: HTTP ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as TResponse;
};
