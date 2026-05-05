export function rangeStatus(value: number, low: number, high: number): string {
  if (value < low) return "var(--color-danger)";
  if (value > high) return "var(--color-warning)";
  return "var(--color-mint)";
}
