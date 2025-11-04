import * as Linking from 'expo-linking';
import type { Href } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import * as logger from '@/shared/logger';

const DEFAULT_WEB_ORIGIN = 'https://whisplist.app';

const trimTrailingSlash = (value: string): string =>
  value.endsWith('/') && value.length > 1 ? value.slice(0, -1) : value;

const cleanOrigin = (origin?: string): string =>
  origin && origin.trim().length
    ? trimTrailingSlash(origin.trim())
    : DEFAULT_WEB_ORIGIN;

const FALLBACK_WEB_ORIGIN = cleanOrigin(process.env.EXPO_PUBLIC_WEB_ORIGIN);

type ParsedWishlistLink = {
  listId: string;
  url: string;
};

type AuthState = {
  isReady: boolean;
  isAuthenticated: boolean;
};

const PATH_MATCHERS = new Set(['w', 'wishlist']);

const sanitizeSegments = (segments: string[]): string[] =>
  segments
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== '--');

const getPathSegments = (url: string): string[] => {
  let parsedPath: string | null = null;
  try {
    const parsed = Linking.parse(url);
    if (parsed?.path && typeof parsed.path === 'string') {
      parsedPath = parsed.path;
    }
  } catch (err) {
    logger.warn('Failed to parse deep link via expo-linking', err, { url });
  }

  if (!parsedPath) {
    try {
      const parsed = new URL(url);
      parsedPath = parsed.pathname;
    } catch {
      try {
        const parsed = new URL(url, `${DEFAULT_WEB_ORIGIN}/`);
        parsedPath = parsed.pathname;
      } catch (err) {
        logger.warn('Unable to derive pathname for deep link', err, { url });
        return [];
      }
    }
  }

  return sanitizeSegments(parsedPath.split('/'));
};

export const parseWishlistDeepLink = (
  url: string | null | undefined,
): ParsedWishlistLink | null => {
  if (!url || typeof url !== 'string') return null;
  const segments = getPathSegments(url);
  if (segments.length < 2) return null;
  const [first, second] = segments;
  if (!PATH_MATCHERS.has(first.toLowerCase())) return null;
  const listId = decodeURIComponent(second || '').trim();
  if (!listId) return null;
  return { listId, url };
};

export const ensureAbsoluteUrl = (
  rawUrl: string,
  fallbackOrigin: string = FALLBACK_WEB_ORIGIN,
): string => {
  if (!rawUrl) return fallbackOrigin;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol && parsed.host) {
      return parsed.toString();
    }
  } catch {
    // fall through to compose absolute url
  }
  const base = cleanOrigin(fallbackOrigin);
  const needsSlash = !rawUrl.startsWith('/');
  const path = needsSlash ? `/${rawUrl}` : rawUrl;
  return `${base}${path}`;
};

type NavigateToWishlistFn = (listId: string) => void;
type OpenExternalUrlFn = (url: string) => void | Promise<void | boolean>;

export class WishlistDeepLinkController {
  private pending: ParsedWishlistLink | null = null;
  private authState: AuthState = { isReady: false, isAuthenticated: false };
  private readonly navigateToWishlist: NavigateToWishlistFn;
  private readonly openExternalUrl: OpenExternalUrlFn;
  private readonly fallbackOrigin: string;

  constructor({
    navigateToWishlist,
    openExternalUrl,
    fallbackOrigin,
  }: {
    navigateToWishlist: NavigateToWishlistFn;
    openExternalUrl?: OpenExternalUrlFn;
    fallbackOrigin?: string;
  }) {
    this.navigateToWishlist = navigateToWishlist;
    this.openExternalUrl =
      openExternalUrl ??
      ((url: string) => {
        void Linking.openURL(url);
      });
    this.fallbackOrigin = cleanOrigin(fallbackOrigin);
  }

  updateAuthState(state: AuthState) {
    this.authState = state;
    if (
      this.pending &&
      this.authState.isReady &&
      this.authState.isAuthenticated
    ) {
      this.openWishlist(this.pending.listId);
      this.pending = null;
    }
  }

  handleIncomingUrl(url: string | null | undefined) {
    if (!url) return;
    const parsed = parseWishlistDeepLink(url);
    if (parsed) {
      if (this.authState.isReady && this.authState.isAuthenticated) {
        this.openWishlist(parsed.listId);
      } else {
        this.pending = parsed;
        logger.log('Deferred wishlist deep link until auth ready', {
          listId: parsed.listId,
        });
      }
      return;
    }
    this.fallbackToWeb(url);
  }

  private openWishlist(listId: string) {
    const normalizedId = listId.trim();
    if (!normalizedId) return;
    try {
      this.navigateToWishlist(normalizedId);
    } catch (err) {
      logger.error('Failed to navigate to wishlist deep link', err, {
        listId: normalizedId,
      });
    }
  }

  private fallbackToWeb(url: string) {
    const absolute = ensureAbsoluteUrl(url, this.fallbackOrigin);
    try {
      const result = this.openExternalUrl(absolute);
      if (result instanceof Promise) {
        void result.catch((err) => {
          logger.warn('Failed to open fallback wishlist link', err, {
            url: absolute,
          });
        });
      }
    } catch (err) {
      logger.warn('Failed to open fallback wishlist link', err, {
        url: absolute,
      });
    }
  }
}

export const useWishlistDeepLinkHandler = () => {
  const router = useRouter();
  const { user, loading } = useAuthSession();
  const controllerRef = useRef<WishlistDeepLinkController | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = new WishlistDeepLinkController({
      fallbackOrigin: FALLBACK_WEB_ORIGIN,
      navigateToWishlist: (listId: string) => {
        const href = `/wish/${encodeURIComponent(listId)}` as Href;
        try {
          router.push(href);
        } catch (err) {
          logger.error('Wishlist deep link navigation failed', err, {
            listId,
            href,
          });
        }
      },
      openExternalUrl: (url: string) => Linking.openURL(url),
    });
  }

  useEffect(() => {
    controllerRef.current?.updateAuthState({
      isReady: !loading,
      isAuthenticated: Boolean(user?.uid),
    });
  }, [loading, user?.uid]);

  useEffect(() => {
    let cancelled = false;
    const subscription = Linking.addEventListener('url', ({ url }) => {
      controllerRef.current?.handleIncomingUrl(url);
    });

    Linking.getInitialURL()
      .then((initialUrl) => {
        if (!cancelled && initialUrl) {
          controllerRef.current?.handleIncomingUrl(initialUrl);
        }
      })
      .catch((err) => {
        logger.warn('Failed to resolve initial wishlist deep link', err);
      });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);
};
