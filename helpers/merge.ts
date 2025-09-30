/**
 * Normalize a Firestore Timestamp-like value to millis.
 */
export function toMillis(ts: any): number {
  if (!ts) return 0;
  try {
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  } catch {}
  return 0;
}

/**
 * Dedupe items by id and sort descending by `timestamp`.
 */
export function dedupeSortByTimestampDesc<T extends { id: string; timestamp?: any }>(
  items: T[],
): T[] {
  const deduped = items.filter(
    (v, i, a) => a.findIndex((x) => x.id === v.id) === i,
  );
  return deduped.sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp));
}

/**
 * Merge multiple chunks of items and apply dedupe + timestamp sort.
 */
export function mergeChunksByTsDesc<T extends { id: string; timestamp?: any }>(
  chunks: T[][],
): T[] {
  return dedupeSortByTimestampDesc(chunks.flat());
}
