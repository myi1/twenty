import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';

import { runAgent } from '@/sdk/logic-function/agents/run-agent';

describe('runAgent', () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    process.env.TWENTY_API_URL = 'https://api.test';
    process.env.TWENTY_APP_ACCESS_TOKEN = 'app-token';
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    delete process.env.TWENTY_API_URL;
    delete process.env.TWENTY_APP_ACCESS_TOKEN;
    fetchSpy.mockRestore();
  });

  it('POSTs the agent id + prompt to /apps/agents/run and returns the result', async () => {
    const payload = {
      result: { response: 'done' },
      hasNoMoreAvailableCredits: false,
    };

    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 }),
    );

    const result = await runAgent({
      agentUniversalIdentifier: 'agent-uid',
      prompt: 'Enrich record 123',
    });

    expect(result).toEqual(payload);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.test/apps/agents/run',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          agentUniversalIdentifier: 'agent-uid',
          prompt: 'Enrich record 123',
        }),
        headers: expect.objectContaining({
          Authorization: 'Bearer app-token',
        }),
      }),
    );
  });

  it('surfaces non-2xx HTTP responses as a regular Error', async () => {
    fetchSpy.mockResolvedValue(
      new Response('boom', { status: 500, statusText: 'Server Error' }),
    );

    await expect(
      runAgent({ agentUniversalIdentifier: 'a', prompt: 'p' }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it('throws when the runtime env vars are missing', async () => {
    delete process.env.TWENTY_API_URL;

    await expect(
      runAgent({ agentUniversalIdentifier: 'a', prompt: 'p' }),
    ).rejects.toThrow(/requires the app runtime env vars/);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
