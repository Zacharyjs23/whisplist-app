export type WishScope = 'all' | 'friends' | 'close' | 'anon';

const SCOPES: WishScope[] = ['all', 'friends', 'close', 'anon'];

export function normalizeWishScope(input: unknown): WishScope {
  if (typeof input === 'string') {
    const lowered = input.toLowerCase();
    if ((SCOPES as string[]).includes(lowered)) {
      return lowered as WishScope;
    }
  }
  return 'all';
}

export function canViewerSeeWish(params: {
  scope: WishScope | null | undefined;
  ownerId: string | null | undefined;
  viewerId: string | null;
  isFriend?: boolean;
  isClose?: boolean;
}): boolean {
  const scope = normalizeWishScope(params.scope);
  const ownerId = typeof params.ownerId === 'string' ? params.ownerId : null;
  const viewerId =
    typeof params.viewerId === 'string' && params.viewerId.length
      ? params.viewerId
      : null;

  if (!ownerId) {
    // Wishes without an owner should only surface if explicitly public.
    return scope === 'all' || scope === 'anon';
  }

  if (viewerId === ownerId) return true;

  switch (scope) {
    case 'all':
    case 'anon':
      return true;
    case 'friends':
      return Boolean(viewerId && params.isFriend);
    case 'close':
      return Boolean(viewerId && params.isClose);
    default:
      return false;
  }
}
