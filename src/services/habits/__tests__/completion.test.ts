import { clampCount, resolveAdjust, shouldAward } from '../completion';

describe('shouldAward', () => {
  it('awards when the count first reaches the target', () => {
    expect(shouldAward(9, 10, 10, false)).toBe(true);
  });

  it('awards when the count jumps past the target', () => {
    expect(shouldAward(5, 30, 10, false)).toBe(true);
  });

  it('does not award while still below the target', () => {
    expect(shouldAward(5, 9, 10, false)).toBe(false);
  });

  it('does not award twice once already completed', () => {
    expect(shouldAward(9, 10, 10, true)).toBe(false);
  });

  it('does not award when incrementing above an already-passed target', () => {
    expect(shouldAward(12, 15, 10, false)).toBe(false);
  });

  it('awards for a single-step target', () => {
    expect(shouldAward(0, 1, 1, false)).toBe(true);
  });
});

describe('clampCount', () => {
  it('leaves non-negative values alone', () => {
    expect(clampCount(7)).toBe(7);
    expect(clampCount(0)).toBe(0);
  });

  it('floors negative values at zero', () => {
    expect(clampCount(-3)).toBe(0);
  });
});

describe('clampCount', () => {
  it('rounds fractional values, because habit_logs.count is an INTEGER column', () => {
    expect(clampCount(2.4)).toBe(2);
    expect(clampCount(2.6)).toBe(3);
  });
});

describe('shouldAward edge cases', () => {
  it('does not award on a zero-delta adjustment below the target', () => {
    expect(shouldAward(5, 5, 10, false)).toBe(false);
  });

  it('does not award on a decrement while still incomplete', () => {
    expect(shouldAward(5, 3, 10, false)).toBe(false);
  });
});

describe('resolveAdjust', () => {
  const base = { previousCount: 0, previousCompletedAt: null, delta: 0, target: 10, now: 'NOW' };

  it('stamps completedAt the first time the target is crossed', () => {
    const result = resolveAdjust({ ...base, previousCount: 9, delta: 1 });
    expect(result).toEqual({
      newCount: 10,
      completedAt: 'NOW',
      alreadyCompleted: false,
      justCompleted: true,
    });
  });

  it('leaves completedAt null while still below the target', () => {
    const result = resolveAdjust({ ...base, previousCount: 5, delta: 1 });
    expect(result.completedAt).toBeNull();
    expect(result.justCompleted).toBe(false);
  });

  it('preserves the original timestamp on a later increment', () => {
    const result = resolveAdjust({
      ...base,
      previousCount: 10,
      previousCompletedAt: 'EARLIER',
      delta: 1,
    });
    expect(result.completedAt).toBe('EARLIER');
    expect(result.alreadyCompleted).toBe(true);
    expect(result.justCompleted).toBe(false);
  });

  it('preserves the timestamp even when a decrement drives the count to zero', () => {
    const result = resolveAdjust({
      ...base,
      previousCount: 10,
      previousCompletedAt: 'EARLIER',
      delta: -50,
    });
    expect(result.newCount).toBe(0);
    expect(result.completedAt).toBe('EARLIER');
    expect(result.justCompleted).toBe(false);
  });

  it('does not re-award after dropping below the target and climbing back', () => {
    const dropped = resolveAdjust({
      ...base,
      previousCount: 10,
      previousCompletedAt: 'EARLIER',
      delta: -5,
    });
    const climbed = resolveAdjust({
      ...base,
      previousCount: dropped.newCount,
      previousCompletedAt: dropped.completedAt,
      delta: 5,
    });
    expect(climbed.justCompleted).toBe(false);
    expect(climbed.completedAt).toBe('EARLIER');
  });

  it('treats an undefined timestamp (no row yet) as not completed', () => {
    const result = resolveAdjust({ ...base, previousCompletedAt: undefined, delta: 10 });
    expect(result.alreadyCompleted).toBe(false);
    expect(result.justCompleted).toBe(true);
  });
});
