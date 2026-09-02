import { describe, it, expect } from 'vitest';
import { numberToWordsIndian } from './number-to-words';

describe('numberToWordsIndian', () => {
  it('handles the required fixtures', () => {
    expect(numberToWordsIndian(0)).toBe('ZERO');
    expect(numberToWordsIndian(1)).toBe('ONE');
    expect(numberToWordsIndian(19)).toBe('NINETEEN');
    expect(numberToWordsIndian(20)).toBe('TWENTY');
    expect(numberToWordsIndian(99)).toBe('NINETY NINE');
    expect(numberToWordsIndian(100)).toBe('ONE HUNDRED');
    expect(numberToWordsIndian(999)).toBe('NINE HUNDRED NINETY NINE');
    expect(numberToWordsIndian(1000)).toBe('ONE THOUSAND');
    expect(numberToWordsIndian(12479)).toBe('TWELVE THOUSAND FOUR HUNDRED SEVENTY NINE');
    expect(numberToWordsIndian(100000)).toBe('ONE LAKH');
    expect(numberToWordsIndian(1234567)).toBe('TWELVE LAKH THIRTY FOUR THOUSAND FIVE HUNDRED SIXTY SEVEN');
    expect(numberToWordsIndian(10000000)).toBe('ONE CRORE');
  });

  it('rounds to the nearest rupee', () => {
    expect(numberToWordsIndian(12478.6)).toBe('TWELVE THOUSAND FOUR HUNDRED SEVENTY NINE');
    expect(numberToWordsIndian(12479.4)).toBe('TWELVE THOUSAND FOUR HUNDRED SEVENTY NINE');
  });
});
