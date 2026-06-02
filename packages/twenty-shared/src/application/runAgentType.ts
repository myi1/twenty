// Request body for POST /apps/agents/run (sent by the SDK runAgent() helper).
export type RunAgentInput = {
  // universalIdentifier of the agent to run (the value passed to defineAgent).
  agentUniversalIdentifier: string;
  // The user message / task given to the agent.
  prompt: string;
};

// Response returned to the SDK helper.
export type RunAgentResult = {
  // The agent's final output. Plain object (text under `response`, or the
  // structured object if the agent declares a responseFormat).
  result: object;
  // True when the workspace ran out of AI credits mid-run; `result` may be empty.
  hasNoMoreAvailableCredits: boolean;
};
