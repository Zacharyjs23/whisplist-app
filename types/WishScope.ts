export type WishScope = 'all' | 'friends' | 'close' | 'anon';

export const WISH_SCOPES: WishScope[] = ['all', 'friends', 'close', 'anon'];

export function isWishScope(value: unknown): value is WishScope {
  return typeof value === 'string' && (WISH_SCOPES as string[]).includes(value);
}

export function normalizeWishScope(value: unknown): WishScope {
  if (isWishScope(value)) return value;
  return 'all';
}
