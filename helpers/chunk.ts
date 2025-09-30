/**
 * Split an array into chunks of at most `size` items.
 * Useful for Firestore `in` queries, which accept up to 10 values.
 */
export function chunk<T>(arr: T[], size = 10): T[][] {
  if (size <= 0) return [arr.slice()];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
