import { compactFilterLabel } from '../filterLabels';

const options = [
  { value: 'emaar', label: 'Emaar Properties' },
  { value: 'damac', label: 'DAMAC' },
  { value: 'meraas', label: 'Meraas' },
];

describe('compactFilterLabel', () => {
  it('uses the empty label when no values are selected', () => {
    expect(compactFilterLabel(options, [], 'All developers')).toBe('All developers');
  });

  it('shows the full selected label for one value', () => {
    expect(compactFilterLabel(options, ['emaar'], 'All developers')).toBe('Emaar Properties');
  });

  it('summarizes additional selected values without adding more pills', () => {
    expect(compactFilterLabel(options, ['emaar', 'damac', 'meraas'], 'All developers')).toBe(
      'Emaar Properties +2',
    );
  });
});
