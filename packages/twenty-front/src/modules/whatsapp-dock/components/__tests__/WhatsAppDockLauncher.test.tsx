import { fireEvent, render, screen } from '@testing-library/react';

import { WhatsAppDockLauncher } from '@/whatsapp-dock/components/WhatsAppDock';

const getEmotionRuleText = (element: HTMLElement) => {
  const emotionClassName = [...element.classList].find((className) =>
    className.startsWith('css-'),
  );

  return [...document.styleSheets]
    .flatMap((styleSheet) => [...styleSheet.cssRules])
    .filter(
      (rule) =>
        emotionClassName !== undefined &&
        rule.cssText.includes(`.${emotionClassName}`),
    )
    .map((rule) => rule.cssText)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
};

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

    const ruleText = getEmotionRuleText(launcher);
    expect(ruleText).toContain('color: white');
    expect(ruleText).toContain(':focus-visible');
    expect(ruleText).toContain(
      'outline: 2px solid var(--t-font-color-primary)',
    );

    fireEvent.click(launcher);
    expect(clickCount).toBe(1);
  });
});
