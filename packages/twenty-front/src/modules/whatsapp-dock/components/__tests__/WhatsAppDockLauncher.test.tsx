import { fireEvent, render, screen } from '@testing-library/react';

import { WhatsAppDockLauncher } from '@/whatsapp-dock/components/WhatsAppDock';

describe('WhatsAppDockLauncher', () => {
  it('renders the brand icon in an icon-only 44px circle and activates accessibly', () => {
    let clickCount = 0;
    const onClick = () => {
      clickCount += 1;
    };
    render(<WhatsAppDockLauncher onClick={onClick} />);

    const launcher = screen.getByRole('button', { name: 'Open WhatsApp' });
    expect(launcher.getAttribute('title')).toBe('Open WhatsApp');
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
