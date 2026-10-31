import { checkResourceBudget } from "./resource-context.server";
export async function mapWithConcurrencyLimit<TInput, TOutput>(
  items: readonly TInput[],
  concurrencyLimit: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<TOutput>(items.length);
  const normalizedLimit = Number.isFinite(concurrencyLimit)
    ? Math.floor(concurrencyLimit)
    : 1;
  const workerCount = Math.min(Math.max(1, normalizedLimit), items.length);
  let nextIndex = 0;
  let failure: { reason: unknown } | undefined;

  await Promise.allSettled(
    Array.from({ length: workerCount }, async () => {
      while (!failure && nextIndex < items.length) {
        try {
          checkResourceBudget();
          const currentIndex = nextIndex;
          nextIndex += 1;
          results[currentIndex] = await mapper(
            items[currentIndex]!,
            currentIndex,
          );
        } catch (reason) {
          failure ??= { reason };
        }
      }
    }),
  );

  if (failure) throw failure.reason;
  return results;
}
