export function remainingFeedItems<T extends { id: string }>(
  items: readonly T[],
  exhaustedIds: ReadonlySet<string>,
): T[] {
  if (exhaustedIds.size === 0) return [...items];
  return items.filter((item) => !exhaustedIds.has(item.id));
}
