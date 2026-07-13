import { fireEvent, render, screen } from '@testing-library/react';

import { DialerDockLauncher } from '@/dialer-dock/components/DialerDock';

describe('DialerDockLauncher', () => {
  it('renders an icon-only 44px circle and activates accessibly', () => {
    let clickCount = 0;
    const onClick = () => {
      clickCount += 1;
    };
    render(<DialerDockLauncher onClick={onClick} />);

    const launcher = screen.getByRole('button', { name: 'Expand dialer' });
    expect(launcher.getAttribute('title')).toBe('Open dialer');
    expect(window.getComputedStyle(launcher)).toMatchObject({
      width: '44px',
      height: '44px',
      borderRadius: '50%',
      padding: '0px',
    });
    expect(launcher.textContent).toBe('');
    expect(launcher.querySelector('svg')).not.toBeNull();

    fireEvent.click(launcher);
    expect(clickCount).toBe(1);
  });
});
