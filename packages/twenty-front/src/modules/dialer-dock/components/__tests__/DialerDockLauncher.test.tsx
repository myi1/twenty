import { fireEvent, render, screen } from '@testing-library/react';

import { DialerDockLauncher } from '@/dialer-dock/components/DialerDock';

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

    const ruleText = getEmotionRuleText(launcher);
    expect(ruleText).toContain('color: var(--t-background-primary-inverted)');
    expect(ruleText).toContain(':focus-visible');
    expect(ruleText).toContain(
      'outline: 2px solid var(--t-font-color-primary)',
    );

    fireEvent.click(launcher);
    expect(clickCount).toBe(1);
  });
});
