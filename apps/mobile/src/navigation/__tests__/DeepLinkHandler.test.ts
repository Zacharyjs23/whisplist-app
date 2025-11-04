/* eslint-disable import/first */
jest.mock('@/shared/logger', () => ({
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('@/contexts/AuthSessionContext', () => ({
  useAuthSession: jest.fn(() => ({ user: null, loading: false })),
}));

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}));

jest.mock('expo-linking', () => {
  const listeners = new Set<any>();
  return {
    parse: jest.fn((url: string) => {
      try {
        const parsed = new URL(url, 'https://fallback.whisplist.test');
        const path = parsed.pathname.startsWith('/')
          ? parsed.pathname.slice(1)
          : parsed.pathname;
        return { path };
      } catch {
        return { path: undefined };
      }
    }),
    openURL: jest.fn(),
    getInitialURL: jest.fn(async () => null),
    addEventListener: jest.fn((event: string, handler: any) => {
      if (event === 'url') {
        listeners.add(handler);
      }
      return {
        remove: () => {
          listeners.delete(handler);
        },
      };
    }),
    _emit: (url: string) => {
      listeners.forEach((handler) => handler({ url }));
    },
  };
});

import {
  ensureAbsoluteUrl,
  parseWishlistDeepLink,
  WishlistDeepLinkController,
} from '../DeepLinkHandler';

describe('parseWishlistDeepLink', () => {
  it('extracts listId from /w path', () => {
    const parsed = parseWishlistDeepLink('https://whisplist.app/w/abc123');
    expect(parsed).toEqual({
      listId: 'abc123',
      url: 'https://whisplist.app/w/abc123',
    });
  });

  it('handles Expo development deep links', () => {
    const parsed = parseWishlistDeepLink(
      'exp://127.0.0.1:19000/--/wishlist/abc-789',
    );
    expect(parsed).toEqual({
      listId: 'abc-789',
      url: 'exp://127.0.0.1:19000/--/wishlist/abc-789',
    });
  });
});

describe('ensureAbsoluteUrl', () => {
  it('appends relative path to fallback origin', () => {
    expect(ensureAbsoluteUrl('/foo/bar', 'https://whisplist.app')).toBe(
      'https://whisplist.app/foo/bar',
    );
  });

  it('preserves absolute URLs', () => {
    expect(
      ensureAbsoluteUrl('https://example.com/wishlist/abc', 'https://fallback'),
    ).toBe('https://example.com/wishlist/abc');
  });
});

describe('WishlistDeepLinkController', () => {
  const fallbackOrigin = 'https://whisplist.app';

  it('defers wishlist navigation until authentication completes', () => {
    const navigate = jest.fn();
    const openExternal = jest.fn();
    const controller = new WishlistDeepLinkController({
      navigateToWishlist: navigate,
      openExternalUrl: openExternal,
      fallbackOrigin,
    });

    controller.updateAuthState({ isReady: false, isAuthenticated: false });
    controller.handleIncomingUrl('https://whisplist.app/w/list-123');
    expect(navigate).not.toHaveBeenCalled();

    controller.updateAuthState({ isReady: true, isAuthenticated: false });
    expect(navigate).not.toHaveBeenCalled();

    controller.updateAuthState({ isReady: true, isAuthenticated: true });
    expect(navigate).toHaveBeenCalledWith('list-123');
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('falls back to opening the web URL for unknown paths', () => {
    const navigate = jest.fn();
    const openExternal = jest.fn();
    const controller = new WishlistDeepLinkController({
      navigateToWishlist: navigate,
      openExternalUrl: openExternal,
      fallbackOrigin,
    });

    controller.updateAuthState({ isReady: true, isAuthenticated: true });
    controller.handleIncomingUrl('/not-a-wishlist/123');

    expect(openExternal).toHaveBeenCalledWith(
      'https://whisplist.app/not-a-wishlist/123',
    );
    expect(navigate).not.toHaveBeenCalled();
  });
});
