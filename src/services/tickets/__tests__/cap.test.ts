import { clampAward } from '../cap';

describe('clampAward', () => {
  it('grants the full amount when well under the cap', () => {
    expect(clampAward(1, 0, 5)).toBe(1);
  });

  it('grants the full amount when it exactly reaches the cap', () => {
    expect(clampAward(2, 3, 5)).toBe(2);
  });

  it('clips the amount when it would exceed the cap', () => {
    expect(clampAward(3, 4, 5)).toBe(1);
  });

  it('grants nothing when the cap is already reached', () => {
    expect(clampAward(1, 5, 5)).toBe(0);
  });

  it('grants nothing when already somehow over the cap', () => {
    expect(clampAward(1, 7, 5)).toBe(0);
  });

  it('grants nothing for a zero or negative request', () => {
    expect(clampAward(0, 0, 5)).toBe(0);
    expect(clampAward(-2, 0, 5)).toBe(0);
  });
});

describe('clampAward at the cap boundary', () => {
  it('clips a single request that exceeds the whole cap from zero', () => {
    expect(clampAward(10, 0, 5)).toBe(5);
  });
});
