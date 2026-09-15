export function shouldAward(
  previousCount: number,
  newCount: number,
  target: number,
  alreadyCompleted: boolean,
): boolean {
  if (alreadyCompleted) {
    return false;
  }
  return previousCount < target && newCount >= target;
}

export function clampCount(value: number): number {
  return Math.max(0, Math.round(value));
}

export type AdjustInput = {
  previousCount: number;
  previousCompletedAt: string | null | undefined;
  delta: number;
  target: number;
  now: string;
};

export type AdjustDecision = {
  newCount: number;
  completedAt: string | null;
  alreadyCompleted: boolean;
  justCompleted: boolean;
};

// Every decision the transaction in `adjustHabitCount` makes, pulled out as a pure
// function so it can be tested without the native module. The transaction itself is
// then just a read, this call, and a write.
export function resolveAdjust({
  previousCount,
  previousCompletedAt,
  delta,
  target,
  now,
}: AdjustInput): AdjustDecision {
  const alreadyCompleted = previousCompletedAt !== null && previousCompletedAt !== undefined;
  const newCount = clampCount(previousCount + delta);
  const justCompleted = shouldAward(previousCount, newCount, target, alreadyCompleted);

  // A completion is never clawed back: once stamped, the timestamp survives any
  // later decrement, even one that drives the count to zero.
  const completedAt = alreadyCompleted ? (previousCompletedAt ?? null) : justCompleted ? now : null;

  return { newCount, completedAt, alreadyCompleted, justCompleted };
}
