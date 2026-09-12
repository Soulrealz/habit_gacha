export function clampAward(requested: number, awardedToday: number, dailyCap: number): number {
  if (requested <= 0) {
    return 0;
  }

  const remaining = dailyCap - awardedToday;
  if (remaining <= 0) {
    return 0;
  }

  return Math.min(requested, remaining);
}
