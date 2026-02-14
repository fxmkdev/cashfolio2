export function sum(values: number[]): number {
  return values.reduce<number>((prev, curr) => prev + curr, 0);
}
