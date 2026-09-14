import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { AgentHome } from '@/propel/components/runner/AgentHome';
import { type AgentBlock } from '@/propel/types/oneOnOne';

const degradedAgent: AgentBlock = {
  nextMeeting: null,
  openLeads: 62,
  openLeadsError: null,
  manager: { id: 'manager-1', label: 'Nancy' },
  agentDetailsAvailability: 'DEGRADED',
  agentDetailsError: 'AGENT_DETAILS_UNAVAILABLE',
};

describe('AgentHome agent-detail degradation', () => {
  it('keeps the panel and gives a plain refresh message without provider text', () => {
    render(
      <MantineProvider>
        <AgentHome
          agent={degradedAgent}
          onBook={() => {}}
          onRunMeeting={() => {}}
        />
      </MantineProvider>,
    );

    expect(screen.getByText('62')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      /^Some 1:1 details are unavailable\. Refresh the page to try again\.$/,
    );
    expect(screen.queryByText(/PERMISSION_DENIED|SECRET_/)).not.toBeInTheDocument();
  });
});
