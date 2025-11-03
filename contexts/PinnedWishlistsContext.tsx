import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuthSession } from './AuthSessionContext';
import {
  bootstrapPins,
  clearPinCache,
  removePin,
  upsertPin,
  type PinRecord,
} from '@/src/features/wishlist/pinController';
import * as logger from '@/shared/logger';

type PinMeta = {
  title?: string | null;
  coverUri?: string | null;
};

type PinnedWishlistsContextValue = {
  pins: PinRecord[];
  loading: boolean;
  pinWishlist: (wishlistId: string, meta?: PinMeta) => Promise<void>;
  unpinWishlist: (wishlistId: string) => Promise<void>;
};

const PinnedWishlistsContext =
  createContext<PinnedWishlistsContextValue>({
    pins: [],
    loading: true,
    pinWishlist: async () => {},
    unpinWishlist: async () => {},
  });

export const PinnedWishlistsProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { user } = useAuthSession();
  const [pins, setPins] = useState<PinRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const previousUserRef = useRef<string | null>(null);

  useEffect(() => {
    const userId = user?.uid ?? null;
    if (previousUserRef.current && previousUserRef.current !== userId) {
      // Remove any cached data for the prior user to prevent leakage.
      void clearPinCache(previousUserRef.current, { removeStorage: true });
    }
    previousUserRef.current = userId;

    unsubscribeRef.current?.();
    unsubscribeRef.current = null;

    if (!userId) {
      setPins([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    bootstrapPins(userId, (next) => {
      if (cancelled) return;
      setPins(next);
      setLoading(false);
    })
      .then(({ initial, unsubscribe }) => {
        if (cancelled) {
          unsubscribe();
          return;
        }
        unsubscribeRef.current = () => {
          unsubscribe();
          unsubscribeRef.current = null;
        };
        if (!cancelled && !initial.length) {
          setPins(initial);
          setLoading(false);
        }
      })
      .catch((err) => {
        logger.warn('Failed to bootstrap pins', err, { userId });
        if (!cancelled) {
          setPins([]);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [user?.uid]);

  const pinWishlist = useCallback(
    async (wishlistId: string, meta: PinMeta = {}) => {
      const userId = user?.uid;
      if (!userId) {
        throw new Error('Cannot pin without an authenticated user');
      }
      try {
        const { pin } = await upsertPin(userId, wishlistId, meta);
        setPins((current) => {
          const existingIndex = current.findIndex(
            (item) => item.wishlistId === wishlistId,
          );
          if (existingIndex >= 0) {
            const next = [...current];
            next.splice(existingIndex, 1, pin);
            return next;
          }
          return [pin, ...current];
        });
      } catch (err) {
        logger.error('Failed to pin wishlist', err, {
          userId,
          wishlistId,
        });
        throw err;
      }
    },
    [user?.uid],
  );

  const unpinWishlist = useCallback(
    async (wishlistId: string) => {
      const userId = user?.uid;
      if (!userId) return;
      try {
        await removePin(userId, wishlistId);
        setPins((current) =>
          current.filter((pin) => pin.wishlistId !== wishlistId),
        );
      } catch (err) {
        logger.warn('Failed to unpin wishlist', err, {
          userId,
          wishlistId,
        });
      }
    },
    [user?.uid],
  );

  const value = useMemo<PinnedWishlistsContextValue>(
    () => ({
      pins,
      loading,
      pinWishlist,
      unpinWishlist,
    }),
    [pins, loading, pinWishlist, unpinWishlist],
  );

  return (
    <PinnedWishlistsContext.Provider value={value}>
      {children}
    </PinnedWishlistsContext.Provider>
  );
};

export const usePinnedWishlists = () => useContext(PinnedWishlistsContext);
