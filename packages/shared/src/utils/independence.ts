export function calculateIndependenceWeight(
  principalId1: string,
  principalId2: string
): number {
  if (principalId1 === principalId2) {
    return 0.0;
  }
  return 1.0;
}

export function aggregateIndependentWeight(reproductions: { independence_weight: number }[]): number {
  return reproductions.reduce((sum, r) => sum + r.independence_weight, 0);
}
