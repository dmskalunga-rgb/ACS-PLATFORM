import { describe, expect, it } from 'vitest';
import { calculateRating } from './rating-engine.js';
describe('Rating engine', () => {
  it('calculates FLAT, PER_UNIT and graduated tiers deterministically', () => {
    expect(calculateRating({ pricingModel: 'FLAT', quantity: '99', flatAmount: '1.005' })).toBe(
      '1.01',
    );
    expect(
      calculateRating({ pricingModel: 'PER_UNIT', quantity: '2.5', unitRate: '0.10002' }),
    ).toBe('0.25');
    expect(
      calculateRating({
        pricingModel: 'TIERED_GRADUATED',
        quantity: '150',
        tiers: [
          { lower_bound: '0', upper_bound: '100', unit_rate: '0.1' },
          { lower_bound: '100', upper_bound: null, unit_rate: '0.05' },
        ],
      }),
    ).toBe('12.50');
  });
  it('rounds below, at, and above the USD half boundary with HALF_UP', () => {
    expect(calculateRating({ pricingModel: 'FLAT', quantity: '1', flatAmount: '1.0049' })).toBe(
      '1.00',
    );
    expect(calculateRating({ pricingModel: 'FLAT', quantity: '1', flatAmount: '1.005' })).toBe(
      '1.01',
    );
    expect(calculateRating({ pricingModel: 'FLAT', quantity: '1', flatAmount: '1.0051' })).toBe(
      '1.01',
    );
  });
  it('rejects incomplete and discontinuous rules', () => {
    expect(() => calculateRating({ pricingModel: 'PER_UNIT', quantity: '1' })).toThrow();
    expect(() =>
      calculateRating({
        pricingModel: 'TIERED_GRADUATED',
        quantity: '2',
        tiers: [{ lower_bound: '1', upper_bound: null, unit_rate: '1' }],
      }),
    ).toThrow();
  });
});
