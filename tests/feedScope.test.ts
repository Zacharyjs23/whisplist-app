import {
  canViewerSeeWish,
  normalizeWishScope,
} from '../functions/src/feedVisibility';

describe('feed visibility', () => {
  it('normalizes wish scope values', () => {
    expect(normalizeWishScope('friends')).toBe('friends');
    expect(normalizeWishScope('ANON')).toBe('anon');
    expect(normalizeWishScope('unknown')).toBe('all');
    expect(normalizeWishScope(null)).toBe('all');
  });

  it('allows public wishes for any viewer', () => {
    expect(
      canViewerSeeWish({
        scope: 'all',
        ownerId: 'u1',
        viewerId: null,
      }),
    ).toBe(true);
    expect(
      canViewerSeeWish({
        scope: 'anon',
        ownerId: 'u1',
        viewerId: 'u2',
      }),
    ).toBe(true);
  });

  it('grants access to owners regardless of scope', () => {
    expect(
      canViewerSeeWish({
        scope: 'close',
        ownerId: 'owner',
        viewerId: 'owner',
      }),
    ).toBe(true);
  });

  it('requires mutual friendship for friends scope', () => {
    expect(
      canViewerSeeWish({
        scope: 'friends',
        ownerId: 'owner',
        viewerId: 'viewer',
        isFriend: true,
      }),
    ).toBe(true);
    expect(
      canViewerSeeWish({
        scope: 'friends',
        ownerId: 'owner',
        viewerId: 'viewer',
        isFriend: false,
      }),
    ).toBe(false);
  });

  it('requires close access for close scope', () => {
    expect(
      canViewerSeeWish({
        scope: 'close',
        ownerId: 'owner',
        viewerId: 'viewer',
        isClose: true,
      }),
    ).toBe(true);
    expect(
      canViewerSeeWish({
        scope: 'close',
        ownerId: 'owner',
        viewerId: 'viewer',
        isClose: false,
      }),
    ).toBe(false);
  });

  it('denies restricted scopes for unauthenticated viewers', () => {
    expect(
      canViewerSeeWish({
        scope: 'friends',
        ownerId: 'owner',
        viewerId: null,
      }),
    ).toBe(false);
    expect(
      canViewerSeeWish({
        scope: 'close',
        ownerId: 'owner',
        viewerId: null,
      }),
    ).toBe(false);
  });
});
