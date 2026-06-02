import {
  type RunAgentInput,
  type RunAgentResult,
} from 'twenty-shared/application';

import { postAgentsEndpoint } from '@/sdk/logic-function/agents/utils/post-agents-endpoint.util';

// Run one of this app's AI agents and return its result. The agent executes
// server-side with its own prompt, skills and tools (so it can read/update
// records itself). Identify the agent by the universalIdentifier you passed
// to defineAgent(). Synchronous: resolves once the agent run completes.
export const runAgent = async (
  input: RunAgentInput,
): Promise<RunAgentResult> => {
  return postAgentsEndpoint<RunAgentInput, RunAgentResult>('run', input);
};
